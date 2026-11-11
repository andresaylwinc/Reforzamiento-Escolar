/* Pruebas del cliente de nube contra el servidor de prueba. */
import { crearServidor } from './mock-supabase.mjs';

let ok = 0, fail = 0;
function check(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FALLA ' + n + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 240) : '')); }
}

/* --- entorno mínimo de navegador --- */
const almacen = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
globalThis.localStorage = almacen;
globalThis.location = { search: '' };

const servidor = crearServidor();
let base = await servidor.escuchar(0);
globalThis.CONFIG = { supabaseUrl: base, supabaseKey: 'anon-de-prueba' };

await import('../src/nube.js');
const NUBE = globalThis.NUBE;

console.log('== Conexión y entrada ==');
check('el cliente queda activo', NUBE.activo === true);
check('la conexión responde', (await NUBE.probarConexion()).ok === true);

let error = null;
try { await NUBE.ingresar('lider@ejemplo.cl', 'mala'); } catch (e) { error = e.message; }
check('rechaza contraseña incorrecta', /incorrectos/i.test(error || ''), error);

const usuario = await NUBE.ingresar('lider@ejemplo.cl', 'secreta');
check('entra con credenciales válidas', usuario && usuario.rol === 'lider', usuario);
check('guarda la sesión en el navegador', !!almacen.getItem('reforzamiento.sesion'));

console.log('== Carga de datos ==');
const db = await NUBE.cargarTodo();
check('trae 2 colegios', db.colegios.length === 2, db.colegios.length);
check('trae 3 cursos', db.cursos.length === 3, db.cursos.length);
check('trae 3 estudiantes', db.estudiantes.length === 3, db.estudiantes.length);
check('trae 2 profesores', db.profesores.length === 2, db.profesores.length);
check('aún no hay clases', db.sesiones.length === 0, db.sesiones.length);
check('los nombres de campo se traducen', db.cursos[0].colegioId === 'c1', db.cursos[0]);

console.log('== Guardar una clase ==');
const idClase = 's-k1-2026-11-10';
const filas = [
  { estudianteId: 'e001', asistencia: 'P', evaluacion: 3, observacion: 'Buena participación', etiquetas: ['Participación'] },
  { estudianteId: 'e002', asistencia: 'A', evaluacion: 0, observacion: '', etiquetas: [] },
];
await NUBE.guardarClase({
  id: idClase, fecha: '2026-11-10', colegioId: 'c1', cursoId: 'k1', profesorId: 'u-lider',
  realizada: true, motivo: '', filas,
});
check('crea la clase en el servidor', servidor.datos.clases.length === 1, servidor.datos.clases.length);
check('crea los dos registros', servidor.datos.registros.length === 2, servidor.datos.registros.length);
check('el ausente guarda evaluación 0',
  servidor.datos.registros.find(r => r.estudiante_id === 'e002').evaluacion === 0);
check('guarda las etiquetas como lista',
  Array.isArray(servidor.datos.registros[0].etiquetas) && servidor.datos.registros[0].etiquetas[0] === 'Participación');

console.log('== Reenviar la misma clase ==');
await NUBE.guardarClase({
  id: idClase, fecha: '2026-11-10', colegioId: 'c1', cursoId: 'k1', profesorId: 'u-lider',
  realizada: true, motivo: '',
  filas: [
    { estudianteId: 'e001', asistencia: 'P', evaluacion: 2, observacion: '', etiquetas: [] },
    { estudianteId: 'e002', asistencia: 'P', evaluacion: 1, observacion: '', etiquetas: [] },
  ],
});
check('no duplica la clase', servidor.datos.clases.length === 1, servidor.datos.clases.length);
check('no duplica los registros', servidor.datos.registros.length === 2, servidor.datos.registros.length);
check('actualiza los valores',
  servidor.datos.registros.find(r => r.estudiante_id === 'e001').evaluacion === 2);

console.log('== Clase no realizada ==');
await NUBE.guardarClase({
  id: 's-k2-2026-11-11', fecha: '2026-11-11', colegioId: 'c1', cursoId: 'k2', profesorId: 'u-lider',
  realizada: false, motivo: 'Feriado', filas: [],
});
check('guarda la clase con su motivo', servidor.datos.clases.some(c => c.motivo === 'Feriado'));
check('sin registros de estudiantes', servidor.datos.registros.length === 2, servidor.datos.registros.length);

console.log('== Estudiantes ==');
await NUBE.guardarEstudiante({ id: 'e100', colegioId: 'c1', cursoId: 'k1', nombre: 'Estudiante Nuevo' });
check('agrega un estudiante', servidor.datos.estudiantes.length === 4, servidor.datos.estudiantes.length);
await NUBE.guardarEstudiante({ id: 'e100', colegioId: 'c1', cursoId: 'k1', nombre: 'Estudiante Nuevo 2' });
check('editar no duplica', servidor.datos.estudiantes.length === 4);
check('actualiza el nombre', servidor.datos.estudiantes.find(e => e.id === 'e100').nombre === 'Estudiante Nuevo 2');
await NUBE.borrarEstudiante('e100');
check('quita un estudiante', servidor.datos.estudiantes.length === 3);

console.log('== Colegios, cursos y asignaciones ==');
await NUBE.guardarColegio({ id: 'c9', nombre: 'Colegio 9', comuna: 'Otra' });
check('agrega un colegio', servidor.datos.colegios.length === 3);
await NUBE.guardarCurso({ id: 'k9', colegioId: 'c9', nombre: 'Curso 1' });
check('agrega un curso', servidor.datos.cursos.length === 4);
await NUBE.guardarAsignaciones('c2', ['u-lider', 'u-profe']);
check('reemplaza las asignaciones', servidor.datos.asignaciones.filter(a => a.colegio_id === 'c2').length === 2,
  servidor.datos.asignaciones);

console.log('== Eliminar un colegio ==');
// c1 tiene 2 cursos, 2 estudiantes, 1 asignación y clases con registros.
const clasesC1 = servidor.datos.clases.filter(c => c.colegio_id === 'c1').map(c => c.id);
check('c1 tiene clases antes de borrar', clasesC1.length === 2, clasesC1.length);
await NUBE.borrarColegio('c1');
check('borra el colegio', !servidor.datos.colegios.some(c => c.id === 'c1'));
check('borra sus cursos', servidor.datos.cursos.filter(k => k.colegio_id === 'c1').length === 0);
check('borra sus estudiantes', servidor.datos.estudiantes.filter(e => e.colegio_id === 'c1').length === 0);
check('borra sus clases', servidor.datos.clases.filter(c => c.colegio_id === 'c1').length === 0);
check('borra sus registros',
  servidor.datos.registros.filter(r => clasesC1.includes(r.clase_id)).length === 0,
  servidor.datos.registros.length);
check('borra sus asignaciones', servidor.datos.asignaciones.filter(a => a.colegio_id === 'c1').length === 0);
check('no toca el otro colegio', servidor.datos.colegios.some(c => c.id === 'c2'));
check('no toca a los estudiantes del otro colegio',
  servidor.datos.estudiantes.some(e => e.colegio_id === 'c2'));

console.log('== Quitar y restaurar una cuenta ==');
await NUBE.quitarProfesor('u-profe');
check('la cuenta queda inactiva', servidor.datos.perfiles.find(p => p.id === 'u-profe').activo === false);
const todos = await NUBE.perfiles(true);
check('perfiles(true) la sigue mostrando', todos.some(p => p.id === 'u-profe'), todos.length);
const soloActivos = await NUBE.perfiles();
check('perfiles() la deja fuera', !soloActivos.some(p => p.id === 'u-profe'), soloActivos.length);
const dbSin = await NUBE.cargarTodo();
check('desaparece de la lista de profesores', !dbSin.profesores.some(p => p.id === 'u-profe'),
  dbSin.profesores.map(p => p.id));
await NUBE.restaurarProfesor('u-profe');
check('vuelve a estar activa', servidor.datos.perfiles.find(p => p.id === 'u-profe').activo === true);
const dbCon = await NUBE.cargarTodo();
check('vuelve a la lista de profesores', dbCon.profesores.some(p => p.id === 'u-profe'));

console.log('== Sin conexión ==');
await servidor.cerrar();
let fallo = null;
const cola = {
  id: 's-k1-2026-11-17', fecha: '2026-11-17', colegioId: 'c1', cursoId: 'k1', profesorId: 'u-lider',
  realizada: true, motivo: '',
  filas: [{ estudianteId: 'e001', asistencia: 'P', evaluacion: 3, observacion: '', etiquetas: [] }],
};
try { await NUBE.guardarClase(cola); } catch (e) { fallo = e.message; }
check('falla sin conexión', !!fallo, fallo);
NUBE.encolar(cola);
check('queda en la cola', NUBE.pendientes() === 1, NUBE.pendientes());

const servidor2 = crearServidor();
base = await servidor2.escuchar(Number(new URL(base).port) || 0);
const enviadas = await NUBE.reintentar();
check('reenvía lo pendiente', enviadas === 1, enviadas);
check('la cola queda vacía', NUBE.pendientes() === 0, NUBE.pendientes());
check('la clase llegó al servidor', servidor2.datos.clases.length === 1, servidor2.datos.clases.length);

console.log('== Salir ==');
await NUBE.salir();
check('borra la sesión local', !almacen.getItem('reforzamiento.sesion'));
check('ya no hay sesión', NUBE.haySesion() === false);

await servidor2.cerrar();
console.log('\nRESULTADO: ' + ok + ' ok, ' + fail + ' fallas');
process.exit(fail ? 1 : 0);
