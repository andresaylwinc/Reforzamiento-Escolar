/* Comprueba que el sitio publicado esté conectado a la base real. */
import { spawn } from 'node:child_process';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9488;
const URL = 'https://andresaylwinc.github.io/Reforzamiento-Escolar/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let ok = 0, fail = 0;
function check(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FALLA ' + n + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 200) : '')); }
}

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(process.env.TEMP, 'dsh-pub2-' + Date.now()), '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map(); const logs = [];
function send(m, p) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); }); }
async function ev(e) {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
  return r.result.value;
}

let t = null;
for (let i = 0; i < 80; i++) {
  try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t) break; } catch (e) {}
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
await send('Page.navigate', { url: URL });
await sleep(3500);

console.log('== Sitio publicado ==');
check('sigue siendo la misma dirección', (await ev('location.href')).indexOf('Sistema-Asistencia.html') > 0, await ev('location.href'));
check('la app está en modo en uso', await ev('!!window.NUBE && window.NUBE.activo === true'));
check('apunta a tu proyecto', (await ev('window.NUBE ? window.NUBE.url : ""')).indexOf('tkrjwusyvoseialpviyd') > 0, await ev('window.NUBE ? window.NUBE.url : ""'));
check('pide entrar', await ev('!!document.querySelector("#login-form")'));
check('no muestra la demo', await ev('document.querySelectorAll("#rows .row").length') === 0);
check('la clave está presente', (await ev('JSON.stringify(window.CONFIG||{})')).length > 40, await ev('JSON.stringify(window.CONFIG||{}).length'));

console.log(logs.length ? 'EXCEPCIONES:\n' + logs.join('\n') : 'sin excepciones en la página');
console.log('\nRESULTADO: ' + ok + ' ok, ' + fail + ' fallas');
ws.close(); edge.kill();
process.exit(fail ? 1 : 0);
