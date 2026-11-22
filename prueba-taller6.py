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

apply('test/flujo.mjs', [
  ("""  console.log('== Selección por curso ==');
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
  await sleep(400);""",
   """  console.log('== Selección por taller ==');
  check('se ven los 9 estudiantes del colegio', await ev('document.querySelectorAll("#rows .row").length') === 9,
    await ev('document.querySelectorAll("#rows .row").length'));
  check('el selector ofrece los 12 talleres', await ev('document.querySelectorAll("#f-taller option").length') === 13,
    await ev('document.querySelectorAll("#f-taller option").length'));
  check('la clase arranca con un taller elegido', (await ev('document.querySelector("#f-taller").value')).length >= 3,
    await ev('document.querySelector("#f-taller").value'));
  await ev(`(function(){ const s = document.querySelector('#f-taller'); s.value = '10.1'; s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  await sleep(400);
  check('la lista sigue siendo la del colegio', await ev('document.querySelectorAll("#rows .row").length') === 9,
    await ev('document.querySelectorAll("#rows .row").length'));
  check('el encabezado muestra el taller', (await txt('.course-bar .who')).indexOf('Taller 10.1') >= 0, await txt('.course-bar .who'));"""),

  ("  check('marca las filas incompletas', await ev('document.querySelectorAll(\"#rows .row.invalid\").length') === 5);",
   "  check('marca las filas incompletas', await ev('document.querySelectorAll(\"#rows .row.invalid\").length') === 9);"),

  ("  check('contador completo', (await txt('#cursofoot')).indexOf('5 de 5') >= 0, await txt('#cursofoot'));",
   "  check('contador completo', (await txt('#cursofoot')).indexOf('9 de 9') >= 0, await txt('#cursofoot'));"),

  ("""    const db = window.__app.DB(), f = '2026-09-02';
    const ests = window.LOGIC.estudiantesDeCurso(db, 'k1', f);
    window.LOGIC.guardarSesion(db, {fecha:f, colegioId:'c1', cursoId:'k1', profesorId:'p2', realizada:true,""",
   """    const db = window.__app.DB(), f = '2026-09-02', st = window.__app.S;
    const ests = window.LOGIC.estudiantesDeColegio(db, 'c1');
    window.LOGIC.guardarSesion(db, {fecha:f, colegioId:'c1', cursoId:'k1', taller: st.taller, profesorId:'p2', realizada:true,"""),

  ("  check('se creó la clase antigua', creadas === 5, creadas);",
   "  check('se creó la clase antigua', creadas === 9, creadas);"),
])

apply('test/nube-ui.mjs', [
  ("""console.log('== Registro de una clase desde la base ==');""",
   """await ev(`(function(){ const s = document.querySelector('#f-taller'); s.value = '9.1'; s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
await sleep(500);

console.log('== Registro de una clase desde la base ==');"""),
])
