import io, sys

def apply(path, pares):
    s = io.open(path, encoding='utf-8').read()
    for old, new, veces in pares:
        n = s.count(old)
        if n != veces:
            print('ERROR', path, 'ocurrencias=%d esperadas=%d' % (n, veces)); print('   ' + old[:120].replace('\n', '\\n')); sys.exit(1)
        s = s.replace(old, new)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('ok', path, len(pares), 'cambios')

# las pruebas deben indicar el taller
apply('test/verify.mjs', [
  ("fecha: '2026-11-10', colegioId: 'c1', cursoId: 'k1', profesorId: 'p2', realizada: true,",
   "fecha: '2026-11-10', colegioId: 'c1', cursoId: 'k1', taller: '9.1', profesorId: 'p2', realizada: true,", 5),
  ("check('exige curso', sinCurso.some(e => /curso/i.test(e)), sinCurso);",
   "check('exige taller', sinCurso.some(e => /taller/i.test(e)), sinCurso);", 1),
])

# nota del diccionario del Excel
apply('src/report.js', [
  ("""'"P · 0" es presente sin nota; "A" es ausente (sin nota). Cada curso tiene su propio bloque porque las fechas de clase son distintas.'""",
   """'"P · 0" es presente sin nota; "A" es ausente (sin nota). Cada columna indica la fecha y el taller de esa clase.'""", 1),
])
