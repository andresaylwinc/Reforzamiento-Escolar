/* Servidor de prueba que imita la API de Supabase (Auth + PostgREST).
   Sirve para verificar el cliente sin depender de un proyecto real. */
import http from 'node:http';

export function crearServidor(opciones = {}) {
  const datos = {
    perfiles: [
      { id: 'u-lider', nombre: 'Líder', rol: 'lider', activo: true },
      { id: 'u-profe', nombre: 'Profesor 2', rol: 'profesor', activo: true },
    ],
    colegios: [
      { id: 'c1', nombre: 'Colegio 1', comuna: 'Los Parques', color: '#2F6F4E' },
      { id: 'c2', nombre: 'Colegio 2', comuna: 'Los Parques', color: '#2B6CB0' },
    ],
    cursos: [
      { id: 'k1', colegio_id: 'c1', nombre: 'Curso 1' },
      { id: 'k2', colegio_id: 'c1', nombre: 'Curso 2' },
      { id: 'k3', colegio_id: 'c2', nombre: 'Curso 1' },
    ],
    asignaciones: [
      { colegio_id: 'c1', profesor_id: 'u-profe' },
    ],
    estudiantes: [
      { id: 'e001', colegio_id: 'c1', curso_id: 'k1', nombre: 'Estudiante 1', activo: true },
      { id: 'e002', colegio_id: 'c1', curso_id: 'k1', nombre: 'Estudiante 2', activo: true },
      { id: 'e003', colegio_id: 'c2', curso_id: 'k3', nombre: 'Estudiante 3', activo: true },
    ],
    clases: [],
    registros: [],
  };

  // Con { vacio: true } el servidor parte sin colegios, cursos ni estudiantes,
  // como un proyecto recién creado.
  if (opciones.vacio) {
    datos.colegios = [];
    datos.cursos = [];
    datos.asignaciones = [];
    datos.estudiantes = [];
  }

  function filtros(query) {
    const out = [];
    for (const [k, v] of query.entries()) {
      if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue;
      if (v.startsWith('eq.')) out.push([k, v.slice(3)]);
    }
    return out;
  }
  function aplicar(lista, query) {
    let r = lista.slice();
    for (const [campo, valor] of filtros(query)) {
      r = r.filter((x) => String(x[campo]) === String(valor));
    }
    const order = query.get('order');
    if (order) {
      const campo = order.split('.')[0];
      r.sort((a, b) => String(a[campo]) < String(b[campo]) ? -1 : 1);
    }
    const limit = Number(query.get('limit'));
    if (limit) r = r.slice(0, limit);
    return r;
  }

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const ruta = url.pathname;
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      const json = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(obj === undefined ? '' : JSON.stringify(obj));
      };
      const json204 = () => { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); res.end(); };
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Private-Network': 'true' });
        res.end(); return;
      }

      // ---- Auth ----
      if (ruta === '/auth/v1/settings') return json(200, { external: {} });
      if (ruta === '/auth/v1/logout') return json204();
      if (ruta === '/auth/v1/token') {
        const grant = url.searchParams.get('grant_type');
        if (grant === 'password') {
          const b = cuerpo ? JSON.parse(cuerpo) : {};
          if (b.password !== 'secreta') return json(400, { error_description: 'Invalid login credentials' });
          return json(200, { access_token: 'tok-' + Date.now(), refresh_token: 'ref-1', expires_in: 3600, user: { id: 'u-lider', email: b.email } });
        }
        return json(200, { access_token: 'tok-ref', refresh_token: 'ref-2', expires_in: 3600, user: { id: 'u-lider' } });
      }

      // ---- Función crear-profesor ----
      if (ruta === '/functions/v1/crear-profesor') {
        if (!req.headers.authorization) return json(401, { error: 'Sin sesión' });
        const b = cuerpo ? JSON.parse(cuerpo) : {};
        if (!b.nombre || !b.email || !b.password) return json(400, { error: 'Faltan el nombre, el correo o la contraseña' });
        if (String(b.password).length < 8) return json(400, { error: 'La contraseña debe tener al menos 8 caracteres' });
        if (datos.perfiles.some((p) => p.email === b.email)) return json(409, { error: 'Ya existe una cuenta con ese correo' });
        const id = 'u-' + Math.random().toString(36).slice(2, 8);
        datos.perfiles.push({ id: id, nombre: b.nombre, rol: 'profesor', activo: true, email: b.email });
        return json(200, { ok: true, id: id, email: b.email });
      }

      // ---- PostgREST ----
      const m = ruta.match(/^\/rest\/v1\/([a-z_]+)$/);
      if (!m) return json(404, { message: 'ruta no encontrada' });
      const tabla = m[1];
      if (!datos[tabla]) return json(404, { message: 'tabla no encontrada' });
      if (!req.headers.authorization) return json(401, { message: 'sin autorización' });

      if (req.method === 'GET') return json(200, aplicar(datos[tabla], url.searchParams));

      if (req.method === 'POST') {
        const b = cuerpo ? JSON.parse(cuerpo) : {};
        const filas = Array.isArray(b) ? b : [b];
        const salida = [];
        for (const fila of filas) {
          const i = fila.id === undefined ? -1 : datos[tabla].findIndex((x) => x.id === fila.id);
          if (i >= 0) datos[tabla][i] = Object.assign({}, datos[tabla][i], fila);
          else datos[tabla].push(fila);
          salida.push(fila);
        }
        const prefer = req.headers.prefer || '';
        if (prefer.includes('return=minimal')) return json(201, undefined);
        return json(201, salida);
      }

      if (req.method === 'DELETE') {
        const antes = datos[tabla].length;
        const quedan = datos[tabla].filter((x) => !aplicar([x], url.searchParams).length);
        datos[tabla] = quedan;
        return json(200, { borrados: antes - quedan.length });
      }

      if (req.method === 'PATCH') return json(200, []);
      return json(405, { message: 'método no permitido' });
    });
  });

  return {
    datos,
    escuchar(puerto = 0) {
      return new Promise((resolve) => {
        servidor.listen(puerto, '127.0.0.1', () => resolve('http://127.0.0.1:' + servidor.address().port));
      });
    },
    cerrar() {
      return new Promise((resolve) => servidor.close(resolve));
    },
  };
}

// Si se ejecuta directamente: node test/mock-supabase.mjs 54321
if (process.argv[1] && process.argv[1].endsWith('mock-supabase.mjs')) {
  const s = crearServidor();
  const url = await s.escuchar(Number(process.argv[2] || 54321));
  console.log('mock escuchando en ' + url);
}
