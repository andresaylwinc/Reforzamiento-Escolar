/* Verifica la descarga real del Excel desde el navegador. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9411;
const FILE = 'file:///G:/Mi%20unidad/000%20-%20ESCRITORIO%20PERSONAL/deepSeekLosParques/Sistema-Asistencia.html';
const DL = path.join(process.cwd(), 'Ejemplos', 'descarga');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(process.env.TEMP, 'dsh-dl-' + Date.now()), 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map();
function send(m, p) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); }); }
async function ev(e) {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
  return r.result.value;
}
let target = null;
for (let i = 0; i < 60; i++) {
  try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = l.find(x => x.type === 'page'); if (target) break; } catch (e) {}
  await sleep(250);
}
ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = m => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); } };

await send('Page.enable');
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
await send('Page.navigate', { url: FILE });
await sleep(1800);
await ev('(document.querySelector("[data-view=panel]").click(), true)');
await sleep(600);
await ev('(document.querySelector("#p-xlsx").click(), true)');
await sleep(2500);

const files = fs.readdirSync(DL).filter(f => f.endsWith('.xlsx'));
console.log('archivos descargados:', files);
if (!files.length) { console.log('FALLA: no se descargó nada'); edge.kill(); process.exit(1); }
const full = path.join(DL, files[0]);
const buf = fs.readFileSync(full);
const firma = String.fromCharCode(buf[0], buf[1]);
console.log('nombre:', files[0]);
console.log('tamaño KB:', Math.round(buf.length / 1024));
console.log('firma ZIP:', firma);
console.log(firma === 'PK' && buf.length > 20000 ? 'OK descarga válida' : 'FALLA archivo inválido');
ws.close(); edge.kill();
process.exit(firma === 'PK' ? 0 : 1);
