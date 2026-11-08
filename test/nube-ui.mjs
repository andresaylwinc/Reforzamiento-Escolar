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
    res.end(fs.readFileSync('config.js'));
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
