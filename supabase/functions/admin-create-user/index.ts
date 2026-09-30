// ============================================================
// Edge Function: admin-create-user
// Requiere sesión válida (deploy CON verificación de JWT, la opción
// por defecto). Verifica dentro que quien llama es Administrador
// antes de usar la service_role para crear el usuario en Auth + su
// perfil. El frontend nunca ve la service_role key.
//
// Body esperado:
//   { nombre_completo, correo, password_temporal, rol,
//     area_id?, linea_id? }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Cliente "como el usuario que llama", solo para confirmar quién es
  // y que su perfil sea administrador — usa la anon key + su token.
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "No autenticado." }, 401);

  const admin = createClient(url, serviceKey);
  const { data: callerProfile } = await admin
    .from("profiles").select("rol, activo").eq("user_id", userData.user.id).single();
  if (!callerProfile?.activo || callerProfile.rol !== "administrador") {
    return json({ error: "Solo un Administrador puede crear usuarios." }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido." }, 400); }
  const { nombre_completo, correo, password_temporal, rol, area_id, linea_id } = body ?? {};
  if (!nombre_completo?.trim() || !correo?.trim() || !password_temporal || !rol) {
    return json({ error: "Completa nombre, correo, contraseña temporal y rol." }, 400);
  }
  if (!["administrador", "coordinador_produccion", "mantenimiento"].includes(rol)) {
    return json({ error: "Rol inválido." }, 400);
  }
  if (String(password_temporal).length < 8) {
    return json({ error: "La contraseña temporal debe tener al menos 8 caracteres." }, 400);
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: String(correo).trim().toLowerCase(),
    password: password_temporal,
    email_confirm: true, // no hay flujo de correo de bienvenida propio; el usuario entra directo
  });
  if (createErr || !created?.user) {
    return json({ error: createErr?.message ?? "No se pudo crear el usuario en Auth." }, 400);
  }

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .insert({
      user_id: created.user.id,
      nombre_completo: String(nombre_completo).trim(),
      correo: String(correo).trim().toLowerCase(),
      rol,
      activo: true,
      area_id: area_id ?? null,
      linea_id: linea_id ?? null,
    })
    .select()
    .single();

  if (profileErr) {
    // Revertir el usuario de Auth si el perfil no se pudo crear,
    // para no dejar una cuenta huérfana sin perfil.
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "No se pudo crear el perfil: " + profileErr.message }, 500);
  }

  return json({ profile });
});
