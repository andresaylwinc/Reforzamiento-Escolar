/* Verifica la versión publicada en GitHub Pages: carga, registro y exportación. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9433;
const URL = 'https://andresaylwinc.github.io/Reforzamiento-Escolar/';
const OUT = 'Ejemplos/capturas';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(process.env.TEMP, 'dsh-pub-' + Date.now()),
  '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map(); const logs = [];
let ok = 0, fail = 0;
function check(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FALLA ' + n + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 200) : '')); }
}
function send(m, p) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); }); }
async function ev(e) {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
  return r.result.value;
}
const txt = async (sel) => (await ev('document.querySelector("' + sel + '") ? document.querySelector("' + sel + '").textContent.replace(/\\s+/g," ") : ""'));

let t = null;
for (let i = 0; i < 80; i++) {
  try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t) break; } catch (e) {}
  await sleep(250);
}
ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = m => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push('[EXCEPCIÓN] ' + ((d.exception && d.exception.description) || d.text));
  }
};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(3500);

console.log('== Carga desde la URL pública ==');
check('la portada redirige a la app', (await ev('location.href')).indexOf('Sistema-Asistencia.html') > 0, await ev('location.href'));
check('la app se renderiza', await ev('document.querySelectorAll("#rows .row").length') === 5, await ev('document.querySelectorAll("#rows .row").length'));
check('usa almacenamiento del navegador (https)', await ev('!!window.__app && !!window.__app.DB()'), await ev('typeof window.__app'));
check('sin datos de una sesión previa', await ev('window.__app.DB().sesiones.length') === 80, await ev('window.__app.DB().sesiones.length'));

console.log('== Registro real ==');
await ev(`(document.querySelector('#rows .row [data-tipo=a] [data-k="A"]').click(), true)`);
await ev(`(document.querySelectorAll('#rows .row').forEach((r,i) => { if(i>0) r.querySelector('[data-tipo=e] [data-k="2"]').click(); }), true)`);
await sleep(400);
await ev('(document.querySelector("[data-accion=enviar]").click(), true)');
await sleep(900);
check('guarda la clase', await ev('window.__app.DB().sesiones.length') === 81, await ev('window.__app.DB().sesiones.length'));
check('confirma al usuario', (await txt('#toast')).indexOf('guardado') >= 0, await txt('#toast'));

console.log('== Excel desde la nube ==');
const info = JSON.parse(await ev(`(function(){
  const wb = window.REPORT.construir(window.__app.DB(), {desde:'2026-08-24', hasta:'2026-11-07'});
  const b = wb.build();
  return JSON.stringify({bytes:b.length, hojas:wb.sheets.length, firma:String.fromCharCode(b[0],b[1])});
})()`));
check('genera el Excel en la versión publicada', info.bytes > 20000 && info.firma === 'PK', info);
check('11 hojas', info.hojas === 11, info.hojas);

fs.mkdirSync(OUT, { recursive: true });
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 2, mobile: true });
await sleep(700);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(OUT, '08-publicado-movil.png'), Buffer.from(shot.data, 'base64'));
console.log('  captura: 08-publicado-movil.png');

console.log(logs.length ? 'EXCEPCIONES:\n' + logs.join('\n') : 'sin excepciones en la página');
console.log('\nRESULTADO: ' + ok + ' ok, ' + fail + ' fallas');
ws.close(); edge.kill();
process.exit(fail ? 1 : 0);
