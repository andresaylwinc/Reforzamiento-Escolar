/* Prueba del sistema en uso con la base recién creada (sin datos). */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { crearServidor } from './mock-supabase.mjs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT_CDP = 9466;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let ok = 0, fail = 0;
function check(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FALLA ' + n + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 200) : '')); }
}

const mock = crearServidor({ vacio: true });
const api = await mock.escuchar(0);

const html = fs.readFileSync('Sistema-Asistencia.html');
const config = 'window.CONFIG={supabaseUrl:"",supabaseKey:""};';
const estatico = http.createServer((req, res) => {
  if ((req.url || '').indexOf('config.js') >= 0) {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(config); return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise((r) => estatico.listen(0, '127.0.0.1', r));
const appUrl = 'http://127.0.0.1:' + estatico.address().port + '/?api=' + encodeURIComponent(api) + '&anon=prueba';

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + PORT_CDP,
  '--user-data-dir=' + path.join(process.env.TEMP, 'dsh-vacio-' + Date.now()), '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });

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
await sleep(2200);

await ev('(function(){ document.querySelector("#lg-email").value="lider@ejemplo.cl"; document.querySelector("#lg-pass").value="secreta"; document.querySelector("#login-form").dispatchEvent(new Event("submit",{cancelable:true,bubbles:true})); return true; })()');
await sleep(2200);

console.log('== Base recién creada ==');
check('entra al sistema', !(await ev('document.body.classList.contains("sin-tabs")')));
check('no hay colegios', await ev('window.__app.DB().colegios.length') === 0, await ev('window.__app.DB().colegios.length'));
check('avisa que el curso no tiene estudiantes', (await txt('#ctx')).indexOf('no tiene estudiantes') >= 0, await txt('#ctx'));
check('la pantalla no queda en blanco', (await txt('#view-registrar')).length > 100);

console.log('== Secciones con datos vacíos ==');
await ev('(document.querySelector("[data-view=panel]").click(), true)');
await sleep(700);
check('el panel abre sin errores', (await txt('#view-panel')).indexOf('Asistencia') >= 0);
check('los gráficos muestran "sin datos"', (await txt('#view-panel')).indexOf('Sin datos') >= 0, (await txt('#view-panel')).slice(0, 160));

await ev('(document.querySelector("[data-view=estudiantes]").click(), true)');
await sleep(500);
check('estudiantes muestra el vacío', (await txt('#view-estudiantes')).indexOf('Sin estudiantes') >= 0);

await ev('(document.querySelector("[data-view=ajustes]").click(), true)');
await sleep(500);
check('ajustes abre para crear colegios', await ev('!!document.querySelector("#a-addcol")'));
check('oculta el botón de datos de ejemplo', await ev('!document.querySelector("#a-reset")'));

console.log('== Crear el primer colegio desde la app ==');
await ev('(function(){ document.querySelector("#a-col").value="Colegio Nuevo"; document.querySelector("#a-addcol").click(); return true; })()');
await sleep(1500);
check('el colegio llegó a la base', mock.datos.colegios.length === 1, mock.datos.colegios.length);
check('creó su curso inicial', mock.datos.cursos.length === 1, mock.datos.cursos.length);
check('aparece en la pantalla', (await txt('#view-ajustes')).indexOf('Colegio Nuevo') >= 0);

await ev('(document.querySelector("[data-view=registrar]").click(), true)');
await sleep(600);
check('el registro ya ofrece el colegio', (await txt('#f-col')).indexOf('Colegio Nuevo') >= 0, await txt('#f-col'));
check('y su curso', (await txt('#f-cur')).indexOf('Curso 1') >= 0, await txt('#f-cur'));

console.log(logs.length ? 'EXCEPCIONES:\n' + logs.join('\n') : 'sin excepciones en la página');
console.log('\nRESULTADO: ' + ok + ' ok, ' + fail + ' fallas');
ws.close(); edge.kill(); await mock.cerrar(); estatico.close();
process.exit(fail ? 1 : 0);
