/* ============================================================
   report.js — Informe Excel.
     · Resumen          indicadores generales, por colegio y por curso
     · <un colegio>     una hoja por colegio, con un bloque por curso
     · Registro         base plana (una fila por estudiante y clase)
     · Observaciones    texto cualitativo filtrable
     · Estudiantes      nómina por curso
     · Diccionario      qué significa cada código y cómo recalcular

   Escala: 0 = sin nota; 1, 2 y 3 = niveles de logro.
   ============================================================ */
(function (root, factory) {
  const api = factory(root.LOGIC, root.XLSX);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.REPORT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (L, XLSX) {
  'use strict';

  function construir(db, opts) {
    opts = opts || {};
    const desde = opts.desde, hasta = opts.hasta;
    const wb = XLSX.create();

    const k = L.indicadores(db, opts);
    const cols = L.porColegio(db, opts);
    const curs = L.porCurso(db, opts);
    const profs = L.porProfesor(db, opts);
    const obs = L.observaciones(db, opts);
    const als = L.alertas(db, opts);
    const periodo = L.fmtFecha(desde) + ' a ' + L.fmtFecha(hasta);

    /* ---------------------------- Resumen --------------------------- */
    const rs = wb.addSheet('Resumen');
    rs.widths([36, 20, 14, 12, 12, 14, 14, 14, 14]);
    rs.merge(0, 0, 0, 8);
    rs.set(0, 0, 'Reforzamiento escolar — Informe de asistencia y evaluación', 'title');
    rs.rowHeight(0, 24);
    rs.merge(1, 0, 1, 8);
    rs.set(1, 0, 'Periodo: ' + periodo + ' · Generado el ' + L.fmtFecha(new Date()) +
      ' · Fuente: registros del sistema', 'note');

    let r = 3;
    rs.set(r, 0, 'Indicadores generales del periodo', 'h2');
    rs.merge(r, 0, r, 3);
    r++;
    [
      ['Sesiones realizadas', k.sesiones, 'int'],
      ['Colegios con actividad', cols.length, 'int'],
      ['Cursos con actividad', curs.length, 'int'],
      ['Estudiantes participantes', k.estudiantes, 'int'],
      ['Registros de asistencia', k.registros, 'int'],
      ['Asistencia promedio', k.asistencia, 'pct'],
      ['Evaluación promedio (niveles 1-3)', k.promedio, 'num'],
      ['Registros con nota', k.conNota, 'int'],
      ['Registros sin nota (0)', k.sinNota, 'int'],
      ['Niveles 2 y 3 sobre las notas', k.conNota ? (k.distribucion[2] + k.distribucion[3]) / k.conNota : null, 'pct'],
      ['Registros con observación', k.observaciones, 'int'],
    ].forEach(function (x) {
      rs.set(r, 0, x[0], 'text');
      rs.merge(r, 0, r, 1);
      rs.set(r, 2, x[1], x[2]);
      r++;
    });

    r += 1;
    rs.set(r, 0, 'Asistencia y evaluación por colegio', 'h2');
    rs.merge(r, 0, r, 8);
    r++;
    ['Colegio', 'Comuna', 'Cursos', 'Sesiones', 'Estudiantes', 'Asistencia', 'Prom. 1-3', 'Sin nota', 'Obs.']
      .forEach(function (h, i) { rs.set(r, i, h, 'h1'); });
    r++;
    const cabCol = r;
    cols.forEach(function (c) {
      const kc = L.indicadores(db, Object.assign({}, opts, { colegioId: c.colegio.id, cursoId: undefined }));
      rs.set(r, 0, c.colegio.nombre, 'text');
      rs.set(r, 1, c.colegio.comuna || '', 'text');
      rs.set(r, 2, c.cursos, 'int');
      rs.set(r, 3, c.sesiones, 'int');
      rs.set(r, 4, c.estudiantes, 'int');
      rs.set(r, 5, c.asistencia, 'pct');
      rs.set(r, 6, c.promedio, 'num');
      rs.set(r, 7, kc.sinNota, 'int');
      rs.set(r, 8, kc.observaciones, 'int');
      r++;
    });
    rs.autofilter(cabCol - 1, 0, r - 1, 8);

    r += 1;
    rs.set(r, 0, 'Detalle por curso', 'h2');
    rs.merge(r, 0, r, 8);
    r++;
    ['Colegio', 'Curso', 'Sesiones', 'Estudiantes', 'Asistencia', 'Prom. 1-3', 'Sin nota', 'Obs.']
      .forEach(function (h, i) { rs.set(r, i, h, 'h1'); });
    r++;
    const cabCur = r;
    curs.forEach(function (c) {
      const kk = L.indicadores(db, { desde: desde, hasta: hasta, cursoId: c.curso.id });
      rs.set(r, 0, c.colegio ? c.colegio.nombre : '', 'text');
      rs.set(r, 1, c.curso.nombre, 'text');
      rs.set(r, 2, c.sesiones, 'int');
      rs.set(r, 3, c.estudiantes, 'int');
      rs.set(r, 4, c.asistencia, 'pct');
      rs.set(r, 5, c.promedio, 'num');
      rs.set(r, 6, kk.sinNota, 'int');
      rs.set(r, 7, kk.observaciones, 'int');
      r++;
    });
    rs.autofilter(cabCur - 1, 0, r - 1, 7);

    r += 1;
    rs.set(r, 0, 'Desempeño por profesor', 'h2');
    rs.merge(r, 0, r, 8);
    r++;
    ['Profesor', 'Sesiones', 'Registros', 'Asistencia', 'Prom. 1-3'].forEach(function (h, i) { rs.set(r, i, h, 'h1'); });
    r++;
    profs.forEach(function (p) {
      rs.set(r, 0, p.profesor.nombre, 'text');
      rs.set(r, 1, p.sesiones, 'int');
      rs.set(r, 2, p.registros, 'int');
      rs.set(r, 3, p.asistencia, 'pct');
      rs.set(r, 4, p.promedio, 'num');
      r++;
    });

    r += 1;
    rs.set(r, 0, 'Distribución de la evaluación', 'h2');
    rs.merge(r, 0, r, 8);
    r++;
    ['Valor', 'Significado', 'Registros', '% del total'].forEach(function (h, i) { rs.set(r, i, h, 'h1'); });
    r++;
    const etiquetas = ['Sin nota', 'Nivel 1', 'Nivel 2', 'Nivel 3'];
    k.distribucion.forEach(function (n, i) {
      rs.set(r, 0, i, 'int');
      rs.set(r, 1, etiquetas[i], 'text');
      rs.set(r, 2, n, 'int');
      rs.set(r, 3, k.registros ? n / k.registros : null, 'pct');
      r++;
    });

    r += 1;
    rs.set(r, 0, 'Estudiantes que requieren seguimiento (' + als.length + ')', 'h2');
    rs.merge(r, 0, r, 8);
    r++;
    ['Estudiante', 'Colegio', 'Curso', 'Asistencia', 'Prom. 1-3', 'Motivo'].forEach(function (h, i) { rs.set(r, i, h, 'h1'); });
    r++;
    als.slice(0, 25).forEach(function (a) {
      rs.set(r, 0, a.estudiante.nombre, 'text');
      rs.set(r, 1, a.colegio.nombre, 'text');
      rs.set(r, 2, a.curso.nombre, 'text');
      rs.set(r, 3, a.tasa, 'pct');
      rs.set(r, 4, a.promedio, 'num');
      rs.set(r, 5, a.motivos.map(function (m) { return m.texto; }).join('; '), 'wrap');
      r++;
    });
    rs.freeze(0, 0);

    /* --------------------- Una hoja por colegio --------------------- */
    const todas = L.filtrar(db, opts).sesiones;

    (db.colegios || []).forEach(function (col) {
      if (opts.colegioId && col.id !== opts.colegioId) return;
      const cursosCol = L.cursosDeColegio(db, col.id).filter(function (cur) {
        if (opts.cursoId && cur.id !== opts.cursoId) return false;
        return todas.some(function (s) { return s.cursoId === cur.id && s.realizada; });
      });
      if (!cursosCol.length) return;

      const bloques = cursosCol.map(function (cur) {
        const sesiones = todas.filter(function (s) { return s.cursoId === cur.id && s.realizada; })
          .sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
        return { curso: cur, sesiones: sesiones, estudiantes: L.estudiantesDeCurso(db, cur.id) };
      });

      const maxSes = bloques.reduce(function (m, b) { return Math.max(m, b.sesiones.length); }, 0);
      const ws = wb.addSheet(col.nombre);
      ws.widths([30].concat(new Array(maxSes).fill(7.5)).concat([10.5, 9.5, 8.5, 8, 44]));

      ws.merge(0, 0, 0, 1 + maxSes + 3);
      ws.set(0, 0, col.nombre, 'title');
      ws.rowHeight(0, 24);
      ws.merge(1, 0, 1, 1 + maxSes + 3);
      ws.set(1, 0, 'Comuna de ' + (col.comuna || '') + ' · Periodo: ' + periodo + ' · ' +
        bloques.length + ' curso(s) · Profesor(es): ' +
        L.profesoresDeColegio(db, col.id).map(function (p) { return p.nombre; }).join(', '), 'note');
      let row = 3;

      bloques.forEach(function (b) {
        const nSes = b.sesiones.length;
        const base = 1 + nSes;

        ws.merge(row, 0, row, base + 4);
        ws.set(row, 0, b.curso.nombre + '  ·  ' + b.estudiantes.length + ' estudiantes  ·  ' + nSes + ' clases', 'h2');
        ws.rowHeight(row, 20);
        row++;

        ws.set(row, 0, 'Estudiante', 'h1');
        b.sesiones.forEach(function (s, i) { ws.set(row, 1 + i, L.fmtCorta(s.fecha), 'h1'); });
        ws.set(row, base, '% Asist.', 'h1');
        ws.set(row, base + 1, 'Prom. 1-3', 'h1');
        ws.set(row, base + 2, 'Sin nota', 'h1');
        ws.set(row, base + 3, 'N obs.', 'h1');
        ws.set(row, base + 4, 'Última observación', 'h1');
        ws.rowHeight(row, 28);
        row++;

        const primeraFila = row;
        b.estudiantes.forEach(function (est) {
          ws.set(row, 0, est.nombre, 'text');
          let pres = 0, cnt = 0, sum = 0, sinNota = 0, nobs = 0, ultima = '';
          b.sesiones.forEach(function (s, i) {
            const rg = L.registroDe(db, s.id, est.id);
            if (!rg) { ws.set(row, 1 + i, '', 'center'); return; }
            if (rg.asistencia === 'P') {
              pres++;
              ws.set(row, 1 + i, 'P · ' + rg.evaluacion, 'present');
              if (rg.evaluacion >= 1) { cnt++; sum += rg.evaluacion; } else { sinNota++; }
            } else {
              ws.set(row, 1 + i, 'A', 'absent');
              if (!rg.evaluacion) sinNota++;
            }
            if (rg.observacion && rg.observacion.trim()) { nobs++; ultima = rg.observacion; }
          });
          const conReg = b.sesiones.filter(function (s) { return !!L.registroDe(db, s.id, est.id); }).length;
          ws.set(row, base, conReg ? pres / conReg : null, 'pct');
          ws.set(row, base + 1, cnt ? sum / cnt : null, 'num');
          ws.set(row, base + 2, sinNota, 'int');
          ws.set(row, base + 3, nobs, 'int');
          ws.set(row, base + 4, ultima, 'wrap');
          row++;
        });

        const kc = L.indicadores(db, { desde: desde, hasta: hasta, cursoId: b.curso.id });
        ws.set(row, 0, 'Total ' + b.curso.nombre, 'total');
        for (let i = 0; i < nSes; i++) ws.set(row, 1 + i, '', 'total');
        ws.set(row, base, kc.asistencia, 'pct');
        ws.set(row, base + 1, kc.promedio, 'num');
        ws.set(row, base + 2, kc.sinNota, 'int');
        ws.set(row, base + 3, kc.observaciones, 'int');
        ws.set(row, base + 4, '', 'total');
        row += 2;
      });

      ws.freeze(4, 1);
      ws.merge(row, 0, row, 8);
      ws.set(row, 0, 'Cada celda muestra la asistencia y el valor registrado: "P · 3" es presente con nivel 3; ' +
        '"P · 0" es presente sin nota; "A" es ausente (sin nota). Cada curso tiene su propio bloque porque las fechas de clase son distintas.', 'note');
    });

    /* ------------------------ Registro plano ------------------------ */
    const rg = wb.addSheet('Registro');
    rg.widths([11, 30, 16, 20, 28, 11, 11, 58, 24, 18, 18]);
    rg.set(0, 0, 'Base de datos — una fila por estudiante y clase', 'title');
    rg.merge(0, 0, 0, 10);
    rg.set(1, 0, 'Periodo: ' + periodo + ' · ' + k.registros + ' registros · 0 = sin nota', 'note');
    rg.merge(1, 0, 1, 10);
    const rHead = ['Fecha', 'Colegio', 'Curso', 'Profesor', 'Estudiante', 'Asistencia', 'Evaluación',
      'Observación', 'Etiquetas', 'Registrado por', 'Última actualización'];
    rHead.forEach(function (h, i) { rg.set(3, i, h, 'h1'); });
    rg.rowHeight(3, 28);

    const filas = [];
    k.registrosLista.forEach(function (reg) {
      const s = k.sesionesLista.find(function (x) { return x.id === reg.sesionId; });
      if (s) filas.push({ s: s, reg: reg });
    });
    filas.sort(function (a, b) {
      if (a.s.fecha !== b.s.fecha) return a.s.fecha < b.s.fecha ? -1 : 1;
      if (a.s.colegioId !== b.s.colegioId) return a.s.colegioId < b.s.colegioId ? -1 : 1;
      return 0;
    });

    let rr = 4;
    filas.forEach(function (x) {
      const est = L.estudiante(db, x.reg.estudianteId);
      const col = L.colegio(db, x.s.colegioId);
      const cur = L.curso(db, x.s.cursoId);
      const prof = L.profesor(db, x.s.profesorId);
      rg.set(rr, 0, L.parseISO(x.s.fecha), 'date');
      rg.set(rr, 1, col ? col.nombre : '', 'text');
      rg.set(rr, 2, cur ? cur.nombre : '', 'text');
      rg.set(rr, 3, prof ? prof.nombre : '', 'text');
      rg.set(rr, 4, est ? est.nombre : '', 'text');
      rg.set(rr, 5, x.reg.asistencia, x.reg.asistencia === 'P' ? 'present' : 'absent');
      rg.set(rr, 6, x.reg.evaluacion, 'int');
      rg.set(rr, 7, x.reg.observacion || '', 'wrap');
      rg.set(rr, 8, (x.reg.etiquetas || []).join(', '), 'wrap');
      rg.set(rr, 9, prof ? prof.nombre : '', 'text');
      rg.set(rr, 10, x.reg.actualizadoEn ? L.fmtFecha(x.reg.actualizadoEn.slice(0, 10)) : '', 'date');
      rr++;
    });
    rg.freeze(4, 0);
    rg.autofilter(3, 0, Math.max(3, rr - 1), 10);
    rg.merge(rr + 1, 0, rr + 1, 8);
    rg.set(rr + 1, 0, 'Sugerencia: usa esta hoja para tablas dinámicas y gráficos; las hojas por colegio son para lectura rápida.', 'note');

    /* ----------------------- Observaciones -------------------------- */
    const os = wb.addSheet('Observaciones');
    os.widths([11, 30, 16, 28, 20, 11, 11, 22, 66]);
    os.merge(0, 0, 0, 8);
    os.set(0, 0, 'Observaciones registradas (' + obs.length + ')', 'title');
    os.merge(1, 0, 1, 8);
    os.set(1, 0, 'Texto libre escrito por el profesorado. Sirve para el análisis cualitativo del informe.', 'note');
    ['Fecha', 'Colegio', 'Curso', 'Estudiante', 'Profesor', 'Asist.', 'Eval.', 'Etiqueta', 'Observación']
      .forEach(function (h, i) { os.set(3, i, h, 'h1'); });
    let oo = 4;
    obs.forEach(function (o) {
      os.set(oo, 0, L.parseISO(o.fecha), 'date');
      os.set(oo, 1, o.colegio ? o.colegio.nombre : '', 'text');
      os.set(oo, 2, o.curso ? o.curso.nombre : '', 'text');
      os.set(oo, 3, o.estudiante ? o.estudiante.nombre : '', 'text');
      os.set(oo, 4, o.profesor ? o.profesor.nombre : '', 'text');
      os.set(oo, 5, o.asistencia, o.asistencia === 'P' ? 'present' : 'absent');
      os.set(oo, 6, o.evaluacion, 'int');
      os.set(oo, 7, o.etiquetas.join(', '), 'text');
      os.set(oo, 8, o.observacion, 'wrap');
      oo++;
    });
    os.freeze(4, 0);
    os.autofilter(3, 0, Math.max(3, oo - 1), 8);

    /* ------------------------- Estudiantes -------------------------- */
    const es = wb.addSheet('Estudiantes');
    es.widths([30, 28, 16, 12, 12, 9]);
    es.merge(0, 0, 0, 5);
    es.set(0, 0, 'Nómina de estudiantes', 'title');
    es.merge(1, 0, 1, 5);
    es.set(1, 0, 'Lista vigente por curso. Un estudiante deja de aparecer cuando se quita de la lista.', 'note');
    ['Colegio', 'Estudiante', 'Curso', 'Asistencia', 'Prom. 1-3', 'N obs.']
      .forEach(function (h, i) { es.set(3, i, h, 'h1'); });
    let ee = 4;
    (db.estudiantes || []).slice().sort(function (a, b) {
      return a.colegioId === b.colegioId ? L.cmpNombre(a, b) : a.colegioId.localeCompare(b.colegioId);
    }).forEach(function (est) {
      const col = L.colegio(db, est.colegioId);
      const cur = L.curso(db, est.cursoId);
      const regs = k.registrosLista.filter(function (x) { return x.estudianteId === est.id; });
      const pres = regs.filter(function (x) { return x.asistencia === 'P'; }).length;
      const evs = regs.filter(function (x) { return typeof x.evaluacion === 'number' && x.evaluacion >= 1; });
      es.set(ee, 0, col ? col.nombre : '', 'text');
      es.set(ee, 1, est.nombre, 'text');
      es.set(ee, 2, cur ? cur.nombre : '', 'text');
      es.set(ee, 3, regs.length ? pres / regs.length : null, 'pct');
      es.set(ee, 4, evs.length ? evs.reduce(function (a, x) { return a + x.evaluacion; }, 0) / evs.length : null, 'num');
      es.set(ee, 5, regs.filter(function (x) { return x.observacion && x.observacion.trim(); }).length, 'int');
      ee++;
    });
    es.freeze(4, 0);
    es.autofilter(3, 0, Math.max(3, ee - 1), 5);

    /* ------------------------- Diccionario -------------------------- */
    const ds = wb.addSheet('Diccionario');
    ds.widths([28, 108]);
    ds.merge(0, 0, 0, 1);
    ds.set(0, 0, 'Cómo leer y usar este archivo', 'title');
    const filasDoc = [
      ['Este archivo lo genera el sistema', 'Se regenera completo cada vez que se descarga: no conviene escribir a mano dentro de él, porque el próximo no incluirá esos cambios. Para trabajar con datos propios, copia una hoja a un archivo nuevo.'],
      ['Unidad de registro', 'La clase. Cada curso tiene sus propias clases: dos cursos del mismo colegio pueden tener fechas distintas y por eso aparecen en bloques separados dentro de la hoja del colegio.'],
      ['Asistencia', 'P = presente; A = ausente.'],
      ['Evaluación', 'Se registra siempre, en una escala de 0 a 3. El 0 significa SIN NOTA (no hubo evaluación: por ejemplo, el estudiante faltó). Los valores 1, 2 y 3 son los niveles de logro que el equipo define en sus reuniones semanales.'],
      ['Promedio', 'Se calcula solo con los niveles 1, 2 y 3. Los registros en 0 no entran en el promedio, porque no son una nota; se informan aparte en la columna "Sin nota".'],
      ['Hojas por colegio', 'Cada colegio tiene su hoja, con un bloque por curso: estudiantes en filas, clases en columnas y el resumen a la derecha de cada bloque.'],
      ['Hoja Registro', 'Una fila por estudiante y por clase, con la columna Curso y el valor de evaluación tal como se registró. Es la hoja para tablas dinámicas y cruces.'],
      ['Hoja Observaciones', 'Todo el texto cualitativo, con fecha, colegio, curso y etiqueta, para citar en el informe.'],
      ['Clases no realizadas', 'Si una clase se suspendió (feriado, licencia, actividad del colegio) no se marca a nadie como ausente: la clase no entra en los cálculos.'],
      ['Actualización', 'Los datos se pueden exportar en cualquier momento: el archivo siempre refleja lo último guardado.'],
    ];
    filasDoc.forEach(function (f, i) {
      ds.set(2 + i, 0, f[0], 'label');
      ds.set(2 + i, 1, f[1], 'wrap');
      ds.rowHeight(2 + i, 32);
    });

    return wb;
  }

  return { construir: construir };
});
