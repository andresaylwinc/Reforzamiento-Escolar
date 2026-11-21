/* Prueba de la versión en uso: entrada, carga y registro contra la API de prueba. */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { crearServidor } from './mock-supabase.mjs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT_CDP = 9455;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let ok = 0, fail = 0;
function check(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FALLA ' + n + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 240) : '')); }
}

/* --- API de prueba --- */
const mock = crearServidor();
const api = await mock.escuchar(0);

/* --- servidor estático para la app --- */
const html = fs.readFileSync('Sistema-Asistencia.html');
const estatico = http.createServer((req, res) => {
  if ((req.url || '').indexOf('config.js') >= 0) {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end('window.CONFIG={supabaseUrl:"",supabaseKey:""};');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise((r) => estatico.listen(0, '127.0.0.1', r));
const appUrl = 'http://127.0.0.1:' + estatico.address().port + '/?api=' + encodeURIComponent(api) + '&anon=prueba';
console.log('app:', appUrl);
console.log('api:', api);

/* --- navegador --- */
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT_CDP, '--user-data-dir=' + path.join(process.env.TEMP, 'dsh-nube-' + Date.now()),
  '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map(); const logs = [];
function send(m, p) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); }); }
async function ev(e) {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
  return r.result.value;
}
const txt = async (sel) => (await ev('document.querySelector("' + sel + '") ? document.querySelector("' + sel + '").textContent.replace(/\\s+/g," ") : ""'));

let t = null;
for (let i = 0; i < 80; i++) {
  try { const l = await (await fetch('http://127.0.0.1:' + PORT_CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t) break; } catch (e) {}
  await sleep(250);
}
ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = m => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); return; }
  if (msg.method === 'Runtime.exceptionThrown') { const d = msg.params.exceptionDetails; logs.push((d.exception && d.exception.description) || d.text); }
};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: appUrl });
await sleep(2500);

console.log('== Pantalla de entrada ==');
check('pide entrar antes de mostrar el sistema', await ev('!!document.querySelector("#login-form")'));
check('no hay pestañas visibles', await ev('document.body.classList.contains("sin-tabs")'));
check('las vistas del sistema están ocultas', await ev('document.querySelectorAll(".view.on").length') === 1);

console.log('== Entrada con credenciales ==');
await ev('(function(){ document.querySelector("#lg-email").value="lider@ejemplo.cl"; document.querySelector("#lg-pass").value="mala"; document.querySelector("#login-form").dispatchEvent(new Event("submit",{cancelable:true,bubbles:true})); return true; })()');
await sleep(900);
check('muestra el error de credenciales', (await txt('#view-login')).toLowerCase().indexOf('incorrect') >= 0, await txt('#view-login'));

await ev('(function(){ document.querySelector("#lg-email").value="lider@ejemplo.cl"; document.querySelector("#lg-pass").value="secreta"; document.querySelector("#login-form").dispatchEvent(new Event("submit",{cancelable:true,bubbles:true})); return true; })()');
await sleep(2500);
check('entra y muestra el sistema', await ev('document.querySelectorAll(".view.on").length') === 1 && !(await ev('document.body.classList.contains("sin-tabs")')));
check('carga los colegios de la base', await ev('window.__app.DB().colegios.length') === 2, await ev('window.__app.DB().colegios.length'));
check('muestra el nombre del usuario', (await txt('.userbox')).indexOf('Líder') >= 0, await txt('.userbox'));

console.log('== Registro de una clase desde la base ==');
check('lista los estudiantes del curso', await ev('document.querySelectorAll("#rows .row").length') === 2,
  await ev('document.querySelectorAll("#rows .row").length'));
await ev(`(document.querySelector('#rows .row [data-tipo=a] [data-k="A"]').click(), true)`);
await ev(`(document.querySelectorAll('#rows .row').forEach((r,i) => { if(i>0) r.querySelector('[data-tipo=e] [data-k="3"]').click(); }), true)`);
await sleep(400);
await ev('(document.querySelector("[data-accion=enviar]").click(), true)');
await sleep(1800);
check('guardó la clase en la base', mock.datos.clases.length === 1, mock.datos.clases.length);
check('guardó los dos registros', mock.datos.registros.length === 2, mock.datos.registros.length);
check('el ausente quedó en 0 (sin nota)', mock.datos.registros.find(r => r.asistencia === 'A').evaluacion === 0);

console.log('== Reenvío ==');
await ev('(document.querySelector("[data-accion=enviar]").click(), true)');
await sleep(1500);
check('no duplica la clase', mock.datos.clases.length === 1, mock.datos.clases.length);
check('no duplica los registros', mock.datos.registros.length === 2, mock.datos.registros.length);

console.log('== Bitácora ==');
check('muestra la tarjeta de bitácora', await ev('!!document.querySelector("#bitacora-card") && document.querySelector("#bitacora-card").style.display !== "none"'));
check('ofrece adjuntar archivo', (await txt('#bitacora')).indexOf('Adjuntar') >= 0, await txt('#bitacora'));
const subido = await ev(`(async function(){
  const s = window.__app.S;
  const blob = new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], {type:'image/png'});
  const r = await window.NUBE.subirArchivo({claseId: s.editando.id, colegioId: s.colegioId, cursoId: s.cursoId, fecha: s.fecha, archivo: blob, nombre: 'bitacora.png', tipo: 'image/png'});
  window.__app.DB().archivos.push(r);
  return r.ruta;
})()`);
check('el archivo llega al almacenamiento', !!subido && mock.binarios.has(subido), subido);
await ev('(document.querySelector("[data-view=panel]").click(), true)');
await sleep(400);
await ev('(document.querySelector("[data-view=registrar]").click(), true)');
await sleep(700);
check('la bitácora muestra el archivo adjunto', await ev('document.querySelectorAll("#bitacora .bit-item").length') === 1,
  await ev('document.querySelectorAll("#bitacora .bit-item").length'));

console.log('== Estudiantes ==');
await ev('(document.querySelector("[data-view=estudiantes]").click(), true)');
await sleep(600);
const antes = await ev('document.querySelectorAll("#view-estudiantes tbody tr").length');
await ev('(document.querySelector("#e-add").click(), true)');
await sleep(400);
await ev('(function(){ document.querySelector("#me-nombre").value="Estudiante Nuevo"; const b=[...document.querySelectorAll("#modal .foot .btn")].find(x=>/Agregar/.test(x.textContent)); b.click(); return true; })()');
await sleep(1500);
check('agrega el estudiante en la base', mock.datos.estudiantes.length === 4, mock.datos.estudiantes.length);
check('la tabla se actualiza', await ev('document.querySelectorAll("#view-estudiantes tbody tr").length') === antes + 1);

console.log('== Crear cuenta de profesor desde la app ==');
await ev('(document.querySelector("[data-view=ajustes]").click(), true)');
await sleep(700);
check('el formulario de cuentas está disponible', await ev('!!document.querySelector("#np-crear")'));
const antesPerfiles = mock.datos.perfiles.length;
await ev('(function(){ document.querySelector("#np-nombre").value="Profesor Nuevo"; document.querySelector("#np-email").value="nuevo@ejemplo.cl"; document.querySelector("#np-pass").value="clave12345"; document.querySelector("#np-crear").click(); return true; })()');
await sleep(1800);
check('la cuenta se creó en la base', mock.datos.perfiles.length === antesPerfiles + 1, mock.datos.perfiles.length);
check('la cuenta aparece en la lista', (await txt('#view-ajustes')).indexOf('Profesor Nuevo') >= 0);
await ev('(function(){ document.querySelector("#np-nombre").value="Otra"; document.querySelector("#np-email").value="nuevo@ejemplo.cl"; document.querySelector("#np-pass").value="clave12345"; document.querySelector("#np-crear").click(); return true; })()');
await sleep(1400);
check('avisa si el correo ya existe', (await txt('#toast')).indexOf('Ya existe') >= 0, await txt('#toast'));

console.log('== Cambiar la contraseña desde la app ==');
const idNuevo = mock.datos.perfiles.find(p => p.email === 'nuevo@ejemplo.cl').id;
await ev(`(document.querySelector('[data-clave="` + idNuevo + `"]').click(), true)`);
await sleep(600);
check('abre el formulario de contraseña', await ev('!!document.querySelector("#cl-pass")'));
check('propone una contraseña al azar', (await ev('document.querySelector("#cl-pass").value.length')) >= 8);
await ev('(function(){ document.querySelector("#cl-pass").value="nuevaClave99"; const b=[...document.querySelectorAll("#modal .foot .btn")].find(x=>/Guardar contraseña/.test(x.textContent)); b.click(); return true; })()');
await sleep(1600);
check('la contraseña se actualizó en la base', mock.datos.perfiles.find(p => p.id === idNuevo).clave === 'nuevaClave99',
  mock.datos.perfiles.find(p => p.id === idNuevo).clave);

await ev('(document.querySelector("#cl-pass") ? true : true)');

console.log('== Clonar: exportar e importar estructura ==');
const estructura = JSON.parse(await ev('JSON.stringify(window.__app.estructuraActual())'));
check('exporta los colegios', estructura.colegios.length === mock.datos.colegios.length, estructura.colegios.length);
check('exporta los cursos', estructura.cursos.length === mock.datos.cursos.length, estructura.cursos.length);
check('exporta los estudiantes', estructura.estudiantes.length === mock.datos.estudiantes.length, estructura.estudiantes.length);
check('no lleva clases ni registros', estructura.clases === undefined && estructura.registros === undefined);
check('cada curso apunta a su colegio', estructura.cursos.every(k => !!estructura.colegios.find(c => c.id === k.colegioId)));
check('cada estudiante apunta a su curso', estructura.estudiantes.every(e => !!estructura.cursos.find(k => k.id === e.cursoId)));

// importar en un sistema vacío (se simula con el mismo servidor)
const antesCol = mock.datos.colegios.length;
const antesEst = mock.datos.estudiantes.length;
const paquete = {
  tipo: 'estructura-reforzamiento', version: 1,
  colegios: [
    { id: 'cN1', nombre: 'Colegio Nuevo 1', comuna: 'Otra', color: '#123456' },
    { id: 'cN2', nombre: 'Colegio Nuevo 2', comuna: 'Otra', color: '#654321' },
  ],
  cursos: [
    { id: 'kN1', colegioId: 'cN1', nombre: 'Curso 1' },
    { id: 'kN2', colegioId: 'cN2', nombre: 'Curso 1' },
  ],
  estudiantes: [
    { id: 'eN1', nombre: 'Alumno Uno', colegioId: 'cN1', cursoId: 'kN1' },
    { id: 'eN2', nombre: 'Alumno Dos', colegioId: 'cN1', cursoId: 'kN1' },
    { id: 'eN3', nombre: 'Alumno Tres', colegioId: 'cN2', cursoId: 'kN2' },
  ],
};
await ev('window.confirm = function(){ return true; }; true');
await ev('window.__app.importarEstructura(' + JSON.stringify(paquete) + '); true');
await sleep(2500);
check('importa los colegios', mock.datos.colegios.length === antesCol + 2, mock.datos.colegios.length);
check('importa los cursos', mock.datos.cursos.filter(k => k.id.indexOf('kN') === 0).length === 2);
check('importa los estudiantes', mock.datos.estudiantes.length === antesEst + 3, mock.datos.estudiantes.length);
check('respeta el curso de cada estudiante',
  mock.datos.estudiantes.find(e => e.id === 'eN3').curso_id === 'kN2');
check('la app refresca la lista', (await txt('#view-ajustes')).indexOf('Colegio Nuevo 1') >= 0);

fs.mkdirSync('Ejemplos/capturas', { recursive: true });
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 2, mobile: true });
await ev('(document.querySelector("[data-view=registrar]").click(), true)');
await sleep(600);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join('Ejemplos/capturas', '09-en-uso-movil.png'), Buffer.from(shot.data, 'base64'));
console.log('  captura: 09-en-uso-movil.png');

console.log(logs.length ? 'EXCEPCIONES:\n' + logs.join('\n') : 'sin excepciones en la página');
console.log('\nRESULTADO: ' + ok + ' ok, ' + fail + ' fallas');
ws.close(); edge.kill(); await mock.cerrar(); estatico.close();
process.exit(fail ? 1 : 0);
