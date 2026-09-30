const CFG = window.APP_CONFIG || {};
export const CONFIGURADO =
  !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase) &&
  !/TU-PROYECTO|TU_CLAVE/.test(CFG.SUPABASE_URL + CFG.SUPABASE_ANON_KEY);

export const sb = CONFIGURADO
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
  : null;
