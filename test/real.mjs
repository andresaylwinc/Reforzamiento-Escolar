/* Prueba contra el proyecto real de Supabase (sin credenciales de usuario). */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT_CDP = 9477;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let ok = 0, fail = 0;
function check(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FALLA ' + n + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 200) : '')); }
}

const html = fs.readFileSync('Sistema-Asistencia.html');
const config = fs.readFileSync('config.js');
const estatico = http.createServer((req, res) => {
  if ((req.url || '').indexOf('config.js') >= 0) {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(config); return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise((r) => estatico.listen(0, '127.0.0.1', r));
const appUrl = 'http://127.0.0.1:' + estatico.address().port + '/';

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + PORT_CDP,
  '--user-data-dir=' + path.join(process.env.TEMP, 'dsh-real-' + Date.now()), '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });

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
await sleep(3000);

console.log('== Proyecto real ==');
check('la app está en modo en uso (no demo)', await ev('!!window.NUBE && window.NUBE.activo === true'));
check('apunta a tu proyecto', (await ev('window.NUBE.url || ""')).indexOf('tkrjwusyvoseialpviyd') > 0, await ev('window.NUBE.url'));
check('muestra la pantalla de entrada', await ev('!!document.querySelector("#login-form")'));

console.log('== Autenticación real ==');
await ev('(function(){ document.querySelector("#lg-email").value="prueba@ejemplo.cl"; document.querySelector("#lg-pass").value="clave-invalida-123"; document.querySelector("#login-form").dispatchEvent(new Event("submit",{cancelable:true,bubbles:true})); return true; })()');
await sleep(3500);
const error = (await txt('#view-login')).toLowerCase();
check('el servidor rechaza credenciales falsas', error.indexOf('incorrect') >= 0, error.slice(0, 160));
check('muestra el mensaje correcto, no un error técnico', error.indexOf('500') < 0 && error.indexOf('error') < 0 || error.indexOf('incorrect') >= 0, error.slice(0, 160));
check('no entró al sistema', await ev('document.body.classList.contains("sin-tabs")'));

console.log(logs.length ? 'EXCEPCIONES:\n' + logs.join('\n') : 'sin excepciones en la página');
console.log('\nRESULTADO: ' + ok + ' ok, ' + fail + ' fallas');
ws.close(); edge.kill(); estatico.close();
process.exit(fail ? 1 : 0);
