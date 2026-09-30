// Completa con los valores de tu proyecto Supabase (Project Settings → API).
// Usa SOLO la clave pública ("anon" / "publishable").
// NUNCA pegues aquí la clave "service_role" / "secret".
//
// TURNSTILE_SITE_KEY es la llave PÚBLICA de Cloudflare Turnstile (la del
// "site key", visible en el widget). La llave SECRETA de Turnstile va
// aparte, solo como variable de entorno de la Edge Function
// "reportar-solicitud" — nunca en este archivo.
window.APP_CONFIG = {
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "TU_CLAVE_PUBLICA",
  TURNSTILE_SITE_KEY: "TU_TURNSTILE_SITE_KEY",
};
