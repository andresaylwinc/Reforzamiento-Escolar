/* ============================================================
   nube.js — Acceso a la base de datos compartida (Supabase).
   Habla con la API REST (PostgREST) y con Auth usando fetch,
   sin librerías externas.

   Modelo: se carga una vez todo lo que el usuario puede ver y se
   trabaja en memoria con la misma estructura que el prototipo.
   Al guardar una clase se envía al servidor; si no hay conexión,
   queda en una cola local y se reintenta después.
   ============================================================ */
(function (root) {
  'use strict';

  const CFG = root.CONFIG || {};
  const params = new URLSearchParams(root.location ? root.location.search : '');
  const desdeUrl = params.get('api');
  const urlBase = ((CFG.supabaseUrl && CFG.supabaseUrl.trim()) || (desdeUrl || '')).replace(/\/+$/, '');
  const clave = ((CFG.supabaseKey && CFG.supabaseKey.trim()) || params.get('anon') || '').trim();

  const K_SESION = 'reforzamiento.sesion';
  const K_COLA = 'reforzamiento.cola';

  let sesion = leerSesion();

  /* ------------------------- Sesión ---------------------------- */
  function leerSesion() {
    try { return JSON.parse(localStorage.getItem(K_SESION) || 'null'); } catch (e) { return null; }
  }
  function guardarSesion(s) {
    sesion = s;
    try { localStorage.setItem(K_SESION, JSON.stringify(s)); } catch (e) {}
  }
  function limpiarSesion() {
    sesion = null;
    try { localStorage.removeItem(K_SESION); } catch (e) {}
  }

  async function asegurar() {
    if (!sesion) return null;
    if (Date.now() < (sesion.expira || 0) - 60000) return sesion;
    try {
      const r = await fetch(urlBase + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: clave },
        body: JSON.stringify({ refresh_token: sesion.refresh_token }),
      });
      if (!r.ok) throw new Error('refresh');
      const d = await r.json();
      guardarSesion(Object.assign({}, sesion, {
        access_token: d.access_token,
        refresh_token: d.refresh_token,
        expira: Date.now() + (d.expires_in || 3600) * 1000,
      }));
      return sesion;
    } catch (e) {
      limpiarSesion();
      return null;
    }
  }

  async function mensajeError(r) {
    let detalle = '';
    try {
      const d = await r.json();
      detalle = d.message || d.error_description || d.error || JSON.stringify(d);
    } catch (e) {
      detalle = await r.text().catch(function () { return ''; });
    }
    if (r.status === 401) return 'La sesión venció. Vuelve a entrar.';
    if (r.status === 403) return 'No tienes permiso para esa acción.';
    if (r.status === 409) return 'Ese registro ya existe.';
    return 'Error ' + r.status + ': ' + String(detalle).slice(0, 160);
  }

  /* ---------------------- Llamadas a la API -------------------- */
  async function pedir(ruta, opciones) {
    opciones = opciones || {};
    const s = await asegurar();
    if (!s) throw new Error('La sesión venció. Vuelve a entrar.');
    const cabeceras = {
      apikey: clave,
      Authorization: 'Bearer ' + s.access_token,
      'Content-Type': 'application/json',
    };
    if (opciones.prefer) cabeceras.Prefer = opciones.prefer;
    const r = await fetch(urlBase + '/rest/v1/' + ruta, {
      method: opciones.method || 'GET',
      headers: cabeceras,
      body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
    });
    if (!r.ok) throw new Error(await mensajeError(r));
    if (r.status === 204) return null;
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  async function ingresar(email, pass) {
    if (!urlBase) throw new Error('Falta configurar la dirección de la base de datos.');
    const r = await fetch(urlBase + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: clave },
      body: JSON.stringify({ email: email.trim(), password: pass }),
    });
    if (!r.ok) {
      const t = (await r.text()).toLowerCase();
      throw new Error(t.indexOf('invalid') >= 0 || t.indexOf('credentials') >= 0
        ? 'Correo o contraseña incorrectos.'
        : 'No se pudo entrar. Revisa tu conexión e inténtalo otra vez.');
    }
    const d = await r.json();
    guardarSesion({
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expira: Date.now() + (d.expires_in || 3600) * 1000,
      usuario: { id: d.user.id, email: d.user.email },
    });
    const perfil = await pedir('perfiles?select=id,nombre,rol,activo&id=eq.' + encodeURIComponent(d.user.id));
    if (!perfil || !perfil.length) {
      limpiarSesion();
      throw new Error('Tu cuenta no tiene perfil en el sistema. Pídele a la líder que la habilite.');
    }
    if (perfil[0].activo === false) {
      limpiarSesion();
      throw new Error('Tu cuenta está desactivada. Habla con la líder del proyecto.');
    }
    guardarSesion(Object.assign({}, sesion, {
      usuario: { id: d.user.id, email: d.user.email, nombre: perfil[0].nombre, rol: perfil[0].rol },
    }));
    return sesion.usuario;
  }

  async function salir() {
    const s = sesion;
    limpiarSesion();
    if (!s) return;
    try {
      await fetch(urlBase + '/auth/v1/logout', {
        method: 'POST',
        headers: { apikey: clave, Authorization: 'Bearer ' + s.access_token },
      });
    } catch (e) { /* sin conexión: la sesión local ya se borró */ }
  }

  /** true si ya hay una sesión válida guardada en este navegador. */
  function haySesion() {
    return !!sesion && Date.now() < (sesion.expira || 0);
  }

  function usuario() {
    return sesion ? sesion.usuario : null;
  }

  /* ------------------------ Carga inicial ---------------------- */
  function aCamelClase(c) {
    return {
      id: c.id, fecha: c.fecha, colegioId: c.colegio_id, cursoId: c.curso_id,
      profesorId: c.profesor_id, realizada: c.realizada, motivo: c.motivo || '',
      registradoPor: c.registrado_por, creadoEn: c.creado_en, actualizadoEn: c.actualizado_en,
    };
  }
  function aCamelRegistro(r) {
    return {
      id: r.id, sesionId: r.clase_id, estudianteId: r.estudiante_id,
      asistencia: r.asistencia, evaluacion: r.evaluacion,
      observacion: r.observacion || '', etiquetas: r.etiquetas || [],
      actualizadoEn: r.actualizado_en,
    };
  }

  /** Trae todo lo que el usuario puede ver y lo deja con la forma del prototipo. */
  async function cargarTodo() {
    const [colegios, cursos, perfiles, asignaciones, estudiantes, clases, registros] = await Promise.all([
      pedir('colegios?select=*&order=nombre'),
      pedir('cursos?select=*&order=nombre'),
      pedir('perfiles?select=id,nombre,rol,activo&order=nombre'),
      pedir('asignaciones?select=*'),
      pedir('estudiantes?select=*&activo=eq.true&order=nombre'),
      pedir('clases?select=*&order=fecha'),
      pedir('registros?select=*&limit=50000'),
    ]);

    return {
      version: 4,
      colegios: (colegios || []).map(function (c) {
        return { id: c.id, nombre: c.nombre, comuna: c.comuna || '', color: c.color || '#1F3B57' };
      }),
      cursos: (cursos || []).map(function (k) {
        return { id: k.id, colegioId: k.colegio_id, nombre: k.nombre };
      }),
      profesores: (perfiles || []).filter(function (p) { return p.activo !== false; })
        .map(function (p) { return { id: p.id, nombre: p.nombre, rol: p.rol === 'lider' ? 'Líder de proyecto' : 'Profesor' }; }),
      asignaciones: (asignaciones || []).map(function (a) {
        return { colegioId: a.colegio_id, profesorId: a.profesor_id };
      }),
      estudiantes: (estudiantes || []).map(function (e) {
        return { id: e.id, nombre: e.nombre, colegioId: e.colegio_id, cursoId: e.curso_id };
      }),
      sesiones: (clases || []).map(aCamelClase),
      registros: (registros || []).map(aCamelRegistro),
      etiquetas: ['Comprensión lectora', 'Cálculo y operatoria', 'Participación', 'Conducta',
        'Motivación', 'Asistencia irregular', 'Apoyo familiar', 'Logro destacado'],
      ajustes: { modoRapido: true, diasEdicion: 30 },
    };
  }

  /* ------------------------- Escrituras ------------------------ */
  const ahora = function () { return new Date().toISOString(); };

  async function guardarClase(datos) {
    const fila = {
      id: datos.id,
      fecha: datos.fecha,
      colegio_id: datos.colegioId,
      curso_id: datos.cursoId,
      profesor_id: datos.profesorId,
      realizada: datos.realizada,
      motivo: datos.motivo || '',
      registrado_por: datos.profesorId,
      actualizado_en: ahora(),
    };
    const res = await pedir('clases?on_conflict=id', {
      method: 'POST', body: fila,
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    const clase = (res && res[0]) || fila;

    if (!datos.realizada) {
      await pedir('registros?clase_id=eq.' + encodeURIComponent(clase.id), { method: 'DELETE' });
      return clase;
    }
    if (datos.filas && datos.filas.length) {
      const regs = datos.filas.map(function (f) {
        return {
          id: 'r-' + clase.id + '-' + f.estudianteId,
          clase_id: clase.id,
          estudiante_id: f.estudianteId,
          asistencia: f.asistencia,
          evaluacion: Number(f.evaluacion),
          observacion: f.observacion || '',
          etiquetas: f.etiquetas || [],
          actualizado_en: ahora(),
        };
      });
      await pedir('registros?on_conflict=id', {
        method: 'POST', body: regs,
        prefer: 'resolution=merge-duplicates,return=minimal',
      });
    }
    return clase;
  }

  async function guardarEstudiante(e) {
    await pedir('estudiantes?on_conflict=id', {
      method: 'POST',
      body: {
        id: e.id, colegio_id: e.colegioId, curso_id: e.cursoId,
        nombre: e.nombre, activo: true,
      },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }

  async function borrarEstudiante(id) {
    await pedir('estudiantes?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  }

  async function guardarColegio(c) {
    await pedir('colegios?on_conflict=id', {
      method: 'POST',
      body: { id: c.id, nombre: c.nombre, comuna: c.comuna || '', color: c.color || '#1F3B57' },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }

  async function guardarCurso(k) {
    await pedir('cursos?on_conflict=id', {
      method: 'POST',
      body: { id: k.id, colegio_id: k.colegioId, nombre: k.nombre },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }

  async function borrarCurso(id) {
    await pedir('cursos?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  }

  /**
   * Borra un colegio con todo lo que cuelga de él.
   * El orden importa: las clases van primero (sus registros se van con ellas),
   * después estudiantes, cursos y asignaciones, y el colegio al final.
   * Solo la líder puede hacerlo: las reglas de la base lo impiden al resto.
   */
  async function borrarColegio(id) {
    const q = 'colegio_id=eq.' + encodeURIComponent(id);
    await pedir('clases?' + q, { method: 'DELETE' });
    await pedir('estudiantes?' + q, { method: 'DELETE' });
    await pedir('cursos?' + q, { method: 'DELETE' });
    await pedir('asignaciones?' + q, { method: 'DELETE' });
    await pedir('colegios?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  }

  async function guardarAsignaciones(colegioId, profesorIds) {
    await pedir('asignaciones?colegio_id=eq.' + encodeURIComponent(colegioId), { method: 'DELETE' });
    if (!profesorIds.length) return;
    await pedir('asignaciones', {
      method: 'POST',
      body: profesorIds.map(function (p) { return { colegio_id: colegioId, profesor_id: p }; }),
      prefer: 'return=minimal',
    });
  }

  /* ------------------- Cola para trabajar sin señal ------------- */
  function leerCola() {
    try { return JSON.parse(localStorage.getItem(K_COLA) || '[]'); } catch (e) { return []; }
  }
  function guardarCola(lista) {
    try { localStorage.setItem(K_COLA, JSON.stringify(lista)); } catch (e) {}
  }
  function encolar(datos) {
    const cola = leerCola();
    const i = cola.findIndex(function (x) { return x.id === datos.id; });
    if (i >= 0) cola[i] = datos; else cola.push(datos);
    guardarCola(cola);
    return cola.length;
  }
  function pendientes() { return leerCola().length; }

  /** Reintenta lo que quedó pendiente. Devuelve cuántas se enviaron. */
  async function reintentar() {
    const cola = leerCola();
    if (!cola.length || !sesion) return 0;
    const quedan = [];
    let enviadas = 0;
    for (const datos of cola) {
      try {
        await guardarClase(datos);
        enviadas++;
      } catch (e) {
        if (String(e.message).indexOf('sesión') >= 0) { quedan.push(datos); }
        else quedan.push(datos);
      }
    }
    guardarCola(quedan);
    return enviadas;
  }

  /** Comprueba que la conexión esté bien configurada (para la pantalla de entrada). */
  async function probarConexion() {
    if (!urlBase) return { ok: false, mensaje: 'Falta configurar la dirección de la base de datos.' };
    try {
      const r = await fetch(urlBase + '/auth/v1/settings', { headers: { apikey: clave } });
      if (!r.ok) return { ok: false, mensaje: 'La base de datos respondió con error ' + r.status + '.' };
      return { ok: true, mensaje: 'Conexión correcta.' };
    } catch (e) {
      return { ok: false, mensaje: 'No se pudo conectar con la base de datos.' };
    }
  }

  /* -------------------- Cuentas de profesores ------------------ */
  async function crearProfesor(datos) {
    const s = await asegurar();
    if (!s) throw new Error('La sesión venció. Vuelve a entrar.');
    let r;
    try {
      r = await fetch(urlBase + '/functions/v1/crear-profesor', {
        method: 'POST',
        headers: {
          apikey: clave,
          Authorization: 'Bearer ' + s.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(datos),
      });
    } catch (e) {
      throw new Error('No se pudo conectar con el servidor. Revisa tu conexión.');
    }
    let d = null;
    try { d = await r.json(); } catch (e) { /* respuesta sin cuerpo */ }
    if (r.status === 404) {
      throw new Error('Falta desplegar la función "crear-profesor" en Supabase. Revisa la guía.');
    }
    if (!r.ok) throw new Error((d && d.error) || 'No se pudo crear la cuenta (' + r.status + ').');
    return d;
  }

  /**
   * Cuentas del equipo. Por defecto solo las activas; con `true` trae también
   * las dadas de baja (para poder restaurarlas).
   */
  async function perfiles(incluirInactivos) {
    const p = await pedir('perfiles?select=id,nombre,rol,activo&order=nombre');
    return (p || [])
      .filter(function (x) { return incluirInactivos || x.activo !== false; })
      .map(function (x) {
        return {
          id: x.id,
          nombre: x.nombre,
          rol: x.rol === 'lider' ? 'Líder de proyecto' : 'Profesor',
          activo: x.activo !== false,
        };
      });
  }

  /** Cambia el estado de una cuenta (solo la líder puede). */
  async function actualizarPerfil(id, campos) {
    await pedir('perfiles?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      body: campos,
      prefer: 'return=minimal',
    });
  }

  /**
   * Quita a una persona del equipo sin borrar su historia: la cuenta queda
   * desactivada, no puede entrar y desaparece de las listas, pero sus clases
   * se conservan. Se puede restaurar.
   */
  async function quitarProfesor(id) {
    await actualizarPerfil(id, { activo: false });
  }

  async function restaurarProfesor(id) {
    await actualizarPerfil(id, { activo: true });
  }

  root.NUBE = {
    activo: !!urlBase,
    url: urlBase,
    ingresar: ingresar,
    salir: salir,
    haySesion: haySesion,
    usuario: usuario,
    cargarTodo: cargarTodo,
    guardarClase: guardarClase,
    guardarEstudiante: guardarEstudiante,
    borrarEstudiante: borrarEstudiante,
    guardarColegio: guardarColegio,
    guardarCurso: guardarCurso,
    borrarCurso: borrarCurso,
    borrarColegio: borrarColegio,
    guardarAsignaciones: guardarAsignaciones,
    encolar: encolar,
    pendientes: pendientes,
    reintentar: reintentar,
    crearProfesor: crearProfesor,
    perfiles: perfiles,
    actualizarPerfil: actualizarPerfil,
    quitarProfesor: quitarProfesor,
    restaurarProfesor: restaurarProfesor,
    probarConexion: probarConexion,
  };
})(typeof window !== 'undefined' ? window : globalThis);
