/* Capturas finales con un estado realista (colegio con varios cursos). */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9377;
const FILE = 'file:///G:/Mi%20unidad/000%20-%20ESCRITORIO%20PERSONAL/deepSeekLosParques/Sistema-Asistencia.html';
const OUT = 'Ejemplos/capturas';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(process.env.TEMP, 'dsh-shots-' + Date.now()),
  '--window-size=1440,1200', 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map();
function send(m, p) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); }); }
async function ev(e) {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
  return r.result.value;
}
async function shot(name, w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: w < 600 });
  await sleep(550);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('  ' + name);
}

let target = null;
for (let i = 0; i < 60; i++) {
  try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = l.find(x => x.type === 'page'); if (target) break; } catch (e) {}
  await sleep(250);
}
ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = m => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); } };
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: FILE });
await sleep(1800);

// Colegio con 8 estudiantes para que la lista se vea completa
await ev(`(function(){ const s = document.querySelector('#f-col'); s.value = 'c2'; s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
await sleep(500);

// Estado realista: una ausencia, notas variadas, una observación con etiqueta
await ev(`(document.querySelectorAll('#rows .row')[0].querySelector('[data-k="A"]').click(), true)`);
const notas = [2, 3, 1, 2, 3, 3, 2];
for (let i = 0; i < notas.length; i++) {
  await ev(`(document.querySelectorAll('#rows .row')[${i + 1}].querySelector('[data-tipo=e] [data-k="${notas[i]}"]').click(), true)`);
}
await ev(`(document.querySelectorAll('#rows .row')[2].querySelector('[data-obs-open]').click(), true)`);
await sleep(250);
await ev(`(function(){
  const ta = document.querySelectorAll('#rows .row')[2].querySelector('textarea');
  ta.value = 'Confunde la multiplicación por dos cifras; se trabajó con material concreto y quedó con guía para la casa.';
  ta.dispatchEvent(new Event('input', {bubbles:true}));
  return true;})()`);
await ev(`(function(){
  const row = document.querySelectorAll('#rows .row')[2];
  const t = Array.from(row.querySelectorAll('.tag-btn')).find(b => b.textContent === 'Cálculo y operatoria');
  if (t) t.click();
  window.scrollTo(0,0);
  return true;})()`);
await sleep(450);

console.log('capturas:');
fs.mkdirSync(OUT, { recursive: true });
await shot('01-registrar-escritorio.png', 1400, 1330);

await ev('(document.querySelector("[data-view=panel]").click(), true)');
await sleep(700);
await shot('02-panel-escritorio.png', 1400, 2150);

await ev('(document.querySelector("[data-view=estudiantes]").click(), true)');
await sleep(500);
await shot('03-estudiantes-escritorio.png', 1400, 1200);

await ev('(document.querySelector("[data-view=informes]").click(), true)');
await sleep(500);
await shot('04-informes-escritorio.png', 1400, 1500);

await ev('(document.querySelector("[data-view=ajustes]").click(), true)');
await sleep(500);
await shot('05-ajustes-escritorio.png', 1400, 1600);

await ev('(document.querySelector("[data-view=registrar]").click(), true)');
await sleep(600);
await shot('06-registrar-movil.png', 390, 1500);

await ev('(document.querySelector("[data-view=panel]").click(), true)');
await sleep(700);
await shot('07-panel-movil.png', 390, 1700);

ws.close(); edge.kill(); process.exit(0);
