import io, sys

def apply(path, pares):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pares:
        n = s.count(old)
        if n != 1:
            print('ERROR', path, 'ocurrencias=%d' % n); print('   ' + old[:130].replace('\n', '\\n')); sys.exit(1)
        s = s.replace(old, new)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('ok', path, len(pares), 'cambios')

# ------------------------- flujo: ya no hay filtro de curso en estudiantes
apply('test/flujo.mjs', [
  ("""  await ev(`(function(){ const s = document.querySelector('#e-cur'); s.value = 'k2'; s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  await sleep(400);
  check('filtrar estudiantes por curso', await ev('document.querySelectorAll("#view-estudiantes tbody tr").length') === 4,
    await ev('document.querySelectorAll("#view-estudiantes tbody tr").length'));
""", ""),
])

# ------------------------- informe: detalle por taller y columna Taller
apply('src/report.js', [
  ("""    rs.set(r, 0, 'Detalle por curso', 'h2');
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
      r++;""",
   """    rs.set(r, 0, 'Detalle por taller', 'h2');
    rs.merge(r, 0, r, 8);
    r++;
    ['Colegio', 'Taller', 'Sesiones', 'Estudiantes', 'Asistencia', 'Prom. 1-3', 'Sin nota', 'Obs.']
      .forEach(function (h, i) { rs.set(r, i, h, 'h1'); });
    r++;
    const cabCur = r;
    const porTaller = {};
    k.sesionesLista.forEach(function (s) {
      const clave = s.colegioId + '|' + (s.taller || '');
      porTaller[clave] = porTaller[clave] || { colegioId: s.colegioId, taller: s.taller || '', sesiones: 0, regs: [] };
      porTaller[clave].sesiones++;
    });
    k.registrosLista.forEach(function (rg) {
      const s = k.sesionesLista.find(function (x) { return x.id === rg.sesionId; });
      if (!s) return;
      const clave = s.colegioId + '|' + (s.taller || '');
      if (porTaller[clave]) porTaller[clave].regs.push(rg);
    });
    Object.keys(porTaller).sort().forEach(function (clave) {
      const g = porTaller[clave];
      const pres = g.regs.filter(function (x) { return x.asistencia === 'P'; }).length;
      const conNota = g.regs.filter(function (x) { return typeof x.evaluacion === 'number' && x.evaluacion >= 1; });
      const sinNota = g.regs.filter(function (x) { return x.evaluacion === 0; }).length;
      const alumnos = {};
      g.regs.forEach(function (x) { alumnos[x.estudianteId] = 1; });
      const col = L.colegio(db, g.colegioId);
      rs.set(r, 0, col ? col.nombre : '', 'text');
      rs.set(r, 1, g.taller || '(sin taller)', 'text');
      rs.set(r, 2, g.sesiones, 'int');
      rs.set(r, 3, Object.keys(alumnos).length, 'int');
      rs.set(r, 4, g.regs.length ? pres / g.regs.length : null, 'pct');
      rs.set(r, 5, conNota.length ? conNota.reduce(function (a, x) { return a + x.evaluacion; }, 0) / conNota.length : null, 'num');
      rs.set(r, 6, sinNota, 'int');
      rs.set(r, 7, g.regs.filter(function (x) { return x.observacion && x.observacion.trim(); }).length, 'int');
      r++;"""),

  ("    const rHead = ['Fecha', 'Colegio', 'Curso', 'Profesor', 'Estudiante', 'Asistencia', 'Evaluación',",
   "    const rHead = ['Fecha', 'Colegio', 'Taller', 'Profesor', 'Estudiante', 'Asistencia', 'Evaluación',"),
  ("      rg.set(rr, 2, cur ? cur.nombre : '', 'text');",
   "      rg.set(rr, 2, x.s.taller || '', 'text');"),

  ("    ['Fecha', 'Colegio', 'Curso', 'Estudiante', 'Profesor', 'Asist.', 'Eval.', 'Etiqueta', 'Observación']",
   "    ['Fecha', 'Colegio', 'Taller', 'Estudiante', 'Profesor', 'Asist.', 'Eval.', 'Etiqueta', 'Observación']"),
  ("      os.set(oo, 2, o.curso ? o.curso.nombre : '', 'text');",
   "      os.set(oo, 2, (o.sesion && o.sesion.taller) || '', 'text');"),

  ("        b.sesiones.forEach(function (s, i) { ws.set(row, 1 + i, L.fmtCorta(s.fecha), 'h1'); });",
   "        b.sesiones.forEach(function (s, i) { ws.set(row, 1 + i, L.fmtCorta(s.fecha) + (s.taller ? ' ' + s.taller : ''), 'h1'); });"),

  ("        return { curso: cur, sesiones: sesiones, estudiantes: L.estudiantesDeCurso(db, cur.id) };",
   """        return {
          curso: cur, sesiones: sesiones,
          talleres: sesiones.map(function (s) { return s.taller; })
            .filter(function (t, i, a) { return t && a.indexOf(t) === i; }),
          estudiantes: L.estudiantesDeColegio(db, cur.colegioId),
        };"""),

  ("        ws.set(row, 0, b.curso.nombre + '  ·  ' + b.estudiantes.length + ' estudiantes  ·  ' + nSes + ' clases', 'h2');",
   "        ws.set(row, 0, (b.talleres.length ? 'Taller ' + b.talleres.join(' / ') + '  ·  ' : '') +\n          b.estudiantes.length + ' estudiantes  ·  ' + nSes + ' clases', 'h2');"),

  ("        ws.set(row, 0, 'Total ' + b.curso.nombre, 'total');",
   "        ws.set(row, 0, 'Total del colegio', 'total');"),

  ("'P · 0\" es presente sin nota; \"A\" es ausente (sin nota). Cada curso tiene su propio bloque porque las fechas de clase son distintas.', 'note');",
   "'P · 0\" es presente sin nota; \"A\" es ausente (sin nota). Cada columna indica la fecha y el taller de esa clase.', 'note');"),

  ("['Unidad de registro', 'La clase. Cada curso tiene sus propias clases: dos cursos del mismo colegio pueden tener fechas distintas y por eso aparecen en bloques separados dentro de la hoja del colegio.'],",
   "['Unidad de registro', 'La clase. Se identifica por colegio + taller + fecha. Un colegio puede tener varias clases en el mismo periodo, cada una con su taller.'],"),
  ("['Hojas por colegio', 'Cada colegio tiene su hoja, con un bloque por curso: estudiantes en filas, clases en columnas y el resumen a la derecha de cada bloque.'],",
   "['Hojas por colegio', 'Cada colegio tiene su hoja: estudiantes en filas, clases en columnas (fecha y taller) y el resumen a la derecha.'],"),
  ("['Hoja Registro', 'Una fila por estudiante y por clase, con la columna Curso y el valor de evaluación tal como se registró. Es la hoja para tablas dinámicas y cruces.'],",
   "['Hoja Registro', 'Una fila por estudiante y por clase, con la columna Taller y el valor de evaluación tal como se registró. Es la hoja para tablas dinámicas y cruces.'],"),
  ("['Hoja Observaciones', 'Todo el texto cualitativo, con fecha, colegio, curso y etiqueta, para citar en el informe.'],",
   "['Hoja Observaciones', 'Todo el texto cualitativo, con fecha, colegio, taller y etiqueta, para citar en el informe.'],"),
])
