/* ¿La app publicada ya incluye el formulario de creación de cuentas? */
import { spawn } from 'node:child_process';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9499;
const URL = 'https://andresaylwinc.github.io/Reforzamiento-Escolar/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(process.env.TEMP, 'dsh-pub3-' + Date.now()), 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map();
function send(m, p) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); }); }
async function ev(e) { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); return r.result.value; }

let t = null;
for (let i = 0; i < 80; i++) {
  try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t) break; } catch (e) {}
  await sleep(250);
}
ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = m => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); p.res(msg.result); } };
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(3000);

const tieneFuncion = await ev('typeof (window.NUBE && window.NUBE.crearProfesor)');
const enBundle = await ev('document.documentElement.innerHTML.indexOf("np-crear") >= 0');
console.log('NUBE.crearProfesor:', tieneFuncion);
console.log('formulario en el código publicado:', enBundle);
console.log(tieneFuncion === 'function' && enBundle
  ? 'LISTO: la app publicada ya permite crear cuentas'
  : 'PENDIENTE: subir el cambio (commit + push) y esperar a que Pages se regenere');
ws.close(); edge.kill(); process.exit(0);
