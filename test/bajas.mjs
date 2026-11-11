/* Prueba en navegador real (CDP) de los tres borrados: colegio, estudiante y cuenta.
   Corre en modo de prueba (datos locales), sin Supabase.
   Uso: node test/bajas.mjs */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));
if (!EDGE) { console.log('sin navegador: no se encontró Edge'); process.exit(0); }

const PORT = 9355;
const FILE = pathToFileURL(path.resolve('Sistema-Asistencia.html')).href;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const profile = path.join(process.env.TEMP, 'dsh-edge-bajas-' + Date.now());
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--no-default-browser-check', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile, '--window-size=1440,1100', 'about:blank'], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const logs = [];
const dialogos = [];
let ok = 0, fail = 0;

function check(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok   ' + nombre); }
  else { fail++; console.log('  FALLA ' + nombre + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 200) : '')); }
}
function send(method, params) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
  }
  return r.result.value;
}
const txt = (sel) => ev('document.querySelector(' + JSON.stringify(sel) + ') ? document.querySelector(' + JSON.stringify(sel) + ').textContent.replace(/\\s+/g," ").trim() : ""');
const qsa = (sel) => ev('document.querySelectorAll(' + JSON.stringify(sel) + ').length');
const clic = (sel) => ev('(document.querySelector(' + JSON.stringify(sel) + ').click(), true)');

async function main() {
  let target = null;
  for (let i = 0; i < 60; i++) {
    try {
      const lista = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      target = lista.find(t => t.type === 'page');
      if (target) break;
    } catch (e) {}
    await sleep(250);
  }
  if (!target) throw new Error('el navegador no respondió');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push('[EXCEPCIÓN] ' + ((d.exception && d.exception.description) || d.text));
    }
    if (msg.method === 'Page.javascriptDialogOpening') {
      dialogos.push(msg.params.message);
      send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: FILE });
  await sleep(2000);

  const irA = async (vista) => {
    await ev('(document.querySelector(\'.tab[data-view="' + vista + '"]\').click(), true)');
    await sleep(450);
  };

  console.log('== Ajustes: eliminar colegio ==');
  await irA('ajustes');
  const colegios0 = await ev('window.__app.DB().colegios.length');
  const cursos0 = await ev('window.__app.DB().cursos.length');
  const ests0 = await ev('window.__app.DB().estudiantes.length');
  check('hay colegios de ejemplo', colegios0 > 0, colegios0);
  check('cada colegio tiene su botón Eliminar', await qsa('[data-borrar-col]') === colegios0,
    await qsa('[data-borrar-col]'));

  await clic('[data-borrar-col]');
  await sleep(350);
  check('abre la ventana de confirmación', await qsa('#bc-nombre') === 1);
  const aviso = await txt('#modal .body');
  check('pide escribir el nombre', /para confirmar/.test(aviso), aviso.slice(0, 120));
  check('dice cuántos estudiantes se borran', /estudiante/.test(aviso), aviso.slice(0, 120));

  const nombreColegio = await ev('window.__app.DB().colegios[0].nombre');
  await ev('(function(){ const i=document.querySelector("#bc-nombre"); i.value="otro nombre"; i.dispatchEvent(new Event("input",{bubbles:true})); return true; })()');
  await ev('(function(){ const b=[...document.querySelectorAll("#modal .foot .btn")].find(x=>/Eliminar/.test(x.textContent)); b.click(); return true; })()');
  await sleep(400);
  check('con el nombre equivocado no borra', await ev('window.__app.DB().colegios.length') === colegios0,
    await ev('window.__app.DB().colegios.length'));
  check('la ventana sigue abierta', await ev('document.querySelector("#modal-bg").classList.contains("on")') === true);
  check('avisa que hay que escribir el nombre', /nombre/i.test(await txt('#toast')), await txt('#toast'));

  await ev('(function(){ const i=document.querySelector("#bc-nombre"); i.value=' + JSON.stringify(nombreColegio) + '; i.dispatchEvent(new Event("input",{bubbles:true})); return true; })()');
  await ev('(function(){ const b=[...document.querySelectorAll("#modal .foot .btn")].find(x=>/Eliminar/.test(x.textContent)); b.click(); return true; })()');
  await sleep(700);
  check('borra el colegio', await ev('window.__app.DB().colegios.length') === colegios0 - 1,
    await ev('window.__app.DB().colegios.length'));
  check('se lleva sus cursos', await ev('window.__app.DB().cursos.length') < cursos0,
    await ev('window.__app.DB().cursos.length'));
  check('se lleva sus estudiantes', await ev('window.__app.DB().estudiantes.length') < ests0,
    await ev('window.__app.DB().estudiantes.length'));
  check('no quedan cursos huérfanos',
    await ev('window.__app.DB().cursos.every(k => window.__app.DB().colegios.some(c => c.id === k.colegioId))') === true);
  check('no quedan estudiantes huérfanos',
    await ev('window.__app.DB().estudiantes.every(e => window.__app.DB().colegios.some(c => c.id === e.colegioId))') === true);

  console.log('== Estudiantes: quitar ==');
  await irA('estudiantes');
  const filas0 = await ev('window.__app.DB().estudiantes.length');
  check('cada estudiante tiene su botón Quitar', await qsa('[data-borrar]') > 0, await qsa('[data-borrar]'));
  await clic('[data-borrar]');
  await sleep(700);
  check('pide confirmación antes de borrar', dialogos.some(d => /Eliminar a/.test(d)), dialogos.slice(-2));
  check('quita al estudiante', await ev('window.__app.DB().estudiantes.length') === filas0 - 1,
    await ev('window.__app.DB().estudiantes.length'));
  check('no quedan registros suyos',
    await ev('(function(){const d=window.__app.DB();return d.registros.every(r=>d.estudiantes.some(e=>e.id===r.estudianteId));})()') === true);

  console.log('== Ajustes: quitar cuenta ==');
  await irA('ajustes');
  const profes0 = await ev('window.__app.DB().profesores.length');
  check('hay profesores', profes0 > 0, profes0);
  check('cada profesor tiene su botón Quitar', await qsa('[data-delprof]') === profes0,
    await qsa('[data-delprof]'));
  await clic('[data-delprof]');
  await sleep(700);
  check('pide confirmación', dialogos.some(d => /Quitar a/.test(d)), dialogos.slice(-2));
  check('quita la cuenta de la lista', await ev('window.__app.DB().profesores.length') === profes0 - 1,
    await ev('window.__app.DB().profesores.length'));
  check('no deja asignaciones colgando',
    await ev('(function(){const d=window.__app.DB();return d.asignaciones.every(a=>d.profesores.some(p=>p.id===a.profesorId));})()') === true);

  check('sin excepciones en consola', logs.length === 0, logs.slice(0, 3));

  console.log('\nRESULTADO: ' + ok + ' ok, ' + fail + ' fallas');
  ws.close();
  edge.kill();
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.log('ERROR: ' + e.message);
  try { edge.kill(); } catch (x) {}
  process.exit(1);
});
