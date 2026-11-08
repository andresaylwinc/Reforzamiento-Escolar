/* ============================================================
   config.js — Conexión a la base de datos compartida
   ------------------------------------------------------------
   Si dejas los dos valores vacíos, el sistema funciona en modo
   local (datos de ejemplo, sin cuentas).
   Para pasar a modo en uso, pega aquí los datos de tu proyecto
   de Supabase y vuelve a generar el archivo:

     supabaseUrl: https://TU-PROYECTO.supabase.co
     supabaseKey: la clave "anon public" (Settings → API)

   La clave anon es pública: está hecha para ir en el navegador.
   Lo que protege los datos son las reglas de la base (RLS).
   ============================================================ */
window.CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',
};
