/* Prueba de flujo completo en navegador real (CDP): cursos, registro, plazo, secciones. */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9344;
let FILE = '';
const OUT = 'Ejemplos/capturas';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const profile = path.join(process.env.TEMP, 'dsh-edge-flow-' + Date.now());
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--window-size=1440,1100', 'about:blank'], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const logs = [];
let ok = 0, fail = 0;

function check(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FALLA ' + n + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 240) : '')); }
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
  return r.result.value;
}
const txt = async (sel) => (await ev('document.querySelector("' + sel + '") ? document.querySelector("' + sel + '").textContent.replace(/\\s+/g," ") : ""'));

async function main() {
  let target = null;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      target = list.find(t => t.type === 'page');
      if (target) break;
    } catch (e) {}
    await sleep(250);
  }
  if (!target) throw new Error('sin navegador');
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
  };
  await send('Page.enable'); await send('Runtime.enable');
  // Se sirve la app con configuración vacía: esta prueba cubre el modo local
  const htmlLocal = fs.readFileSync('Sistema-Asistencia.html');
  const srv = http.createServer((req, res) => {
    if ((req.url || '').indexOf('config.js') >= 0) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end('window.CONFIG={supabaseUrl:"",supabaseKey:""};');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlLocal);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  FILE = 'http://127.0.0.1:' + srv.address().port + '/';
  await send('Page.navigate', { url: FILE });
  await sleep(1700);

  console.log('== Selección por curso ==');
  check('se ven 5 estudiantes del curso A', await ev('document.querySelectorAll("#rows .row").length') === 5,
    await ev('document.querySelectorAll("#rows .row").length'));
  check('el colegio tiene dos cursos en el selector', await ev('document.querySelectorAll("#f-cur option").length') === 2,
    await ev('document.querySelectorAll("#f-cur option").length'));
  await ev(`(function(){ const s = document.querySelector('#f-cur'); s.value = 'k2'; s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  await sleep(400);
  check('cambiar de curso cambia la lista', await ev('document.querySelectorAll("#rows .row").length') === 4,
    await ev('document.querySelectorAll("#rows .row").length'));
  check('el encabezado muestra el curso', (await txt('.course-bar .who')).indexOf('Curso 2') >= 0, await txt('.course-bar .who'));
  await ev(`(function(){ const s = document.querySelector('#f-cur'); s.value = 'k1'; s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  await sleep(400);

  console.log('== Validación ==');
  await ev('(document.querySelector("[data-accion=enviar]").click(), true)');
  await sleep(350);
  check('bloquea el envío sin evaluación', (await txt('#toast')).indexOf('evaluación') > 0, await txt('#toast'));
  check('marca las filas incompletas', await ev('document.querySelectorAll("#rows .row.invalid").length') === 5);

  console.log('== Registro de la clase ==');
  await ev(`(document.querySelector('#rows .row [data-tipo=a] [data-k="A"]').click(), true)`);
  await sleep(200);
  check('marcar ausente deja la evaluación en 0 (sin nota)',
    (await ev('Object.values(window.__app.S.filas)[0].evaluacion')) === 0);

  await ev(`(document.querySelectorAll('#rows .row').forEach((r,i) => { if(i>0) r.querySelector('[data-tipo=a] [data-k="P"]').click(); }), true)`);
  await ev(`(document.querySelectorAll('#rows .row').forEach((r,i) => { if(i>0) r.querySelector('[data-tipo=e] [data-k="3"]').click(); }), true)`);
  await sleep(300);
  check('contador completo', (await txt('#cursofoot')).indexOf('5 de 5') >= 0, await txt('#cursofoot'));

  await ev('(document.querySelector("[data-accion=enviar]").click(), true)');
  await sleep(600);
  check('aviso de guardado', (await txt('#toast')).indexOf('guardado') > 0, await txt('#toast'));
  check('sesión guardada', await ev('window.__app.DB().sesiones.length') === 81,
    await ev('window.__app.DB().sesiones.length'));
  check('banner de confirmación', (await txt('#ctx')).indexOf('Registro guardado') > 0);

  console.log('== Persistencia ==');
  await send('Page.reload');
  await sleep(1700);
  check('los datos siguen', await ev('window.__app.DB().sesiones.length') === 81,
    await ev('window.__app.DB().sesiones.length'));
  check('detecta la clase ya registrada', (await txt('#ctx')).indexOf('ya estaba registrada') > 0, await txt('#ctx'));

  console.log('== Plazo de corrección (30 días) ==');
  const creadas = await ev(`(function(){
    const db = window.__app.DB(), f = '2026-09-02';
    const ests = window.LOGIC.estudiantesDeCurso(db, 'k1', f);
    window.LOGIC.guardarSesion(db, {fecha:f, colegioId:'c1', cursoId:'k1', profesorId:'p2', realizada:true,
      filas: ests.map(e => ({estudianteId:e.id, nombre:e.nombre, asistencia:'P', evaluacion:2, observacion:''}))});
    const inp = document.querySelector('#f-fecha');
    inp.value = f; inp.dispatchEvent(new Event('change',{bubbles:true}));
    return ests.length;
  })()`);
  check('se creó la clase antigua', creadas === 5, creadas);
  await sleep(500);
  check('avisa que está fuera de plazo', (await txt('#ctx')).indexOf('Fuera del plazo') >= 0, (await txt('#ctx')).slice(0, 160));
  check('el botón de envío queda bloqueado', await ev('document.querySelector("[data-accion=enviar]").disabled') === true);
  await ev('(document.querySelector("[data-accion=lider]").click(), true)');
  await sleep(300);
  check('la líder puede habilitarlo', await ev('document.querySelector("[data-accion=enviar]").disabled') === false);
  await ev('(document.querySelector("[data-accion=enviar]").click(), true)');
  await sleep(500);
  check('guardar como líder funciona', (await txt('#toast')).indexOf('guardado') > 0, await txt('#toast'));

  console.log('== Clase no realizada ==');
  await ev(`(function(){ const inp = document.querySelector('#f-fecha'); inp.value = '2026-11-07'; inp.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  await sleep(400);
  await ev('(document.querySelector("#chk-susp").click(), true)');
  await sleep(300);
  check('muestra el motivo', await ev('!!document.querySelector("#m-motivo")'));
  check('avisa que no cuenta como ausencia', (await txt('#curso')).indexOf('no se cuenta como ausencia') > 0);
  await ev('(document.querySelector("#chk-susp").click(), true)');
  await sleep(300);

  console.log('== Otras secciones ==');
  await ev('(document.querySelector("[data-view=panel]").click(), true)');
  await sleep(600);
  check('panel con 5 indicadores', await ev('document.querySelectorAll("#view-panel .kpi").length') === 5);
  check('panel con gráficos', await ev('document.querySelectorAll("#view-panel svg.chart").length') === 2);
  check('tabla por curso lista cursos', (await txt('#view-panel .charts .tbl')).indexOf('Curso 1') >= 0);
  await ev(`(function(){ const s = document.querySelector('#p-col'); s.value = 'c1'; s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  await sleep(500);
  check('filtrar por colegio ofrece sus cursos', await ev('document.querySelectorAll("#p-cur option").length') === 3);

  await ev('(document.querySelector("[data-view=estudiantes]").click(), true)');
  await sleep(500);
  check('tabla de estudiantes del colegio', await ev('document.querySelectorAll("#view-estudiantes tbody tr").length') === 9,
    await ev('document.querySelectorAll("#view-estudiantes tbody tr").length'));
  await ev(`(function(){ const s = document.querySelector('#e-cur'); s.value = 'k2'; s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  await sleep(400);
  check('filtrar estudiantes por curso', await ev('document.querySelectorAll("#view-estudiantes tbody tr").length') === 4,
    await ev('document.querySelectorAll("#view-estudiantes tbody tr").length'));

  await ev('(document.querySelector("[data-view=informes]").click(), true)');
  await sleep(500);
  check('borrador generado', (await txt('#i-draft')).indexOf('INFORME DE REFORZAMIENTO') >= 0);
  check('borrador menciona cursos', (await txt('#i-draft')).indexOf('curso(s)') > 0);

  await ev('(document.querySelector("[data-view=ajustes]").click(), true)');
  await sleep(500);
  check('ajustes con colegios y plazo', await ev('!!document.querySelector("#a-addcol") && !!document.querySelector("#a-dias")'));
  check('plazo configurable a 30', await ev('document.querySelector("#a-dias").value') === '30');

  console.log('== Excel en el navegador ==');
  const info = JSON.parse(await ev(`(function(){
    const db = window.__app.DB();
    const wb = window.REPORT.construir(db, {desde:'2026-08-24', hasta:'2026-11-07'});
    const b = wb.build();
    return JSON.stringify({bytes: b.length, hojas: wb.sheets.length, cabecera: String.fromCharCode(b[0],b[1])});
  })()`));
  check('genera el xlsx', info.bytes > 20000 && info.cabecera === 'PK', info);
  check('11 hojas', info.hojas === 11, info.hojas);

  if (logs.length) console.log('EXCEPCIONES EN PÁGINA:\n' + logs.join('\n'));
  else console.log('sin excepciones en la página');
  console.log('\nRESULTADO: ' + ok + ' ok, ' + fail + ' fallas');
  ws.close(); edge.kill();
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FALLO:', e.message); edge.kill(); process.exit(1); });
