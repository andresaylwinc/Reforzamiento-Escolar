/* Pruebas del núcleo: modelo 0 = sin nota, cursos, indicadores e informe. */
import fs from 'node:fs';
import DEMO from '../src/demo.js';
import LOGIC from '../src/logic.js';
import XLSX from '../src/xlsx-lite.js';

const { buildDemoDB } = DEMO;

globalThis.LOGIC = LOGIC;
globalThis.XLSX = XLSX;
const REPORT = (await import('../src/report.js')).default;
const { construir } = REPORT;

let ok = 0, fail = 0;
function check(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok   ' + nombre); }
  else { fail++; console.log('  FALLA ' + nombre + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 200) : '')); }
}

const HOY = new Date(2026, 10, 7);
const db = buildDemoDB(HOY);
const desde = '2026-08-24', hasta = '2026-11-07';
const opts = { desde, hasta };

console.log('== Datos ==');
check('6 colegios', db.colegios.length === 6, db.colegios.length);
check('8 cursos', db.cursos.length === 8, db.cursos.length);
check('45 estudiantes', db.estudiantes.length === 45, db.estudiantes.length);
check('80 sesiones', db.sesiones.length === 80, db.sesiones.length);
check('sin fechas de ingreso ni egreso', db.estudiantes.every(e => !e.ingreso && !e.egreso));
check('toda evaluación es número 0-3', db.registros.every(r => typeof r.evaluacion === 'number' && r.evaluacion >= 0 && r.evaluacion <= 3));
check('los ausentes quedan en 0 (sin nota)', db.registros.filter(r => r.asistencia === 'A').every(r => r.evaluacion === 0));
check('los presentes tienen 1, 2 o 3', db.registros.filter(r => r.asistencia === 'P').every(r => r.evaluacion >= 1));
check('hay registros en 0', db.registros.filter(r => r.evaluacion === 0).length > 0);

console.log('== Indicadores ==');
const k = LOGIC.indicadores(db, opts);
check('asistencia entre 0.75 y 0.95', k.asistencia > 0.75 && k.asistencia < 0.95, k.asistencia);
check('conNota + sinNota = registros', k.conNota + k.sinNota === k.registros, [k.conNota, k.sinNota, k.registros]);
check('el promedio va de 1 a 3', k.promedio >= 1 && k.promedio <= 3, k.promedio);
check('el promedio excluye los ceros',
  Math.abs(k.promedio - (db.registros.filter(r => r.evaluacion >= 1).reduce((a, r) => a + r.evaluacion, 0) /
    db.registros.filter(r => r.evaluacion >= 1).length)) < 1e-9);
check('la distribución cuenta los 4 valores', k.distribucion.reduce((a, b) => a + b, 0) === k.registros);
check('por curso suma los registros', LOGIC.porCurso(db, opts).reduce((a, c) => a + c.registros, 0) === k.registros);

console.log('== Validación ==');
const est = LOGIC.estudiantesDeCurso(db, 'k1');
const sinEval = LOGIC.validarRegistro({
  fecha: '2026-11-10', colegioId: 'c1', cursoId: 'k1', profesorId: 'p2', realizada: true,
  filas: [{ estudianteId: est[0].id, nombre: est[0].nombre, asistencia: 'P', evaluacion: null }],
});
check('exige evaluación para el presente', sinEval.length === 1 && /evaluación/.test(sinEval[0]), sinEval);
const conCero = LOGIC.validarRegistro({
  fecha: '2026-11-10', colegioId: 'c1', cursoId: 'k1', profesorId: 'p2', realizada: true,
  filas: [{ estudianteId: est[0].id, nombre: est[0].nombre, asistencia: 'A', evaluacion: 0 }],
});
check('el 0 es un valor válido, no un dato faltante', conCero.length === 0, conCero);
const fueraRango = LOGIC.validarRegistro({
  fecha: '2026-11-10', colegioId: 'c1', cursoId: 'k1', profesorId: 'p2', realizada: true,
  filas: [{ estudianteId: est[0].id, nombre: est[0].nombre, asistencia: 'P', evaluacion: 5 }],
});
check('rechaza evaluación fuera de 0-3', fueraRango.length === 1, fueraRango);

console.log('== Guardado ==');
const nuevo = LOGIC.guardarSesion(db, {
  fecha: '2026-11-10', colegioId: 'c1', cursoId: 'k1', profesorId: 'p2', realizada: true,
  filas: est.map((e, i) => ({ estudianteId: e.id, nombre: e.nombre, asistencia: i === 0 ? 'A' : 'P', evaluacion: i === 0 ? 0 : 3, observacion: '' })),
});
check('crea la clase del curso', nuevo.nuevo && nuevo.creados === est.length, nuevo.creados);
check('el ausente se guarda con 0', db.registros.find(r => r.estudianteId === est[0].id && r.sesionId === nuevo.sesion.id).evaluacion === 0);
const dup = LOGIC.guardarSesion(db, {
  fecha: '2026-11-10', colegioId: 'c1', cursoId: 'k1', profesorId: 'p2', realizada: true,
  filas: est.map(e => ({ estudianteId: e.id, nombre: e.nombre, asistencia: 'P', evaluacion: 2, observacion: '' })),
});
check('reenviar actualiza sin duplicar', !dup.nuevo && dup.creados === 0, dup);

console.log('== Informe ==');
const txt = LOGIC.borradorInforme(db, opts);
check('explica que 0 es sin nota', /sin nota/.test(txt));
check('el promedio se informa como niveles 1 a 3', /niveles 1 a 3/.test(txt));
check('menciona cursos', /curso\(s\)/.test(txt));

const wb = construir(db, opts);
const bytes = wb.build();
fs.mkdirSync('Ejemplos', { recursive: true });
fs.writeFileSync('Ejemplos/Informe-Ejemplo.xlsx', bytes);
check('archivo > 20 KB', bytes.length > 20000, bytes.length);
check('11 hojas', wb.sheets.length === 11, wb.sheets.length);
check('nombres válidos', wb.sheets.every(s => s.name.length <= 31));

console.log('\nRESULTADO: ' + ok + ' ok, ' + fail + ' fallas');
process.exit(fail ? 1 : 0);
