/* ============================================================
   logic.js — Reglas de negocio, indicadores y validaciones.
   La unidad de registro es la CLASE: fecha + curso.

   Modelo de evaluación (definido por el equipo):
     0 = sin nota (no hubo evaluación: por ejemplo, el estudiante faltó)
     1, 2, 3 = niveles de logro
   La evaluación se registra siempre, para presentes y ausentes.
   El promedio se calcula solo con los niveles 1-3, porque 0 no es una nota.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LOGIC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------- Fechas ---------------------------- */
  function parseISO(s) {
    if (!s) return null;
    const p = String(s).slice(0, 10).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function ahoraLocal() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return iso(d) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function iso(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + dd;
  }
  function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }
  function startOfWeek(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const wd = (x.getDay() + 6) % 7;
    return addDays(x, -wd);
  }
  function diasDesde(fechaISO, ref) {
    const a = parseISO(fechaISO);
    const b = ref ? (typeof ref === 'string' ? parseISO(ref) : ref) : new Date();
    if (!a) return 0;
    return Math.floor((new Date(b.getFullYear(), b.getMonth(), b.getDate()) -
      new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  }

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  function fmtCorta(s) {
    const d = typeof s === 'string' ? parseISO(s) : s;
    if (!d) return '';
    return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function fmtLarga(s) {
    const d = typeof s === 'string' ? parseISO(s) : s;
    if (!d) return '';
    return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  }
  function fmtFecha(s) {
    const d = typeof s === 'string' ? parseISO(s) : s;
    if (!d) return '';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  /* ------------------------ Búsquedas -------------------------- */
  // Orden natural: "Estudiante 2" antes que "Estudiante 10".
  const COLLATOR = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  function cmpNombre(a, b) { return COLLATOR.compare(a.nombre, b.nombre); }

  function colegio(db, id) { return (db.colegios || []).find(function (c) { return c.id === id; }) || null; }
  function curso(db, id) { return (db.cursos || []).find(function (c) { return c.id === id; }) || null; }
  function profesor(db, id) { return (db.profesores || []).find(function (p) { return p.id === id; }) || null; }
  function estudiante(db, id) { return (db.estudiantes || []).find(function (e) { return e.id === id; }) || null; }

  function cursosDeColegio(db, colegioId) {
    return (db.cursos || []).filter(function (c) { return c.colegioId === colegioId; })
      .slice().sort(function (a, b) { return COLLATOR.compare(a.nombre, b.nombre); });
  }
  function cursosDeProfesor(db, profesorId) {
    const ids = (db.asignaciones || []).filter(function (a) { return a.profesorId === profesorId; })
      .map(function (a) { return a.colegioId; });
    return (db.cursos || []).filter(function (c) { return ids.indexOf(c.colegioId) >= 0; });
  }
  function profesoresDeColegio(db, colegioId) {
    const ids = (db.asignaciones || []).filter(function (a) { return a.colegioId === colegioId; }).map(function (a) { return a.profesorId; });
    return (db.profesores || []).filter(function (p) { return ids.indexOf(p.id) >= 0; });
  }
  function estaAsignado(db, colegioId, profesorId) {
    return (db.asignaciones || []).some(function (a) { return a.colegioId === colegioId && a.profesorId === profesorId; });
  }
  function colegiosDeProfesor(db, profesorId) {
    const ids = (db.asignaciones || []).filter(function (a) { return a.profesorId === profesorId; }).map(function (a) { return a.colegioId; });
    return (db.colegios || []).filter(function (c) { return ids.indexOf(c.id) >= 0; });
  }

  /** Estudiantes del curso (la lista vigente del curso). */
  function estudiantesDeCurso(db, cursoId) {
    return (db.estudiantes || []).filter(function (e) { return e.cursoId === cursoId; }).sort(cmpNombre);
  }
  function estudiantesDeColegio(db, colegioId) {
    return (db.estudiantes || []).filter(function (e) { return e.colegioId === colegioId; }).sort(cmpNombre);
  }

  /** La clase de un curso en una fecha (a lo más una). */
  function sesionDe(db, cursoId, fecha) {
    return (db.sesiones || []).find(function (s) { return s.cursoId === cursoId && s.fecha === fecha; }) || null;
  }
  function registrosDeSesion(db, sesionId) {
    return (db.registros || []).filter(function (r) { return r.sesionId === sesionId; });
  }
  function registroDe(db, sesionId, estudianteId) {
    return (db.registros || []).find(function (r) { return r.sesionId === sesionId && r.estudianteId === estudianteId; }) || null;
  }

  /* ---------------- Filtro maestro de registros ---------------- */
  function filtrar(db, opts) {
    opts = opts || {};
    const desde = opts.desde || '0000-01-01';
    const hasta = opts.hasta || '9999-12-31';
    const sesiones = (db.sesiones || []).filter(function (s) {
      if (s.fecha < desde || s.fecha > hasta) return false;
      if (opts.colegioId && s.colegioId !== opts.colegioId) return false;
      if (opts.cursoId && s.cursoId !== opts.cursoId) return false;
      if (opts.profesorId && s.profesorId !== opts.profesorId) return false;
      if (opts.soloRealizadas !== false && !s.realizada) return false;
      return true;
    }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });

    const ids = {};
    sesiones.forEach(function (s) { ids[s.id] = true; });
    const registros = (db.registros || []).filter(function (r) { return ids[r.sesionId]; });
    return { sesiones: sesiones, registros: registros };
  }

  /* ------------------------- Indicadores ----------------------- */
  function indicadores(db, opts) {
    const f = filtrar(db, opts);
    const conNota = f.registros.filter(function (r) { return typeof r.evaluacion === 'number' && r.evaluacion >= 1; });
    const sinNota = f.registros.filter(function (r) { return r.evaluacion === 0; }).length;
    const presentes = f.registros.filter(function (r) { return r.asistencia === 'P'; }).length;
    const total = f.registros.length;
    const dist = [0, 0, 0, 0];
    f.registros.forEach(function (r) {
      if (typeof r.evaluacion === 'number' && dist[r.evaluacion] !== undefined) dist[r.evaluacion]++;
    });
    const prom = conNota.length ? conNota.reduce(function (a, r) { return a + r.evaluacion; }, 0) / conNota.length : null;
    const alumnos = {};
    f.registros.forEach(function (r) { alumnos[r.estudianteId] = true; });
    return {
      sesiones: f.sesiones.length,
      registros: total,
      presentes: presentes,
      ausentes: total - presentes,
      asistencia: total ? presentes / total : null,
      conNota: conNota.length,
      sinNota: sinNota,
      promedio: prom,
      distribucion: dist,
      estudiantes: Object.keys(alumnos).length,
      observaciones: f.registros.filter(function (r) { return r.observacion && r.observacion.trim(); }).length,
      registrosLista: f.registros,
      sesionesLista: f.sesiones,
    };
  }

  function porColegio(db, opts) {
    return (db.colegios || []).map(function (c) {
      const k = indicadores(db, Object.assign({}, opts, { colegioId: c.id, cursoId: undefined }));
      return {
        colegio: c, sesiones: k.sesiones, registros: k.registros, asistencia: k.asistencia,
        promedio: k.promedio, estudiantes: k.estudiantes, distribucion: k.distribucion,
        cursos: cursosDeColegio(db, c.id).length,
      };
    }).filter(function (x) { return x.registros > 0; })
      .sort(function (a, b) { return (b.asistencia || 0) - (a.asistencia || 0); });
  }

  function porCurso(db, opts) {
    return (db.cursos || []).map(function (k) {
      const kk = indicadores(db, Object.assign({}, opts, { cursoId: k.id, colegioId: undefined }));
      const col = colegio(db, k.colegioId);
      return {
        curso: k, colegio: col, sesiones: kk.sesiones, registros: kk.registros,
        asistencia: kk.asistencia, promedio: kk.promedio, estudiantes: kk.estudiantes,
        distribucion: kk.distribucion,
      };
    }).filter(function (x) { return x.registros > 0; })
      .sort(function (a, b) {
        const ca = a.colegio ? a.colegio.nombre : '', cb = b.colegio ? b.colegio.nombre : '';
        if (ca !== cb) return COLLATOR.compare(ca, cb);
        return COLLATOR.compare(a.curso.nombre, b.curso.nombre);
      });
  }

  function porProfesor(db, opts) {
    return (db.profesores || []).map(function (p) {
      const k = indicadores(db, Object.assign({}, opts, { profesorId: p.id }));
      return { profesor: p, sesiones: k.sesiones, registros: k.registros, asistencia: k.asistencia, promedio: k.promedio };
    }).filter(function (x) { return x.registros > 0; })
      .sort(function (a, b) { return b.sesiones - a.sesiones; });
  }

  function serieSemanal(db, opts) {
    const f = filtrar(db, opts);
    const grupos = {};
    f.registros.forEach(function (r) {
      const s = f.sesiones.find(function (x) { return x.id === r.sesionId; });
      if (!s) return;
      const lunes = iso(startOfWeek(parseISO(s.fecha)));
      if (!grupos[lunes]) grupos[lunes] = { lunes: lunes, regs: [], sesiones: {} };
      grupos[lunes].regs.push(r);
      grupos[lunes].sesiones[s.id] = true;
    });
    return Object.keys(grupos).sort().map(function (k) {
      const g = grupos[k];
      const pres = g.regs.filter(function (r) { return r.asistencia === 'P'; }).length;
      const ev = g.regs.filter(function (r) { return typeof r.evaluacion === 'number' && r.evaluacion >= 1; });
      return {
        lunes: k, label: fmtCorta(k), sesiones: Object.keys(g.sesiones).length,
        asistencia: g.regs.length ? pres / g.regs.length : null,
        promedio: ev.length ? ev.reduce(function (a, r) { return a + r.evaluacion; }, 0) / ev.length : null,
      };
    });
  }

  /* --------------------------- Alertas ------------------------- */
  function alertas(db, opts) {
    opts = opts || {};
    const desde = opts.desde || '0000-01-01';
    const hasta = opts.hasta || '9999-12-31';
    const out = [];
    const cursos = (db.cursos || []).filter(function (k) {
      if (opts.cursoId) return k.id === opts.cursoId;
      if (opts.colegioId) return k.colegioId === opts.colegioId;
      return true;
    });

    cursos.forEach(function (cur) {
      const col = colegio(db, cur.colegioId);
      const sesiones = (db.sesiones || []).filter(function (s) {
        return s.cursoId === cur.id && s.realizada && s.fecha >= desde && s.fecha <= hasta;
      }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
      if (!sesiones.length) return;

      estudiantesDeCurso(db, cur.id).forEach(function (est) {
        const regs = [];
        sesiones.forEach(function (s) {
          const r = registroDe(db, s.id, est.id);
          if (r) regs.push({ r: r, s: s });
        });
        if (!regs.length) return;

        const pres = regs.filter(function (x) { return x.r.asistencia === 'P'; }).length;
        const tasa = pres / regs.length;

        let racha = 0;
        for (let i = regs.length - 1; i >= 0; i--) {
          if (regs[i].r.asistencia === 'A') racha++; else break;
        }

        const evs = regs.filter(function (x) { return typeof x.r.evaluacion === 'number' && x.r.evaluacion >= 1; });
        let caida = 0;
        if (evs.length >= 4) {
          const mitad = Math.floor(evs.length / 2);
          const a = evs.slice(0, mitad), b = evs.slice(mitad);
          const pa = a.reduce(function (s, x) { return s + x.r.evaluacion; }, 0) / a.length;
          const pb = b.reduce(function (s, x) { return s + x.r.evaluacion; }, 0) / b.length;
          caida = pb - pa;
        }

        const motivos = [];
        if (tasa < 0.7) motivos.push({ tipo: 'asistencia', peso: (0.7 - tasa) * 100, texto: 'Asistencia ' + Math.round(tasa * 100) + '% en el periodo' });
        if (racha >= 2) motivos.push({ tipo: 'racha', peso: racha * 12, texto: racha + ' ausencias consecutivas' });
        if (caida <= -0.8) motivos.push({ tipo: 'descenso', peso: Math.abs(caida) * 20, texto: 'Evaluación bajó ' + Math.abs(caida).toFixed(1) + ' pts' });
        if (!motivos.length) return;

        const peso = motivos.reduce(function (a, m) { return a + m.peso; }, 0);
        out.push({
          estudiante: est, colegio: col, curso: cur, tasa: tasa, racha: racha,
          promedio: evs.length ? evs.reduce(function (s, x) { return s + x.r.evaluacion; }, 0) / evs.length : null,
          motivos: motivos, peso: peso,
          nivel: peso > 45 ? 'alto' : peso > 22 ? 'medio' : 'bajo',
          ultimaFecha: regs[regs.length - 1].s.fecha,
          ultimaObs: (function () {
            for (let i = regs.length - 1; i >= 0; i--) {
              if (regs[i].r.observacion && regs[i].r.observacion.trim()) return regs[i].r.observacion;
            }
            return '';
          })(),
        });
      });
    });
    return out.sort(function (a, b) { return b.peso - a.peso; });
  }

  /* ----------------------- Observaciones ----------------------- */
  function observaciones(db, opts) {
    opts = opts || {};
    const f = filtrar(db, opts);
    const out = [];
    f.registros.forEach(function (r) {
      if (!r.observacion || !r.observacion.trim()) return;
      if (opts.etiqueta && (r.etiquetas || []).indexOf(opts.etiqueta) < 0) return;
      if (opts.estudianteId && r.estudianteId !== opts.estudianteId) return;
      const s = f.sesiones.find(function (x) { return x.id === r.sesionId; });
      out.push({
        fecha: s ? s.fecha : '', sesion: s,
        estudiante: estudiante(db, r.estudianteId),
        colegio: s ? colegio(db, s.colegioId) : null,
        curso: s ? curso(db, s.cursoId) : null,
        profesor: s ? profesor(db, s.profesorId) : null,
        evaluacion: r.evaluacion, asistencia: r.asistencia,
        observacion: r.observacion, etiquetas: r.etiquetas || [],
      });
    });
    return out.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
  }

  /* ------------------------ Validación ------------------------- */
  /**
   * Asistencia y evaluación son obligatorias en todas las filas.
   * La evaluación admite 0, y 0 significa "sin nota": es un valor válido,
   * no un dato faltante.
   */
  function validarRegistro(payload) {
    const errores = [];
    const filas = payload.filas || [];
    if (!payload.fecha) errores.push('Falta la fecha de la clase.');
    if (!payload.colegioId) errores.push('Falta seleccionar el colegio.');
    if (!payload.cursoId) errores.push('Falta seleccionar el curso.');
    if (!payload.profesorId) errores.push('Falta seleccionar el profesor.');
    if (payload.realizada !== false) {
      if (!filas.length) errores.push('El curso no tiene estudiantes.');
      filas.forEach(function (f) {
        if (!f.asistencia) errores.push(f.nombre + ': falta marcar la asistencia.');
        if (f.evaluacion === null || f.evaluacion === undefined || f.evaluacion === '' ||
          isNaN(Number(f.evaluacion)) || Number(f.evaluacion) < 0 || Number(f.evaluacion) > 3) {
          errores.push(f.nombre + ': falta la evaluación (0 = sin nota).');
        }
      });
    } else if (!payload.motivo || !payload.motivo.trim()) {
      errores.push('Si la clase no se realizó, indica el motivo.');
    }
    return errores;
  }

  /**
   * Guarda (crea o actualiza) la clase de un curso en una fecha.
   * Una sola clase por curso y fecha: evita duplicar la información.
   */
  function guardarSesion(db, payload) {
    const fecha = payload.fecha;
    let sesion = sesionDe(db, payload.cursoId, fecha);
    const ahora = ahoraLocal();
    let nuevo = false;

    if (!sesion) {
      nuevo = true;
      sesion = {
        id: payload.id || ('s' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
        fecha: fecha,
        colegioId: payload.colegioId,
        cursoId: payload.cursoId,
        profesorId: payload.profesorId,
        realizada: payload.realizada !== false,
        motivo: payload.motivo || '',
        registradoPor: payload.profesorId,
        creadoEn: ahora,
        actualizadoEn: ahora,
      };
      db.sesiones.push(sesion);
    } else {
      sesion.colegioId = payload.colegioId;
      sesion.profesorId = payload.profesorId;
      sesion.realizada = payload.realizada !== false;
      sesion.motivo = payload.motivo || '';
      sesion.actualizadoEn = ahora;
    }

    let creados = 0, actualizados = 0;
    if (sesion.realizada) {
      (payload.filas || []).forEach(function (f) {
        const ex = registroDe(db, sesion.id, f.estudianteId);
        const valor = {
          asistencia: f.asistencia,
          evaluacion: Number(f.evaluacion),
          observacion: (f.observacion || '').trim(),
          etiquetas: f.etiquetas || [],
          actualizadoEn: ahora,
        };
        if (ex) {
          const cambia = ex.asistencia !== valor.asistencia || ex.evaluacion !== valor.evaluacion ||
            ex.observacion !== valor.observacion ||
            JSON.stringify(ex.etiquetas || []) !== JSON.stringify(valor.etiquetas || []);
          Object.assign(ex, valor);
          if (cambia) actualizados++;
        } else {
          db.registros.push(Object.assign({
            id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            sesionId: sesion.id,
            estudianteId: f.estudianteId,
            creadoEn: ahora,
          }, valor));
          creados++;
        }
      });
    } else {
      db.registros = db.registros.filter(function (r) { return r.sesionId !== sesion.id; });
    }
    return { sesion: sesion, nuevo: nuevo, creados: creados, actualizados: actualizados };
  }

  /* ------------------- Resumen narrativo ----------------------- */
  function borradorInforme(db, opts) {
    const k = indicadores(db, opts);
    const cols = porColegio(db, opts);
    const curs = porCurso(db, opts);
    const profs = porProfesor(db, opts);
    const obs = observaciones(db, opts);
    const als = alertas(db, opts);
    const nombreColegio = opts.colegioId ? (colegio(db, opts.colegioId) || {}).nombre : 'todos los colegios';
    const L = [];

    L.push('INFORME DE REFORZAMIENTO — ' + (nombreColegio || '').toUpperCase());
    L.push('Periodo: ' + fmtFecha(opts.desde) + ' al ' + fmtFecha(opts.hasta));
    L.push('');
    L.push('1. Cobertura');
    L.push('Durante el periodo se realizaron ' + k.sesiones + ' sesiones de reforzamiento en ' +
      cols.length + ' establecimiento(s) y ' + curs.length + ' curso(s), con ' + k.estudiantes +
      ' estudiantes participantes y ' + k.registros + ' registros de asistencia.');
    L.push('');
    L.push('2. Asistencia');
    L.push('La asistencia global fue de ' + pct(k.asistencia) + ' (' + k.presentes + ' presencias de ' +
      k.registros + ' registros).');
    L.push(curs.map(function (c) {
      return '· ' + c.colegio.nombre + ' — ' + c.curso.nombre + ': ' + pct(c.asistencia) +
        ' (' + c.estudiantes + ' estudiantes, ' + c.sesiones + ' sesiones)';
    }).join('\n'));
    L.push('');
    L.push('3. Evaluación');
    if (k.promedio !== null) {
      L.push('El promedio de los niveles 1 a 3 fue ' + num(k.promedio, 2) + '. Se calcula solo con las ' +
        k.conNota + ' evaluaciones con nota; los otros ' + k.sinNota + ' registros (' +
        pct(k.registros ? k.sinNota / k.registros : 0) + ') quedaron en 0, que significa sin nota.');
      L.push('Distribución: 0 sin nota: ' + k.distribucion[0] + '; 1: ' + k.distribucion[1] +
        '; 2: ' + k.distribucion[2] + '; 3: ' + k.distribucion[3] + '.');
      if (k.conNota) {
        L.push('El ' + pct((k.distribucion[2] + k.distribucion[3]) / k.conNota) +
          ' de las evaluaciones con nota se ubicó en los niveles 2 y 3.');
      }
    } else {
      L.push('No se registraron evaluaciones con nota en el periodo (todos los registros quedaron en 0).');
    }
    L.push('');
    L.push('4. Equipo docente');
    L.push(profs.map(function (p) {
      return p.profesor.nombre + ': ' + p.sesiones + ' sesiones, asistencia ' + pct(p.asistencia);
    }).join('; ') + '.');
    L.push('');
    L.push('5. Observaciones cualitativas (' + obs.length + ')');
    if (obs.length) {
      obs.slice(0, 25).forEach(function (o) {
        L.push('· ' + fmtFecha(o.fecha) + ' — ' + (o.estudiante ? o.estudiante.nombre : '') +
          ' (' + (o.colegio ? o.colegio.nombre : '') + (o.curso ? ' · ' + o.curso.nombre : '') + '): "' +
          o.observacion + '"' + (o.etiquetas.length ? ' [' + o.etiquetas.join(', ') + ']' : ''));
      });
      if (obs.length > 25) L.push('(se listan las 25 más recientes de ' + obs.length + ' observaciones)');
    } else {
      L.push('Sin observaciones registradas en el periodo.');
    }
    L.push('');
    L.push('6. Estudiantes que requieren seguimiento (' + als.length + ')');
    if (als.length) {
      als.slice(0, 12).forEach(function (a) {
        L.push('· ' + a.estudiante.nombre + ' (' + a.colegio.nombre + ' · ' + a.curso.nombre + '): ' +
          a.motivos.map(function (m) { return m.texto; }).join('; ') + '.');
      });
    } else {
      L.push('No se detectaron señales de alerta con los criterios actuales.');
    }
    L.push('');
    L.push('Documento generado automáticamente desde los registros del sistema el ' + fmtFecha(new Date()) + '.');
    return L.join('\n');
  }

  function pct(x) {
    if (x === null || x === undefined || isNaN(x)) return 's/d';
    return (x * 100).toFixed(1).replace('.', ',') + '%';
  }
  function num(x, d) {
    if (x === null || x === undefined || isNaN(x)) return 's/d';
    return x.toFixed(d === undefined ? 2 : d).replace('.', ',');
  }

  return {
    parseISO: parseISO, iso: iso, ahoraLocal: ahoraLocal, addDays: addDays,
    startOfWeek: startOfWeek, diasDesde: diasDesde,
    fmtCorta: fmtCorta, fmtLarga: fmtLarga, fmtFecha: fmtFecha,
    colegio: colegio, curso: curso, profesor: profesor, estudiante: estudiante, cmpNombre: cmpNombre,
    cursosDeColegio: cursosDeColegio, cursosDeProfesor: cursosDeProfesor,
    profesoresDeColegio: profesoresDeColegio, estaAsignado: estaAsignado,
    colegiosDeProfesor: colegiosDeProfesor,
    estudiantesDeCurso: estudiantesDeCurso, estudiantesDeColegio: estudiantesDeColegio,
    sesionDe: sesionDe, registrosDeSesion: registrosDeSesion, registroDe: registroDe,
    filtrar: filtrar, indicadores: indicadores, porColegio: porColegio, porCurso: porCurso,
    porProfesor: porProfesor, serieSemanal: serieSemanal,
    alertas: alertas, observaciones: observaciones,
    validarRegistro: validarRegistro, guardarSesion: guardarSesion,
    borradorInforme: borradorInforme, pct: pct, num: num,
  };
});
