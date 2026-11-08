/* ============================================================
   app.js — Interfaz del sistema de reforzamiento.
   Sin dependencias ni servidor: funciona con doble clic.
   Pensada primero para celular.

   Evaluación: 0-3. El 0 significa SIN NOTA y es un valor válido.
   Se registra siempre, para presentes y ausentes.
   ============================================================ */
(function () {
  'use strict';

  const LOGIC = window.LOGIC, DEMO = window.DEMO, REPORT = window.REPORT, XLSX = window.XLSX;
  const NUBE = window.NUBE || null;
  const EN_NUBE = !!(NUBE && NUBE.activo);

  /* ------------------------- Utilidades ------------------------ */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoyISO = () => LOGIC.iso(new Date());
  const pct = LOGIC.pct;

  function toast(msg, tipo) {
    const t = $('#toast');
    t.innerHTML = '<div class="toast-in ' + (tipo || '') + '">' + (tipo === 'ok' ? '✓ ' : tipo === 'err' ? '⚠ ' : '') + esc(msg) + '</div>';
    t.classList.add('on');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('on'), tipo === 'err' ? 5200 : 3000);
  }

  /* --------------------------- Almacén ------------------------- */
  const LS_KEY = 'reforzamiento.v4';
  let DB;

  /** Algunos navegadores no dejan guardar nada al abrir un archivo local. */
  const ALMACEN_OK = (function () {
    try { localStorage.setItem('__prueba', '1'); localStorage.removeItem('__prueba'); return true; }
    catch (e) { return false; }
  })();

  /** Normaliza datos de versiones anteriores. */
  function migrar(d) {
    if (!d) return d;
    if (!d.cursos || !d.cursos.length) {
      d.cursos = [];
      (d.colegios || []).forEach(function (c) {
        d.cursos.push({ id: 'k-' + c.id, colegioId: c.id, nombre: c.curso || 'Curso' });
      });
    }
    (d.estudiantes || []).forEach(function (e) {
      if (!e.cursoId) {
        const k = d.cursos.find(function (x) { return x.colegioId === e.colegioId; });
        e.cursoId = k ? k.id : '';
      }
    });
    (d.sesiones || []).forEach(function (s) {
      if (!s.cursoId) {
        const k = d.cursos.find(function (x) { return x.colegioId === s.colegioId; });
        s.cursoId = k ? k.id : '';
      }
    });
    // En el modelo actual la evaluación siempre existe: 0 = sin nota.
    (d.registros || []).forEach(function (r) {
      if (typeof r.evaluacion !== 'number') r.evaluacion = 0;
    });
    d.ajustes = Object.assign({ modoRapido: true, diasEdicion: 30 }, d.ajustes || {});
    delete d.ajustes.leyenda;
    d.version = 3;
    return d;
  }

  function cargarDB() {
    try {
      const raw = localStorage.getItem(LS_KEY) || localStorage.getItem('reforzamiento.v3');
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.colegios && d.estudiantes) return migrar(d);
      }
    } catch (e) { /* almacenamiento no disponible */ }
    return DEMO.buildDemoDB(new Date());
  }
  function guardarDB() {
    if (EN_NUBE) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); }
    catch (e) { toast('No se pudo guardar en este navegador. Descarga un respaldo en Ajustes.', 'err'); }
  }

  function baseVacia() {
    return {
      version: 4, colegios: [], cursos: [], profesores: [], asignaciones: [],
      estudiantes: [], sesiones: [], registros: [], etiquetas: [],
      ajustes: { modoRapido: true, diasEdicion: 30 },
    };
  }

  DB = EN_NUBE ? baseVacia() : cargarDB();

  /* ---------------------------- Estado ------------------------- */
  const S = {
    fecha: hoyISO(), colegioId: '', cursoId: '', profesorId: '',
    realizada: true, motivo: '', filas: {}, obsAbierta: {},
    busqueda: '', intentado: false, editando: null, ultimo: null, modoLider: false,
  };
  const V = {
    vista: 'registrar',
    panel: { rango: '30', colegio: '', curso: '' },
    info: { rango: '30', colegio: '', curso: '', etiqueta: '' },
    estu: { colegio: '', curso: '' },
  };

  function rangoFechas(r) {
    const hoy = new Date();
    const hasta = LOGIC.iso(hoy);
    if (r === 'mes') {
      const p = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      return { desde: LOGIC.iso(p), hasta: hasta };
    }
    if (r === 'todo') return { desde: '2000-01-01', hasta: hasta };
    const dias = parseInt(r, 10) || 30;
    return { desde: LOGIC.iso(LOGIC.addDays(hoy, -(dias - 1))), hasta: hasta };
  }

  /* ----------------------------- Navegación -------------------- */
  function ir(vista) {
    V.vista = vista;
    $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === vista)));
    $$('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + vista));
    if (vista === 'registrar') renderRegistrar();
    if (vista === 'panel') renderPanel();
    if (vista === 'estudiantes') renderEstudiantes();
    if (vista === 'informes') renderInformes();
    if (vista === 'ajustes') renderAjustes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ================================================================
     VISTA 1 · REGISTRAR CLASE
     ================================================================ */
  function opcionesColegio() {
    return DB.colegios.map(c =>
      '<option value="' + c.id + '"' + (c.id === S.colegioId ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('');
  }

  function opcionesCurso() {
    const lista = LOGIC.cursosDeColegio(DB, S.colegioId);
    if (!lista.length) return '<option value="">Sin cursos registrados</option>';
    return lista.map(k =>
      '<option value="' + k.id + '"' + (k.id === S.cursoId ? ' selected' : '') + '>' + esc(k.nombre) + '</option>').join('');
  }

  function opcionesProfesor() {
    const asignados = LOGIC.profesoresDeColegio(DB, S.colegioId);
    const lista = asignados.slice();
    if (S.profesorId && !lista.some(p => p.id === S.profesorId)) {
      const p = LOGIC.profesor(DB, S.profesorId);
      if (p) lista.push(p);
    }
    if (!lista.length) return '<option value="">Sin profesores asignados</option>';
    return lista.map(p =>
      '<option value="' + p.id + '"' + (p.id === S.profesorId ? ' selected' : '') + '>' +
      esc(p.nombre) + (LOGIC.estaAsignado(DB, S.colegioId, p.id) ? '' : ' (no asignado)') + '</option>').join('');
  }

  function initSeleccion() {
    if (!DB.colegios.length) { S.colegioId = ''; S.cursoId = ''; return; }
    if (!S.colegioId || !LOGIC.colegio(DB, S.colegioId)) S.colegioId = DB.colegios[0].id;
    const cursos = LOGIC.cursosDeColegio(DB, S.colegioId);
    if (!S.cursoId || !cursos.some(k => k.id === S.cursoId)) S.cursoId = cursos.length ? cursos[0].id : '';
    const asig = LOGIC.profesoresDeColegio(DB, S.colegioId);
    if (!S.profesorId || !asig.some(p => p.id === S.profesorId)) S.profesorId = asig.length ? asig[0].id : (DB.profesores[0] || {}).id || '';
  }

  function cargarSesion() {
    const ests = LOGIC.estudiantesDeCurso(DB, S.cursoId);
    const ses = LOGIC.sesionDe(DB, S.cursoId, S.fecha);
    S.editando = ses;
    S.filas = {};
    S.obsAbierta = {};
    S.intentado = false;
    S.ultimo = null;
    S.modoLider = false;
    const rapido = DB.ajustes && DB.ajustes.modoRapido;
    ests.forEach(e => {
      const r = ses ? LOGIC.registroDe(DB, ses.id, e.id) : null;
      if (r) {
        S.filas[e.id] = {
          asistencia: r.asistencia,
          evaluacion: typeof r.evaluacion === 'number' ? r.evaluacion : 0,
          observacion: r.observacion || '', etiquetas: (r.etiquetas || []).slice(),
        };
        S.obsAbierta[e.id] = !!(r.observacion && r.observacion.trim());
      } else {
        S.filas[e.id] = { asistencia: rapido ? 'P' : '', evaluacion: null, observacion: '', etiquetas: [] };
      }
    });
    if (ses) {
      S.profesorId = ses.profesorId;
      S.realizada = ses.realizada;
      S.motivo = ses.motivo || '';
    }
  }

  function diasEdicion() { return (DB.ajustes && DB.ajustes.diasEdicion) || 30; }
  function fueraDePlazo() {
    if (!S.editando) return false;
    return LOGIC.diasDesde(S.editando.fecha) > diasEdicion();
  }

  function renderRegistrar() {
    initSeleccion();
    cargarSesion();
    const cont = $('#view-registrar');
    cont.innerHTML =
      '<div class="card">' +
        '<div class="card-head"><h2><span class="step">1</span>Datos de la clase</h2>' +
        '<span class="hint">Paso 1 de 2</span></div>' +
        '<div class="card-body">' +
          '<div class="grid4">' +
            '<div class="field"><label for="f-fecha">Fecha</label>' +
              '<input type="date" id="f-fecha" value="' + S.fecha + '">' +
              '<span class="hint">' + esc(LOGIC.fmtLarga(S.fecha)) + '</span></div>' +
            '<div class="field"><label for="f-col">Colegio</label>' +
              '<select id="f-col">' + opcionesColegio() + '</select>' +
              '<span class="hint">' + DB.colegios.length + ' establecimientos</span></div>' +
            '<div class="field"><label for="f-cur">Curso</label>' +
              '<select id="f-cur">' + opcionesCurso() + '</select>' +
              '<span class="hint">Define la lista del curso</span></div>' +
            '<div class="field"><label for="f-prof">Profesor</label>' +
              '<select id="f-prof">' + opcionesProfesor() + '</select>' +
              '<span class="hint">Quien dictó la clase</span></div>' +
          '</div>' +
          '<div id="ctx" style="margin-top:16px"></div>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h2><span class="step">2</span>Asistencia y evaluación del curso</h2>' +
          '<label class="hint" style="margin-left:auto;display:flex;gap:8px;align-items:center;cursor:pointer">' +
            '<input type="checkbox" id="chk-susp" ' + (S.realizada ? '' : 'checked') + '> Clase no realizada' +
          '</label></div>' +
        '<div id="curso"></div>' +
      '</div>' +
      '<div class="footer-bar" id="cursofoot"></div>';

    $('#f-fecha').addEventListener('change', e => {
      if (!e.target.value) return;
      S.fecha = e.target.value;
      cargarSesion(); pintarCtx(); pintarCurso();
    });
    $('#f-col').addEventListener('change', e => {
      S.colegioId = e.target.value;
      const cursos = LOGIC.cursosDeColegio(DB, S.colegioId);
      S.cursoId = cursos.length ? cursos[0].id : '';
      const asig = LOGIC.profesoresDeColegio(DB, S.colegioId);
      S.profesorId = asig.length ? asig[0].id : S.profesorId;
      $('#f-cur').innerHTML = opcionesCurso();
      $('#f-prof').innerHTML = opcionesProfesor();
      cargarSesion(); pintarCtx(); pintarCurso();
    });
    $('#f-cur').addEventListener('change', e => {
      S.cursoId = e.target.value;
      cargarSesion(); pintarCtx(); pintarCurso();
    });
    $('#f-prof').addEventListener('change', e => {
      S.profesorId = e.target.value;
      pintarCtx();
    });
    $('#chk-susp').addEventListener('change', e => {
      S.realizada = !e.target.checked;
      pintarCurso();
    });
    $('#cursofoot').addEventListener('click', e => {
      const b = e.target.closest('[data-accion]');
      if (b && b.dataset.accion === 'enviar') enviar();
    });
    $('#ctx').addEventListener('click', e => {
      const b = e.target.closest('[data-accion]');
      if (!b) return;
      if (b.dataset.accion === 'lider') { S.modoLider = true; pintarCtx(); pintarFoot(); }
    });
    pintarCtx(); pintarCurso();
  }

  function pintarCtx() {
    const cont = $('#ctx');
    if (!cont) return;
    const col = LOGIC.colegio(DB, S.colegioId);
    const cur = LOGIC.curso(DB, S.cursoId);
    const ests = LOGIC.estudiantesDeCurso(DB, S.cursoId);
    let h = '<div class="row-flex" style="gap:8px">';
    if (col) {
      h += '<span class="pill low">' + esc(col.nombre) + '</span>';
      if (cur) h += '<span class="pill low">' + esc(cur.nombre) + '</span>';
      h += '<span class="pill low">' + ests.length + ' estudiantes</span>';
    }
    h += '</div>';

    if (S.ultimo) {
      h += '<div class="banner ok" style="margin-top:12px"><span class="ic">✓</span><div><strong>' + esc(S.ultimo) +
        '</strong><br>La planilla Excel ya incluye este registro. Puedes corregir algo y volver a enviar.</div></div>';
    } else if (S.editando) {
      h += '<div class="banner info" style="margin-top:12px"><span class="ic">✎</span><div><strong>Esta clase ya estaba registrada</strong><br>' +
        'Se cargaron los datos guardados el ' + esc(LOGIC.fmtFecha(S.editando.actualizadoEn ? S.editando.actualizadoEn.slice(0, 10) : S.fecha)) +
        '. Si corriges y envías, se reemplaza el registro anterior (no se duplica).</div></div>';
    }
    if (S.editando && fueraDePlazo()) {
      if (!S.modoLider) {
        h += '<div class="banner warn" style="margin-top:12px"><span class="ic">!</span><div><strong>Fuera del plazo de corrección (' +
          diasEdicion() + ' días)</strong><br>Esta clase es del ' + esc(LOGIC.fmtFecha(S.editando.fecha)) +
          '. Los profesores pueden corregir hasta ' + diasEdicion() + ' días después; más atrás, solo la líder del proyecto.' +
          '<div style="margin-top:8px"><button class="btn btn-sm" data-accion="lider">Corregir como líder</button></div></div></div>';
      } else {
        h += '<div class="banner warn" style="margin-top:12px"><span class="ic">!</span><div><strong>Corrección como líder habilitada</strong><br>' +
          'Quedará registrado que esta clase se modificó fuera del plazo.</div></div>';
      }
    }
    if (S.profesorId && col && !LOGIC.estaAsignado(DB, S.colegioId, S.profesorId)) {
      h += '<div class="banner warn" style="margin-top:12px"><span class="ic">!</span><div><strong>' +
        esc((LOGIC.profesor(DB, S.profesorId) || {}).nombre) + ' no está asignado a este colegio.</strong><br>' +
        'Puede ser un reemplazo. El registro se guardará igual, pero quedará marcado en la planilla para revisión.</div></div>';
    }
    if (!ests.length) {
      h += '<div class="banner warn" style="margin-top:12px"><span class="ic">!</span><div><strong>Este curso no tiene estudiantes.</strong><br>' +
        'Agrégalos en la sección <em>Estudiantes</em>.</div></div>';
    }
    cont.innerHTML = h;
  }

  function pintarCurso() {
    const cont = $('#curso');
    const foot = $('#cursofoot');
    if (!cont) return;

    if (!S.realizada) {
      cont.innerHTML =
        '<div class="card-body">' +
          '<div class="grid3">' +
            '<div class="field"><label for="m-motivo">Motivo</label><select id="m-motivo">' +
              ['Feriado', 'Clase suspendida por el colegio', 'Profesor ausente', 'Otro']
                .map(m => '<option' + (S.motivo === m ? ' selected' : '') + '>' + m + '</option>').join('') +
            '</select></div>' +
            '<div class="field" style="grid-column:span 2"><label for="m-detalle">Detalle (opcional)</label>' +
              '<input type="text" id="m-detalle" placeholder="Ej: acto del colegio, se recupera el jueves" value="' +
              esc(S.motivo.indexOf('—') > 0 ? S.motivo.split('—').slice(1).join('—').trim() : '') + '"></div>' +
          '</div>' +
          '<div class="banner info" style="margin-top:14px"><span class="ic">i</span><div>' +
            'Una clase no realizada <strong>no se cuenta como ausencia</strong>. No baja la asistencia de los estudiantes ' +
            'y queda registrada en el informe con su motivo.</div></div>' +
        '</div>';
      foot.innerHTML = '<div class="sum">Se guardará la clase del <b>' + esc(LOGIC.fmtFecha(S.fecha)) + '</b> como no realizada.</div>' +
        '<span class="spacer"></span><button class="btn btn-primary" data-accion="enviar">Guardar</button>';
      $('#m-motivo').addEventListener('change', e => { S.motivo = e.target.value; });
      $('#m-detalle').addEventListener('change', e => { S.motivo = ($('#m-motivo').value || 'Otro') + (e.target.value ? ' — ' + e.target.value : ''); });
      return;
    }

    const ests = LOGIC.estudiantesDeCurso(DB, S.cursoId);
    const col = LOGIC.colegio(DB, S.colegioId);
    const cur = LOGIC.curso(DB, S.cursoId);
    const prof = LOGIC.profesor(DB, S.profesorId);
    if (!ests.length) {
      cont.innerHTML = '<div class="empty"><div class="big">☺</div>No hay estudiantes para mostrar.<br><span class="small">Agrégalos en la sección Estudiantes.</span></div>';
      foot.innerHTML = '';
      return;
    }

    cont.innerHTML =
      '<div class="course-bar">' +
        '<div class="who">' + esc(col.nombre) + (cur ? '<span class="curso-tag">' + esc(cur.nombre) + '</span>' : '') +
        '<small>' + esc(LOGIC.fmtLarga(S.fecha)) + (prof ? ' · ' + esc(prof.nombre) : '') + '</small></div>' +
        '<span class="spacer"></span>' +
        '<input type="search" id="buscar" placeholder="Buscar estudiante…" style="max-width:180px;min-height:38px;padding:8px 10px" value="' + esc(S.busqueda) + '">' +
        '<button class="btn btn-sm" data-accion="todos">Todos presentes</button>' +
      '</div>' +
      '<div class="rows-head"><span></span><span>Asistencia</span><span>Evaluación</span><span>Observación</span></div>' +
      '<div class="rows" id="rows"></div>';

    pintarFilas();
    pintarFoot();

    $('#buscar').addEventListener('input', e => { S.busqueda = e.target.value; pintarFilas(); });
    $('#rows').addEventListener('click', onRowClick);
    $('#rows').addEventListener('input', e => {
      const ta = e.target.closest('textarea[data-obs]');
      if (ta) S.filas[ta.dataset.obs].observacion = ta.value;
    });
    const btnTodos = $('[data-accion="todos"]', cont);
    if (btnTodos) btnTodos.addEventListener('click', () => marcarTodos('P'));
  }

  function visibles() {
    const ests = LOGIC.estudiantesDeCurso(DB, S.cursoId);
    const q = (S.busqueda || '').trim().toLowerCase();
    if (!q) return ests;
    return ests.filter(e => e.nombre.toLowerCase().indexOf(q) >= 0);
  }

  function pintarFilas() {
    const rows = $('#rows');
    if (!rows) return;
    rows.innerHTML = visibles().map((e, i) => filaHTML(e, i)).join('');
  }

  /** Repinta solo la fila tocada: mantiene el foco y evita parpadeos. */
  function actualizarFila(id) {
    const el = document.querySelector('.row[data-id="' + id + '"]');
    const est = LOGIC.estudiante(DB, id);
    if (!el || !est) { pintarFilas(); return; }
    const idx = Number($('.idx', el).textContent) - 1;
    const tmp = document.createElement('div');
    tmp.innerHTML = filaHTML(est, idx);
    el.replaceWith(tmp.firstElementChild);
  }

  function filaHTML(e, i) {
    const f = S.filas[e.id] || { asistencia: '', evaluacion: null, observacion: '', etiquetas: [] };
    const a = f.asistencia;
    const sinEval = f.evaluacion === null || f.evaluacion === undefined;
    const inv = S.intentado && (!a || sinEval);
    const abierta = !!S.obsAbierta[e.id];
    const obs = f.observacion || '';
    const tags = f.etiquetas || [];
    return '<div class="row' + (inv ? ' invalid' : '') + (a === 'A' ? ' off' : '') + '" data-id="' + e.id + '">' +
      '<div class="row-name"><span class="idx">' + (i + 1) + '</span><span class="nm">' + esc(e.nombre) +
        (obs ? '<small class="obs-dot">tiene observación</small>' : '') + '</span></div>' +
      '<div class="cell cell-asist"><span class="mlabel">Asistencia</span>' +
        '<div class="seg" data-tipo="a" role="group" aria-label="Asistencia">' +
          '<button data-k="P" class="' + (a === 'P' ? 'on' : '') + '" aria-pressed="' + (a === 'P') + '">P</button>' +
          '<button data-k="A" class="' + (a === 'A' ? 'on' : '') + '" aria-pressed="' + (a === 'A') + '">A</button>' +
        '</div></div>' +
      '<div class="cell cell-eval"><span class="mlabel">Evaluación</span>' +
        '<div class="seg eval" data-tipo="e" role="group" aria-label="Evaluación">' +
          [0, 1, 2, 3].map(v => '<button data-k="' + v + '" class="' + (f.evaluacion === v ? 'on' : '') +
            '" aria-pressed="' + (f.evaluacion === v) + '">' + v + '</button>').join('') +
        '</div></div>' +
      '<div class="obs">' + (abierta
        ? '<textarea data-obs="' + e.id + '" rows="2" placeholder="Observación (opcional): qué se vio, qué necesita, acuerdos…">' + esc(obs) + '</textarea>' +
          '<div class="tags">' + DB.etiquetas.map(t =>
            '<button class="tag-btn' + (tags.indexOf(t) >= 0 ? ' on' : '') + '" data-tag="' + esc(t) + '" data-eid="' + e.id + '">' + esc(t) + '</button>').join('') +
          '</div>'
        : '<button class="obs-toggle' + (obs ? ' has' : '') + '" data-obs-open="' + e.id + '">' +
          (obs ? esc(obs) : '+ Observación (opcional)') + '</button>') +
      '</div>' +
    '</div>';
  }

  function onRowClick(ev) {
    const row = ev.target.closest('.row');
    if (!row) return;
    const id = row.dataset.id;
    const f = S.filas[id];
    if (!f) return;

    const kBtn = ev.target.closest('.seg [data-k]');
    if (kBtn) {
      const tipo = kBtn.closest('.seg').dataset.tipo;
      const k = kBtn.dataset.k;
      if (tipo === 'a') {
        f.asistencia = k;
        // Quien no asiste no tiene nota: queda en 0, que es un valor registrado.
        if (k === 'A') f.evaluacion = 0;
      } else {
        f.evaluacion = (f.evaluacion === Number(k)) ? null : Number(k);
      }
      actualizarFila(id); pintarFoot();
      return;
    }
    const open = ev.target.closest('[data-obs-open]');
    if (open) {
      S.obsAbierta[id] = true;
      actualizarFila(id);
      const ta = $('textarea[data-obs="' + id + '"]');
      if (ta) ta.focus();
      return;
    }
    const tag = ev.target.closest('[data-tag]');
    if (tag) {
      const t = tag.dataset.tag, eid = tag.dataset.eid;
      const arr = S.filas[eid].etiquetas || (S.filas[eid].etiquetas = []);
      const i = arr.indexOf(t);
      if (i >= 0) arr.splice(i, 1); else arr.push(t);
      tag.classList.toggle('on');
    }
  }

  function marcarTodos(v) {
    Object.keys(S.filas).forEach(id => {
      S.filas[id].asistencia = v;
      if (v !== 'P') S.filas[id].evaluacion = v === 'A' ? 0 : null;
    });
    S.intentado = false;
    pintarFilas(); pintarFoot();
  }

  function resumenFilas() {
    const ests = LOGIC.estudiantesDeCurso(DB, S.cursoId);
    let p = 0, a = 0, listos = 0, sinEval = 0, sinMarcar = 0, sinNota = 0;
    ests.forEach(e => {
      const f = S.filas[e.id] || {};
      if (f.asistencia === 'P') p++;
      else if (f.asistencia === 'A') a++;
      else sinMarcar++;
      if (typeof f.evaluacion === 'number') { listos++; if (f.evaluacion === 0) sinNota++; }
      else if (f.asistencia) sinEval++;
    });
    return { total: ests.length, presentes: p, ausentes: a, listos, sinEval, sinMarcar, sinNota };
  }

  function pintarFoot() {
    const foot = $('#cursofoot');
    if (!foot) return;
    const r = resumenFilas();
    const faltan = r.sinEval + r.sinMarcar;
    const cerrado = S.realizada && fueraDePlazo() && !S.modoLider;
    let h = '<div class="sum">' + (r.total ? '<b>' + r.listos + ' de ' + r.total + '</b> completos' : 'Sin estudiantes') +
      (r.presentes ? ' · ' + r.presentes + ' presente' + (r.presentes > 1 ? 's' : '') : '') +
      (r.ausentes ? ' · ' + r.ausentes + ' ausente' + (r.ausentes > 1 ? 's' : '') : '');
    if (r.sinNota) h += ' · ' + r.sinNota + ' sin nota';
    if (faltan) h += '<br><span class="miss">Falta la evaluación de ' + faltan + ' estudiante' + (faltan > 1 ? 's' : '') + '</span>';
    if (cerrado) h += '<br><span class="miss">Fuera del plazo de corrección</span>';
    h += '</div><span class="spacer"></span><button class="btn btn-primary" data-accion="enviar"' +
      (cerrado ? ' disabled title="Solo la líder puede corregir clases de más de ' + diasEdicion() + ' días"' : '') + '>' +
      (S.editando ? 'Guardar cambios' : 'Enviar registro') + '</button>';
    foot.innerHTML = h;
  }

  async function enviar() {
    S.intentado = true;
    if (fueraDePlazo() && !S.modoLider) {
      toast('Esta clase está fuera del plazo de corrección (' + diasEdicion() + ' días).', 'err');
      return;
    }
    const ests = LOGIC.estudiantesDeCurso(DB, S.cursoId);
    const payload = {
      id: 's-' + S.cursoId + '-' + S.fecha,
      fecha: S.fecha, colegioId: S.colegioId, cursoId: S.cursoId, profesorId: S.profesorId,
      realizada: S.realizada, motivo: S.motivo,
      filas: ests.map(e => {
        const f = S.filas[e.id] || {};
        return {
          estudianteId: e.id, nombre: e.nombre,
          asistencia: f.asistencia, evaluacion: f.evaluacion,
          observacion: f.observacion || '', etiquetas: f.etiquetas || [],
        };
      }),
    };
    const errores = LOGIC.validarRegistro(payload);
    if (errores.length) {
      pintarFilas(); pintarFoot();
      toast(errores[0], 'err');
      const bad = $('.row.invalid');
      if (bad) bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const res = LOGIC.guardarSesion(DB, payload);
    S.editando = res.sesion;
    S.intentado = false;
    const subido = await subirClase(res, payload);
    if (!subido) { pintarCtx(); pintarCurso(); return; }
    if (res.sesion.realizada) {
      const r = resumenFilas();
      const k = LOGIC.indicadores(DB, { desde: S.fecha, hasta: S.fecha, cursoId: S.cursoId });
      S.ultimo = 'Registro guardado: ' + r.presentes + (r.presentes === 1 ? ' presente' : ' presentes') +
        ' y ' + r.ausentes + (r.ausentes === 1 ? ' ausente' : ' ausentes') +
        (k.promedio !== null ? ' · promedio ' + LOGIC.num(k.promedio, 1) : '') + '.';
      toast('Registro guardado', 'ok');
    } else {
      S.ultimo = 'Clase del ' + LOGIC.fmtFecha(S.fecha) + ' guardada como no realizada.';
      toast('Clase registrada como no realizada', 'ok');
    }
    pintarCtx(); pintarCurso();
  }

  /* ================================================================
     VISTA 2 · PANEL DE LA LÍDER
     ================================================================ */
  function kpi(lbl, val, sub, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="lbl">' + esc(lbl) + '</div>' +
      '<div class="val">' + val + '</div><div class="sub">' + (sub || '') + '</div></div>';
  }

  function opcionesCursoFiltro(colegioId, seleccionado) {
    const cursos = (DB.cursos || []).filter(k => !colegioId || k.colegioId === colegioId);
    if (!colegioId) {
      const porColegio = {};
      cursos.forEach(k => {
        const c = LOGIC.colegio(DB, k.colegioId);
        const n = c ? c.nombre : 'Sin colegio';
        (porColegio[n] = porColegio[n] || []).push(k);
      });
      return Object.keys(porColegio).sort().map(n =>
        '<optgroup label="' + esc(n) + '">' + porColegio[n].map(k =>
          '<option value="' + k.id + '"' + (k.id === seleccionado ? ' selected' : '') + '>' + esc(k.nombre) + '</option>').join('') +
        '</optgroup>').join('');
    }
    return cursos.map(k =>
      '<option value="' + k.id + '"' + (k.id === seleccionado ? ' selected' : '') + '>' + esc(k.nombre) + '</option>').join('');
  }

  function renderPanel() {
    const P = V.panel;
    const fr = rangoFechas(P.rango);
    const opts = { desde: fr.desde, hasta: fr.hasta, colegioId: P.colegio || undefined, cursoId: P.curso || undefined };
    const k = LOGIC.indicadores(DB, opts);
    const cols = LOGIC.porColegio(DB, opts);
    const curs = LOGIC.porCurso(DB, opts);
    const profs = LOGIC.porProfesor(DB, opts);
    const serie = LOGIC.serieSemanal(DB, opts);
    const als = LOGIC.alertas(DB, opts);
    const obs = LOGIC.observaciones(DB, opts);

    const cont = $('#view-panel');
    cont.innerHTML =
      '<div class="filters">' +
        '<div class="field"><label for="p-rango">Periodo</label><select id="p-rango">' +
          [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['mes', 'Este mes'], ['todo', 'Todo']]
            .map(o => '<option value="' + o[0] + '"' + (P.rango === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label for="p-col">Colegio</label><select id="p-col"><option value="">Todos</option>' +
          DB.colegios.map(c => '<option value="' + c.id + '"' + (P.colegio === c.id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label for="p-cur">Curso</label><select id="p-cur"><option value="">Todos</option>' +
          opcionesCursoFiltro(P.colegio, P.curso) + '</select></div>' +
        '<span class="spacer"></span>' +
        '<button class="btn" id="p-xlsx">⤓ Descargar Excel</button>' +
      '</div>' +

      '<div class="kpis">' +
        kpi('Asistencia', pct(k.asistencia), k.presentes + ' de ' + k.registros + ' registros', k.asistencia !== null && k.asistencia < 0.8 ? 'bad' : 'good') +
        kpi('Nivel 1-3', k.promedio !== null ? LOGIC.num(k.promedio, 1) : 's/d', k.conNota + ' registros con nota', '') +
        kpi('Sesiones', k.sesiones, 'en ' + curs.length + ' cursos', '') +
        kpi('Estudiantes', k.estudiantes, 'con al menos una clase', '') +
        kpi('En seguimiento', als.length, 'señales de alerta', als.length ? 'bad' : 'good') +
      '</div>' +

      '<div class="charts">' +
        '<div class="chart-card"><h3>Asistencia semana a semana</h3><p class="desc">Porcentaje de presencias sobre las clases realizadas.</p>' +
          '<div class="chart-wrap">' + chartLinea(serie.map(s => ({ label: s.label, value: s.asistencia })), { max: 1, color: '#2F6F4E', fmt: v => Math.round(v * 100) + '%' }) + '</div></div>' +
        '<div class="chart-card"><h3>Nivel de logro promedio</h3><p class="desc">Promedio semanal de los niveles 1 a 3 (el 0 no es nota).</p>' +
          '<div class="chart-wrap">' + chartLinea(serie.map(s => ({ label: s.label, value: s.promedio })), { max: 3, color: '#2A4F73', fmt: v => LOGIC.num(v, 1) }) + '</div></div>' +
      '</div>' +

      '<div class="charts">' +
        '<div class="chart-card"><h3>Distribución de la evaluación</h3><p class="desc">' + k.registros + ' registros en el periodo.</p>' +
          distribucionHTML(k) + '</div>' +
        '<div class="chart-card"><h3>Asistencia por curso</h3><p class="desc">Cada curso tiene sus propias clases.</p>' +
          tablaCursos(curs) + '</div>' +
      '</div>' +

      '<div class="card"><div class="card-head"><h2>Estudiantes que requieren atención</h2>' +
        '<span class="hint">' + (als.length ? 'Ordenados por gravedad' : 'Nada urgente por ahora') + '</span></div>' +
        '<div class="card-body">' + alertasHTML(als) + '</div></div>' +

      '<div class="card"><div class="card-head"><h2>Últimas observaciones</h2>' +
        '<span class="hint"><button class="btn btn-sm btn-ghost" id="p-ver-obs">Ver todas →</button></span></div>' +
        '<div class="card-body">' + obsRecientesHTML(obs.slice(0, 4)) + '</div></div>' +

      '<div class="card"><div class="card-head"><h2>Equipo docente</h2><span class="hint">Sesiones registradas en el periodo</span></div>' +
        '<div class="card-body" style="padding:0">' + tablaProfes(profs) + '</div></div>';

    $('#p-rango').addEventListener('change', e => { P.rango = e.target.value; renderPanel(); });
    $('#p-col').addEventListener('change', e => { P.colegio = e.target.value; P.curso = ''; renderPanel(); });
    $('#p-cur').addEventListener('change', e => { P.curso = e.target.value; renderPanel(); });
    $('#p-xlsx').addEventListener('click', () => exportar(opts, nombreArchivo('Informe', P.colegio, P.curso)));
    $('#p-ver-obs').addEventListener('click', () => {
      V.info.colegio = P.colegio; V.info.curso = P.curso; V.info.rango = P.rango; ir('informes');
    });
    cont.querySelectorAll('[data-est]').forEach(tr => tr.addEventListener('click', () => modalEstudiante(tr.dataset.est)));
  }

  function distribucionHTML(k) {
    const nombres = ['Sin nota', 'Nivel 1', 'Nivel 2', 'Nivel 3'];
    const colores = ['#98A6B3', '#B4530B', '#2F6F4E', '#1F6B3F'];
    const total = k.registros || 1;
    const filas = k.distribucion.map((n, i) => {
      const w = Math.round((n / total) * 100);
      return '<div class="dist-row"><span class="n" style="background:' + colores[i] + '">' + i + '</span>' +
        '<span class="track"><span class="fill" style="width:' + Math.max(2, w) + '%;background:' + colores[i] + '"></span></span>' +
        '<span class="txt">' + n + ' · ' + Math.round((n / total) * 100) + '%</span></div>';
    }).join('');
    return '<div class="dist">' + filas + '</div>' +
      '<div class="small" style="margin-top:12px">0 ' + nombres[0] + ' (no entra en el promedio) · 1 a 3 niveles de logro</div>';
  }

  function tablaCursos(curs) {
    if (!curs.length) return '<div class="empty">Sin registros en el periodo.</div>';
    return '<table class="tbl"><thead><tr><th>Curso</th><th>Asistencia</th><th>Nivel</th><th>Clases</th></tr></thead><tbody>' +
      curs.map(c => {
        const v = c.asistencia || 0;
        return '<tr><td><strong>' + esc(c.curso.nombre) + '</strong><div class="small">' + esc(c.colegio ? c.colegio.nombre : '') + '</div></td>' +
          '<td><div class="bar-cell"><span class="track"><span class="fill" style="width:' + Math.round(v * 100) + '%;background:' +
          (v < 0.8 ? '#B42318' : '#2F6F4E') + '"></span></span><span class="v">' + pct(c.asistencia) + '</span></div></td>' +
          '<td class="mono">' + (c.promedio === null ? '—' : LOGIC.num(c.promedio, 1)) + '</td>' +
          '<td class="mono">' + c.sesiones + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function tablaProfes(profs) {
    if (!profs.length) return '<div class="empty">Sin sesiones en el periodo.</div>';
    return '<table class="tbl"><thead><tr><th>Profesor</th><th>Sesiones</th><th>Registros</th><th>Asistencia</th><th class="hide-sm">Nivel</th></tr></thead><tbody>' +
      profs.map(p => '<tr><td><strong>' + esc(p.profesor.nombre) + '</strong><div class="small">' + esc(p.profesor.rol || '') + '</div></td>' +
        '<td class="mono">' + p.sesiones + '</td><td class="mono">' + p.registros + '</td><td class="mono">' + pct(p.asistencia) + '</td>' +
        '<td class="mono hide-sm">' + (p.promedio === null ? '—' : LOGIC.num(p.promedio, 1)) + '</td></tr>').join('') +
      '</tbody></table>';
  }

  function alertasHTML(als) {
    if (!als.length) return '<div class="banner ok" style="margin:0"><span class="ic">✓</span><div>No hay estudiantes bajo los umbrales de alerta (asistencia 70%, 2 ausencias seguidas, caída de nivel).</div></div>';
    return '<div class="alert-list">' + als.slice(0, 8).map(a =>
      '<div class="alert ' + (a.nivel === 'alto' ? 'hi' : a.nivel === 'medio' ? 'mid' : '') + '" data-est="' + a.estudiante.id + '" style="cursor:pointer">' +
        '<span class="pill ' + (a.nivel === 'alto' ? 'hi' : a.nivel === 'medio' ? 'mid' : 'low') + '">' +
          (a.nivel === 'alto' ? 'Prioritario' : a.nivel === 'medio' ? 'Atención' : 'Observar') + '</span>' +
        '<div><div class="who">' + esc(a.estudiante.nombre) + ' <span class="small">· ' + esc(a.colegio.nombre) +
          ' · ' + esc(a.curso.nombre) + '</span></div>' +
          '<div class="why">' + a.motivos.map(m => esc(m.texto)).join(' · ') + '</div>' +
          (a.ultimaObs ? '<div class="obs-line">“' + esc(a.ultimaObs) + '”</div>' : '') +
        '</div>' +
        '<span class="small">' + (a.promedio === null ? '' : 'nivel ' + LOGIC.num(a.promedio, 1)) + '</span>' +
      '</div>').join('') + '</div>' +
      (als.length > 8 ? '<div class="small" style="margin-top:10px">y ' + (als.length - 8) + ' estudiantes más con señales menores.</div>' : '');
  }

  function obsRecientesHTML(lista) {
    if (!lista.length) return '<div class="empty">Todavía no hay observaciones registradas.</div>';
    return lista.map(o => '<div class="obs-item"><div class="meta">' +
      '<strong>' + esc(o.estudiante ? o.estudiante.nombre : '') + '</strong>' +
      '<span>· ' + esc(o.colegio ? o.colegio.nombre : '') + (o.curso ? ' · ' + esc(o.curso.nombre) : '') + '</span>' +
      '<span>· ' + esc(LOGIC.fmtFecha(o.fecha)) + '</span>' +
      (typeof o.evaluacion === 'number' ? '<span class="pill ' + (o.evaluacion >= 2 ? 'ok' : 'mid') + '">eval ' + o.evaluacion + '</span>' : '') +
      '</div><div class="txt">' + esc(o.observacion) + '</div></div>').join('');
  }

  /* --------------------------- Gráficos ------------------------ */
  function chartLinea(puntos, o) {
    const W = 520, H = 190, pl = 40, pr = 12, pt = 14, pb = 26;
    const iw = W - pl - pr, ih = H - pt - pb;
    const max = o.max || 1;
    const n = puntos.length;
    if (!n) return '<div class="empty">Sin datos en el periodo.</div>';
    const x = i => n <= 1 ? pl + iw / 2 : pl + (i / (n - 1)) * iw;
    const y = v => pt + ih - Math.max(0, Math.min(1, v / max)) * ih;

    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const yy = y(v);
      g += '<line class="grid-l" x1="' + pl + '" y1="' + yy + '" x2="' + (W - pr) + '" y2="' + yy + '"/>';
      g += '<text class="axl" x="' + (pl - 7) + '" y="' + (yy + 3.5) + '" text-anchor="end">' + esc(o.fmt(v)) + '</text>';
    }

    const validos = puntos.map((p, i) => ({ i: i, v: p.value })).filter(p => p.v !== null && p.v !== undefined && !isNaN(p.v));
    let d = '', area = '';
    if (validos.length) {
      d = validos.map((p, k) => (k === 0 ? 'M' : 'L') + x(p.i).toFixed(1) + ',' + y(p.v).toFixed(1)).join(' ');
      area = d + ' L' + x(validos[validos.length - 1].i).toFixed(1) + ',' + (pt + ih) +
        ' L' + x(validos[0].i).toFixed(1) + ',' + (pt + ih) + ' Z';
    }
    const paso = Math.ceil(n / 7);
    let labels = '';
    puntos.forEach((p, i) => {
      if (i % paso !== 0 && i !== n - 1) return;
      labels += '<text class="axl" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(p.label) + '</text>';
    });
    const dots = validos.map(p =>
      '<circle cx="' + x(p.i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="3.6" fill="#fff" stroke="' + o.color + '" stroke-width="2.2">' +
      '<title>' + esc(puntos[p.i].label) + ': ' + esc(o.fmt(p.v)) + '</title></circle>').join('');

    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'Gráfico') + '">' +
      '<path d="' + area + '" fill="' + o.color + '" opacity=".10"/>' +
      '<path d="' + d + '" fill="none" stroke="' + o.color + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
      g + dots + labels + '</svg>';
  }

  /* ================================================================
     VISTA 3 · ESTUDIANTES
     ================================================================ */
  function renderEstudiantes() {
    if (!V.estu.colegio) V.estu.colegio = DB.colegios.length ? DB.colegios[0].id : '';
    const cid = V.estu.colegio;
    const col = LOGIC.colegio(DB, cid);
    const cursos = LOGIC.cursosDeColegio(DB, cid);
    if (V.estu.curso && !cursos.some(k => k.id === V.estu.curso)) V.estu.curso = '';
    const lista = DB.estudiantes.filter(e => e.colegioId === cid && (!V.estu.curso || e.cursoId === V.estu.curso))
      .sort(LOGIC.cmpNombre);
    const fr = rangoFechas('90');

    const cont = $('#view-estudiantes');
    cont.innerHTML =
      '<div class="filters">' +
        '<div class="field"><label for="e-col">Colegio</label><select id="e-col">' +
          DB.colegios.map(c => '<option value="' + c.id + '"' + (c.id === cid ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label for="e-cur">Curso</label><select id="e-cur"><option value="">Todos</option>' +
          cursos.map(k => '<option value="' + k.id + '"' + (V.estu.curso === k.id ? ' selected' : '') + '>' + esc(k.nombre) + '</option>').join('') +
        '</select></div>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn-primary" id="e-add">+ Agregar estudiante</button>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h2>' + esc(col ? col.nombre : '') + '</h2>' +
        '<span class="hint">' + lista.length + (lista.length === 1 ? ' estudiante' : ' estudiantes') + ' en la lista</span></div>' +
        '<div class="card-body" style="padding:0">' +
        (lista.length ? '<table class="tbl"><thead><tr><th>Estudiante</th><th>Curso</th>' +
          '<th>Asistencia</th><th class="hide-sm">Nivel</th><th class="hide-sm">Obs.</th><th></th></tr></thead><tbody>' +
          lista.map(e => {
            const regs = DB.registros.filter(r => r.estudianteId === e.id && DB.sesiones.some(s => s.id === r.sesionId && s.fecha >= fr.desde));
            const pres = regs.filter(r => r.asistencia === 'P').length;
            const evs = regs.filter(r => typeof r.evaluacion === 'number' && r.evaluacion >= 1);
            const tasa = regs.length ? pres / regs.length : null;
            const nobs = regs.filter(r => r.observacion && r.observacion.trim()).length;
            const cur = LOGIC.curso(DB, e.cursoId);
            return '<tr><td><strong>' + esc(e.nombre) + '</strong></td>' +
              '<td class="small">' + esc(cur ? cur.nombre : '—') + '</td>' +
              '<td><div class="bar-cell"><span class="track"><span class="fill" style="width:' + Math.round((tasa || 0) * 100) + '%;background:' +
              ((tasa || 0) < 0.7 ? '#B42318' : '#2F6F4E') + '"></span></span><span class="v">' + (tasa === null ? '—' : pct(tasa)) + '</span></div></td>' +
              '<td class="mono hide-sm">' + (evs.length ? LOGIC.num(evs.reduce((a, r) => a + r.evaluacion, 0) / evs.length, 1) : '—') + '</td>' +
              '<td class="mono hide-sm">' + nobs + '</td>' +
              '<td style="text-align:right;white-space:nowrap">' +
                '<button class="btn btn-sm btn-ghost" data-ver="' + e.id + '">Ver</button>' +
                '<button class="btn btn-sm btn-ghost" data-edit="' + e.id + '">Editar</button>' +
              '</td></tr>';
          }).join('') + '</tbody></table>'
          : '<div class="empty"><div class="big">☺</div>Sin estudiantes en esta vista.</div>') +
        '</div></div>';

    $('#e-col').addEventListener('change', e => { V.estu.colegio = e.target.value; V.estu.curso = ''; renderEstudiantes(); });
    $('#e-cur').addEventListener('change', e => { V.estu.curso = e.target.value; renderEstudiantes(); });
    $('#e-add').addEventListener('click', () => modalEditarEstudiante(null));
    cont.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => modalEditarEstudiante(b.dataset.edit)));
    cont.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => modalEstudiante(b.dataset.ver)));
  }

  function modalEditarEstudiante(id) {
    const e = id ? LOGIC.estudiante(DB, id) : null;
    const colegios = DB.colegios.map(c =>
      '<option value="' + c.id + '"' + ((e ? e.colegioId : V.estu.colegio) === c.id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('');
    const cursos = LOGIC.cursosDeColegio(DB, e ? e.colegioId : V.estu.colegio);
    abrirModal({
      titulo: e ? 'Editar estudiante' : 'Agregar estudiante',
      cuerpo:
        '<div class="field" style="margin-bottom:12px"><label>Nombre</label>' +
          '<input type="text" id="me-nombre" value="' + esc(e ? e.nombre : '') + '" placeholder="Nombre y apellidos"></div>' +
        '<div class="grid3">' +
          '<div class="field"><label>Colegio</label><select id="me-col">' + colegios + '</select></div>' +
          '<div class="field"><label>Curso</label><select id="me-cur">' +
            cursos.map(k => '<option value="' + k.id + '"' + (e && e.cursoId === k.id ? ' selected' : '') + '>' + esc(k.nombre) + '</option>').join('') +
          '</select></div>' +
        '</div>' +
        '<p class="small" style="margin:12px 0 0">La lista es la del curso: si un estudiante se integra más adelante, ' +
        'se agrega en ese momento y empieza a aparecer en las clases siguientes.</p>' +
        (e ? '<hr class="sep"><button class="btn btn-danger btn-sm" id="me-borrar">Quitar de la lista</button>' : ''),
      acciones: [
        { label: 'Cancelar', cls: '' },
        { label: e ? 'Guardar' : 'Agregar', cls: 'btn-primary', fn: async () => {
          const nombre = $('#me-nombre').value.trim();
          if (!nombre) { toast('Escribe el nombre del estudiante', 'err'); return false; }
          const colId = $('#me-col').value;
          const cursoId = $('#me-cur').value;
          if (!cursoId) { toast('El colegio no tiene cursos: agrégalos en Ajustes', 'err'); return false; }
          let objetivo;
          if (e) {
            Object.assign(e, { nombre, colegioId: colId, cursoId });
            objetivo = e;
          } else {
            objetivo = { id: 'e' + Date.now().toString(36), nombre, colegioId: colId, cursoId, notas: '' };
            DB.estudiantes.push(objetivo);
          }
          if (EN_NUBE) {
            try { await NUBE.guardarEstudiante(objetivo); }
            catch (err) { toast('No se pudo guardar en la base: ' + err.message, 'err'); return false; }
          } else {
            guardarDB();
          }
          toast(e ? 'Estudiante actualizado' : 'Estudiante agregado', 'ok');
          cargarSesion();
          renderEstudiantes();
          return true;
        } },
      ],
    });
    $('#me-col').addEventListener('change', ev => {
      const ks = LOGIC.cursosDeColegio(DB, ev.target.value);
      $('#me-cur').innerHTML = ks.map(k => '<option value="' + k.id + '">' + esc(k.nombre) + '</option>').join('');
    });
    if (e) {
      $('#me-borrar').addEventListener('click', async () => {
        const n = DB.registros.filter(r => r.estudianteId === e.id).length;
        if (!confirm('¿Quitar a ' + e.nombre + ' de la lista? Se borrarán también sus ' + n + ' registros de clase.')) return;
        if (EN_NUBE) {
          try { await NUBE.borrarEstudiante(e.id); }
          catch (err) { toast('No se pudo quitar: ' + err.message, 'err'); return; }
        }
        DB.estudiantes = DB.estudiantes.filter(x => x.id !== e.id);
        DB.registros = DB.registros.filter(r => r.estudianteId !== e.id);
        guardarDB();
        cerrarModal();
        renderEstudiantes();
        toast('Estudiante quitado de la lista');
      });
    }
  }

  function modalEstudiante(id) {
    const e = LOGIC.estudiante(DB, id);
    if (!e) return;
    const col = LOGIC.colegio(DB, e.colegioId);
    const cur = LOGIC.curso(DB, e.cursoId);
    const regs = DB.registros.filter(r => r.estudianteId === e.id)
      .map(r => ({ r, s: DB.sesiones.find(s => s.id === r.sesionId) }))
      .filter(x => x.s)
      .sort((a, b) => a.s.fecha < b.s.fecha ? 1 : -1);
    const pres = regs.filter(x => x.r.asistencia === 'P').length;
    const evs = regs.filter(x => typeof x.r.evaluacion === 'number' && x.r.evaluacion >= 1);
    const obs = regs.filter(x => x.r.observacion && x.r.observacion.trim());

    abrirModal({
      titulo: e.nombre,
      cuerpo:
        '<div class="row-flex" style="margin-bottom:12px">' +
          '<span class="pill low">' + esc(col ? col.nombre : '') + '</span>' +
          '<span class="pill low">' + esc(cur ? cur.nombre : '') + '</span>' +
        '</div>' +
        '<div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">' +
          kpi('Asistencia', regs.length ? pct(pres / regs.length) : '—', pres + ' de ' + regs.length) +
          kpi('Nivel 1-3', evs.length ? LOGIC.num(evs.reduce((a, x) => a + x.r.evaluacion, 0) / evs.length, 1) : '—', 'con nota') +
          kpi('Observaciones', obs.length, 'registradas') +
        '</div>' +
        '<h4 style="margin:6px 0 8px;font-size:13px;color:#5B6B7A">Últimas clases</h4>' +
        '<table class="tbl"><thead><tr><th>Fecha</th><th>Curso</th><th>Asist.</th><th>Eval.</th><th>Observación</th></tr></thead><tbody>' +
        regs.slice(0, 14).map(x => {
          const kk = LOGIC.curso(DB, x.s.cursoId);
          return '<tr><td class="small">' + esc(LOGIC.fmtFecha(x.s.fecha)) + '</td>' +
            '<td class="small">' + esc(kk ? kk.nombre : '') + '</td>' +
            '<td><span class="pill ' + (x.r.asistencia === 'P' ? 'ok' : 'hi') + '">' + x.r.asistencia + '</span></td>' +
            '<td class="mono">' + x.r.evaluacion + '</td>' +
            '<td class="small">' + esc(x.r.observacion || '') + '</td></tr>';
        }).join('') +
        '</tbody></table>',
      acciones: [{ label: 'Cerrar', cls: 'btn-primary' }],
    });
  }

  /* ================================================================
     VISTA 4 · INFORMES
     ================================================================ */
  function renderInformes() {
    const I = V.info;
    const fr = rangoFechas(I.rango);
    const opts = {
      desde: fr.desde, hasta: fr.hasta,
      colegioId: I.colegio || undefined, cursoId: I.curso || undefined,
      etiqueta: I.etiqueta || undefined,
    };
    const k = LOGIC.indicadores(DB, opts);
    const obs = LOGIC.observaciones(DB, opts);
    const borrador = LOGIC.borradorInforme(DB, { desde: fr.desde, hasta: fr.hasta, colegioId: I.colegio || undefined, cursoId: I.curso || undefined });

    const cont = $('#view-informes');
    cont.innerHTML =
      '<div class="card"><div class="card-head"><h2>Generar informe</h2>' +
        '<span class="hint">Descarga el Excel del periodo o el borrador narrativo</span></div>' +
        '<div class="card-body">' +
          '<div class="filters">' +
            '<div class="field"><label for="i-rango">Periodo</label><select id="i-rango">' +
              [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['mes', 'Este mes'], ['todo', 'Todo']]
                .map(o => '<option value="' + o[0] + '"' + (I.rango === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
            '</select></div>' +
            '<div class="field"><label for="i-col">Colegio</label><select id="i-col"><option value="">Todos</option>' +
              DB.colegios.map(c => '<option value="' + c.id + '"' + (I.colegio === c.id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('') +
            '</select></div>' +
            '<div class="field"><label for="i-cur">Curso</label><select id="i-cur"><option value="">Todos</option>' +
              opcionesCursoFiltro(I.colegio, I.curso) + '</select></div>' +
            '<div class="field"><label for="i-eti">Etiqueta</label><select id="i-eti"><option value="">Todas</option>' +
              DB.etiquetas.map(t => '<option' + (I.etiqueta === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') +
            '</select></div>' +
          '</div>' +
          '<div class="row-flex" style="gap:10px;margin-top:4px">' +
            '<button class="btn btn-primary" id="i-xlsx">⤓ Excel del periodo</button>' +
            '<button class="btn" id="i-csv">⤓ Solo observaciones (CSV)</button>' +
            '<button class="btn" id="i-copiar">Copiar borrador</button>' +
            '<button class="btn" id="i-txt">Descargar borrador (.txt)</button>' +
          '</div>' +
          '<div class="banner info" style="margin-top:16px"><span class="ic">i</span><div>' +
            '<strong>' + k.sesiones + ' sesiones · ' + k.registros + ' registros · ' + obs.length + ' observaciones.</strong><br>' +
            'El Excel trae una hoja por colegio (con un bloque por curso), la base plana para tablas dinámicas y la hoja de observaciones.</div></div>' +
        '</div></div>' +

      '<div class="card"><div class="card-head"><h2>Borrador del informe</h2>' +
        '<span class="hint">Se arma con los datos del periodo; edítalo en Word</span></div>' +
        '<div class="card-body"><pre class="draft" id="i-draft">' + esc(borrador) + '</pre></div></div>' +

      '<div class="card"><div class="card-head"><h2>Observaciones (' + obs.length + ')</h2>' +
        '<span class="hint">Texto libre del profesorado, filtrable</span></div>' +
        '<div class="card-body">' + (obs.length ? obs.map(o =>
          '<div class="obs-item"><div class="meta">' +
            '<strong>' + esc(o.estudiante ? o.estudiante.nombre : '') + '</strong>' +
            '<span>· ' + esc(o.colegio ? o.colegio.nombre : '') + (o.curso ? ' · ' + esc(o.curso.nombre) : '') + '</span>' +
            '<span>· ' + esc(LOGIC.fmtFecha(o.fecha)) + '</span>' +
            '<span>· ' + esc(o.profesor ? o.profesor.nombre : '') + '</span>' +
            (typeof o.evaluacion === 'number' ? '<span class="pill ' + (o.evaluacion >= 2 ? 'ok' : 'mid') + '">eval ' + o.evaluacion + '</span>' : '') +
            o.etiquetas.map(t => '<span class="pill low">' + esc(t) + '</span>').join('') +
          '</div><div class="txt">' + esc(o.observacion) + '</div></div>').join('')
          : '<div class="empty">No hay observaciones en este filtro.</div>') + '</div></div>';

    $('#i-rango').addEventListener('change', e => { I.rango = e.target.value; renderInformes(); });
    $('#i-col').addEventListener('change', e => { I.colegio = e.target.value; I.curso = ''; renderInformes(); });
    $('#i-cur').addEventListener('change', e => { I.curso = e.target.value; renderInformes(); });
    $('#i-eti').addEventListener('change', e => { I.etiqueta = e.target.value; renderInformes(); });
    $('#i-xlsx').addEventListener('click', () => exportar(opts, nombreArchivo('Informe', I.colegio, I.curso)));
    $('#i-csv').addEventListener('click', () => descargarTexto(csvObservaciones(obs), nombreArchivo('Observaciones', I.colegio, I.curso).replace('.xlsx', '.csv'), 'text/csv'));
    $('#i-txt').addEventListener('click', () => descargarTexto(borrador, nombreArchivo('Informe', I.colegio, I.curso).replace('.xlsx', '.txt'), 'text/plain'));
    $('#i-copiar').addEventListener('click', () => {
      navigator.clipboard.writeText(borrador).then(
        () => toast('Borrador copiado al portapapeles', 'ok'),
        () => toast('No se pudo copiar. Usa "Descargar borrador".', 'err')
      );
    });
  }

  function csvObservaciones(obs) {
    const filas = [['Fecha', 'Colegio', 'Curso', 'Estudiante', 'Profesor', 'Asistencia', 'Evaluacion', 'Etiquetas', 'Observacion']];
    obs.forEach(o => filas.push([
      o.fecha, o.colegio ? o.colegio.nombre : '', o.curso ? o.curso.nombre : '',
      o.estudiante ? o.estudiante.nombre : '', o.profesor ? o.profesor.nombre : '', o.asistencia,
      typeof o.evaluacion === 'number' ? o.evaluacion : '', (o.etiquetas || []).join(' | '), o.observacion,
    ]));
    return '\ufeff' + filas.map(f => f.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  }

  /* ================================================================
     VISTA 5 · AJUSTES
     ================================================================ */
  function renderAjustes() {
    const cont = $('#view-ajustes');

    cont.innerHTML =
      '<div class="card"><div class="card-head"><h2>Profesores</h2><span class="hint">Quiénes hacen las clases</span></div>' +
        '<div class="card-body" style="padding:0"><table class="tbl"><tbody>' +
        DB.profesores.map(p => '<tr><td><strong>' + esc(p.nombre) + '</strong><div class="small">' + esc(p.rol || 'Profesor') + '</div></td>' +
          '<td class="small">' + DB.asignaciones.filter(a => a.profesorId === p.id)
            .map(a => (LOGIC.colegio(DB, a.colegioId) || {}).nombre).filter(Boolean).join(', ') + '</td>' +
          '<td style="text-align:right"><button class="btn btn-sm btn-ghost" data-delprof="' + p.id + '">Quitar</button></td></tr>').join('') +
        '</tbody></table></div>' +
        '<div class="card-body" style="border-top:1px solid var(--line)"><div class="row-flex">' +
          '<input type="text" id="a-prof" placeholder="Nombre del profesor o profesora" style="max-width:300px">' +
          '<button class="btn btn-primary" id="a-addprof">Agregar profesor</button>' +
        '</div></div></div>' +

      '<div class="card"><div class="card-head"><h2>Colegios</h2>' +
        '<span class="hint">Un colegio puede tener varios cursos y varios profesores</span></div>' +
        '<div class="card-body" style="padding:0"><table class="tbl"><thead><tr><th>Colegio</th><th>Cursos</th><th>Profesores</th><th></th></tr></thead><tbody>' +
        DB.colegios.map(c => '<tr><td><strong>' + esc(c.nombre) + '</strong><div class="small">Comuna de ' + esc(c.comuna || '') + '</div></td>' +
          '<td class="small">' + (LOGIC.cursosDeColegio(DB, c.id).map(k =>
            esc(k.nombre) + ' <span class="small">(' + DB.estudiantes.filter(e => e.cursoId === k.id).length + ')</span>').join('<br>') || '<em>sin cursos</em>') + '</td>' +
          '<td class="small">' + (LOGIC.profesoresDeColegio(DB, c.id).map(p => esc(p.nombre)).join(', ') || '<em>sin asignar</em>') + '</td>' +
          '<td style="text-align:right;white-space:nowrap"><button class="btn btn-sm btn-ghost" data-curso="' + c.id + '">+ Curso</button>' +
          '<button class="btn btn-sm btn-ghost" data-asig="' + c.id + '">Profesores</button></td></tr>').join('') +
        '</tbody></table></div>' +
        '<div class="card-body" style="border-top:1px solid var(--line)"><div class="row-flex">' +
          '<input type="text" id="a-col" placeholder="Nombre del colegio" style="max-width:280px">' +
          '<button class="btn btn-primary" id="a-addcol">Agregar colegio</button>' +
        '</div></div></div>' +

      '<div class="card"><div class="card-head"><h2>Correcciones</h2></div>' +
        '<div class="card-body">' +
          '<div class="field" style="max-width:260px"><label>Días para corregir una clase</label>' +
            '<input type="number" id="a-dias" min="1" max="365" value="' + diasEdicion() + '"></div>' +
          '<p class="small" style="margin:10px 0 0">Dentro de ese plazo el profesor puede corregir y reenviar su clase. ' +
          'Pasado el plazo, el registro se cierra y solo la líder puede modificarlo.</p>' +
          '<hr class="sep">' +
          '<label class="row-flex" style="gap:10px;align-items:flex-start;cursor:pointer">' +
            '<input type="checkbox" id="a-rapido" ' + (DB.ajustes && DB.ajustes.modoRapido ? 'checked' : '') + ' style="margin-top:3px">' +
            '<span><strong>Modo rápido: todos parten como presentes</strong><br>' +
            '<span class="small">Al abrir una clase, los estudiantes aparecen marcados como presentes y solo se cambia a los ausentes. ' +
            'La evaluación se registra igual para cada uno.</span></span></label>' +
        '</div></div>' +

      '<div class="card"><div class="card-head"><h2>Datos</h2><span class="hint">Respaldo y pruebas</span></div>' +
        '<div class="card-body"><div class="row-flex">' +
          '<button class="btn" id="a-json">⤓ Descargar respaldo (.json)</button>' +
          '<button class="btn" id="a-load">⤒ Cargar respaldo</button>' +
          '<button class="btn btn-danger" id="a-reset">Volver a los datos de ejemplo</button>' +
          '<input type="file" id="a-file" accept="application/json" style="display:none">' +
        '</div><p class="small" style="margin-top:12px">' +
          DB.estudiantes.length + ' estudiantes · ' + DB.cursos.length + ' cursos · ' + DB.sesiones.length + ' sesiones · ' +
          DB.registros.length + ' registros · ' + DB.colegios.length + ' colegios</p>' +
        '<p class="small" style="margin:0">Esta versión guarda los datos en este navegador. Para que la líder vea lo que registran los profesores ' +
        'falta conectar una base de datos compartida (ver la propuesta).</p></div></div>';

    $('#a-addprof').addEventListener('click', () => {
      const n = $('#a-prof').value.trim();
      if (!n) return;
      DB.profesores.push({ id: 'p' + Date.now().toString(36), nombre: n, rol: 'Profesor' });
      guardarDB(); renderAjustes(); toast('Profesor agregado', 'ok');
    });
    $('#a-addcol').addEventListener('click', async () => {
      const n = $('#a-col').value.trim();
      if (!n) return;
      const id = 'c' + Date.now().toString(36);
      const col = { id, nombre: n, comuna: 'Los Parques', color: '#553C9A' };
      const cur = { id: 'k' + Date.now().toString(36), colegioId: id, nombre: 'Curso 1' };
      if (EN_NUBE) {
        try { await NUBE.guardarColegio(col); await NUBE.guardarCurso(cur); }
        catch (err) { toast('No se pudo guardar: ' + err.message, 'err'); return; }
      }
      DB.colegios.push(col);
      DB.cursos.push(cur);
      guardarDB(); renderAjustes(); toast('Colegio agregado con un curso inicial', 'ok');
    });
    $('#a-dias').addEventListener('change', e => {
      const v = Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 30));
      DB.ajustes.diasEdicion = v;
      e.target.value = v;
      guardarDB(); toast('Plazo de corrección: ' + v + ' días', 'ok');
    });
    $$('[data-delprof]', cont).forEach(b => b.addEventListener('click', () => {
      const p = LOGIC.profesor(DB, b.dataset.delprof);
      if (!confirm('¿Quitar a ' + p.nombre + '? Sus registros anteriores se conservan.')) return;
      DB.profesores = DB.profesores.filter(x => x.id !== b.dataset.delprof);
      DB.asignaciones = DB.asignaciones.filter(a => a.profesorId !== b.dataset.delprof);
      guardarDB(); renderAjustes();
    }));
    $$('[data-asig]', cont).forEach(b => b.addEventListener('click', () => modalAsignar(b.dataset.asig)));
    $$('[data-curso]', cont).forEach(b => b.addEventListener('click', () => modalCurso(b.dataset.curso)));
    $('#a-rapido').addEventListener('change', e => {
      DB.ajustes.modoRapido = e.target.checked;
      guardarDB();
      toast(e.target.checked ? 'Modo rápido activado' : 'Modo rápido desactivado');
    });
    $('#a-json').addEventListener('click', () => {
      descargarTexto(JSON.stringify(DB, null, 1), 'respaldo-reforzamiento-' + hoyISO() + '.json', 'application/json');
    });
    $('#a-load').addEventListener('click', () => $('#a-file').click());
    $('#a-file').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const d = JSON.parse(fr.result);
          if (!d.colegios || !d.estudiantes) throw new Error('formato');
          DB = migrar(d);
          guardarDB(); toast('Respaldo cargado', 'ok'); renderAjustes();
        } catch (err) { toast('El archivo no es un respaldo válido', 'err'); }
      };
      fr.readAsText(f);
    });
    $('#a-reset').addEventListener('click', () => {
      if (!confirm('Se reemplazarán todos los datos actuales por los de ejemplo. ¿Continuar?')) return;
      DB = DEMO.buildDemoDB(new Date());
      guardarDB(); cargarSesion(); renderAjustes(); S.ultimo = null;
      toast('Datos de ejemplo restaurados', 'ok');
    });

    // En modo en uso no se crean cuentas ni se restauran datos de ejemplo.
    // Este ajuste va al final, cuando todos los botones ya tienen su acción.
    if (EN_NUBE) {
      const campo = $('#a-prof');
      if (campo) {
        campo.parentNode.innerHTML = '<p class="small" style="margin:0">Las cuentas se crean en el panel de Supabase ' +
          '(Authentication → Users) y después se asignan a cada colegio. Si alguien deja el proyecto, desactívalo en la base.</p>';
      }
      $$('[data-delprof]', cont).forEach(function (b) { b.remove(); });
      const reset = $('#a-reset');
      if (reset) reset.remove();
      const cargar = $('#a-load');
      if (cargar) cargar.remove();
      const nota = cont.querySelector('.card:last-child .card-body p:last-child');
      if (nota) nota.textContent = 'Los datos se guardan en la base compartida: lo que registra cada profesor lo ve la líder al instante.';
    }
  }

  function modalCurso(colegioId) {
    const col = LOGIC.colegio(DB, colegioId);
    const existentes = LOGIC.cursosDeColegio(DB, colegioId);
    abrirModal({
      titulo: 'Cursos · ' + col.nombre,
      cuerpo:
        '<p class="small" style="margin-top:0">Cada curso es una clase distinta: tiene su propia lista de estudiantes y su propio registro por fecha.</p>' +
        '<div style="margin-bottom:14px">' + (existentes.length ? existentes.map(k =>
          '<div class="row-flex" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)">' +
          '<span><strong>' + esc(k.nombre) + '</strong> <span class="small">· ' +
          DB.estudiantes.filter(e => e.cursoId === k.id).length + ' estudiantes</span></span>' +
          '</div>').join('') : '<div class="small">Sin cursos todavía.</div>') + '</div>' +
        '<div class="field"><label>Nuevo curso</label>' +
          '<input type="text" id="mc-nombre" placeholder="Ej: Curso 2, Taller de lectura…"></div>',
      acciones: [
        { label: 'Cerrar' },
        { label: 'Agregar curso', cls: 'btn-primary', fn: async () => {
          const n = $('#mc-nombre').value.trim();
          if (!n) { toast('Escribe el nombre del curso', 'err'); return false; }
          const nuevo = { id: 'k' + Date.now().toString(36), colegioId, nombre: n };
          if (EN_NUBE) {
            try { await NUBE.guardarCurso(nuevo); }
            catch (err) { toast('No se pudo guardar: ' + err.message, 'err'); return false; }
          }
          DB.cursos.push(nuevo);
          guardarDB(); renderAjustes(); toast('Curso agregado', 'ok');
          return true;
        } },
      ],
    });
  }

  function modalAsignar(colegioId) {
    const col = LOGIC.colegio(DB, colegioId);
    abrirModal({
      titulo: 'Asignar profesores · ' + col.nombre,
      cuerpo: '<p class="small" style="margin-top:0">Marca quiénes hacen clases en este colegio. ' +
        'El profesor solo verá esos colegios al registrar.</p>' +
        DB.profesores.map(p => {
          const on = LOGIC.estaAsignado(DB, colegioId, p.id);
          return '<label class="row-flex" style="gap:8px;padding:7px 0;cursor:pointer">' +
            '<input type="checkbox" data-p="' + p.id + '" ' + (on ? 'checked' : '') + '> ' + esc(p.nombre) +
            '</label>';
        }).join(''),
      acciones: [
        { label: 'Cancelar' },
        { label: 'Guardar', cls: 'btn-primary', fn: async () => {
          const marcados = $$('[data-p]', $('#modal')).filter(x => x.checked).map(x => x.dataset.p);
          if (EN_NUBE) {
            try { await NUBE.guardarAsignaciones(colegioId, marcados); }
            catch (err) { toast('No se pudo guardar: ' + err.message, 'err'); return false; }
          }
          DB.asignaciones = DB.asignaciones.filter(a => a.colegioId !== colegioId)
            .concat(marcados.map(pid => ({ colegioId, profesorId: pid })));
          guardarDB(); renderAjustes(); toast('Asignaciones guardadas', 'ok');
          return true;
        } },
      ],
    });
  }

  /* ================================================================
     Exportación
     ================================================================ */
  function nombreArchivo(base, colegioId, cursoId) {
    let n = base;
    if (colegioId) {
      const c = LOGIC.colegio(DB, colegioId);
      if (c) n += ' ' + c.nombre;
    }
    if (cursoId) {
      const k = LOGIC.curso(DB, cursoId);
      if (k) n += ' ' + k.nombre;
    }
    n += ' ' + LOGIC.fmtCorta(hoyISO()) + '.xlsx';
    return n.replace(/[\\/:*?"<>|]/g, '-');
  }

  function exportar(opts, nombre) {
    try {
      const wb = REPORT.construir(DB, opts);
      const bytes = wb.build();
      descargar(bytes, nombre, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast('Excel generado: ' + nombre, 'ok');
    } catch (e) {
      console.error(e);
      toast('No se pudo generar el Excel: ' + e.message, 'err');
    }
  }

  function descargar(bytes, nombre, mime) {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function descargarTexto(texto, nombre, mime) {
    descargar(new TextEncoder().encode(texto), nombre, mime + ';charset=utf-8');
  }

  /* ================================================================
     Modal genérico
     ================================================================ */
  function abrirModal(o) {
    const bg = $('#modal-bg'), m = $('#modal');
    m.innerHTML = '<header><h3>' + esc(o.titulo) + '</h3>' +
      '<button class="x" data-close aria-label="Cerrar">×</button></header>' +
      '<div class="body">' + (o.cuerpo || '') + '</div>' +
      '<div class="foot"></div>';
    const foot = $('.foot', m);
    (o.acciones || []).forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.cls || '');
      b.textContent = a.label;
      b.addEventListener('click', () => {
        if (a.fn) { if (a.fn() === false) return; }
        cerrarModal();
      });
      foot.appendChild(b);
    });
    bg.classList.add('on');
    $('[data-close]', m).addEventListener('click', cerrarModal);
    bg.onclick = e => { if (e.target === bg) cerrarModal(); };
    document.addEventListener('keydown', modalEsc);
  }
  function modalEsc(e) { if (e.key === 'Escape') cerrarModal(); }
  function cerrarModal() {
    $('#modal-bg').classList.remove('on');
    document.removeEventListener('keydown', modalEsc);
  }

  /* ================================================================
     Arranque
     ================================================================ */
  async function init() {
    $$('.tab').forEach(t => t.addEventListener('click', () => ir(t.dataset.view)));
    if (EN_NUBE) {
      if (NUBE.haySesion()) {
        try {
          await cargarDeNube();
          arrancar();
        } catch (e) {
          mostrarLogin('No se pudieron cargar los datos: ' + e.message);
        }
      } else {
        mostrarLogin('');
      }
      return;
    }
    initSeleccion();
    ir('registrar');
    if (!ALMACEN_OK) {
      const aviso = document.createElement('div');
      aviso.className = 'banner warn';
      aviso.style.margin = '0 0 14px';
      aviso.innerHTML = '<span class="ic">!</span><div><strong>Este navegador no permite guardar los registros al abrir el archivo directamente.</strong><br>' +
        'Puedes recorrer las pantallas, pero lo que registres se perderá al cerrar. Abre el sistema en Chrome o Edge, o con el enlace publicado.</div>';
      const main = document.querySelector('main');
      if (main) main.insertBefore(aviso, main.firstChild);
    }
  }

  /* ================================================================
     MODO EN USO · entrada, carga y guardado en la base compartida
     ================================================================ */
  async function cargarDeNube() {
    DB = await NUBE.cargarTodo();
    DB.ajustes = DB.ajustes || { modoRapido: true, diasEdicion: 30 };
    if (!DB.etiquetas || !DB.etiquetas.length) {
      DB.etiquetas = ['Comprensión lectora', 'Cálculo y operatoria', 'Participación', 'Conducta',
        'Motivación', 'Asistencia irregular', 'Apoyo familiar', 'Logro destacado'];
    }
    if (NUBE.pendientes()) {
      try { await NUBE.reintentar(); DB = await NUBE.cargarTodo(); } catch (e) { /* sigue sin conexión */ }
    }
  }

  function arrancar() {
    document.body.classList.remove('sin-tabs');
    initSeleccion();
    pintarUsuario();
    ir('registrar');
  }

  function mostrarLogin(mensaje) {
    document.body.classList.add('sin-tabs');
    $$('.view').forEach(v => v.classList.remove('on'));
    const c = $('#view-login');
    c.classList.add('on');
    c.innerHTML =
      '<div class="login-card">' +
        '<div class="brand" style="margin-bottom:18px"><span class="mark">R</span>' +
          '<div>Reforzamiento<small>Sistema en uso</small></div></div>' +
        '<h1 style="font-size:20px;margin:0 0 6px">Entrar</h1>' +
        '<p class="small" style="margin:0 0 18px">Usa la cuenta que te entregó la líder del proyecto.</p>' +
        (mensaje ? '<div class="banner err" style="margin-bottom:14px"><span class="ic">!</span><div>' + esc(mensaje) + '</div></div>' : '') +
        '<form id="login-form">' +
          '<div class="field" style="margin-bottom:12px"><label for="lg-email">Correo</label>' +
            '<input type="email" id="lg-email" autocomplete="username" required placeholder="nombre@correo.cl"></div>' +
          '<div class="field" style="margin-bottom:18px"><label for="lg-pass">Contraseña</label>' +
            '<input type="password" id="lg-pass" autocomplete="current-password" required></div>' +
          '<button class="btn btn-primary" type="submit" style="width:100%;justify-content:center">Entrar</button>' +
        '</form>' +
        '<p class="small" style="margin:14px 0 0;text-align:center">¿Olvidaste tu contraseña? Pídele a la líder que la restablezca.</p>' +
      '</div>';
    $('#login-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const b = ev.target.querySelector('button');
      b.disabled = true; b.textContent = 'Entrando…';
      try {
        await NUBE.ingresar($('#lg-email').value, $('#lg-pass').value);
        await cargarDeNube();
        arrancar();
        toast('Bienvenido/a', 'ok');
      } catch (e) {
        b.disabled = false; b.textContent = 'Entrar';
        const aviso = $('.banner.err', c);
        if (aviso) aviso.querySelector('div').textContent = e.message;
        else mostrarLogin(e.message);
      }
    });
  }

  function pintarUsuario() {
    if (!EN_NUBE) return;
    const u = NUBE.usuario();
    const cont = document.querySelector('.topbar-in');
    if (!cont || $('.userbox')) return;
    const div = document.createElement('div');
    div.className = 'userbox';
    div.innerHTML = '<span class="uname" title="' + esc(u.email || '') + '">' + esc(u.nombre || u.email) + '</span>' +
      '<span class="pend" id="pend" hidden></span>' +
      '<button class="btn btn-sm btn-ghost" id="salir">Salir</button>';
    cont.appendChild(div);
    $('#salir').addEventListener('click', async () => {
      await NUBE.salir();
      location.reload();
    });
    actualizarPendientes();
  }

  function actualizarPendientes() {
    if (!EN_NUBE) return;
    const el = $('#pend');
    if (!el) return;
    const n = NUBE.pendientes();
    el.hidden = !n;
    el.textContent = n ? n + ' sin enviar' : '';
  }

  /** Guarda la clase en la base. Si no hay conexión, la deja en cola. */
  async function subirClase(res, payload) {
    if (!EN_NUBE) { guardarDB(); return true; }
    const datos = {
      id: res.sesion.id, fecha: payload.fecha, colegioId: payload.colegioId,
      cursoId: payload.cursoId, profesorId: payload.profesorId,
      realizada: payload.realizada, motivo: payload.motivo, filas: payload.filas,
    };
    try {
      await NUBE.guardarClase(datos);
      actualizarPendientes();
      return true;
    } catch (e) {
      NUBE.encolar(datos);
      actualizarPendientes();
      toast('Sin conexión: el registro quedó guardado en este teléfono y se enviará solo.', 'err');
      return false;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  window.__app = { DB: () => DB, S, V, exportar, migrar };
})();
