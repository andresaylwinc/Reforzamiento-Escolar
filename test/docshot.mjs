/* Captura de página completa de un HTML (para revisar el documento antes de entregarlo). */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [url, out, wArg, hArg] = process.argv.slice(2);
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9399;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(process.env.TEMP, 'dsh-doc-' + Date.now()), 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map();
function send(m, p) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); }); }
let target = null;
for (let i = 0; i < 60; i++) {
  try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = l.find(x => x.type === 'page'); if (target) break; } catch (e) {}
  await sleep(250);
}
ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = m => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); } };
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(2000);
const h = Number(hArg || 3000);
await send('Emulation.setDeviceMetricsOverride', { width: Number(wArg || 900), height: h, deviceScaleFactor: 1.5, mobile: false });
await sleep(700);
const r = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
console.log('captura', out, fs.statSync(out).size);
ws.close(); edge.kill(); process.exit(0);
