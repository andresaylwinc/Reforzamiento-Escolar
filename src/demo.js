/* ============================================================
   demo.js — Datos de ejemplo reproducibles, con nombres genéricos.
   6 colegios, 8 cursos, 7 profesores y 45 estudiantes
   ("Colegio 1", "Profesor 1", "Estudiante 1"…), 10 semanas de clases.

   Modelo de evaluación: escala 0-3 donde 0 = SIN NOTA (no hubo
   evaluación, por ejemplo porque el estudiante faltó). 1, 2 y 3 son
   los niveles de logro. La evaluación se registra siempre.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DEMO = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // [colegio, comuna, color, cursos: [id, nombre, cantidad de estudiantes]]
  const ESTRUCTURA = [
    { id: 'c1', nombre: 'Colegio 1', comuna: 'Los Parques', color: '#2F6F4E', cursos: [['k1', 'Curso 1', 5], ['k2', 'Curso 2', 4]] },
    { id: 'c2', nombre: 'Colegio 2', comuna: 'Los Parques', color: '#2B6CB0', cursos: [['k3', 'Curso 1', 8]] },
    { id: 'c3', nombre: 'Colegio 3', comuna: 'Los Parques', color: '#9C4221', cursos: [['k4', 'Curso 1', 7]] },
    { id: 'c4', nombre: 'Colegio 4', comuna: 'Los Parques', color: '#553C9A', cursos: [['k5', 'Curso 1', 4], ['k6', 'Curso 2', 4]] },
    { id: 'c5', nombre: 'Colegio 5', comuna: 'Los Parques', color: '#0F766E', cursos: [['k7', 'Curso 1', 6]] },
    { id: 'c6', nombre: 'Colegio 6', comuna: 'Los Parques', color: '#B7791F', cursos: [['k8', 'Curso 1', 7]] },
  ];

  const COLEGIOS = ESTRUCTURA.map(function (c) {
    return { id: c.id, nombre: c.nombre, comuna: c.comuna, color: c.color };
  });

  const CURSOS = [];
  ESTRUCTURA.forEach(function (c) {
    c.cursos.forEach(function (k) {
      CURSOS.push({ id: k[0], colegioId: c.id, nombre: k[1] });
    });
  });

  const PROFESORES = [
    { id: 'p1', nombre: 'Profesor 1', rol: 'Líder de proyecto' },
    { id: 'p2', nombre: 'Profesor 2', rol: 'Profesor' },
    { id: 'p3', nombre: 'Profesor 3', rol: 'Profesor' },
    { id: 'p4', nombre: 'Profesor 4', rol: 'Profesor' },
    { id: 'p5', nombre: 'Profesor 5', rol: 'Profesor' },
    { id: 'p6', nombre: 'Profesor 6', rol: 'Profesor' },
    { id: 'p7', nombre: 'Profesor 7', rol: 'Profesor' },
  ];

  const ASIGNACIONES = [
    { colegioId: 'c1', profesorId: 'p2' }, { colegioId: 'c1', profesorId: 'p4' },
    { colegioId: 'c2', profesorId: 'p3' },
    { colegioId: 'c3', profesorId: 'p5' }, { colegioId: 'c3', profesorId: 'p7' },
    { colegioId: 'c4', profesorId: 'p2' }, { colegioId: 'c4', profesorId: 'p6' },
    { colegioId: 'c5', profesorId: 'p4' }, { colegioId: 'c5', profesorId: 'p7' },
    { colegioId: 'c6', profesorId: 'p1' }, { colegioId: 'c6', profesorId: 'p3' },
  ];

  const ETIQUETAS = [
    'Comprensión lectora', 'Cálculo y operatoria', 'Participación',
    'Conducta', 'Motivación', 'Asistencia irregular', 'Apoyo familiar', 'Logro destacado',
  ];

  const OBSERVACIONES = {
    'Comprensión lectora': [
      'Lee con fluidez, pero le cuesta extraer la idea principal de textos largos.',
      'Mejoró en la identificación de personajes y secuencias. Sigue con apoyo en inferencias.',
      'Necesita reforzar vocabulario; se sugiere lectura diaria de 15 minutos en casa.',
    ],
    'Cálculo y operatoria': [
      'Resuelve sumas y restas con reserva sin dificultad; aún confunde la multiplicación por dos cifras.',
      'Comete errores de arrastre en ejercicios de varios pasos. Se trabajó con material concreto.',
      'Avanzó notablemente en cálculo mental. Conviene subir el nivel de exigencia.',
    ],
    'Participación': [
      'Participa activamente y ayuda a compañeros que se quedan atrás.',
      'Necesita que se le pregunte directamente para intervenir; se ve inseguridad.',
      'Muy buena disposición al trabajo en grupo.',
    ],
    'Conducta': [
      'Se distrae con facilidad en la segunda mitad de la clase.',
      'Interrumpe con frecuencia; se conversó y se acordó una señal de auto-regulación.',
      'Sin dificultades de conducta esta sesión.',
    ],
    'Motivación': [
      'Se nota desanimado; conversamos sobre sus logros y respondió bien.',
      'Llegó entusiasmado por el material nuevo. Aprovechamos para avanzar.',
      'Manifiesta que le cuesta ver para qué sirve lo que aprende; se trabajó con ejemplos cotidianos.',
    ],
    'Asistencia irregular': [
      'Faltó dos semanas seguidas; se avisó a la encargada de convivencia del colegio.',
      'Se reincorpora después de varias inasistencias; requiere nivelación.',
    ],
    'Apoyo familiar': [
      'La familia pidió orientación para acompañar las tareas.',
      'Se coordinó con la apoderada un seguimiento semanal.',
    ],
    'Logro destacado': [
      'Completó la guía completa sin apoyo y explicó su razonamiento al curso.',
      'Terminó antes que el resto y ayudó a dos compañeros.',
    ],
  };

  // Día de la semana de cada curso: 1 = lunes ... 5 = viernes
  const DIAS = { k1: 2, k2: 4, k3: 3, k4: 4, k5: 1, k6: 5, k7: 5, k8: 2 };

  const ASISTENCIA_BAJA = [4, 12, 41];
  const RETROCESO = [18, 36];
  const SUSPENDIDAS = { k2: 1, k7: 3 };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function iso(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function buildDemoDB(today) {
    const rnd = mulberry32(20261107);
    const now = today ? new Date(today) : new Date();
    now.setHours(12, 0, 0, 0);

    const db = {
      version: 3,
      colegios: JSON.parse(JSON.stringify(COLEGIOS)),
      cursos: JSON.parse(JSON.stringify(CURSOS)),
      profesores: JSON.parse(JSON.stringify(PROFESORES)),
      asignaciones: JSON.parse(JSON.stringify(ASIGNACIONES)),
      estudiantes: [],
      sesiones: [],
      registros: [],
      etiquetas: ETIQUETAS.slice(),
      ajustes: { modoRapido: true, diasEdicion: 30 },
    };

    const perfiles = {};
    let seq = 0;

    ESTRUCTURA.forEach(function (col) {
      col.cursos.forEach(function (k) {
        const cursoId = k[0], cantidad = k[2];
        for (let i = 0; i < cantidad; i++) {
          seq++;
          const id = 'e' + String(seq).padStart(3, '0');
          db.estudiantes.push({
            id: id,
            nombre: 'Estudiante ' + seq,
            colegioId: col.id,
            cursoId: cursoId,
            notas: '',
          });
          perfiles[id] = {
            base: 0.78 + rnd() * 0.21,
            nivel: 0.55 + rnd() * 0.4,
            mejora: -0.06 + rnd() * 0.16,
          };
        }
      });
    });

    db.estudiantes.forEach(function (e) {
      const p = perfiles[e.id];
      const n = Number(e.nombre.split(' ')[1]);
      if (ASISTENCIA_BAJA.indexOf(n) >= 0) p.base = 0.5 + rnd() * 0.12;
      if (RETROCESO.indexOf(n) >= 0) p.mejora = -0.22;
    });

    const inicio = new Date(now);
    inicio.setDate(inicio.getDate() - 74);

    CURSOS.forEach(function (cur) {
      const profs = ASIGNACIONES.filter(function (a) { return a.colegioId === cur.colegioId; })
        .map(function (a) { return a.profesorId; });
      const fechas = [];
      const d = new Date(inicio);
      while (d <= now) {
        if (d.getDay() === DIAS[cur.id]) fechas.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
      fechas.slice(-10).forEach(function (fecha, idx) {
        const sid = 's-' + cur.id + '-' + idx;
        const suspendida = SUSPENDIDAS[cur.id] === idx;
        const profId = profs[idx % profs.length];
        db.sesiones.push({
          id: sid, fecha: iso(fecha), colegioId: cur.colegioId, cursoId: cur.id, profesorId: profId,
          realizada: !suspendida,
          motivo: suspendida ? (idx === 1 ? 'Clase suspendida: actividad del colegio' : 'Profesor con licencia médica') : '',
          registradoPor: profId,
          creadoEn: iso(fecha) + 'T18:30:00',
          actualizadoEn: iso(fecha) + 'T18:30:00',
        });
        if (suspendida) return;

        const alumnos = db.estudiantes.filter(function (e) { return e.cursoId === cur.id; });

        alumnos.forEach(function (est) {
          const p = perfiles[est.id];
          const avance = idx / 10;
          const prob = Math.min(0.99, Math.max(0.4, p.base + (rnd() - 0.5) * 0.12));
          const presente = rnd() < prob;
          // 0 = sin nota. Quien falta no se evalúa: queda en 0, no en blanco.
          let nota = 0, obs = '', tags = [];
          if (presente) {
            const nivel = p.nivel + avance * p.mejora + (rnd() - 0.5) * 0.28;
            nota = nivel < 0.5 ? 1 : nivel < 0.78 ? 2 : 3;
            if (rnd() < 0.14) {
              const tag = ETIQUETAS[Math.floor(rnd() * ETIQUETAS.length)];
              const frases = OBSERVACIONES[tag] || ['Sin observaciones.'];
              obs = frases[Math.floor(rnd() * frases.length)];
              tags = [tag];
            }
          }
          db.registros.push({
            id: 'r-' + sid + '-' + est.id, sesionId: sid, estudianteId: est.id,
            asistencia: presente ? 'P' : 'A',
            evaluacion: nota,
            observacion: obs, etiquetas: tags,
            creadoEn: iso(fecha) + 'T18:30:00',
            actualizadoEn: iso(fecha) + 'T18:30:00',
          });
        });
      });
    });

    return db;
  }

  return {
    buildDemoDB: buildDemoDB,
    COLEGIOS: COLEGIOS, CURSOS: CURSOS, PROFESORES: PROFESORES,
    ASIGNACIONES: ASIGNACIONES, ETIQUETAS: ETIQUETAS,
  };
});
