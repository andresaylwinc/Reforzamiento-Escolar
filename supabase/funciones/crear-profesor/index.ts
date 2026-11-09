/* ============================================================
   create-profesor — función de Supabase (Edge Function)
   Permite que la líder cree cuentas de profesores desde la app,
   sin entrar al panel y sin exponer la clave secreta.

   Desplegar en: Supabase → Edge Functions → Deploy a new function
   → Via Editor → nombre: crear-profesor → pegar este código → Deploy.
   ============================================================ */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respuesta(codigo: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), {
    status: codigo,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return respuesta(405, { error: 'Método no permitido' });

  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion.startsWith('Bearer ')) return respuesta(401, { error: 'Sin sesión' });

  const url = Deno.env.get('SUPABASE_URL')!;
  // Sirve tanto con las claves antiguas (anon / service_role) como con las nuevas
  // (publishable / secret). Si falta la secreta, se avisa con claridad.
  const anon = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    || Deno.env.get('SUPABASE_SECRET_KEY')
    || '';

  if (!servicio) {
    return respuesta(500, {
      error: 'Falta la clave secreta del proyecto en las variables de la función',
    });
  }

  // 1. ¿Quién está llamando? Se valida con su propia sesión.
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: sesion, error: errorSesion } = await comoUsuario.auth.getUser();
  if (errorSesion || !sesion?.user) return respuesta(401, { error: 'Sesión inválida' });

  // 2. ¿Es la líder?
  const admin = createClient(url, servicio);
  const { data: perfil } = await admin
    .from('perfiles')
    .select('rol, activo')
    .eq('id', sesion.user.id)
    .maybeSingle();

  if (!perfil || perfil.activo === false || perfil.rol !== 'lider') {
    return respuesta(403, { error: 'Solo la líder del proyecto puede crear cuentas' });
  }

  // 3. Datos
  let cuerpo: { nombre?: string; email?: string; password?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return respuesta(400, { error: 'Datos inválidos' });
  }

  const nombre = String(cuerpo.nombre || '').trim();
  const email = String(cuerpo.email || '').trim().toLowerCase();
  const password = String(cuerpo.password || '');

  if (!nombre || !email || !password) {
    return respuesta(400, { error: 'Faltan el nombre, el correo o la contraseña' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return respuesta(400, { error: 'El correo no parece válido' });
  }
  if (password.length < 8) {
    return respuesta(400, { error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  // 4. Crear la cuenta ya confirmada
  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  });

  if (errorCrear) {
    const texto = (errorCrear.message || '').toLowerCase();
    if (texto.includes('already') || texto.includes('existe') || texto.includes('registered')) {
      return respuesta(409, { error: 'Ya existe una cuenta con ese correo' });
    }
    return respuesta(400, { error: errorCrear.message });
  }

  // 5. Asegurar el perfil (el disparador de la base ya lo crea; aquí se fija el nombre)
  await admin.from('perfiles').upsert({
    id: creado.user.id,
    nombre,
    rol: 'profesor',
    activo: true,
  });

  return respuesta(200, { ok: true, id: creado.user.id, email });
});
