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

# ------------------------------------------------ pruebas
apply('test/flujo.mjs', [
  ("  check('tabla por curso lista cursos', (await txt('#view-panel .charts .tbl')).indexOf('Curso 1') >= 0);",
   "  check('tabla por colegio lista colegios', (await txt('#view-panel .charts .tbl')).indexOf('Colegio 1') >= 0);"),
  ("  check('filtrar por colegio ofrece sus cursos', await ev('document.querySelectorAll(\"#p-cur option\").length') === 3);",
   "  check('el filtro de taller ofrece los 12', await ev('document.querySelectorAll(\"#p-taller option\").length') === 13);"),
])

# ------------------------------------------------ estudiantes: sin filtro de curso
apply('src/app.js', [
  ("""        '<div class="field"><label for="e-cur">Curso</label><select id="e-cur"><option value="">Todos</option>' +
          cursos.map(k => '<option value="' + k.id + '"' + (V.estu.curso === k.id ? ' selected' : '') + '>' + esc(k.nombre) + '</option>').join('') +
        '</select></div>' +""", ""),
  ("    $('#e-cur').addEventListener('change', e => { V.estu.curso = e.target.value; renderEstudiantes(); });\n", ""),
  ("          '<td class=\"small\">' + esc(cur ? cur.nombre : '—') + '</td>' +\n", ""),
  ("'<table class=\"tbl\"><thead><tr><th>Estudiante</th><th>Curso</th>' +\n          '<th>Asistencia</th>", "'<table class=\"tbl\"><thead><tr><th>Estudiante</th>' +\n          '<th>Asistencia</th>"),
])

# ------------------------------------------------ informe: taller
apply('src/report.js', [
  ("    ['Fecha', 'Colegio', 'Curso', 'Profesor', 'Estudiante', 'Asistencia', 'Evaluación',",
   "    ['Fecha', 'Colegio', 'Taller', 'Profesor', 'Estudiante', 'Asistencia', 'Evaluación',"),
  ("      rg.set(rr, 2, cur ? cur.nombre : '', 'text');",
   "      rg.set(rr, 2, x.s.taller || '', 'text');"),
  ("    ['Fecha', 'Colegio', 'Curso', 'Estudiante', 'Profesor', 'Asist.', 'Eval.', 'Etiqueta', 'Observación']",
   "    ['Fecha', 'Colegio', 'Taller', 'Estudiante', 'Profesor', 'Asist.', 'Eval.', 'Etiqueta', 'Observación']"),
  ("      os.set(oo, 2, o.curso ? o.curso.nombre : '', 'text');",
   "      os.set(oo, 2, (o.sesion && o.sesion.taller) || '', 'text');"),
  ("        b.sesiones.forEach(function (s, i) { ws.set(row, 1 + i, L.fmtCorta(s.fecha), 'h1'); });",
   "        b.sesiones.forEach(function (s, i) { ws.set(row, 1 + i, L.fmtCorta(s.fecha) + (s.taller ? ' ' + s.taller : ''), 'h1'); });"),
  ("        ws.set(row, 0, b.curso.nombre + '  ·  ' + b.estudiantes.length + ' estudiantes  ·  ' + nSes + ' clases', 'h2');",
   "        ws.set(row, 0, (b.talleres.length ? 'Taller ' + b.talleres.join(' / ') + '  ·  ' : '') +\n          b.estudiantes.length + ' estudiantes  ·  ' + nSes + ' clases', 'h2');"),
  ("        return { curso: cur, sesiones: sesiones, estudiantes: L.estudiantesDeCurso(db, cur.id) };",
   """        return {
          curso: cur, sesiones: sesiones,
          talleres: sesiones.map(function (s) { return s.taller; })
            .filter(function (t, i, a) { return t && a.indexOf(t) === i; }),
          estudiantes: L.estudiantesDeCurso(db, cur.id),
        };"""),
])
