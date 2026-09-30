// ============================================================
// Edge Function: reportar-solicitud
// Pública (deploy con --no-verify-jwt). Único punto por el que un
// Invitado toca el sistema. Nunca usa la anon key del navegador:
// habla con la base con la service_role key, que solo existe aquí
// como variable de entorno (nunca en el frontend).
//
// GET  → devuelve catálogo de áreas y líneas (solo id + nombre).
// POST → valida Turnstile, aplica límite de tasa por IP y crea la
//         solicitud. Responde solo con el consecutivo generado.
//
// Variables de entorno requeridas (Supabase → Edge Functions → Secrets):
//   SUPABASE_URL                (ya la inyecta la plataforma)
//   SUPABASE_SERVICE_ROLE_KEY   (ya la inyecta la plataforma)
//   TURNSTILE_SECRET_KEY        (la generas en Cloudflare Turnstile)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*", // ajusta al dominio de Netlify si quieres restringirlo
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const LIMITE_POR_VENTANA = 5;
const VENTANA_MINUTOS = 10;
const PRIORIDADES = ["Alta", "Media", "Baja"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + (Deno.env.get("IP_HASH_SALT") ?? "sal-fija"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (req.method === "GET") {
    const { data: areas, error: e1 } = await admin.from("areas").select("id, nombre").order("nombre");
    const { data: lineas, error: e2 } = await admin.from("lineas").select("id, area_id, nombre").order("nombre");
    if (e1 || e2) return json({ error: "No se pudo cargar el catálogo." }, 500);
    return json({ areas, lineas });
  }

  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido." }, 400); }

  const { area_id, linea_id, tipo, descripcion, prioridad, solicitante, turnstile_token } = body ?? {};
  if (!area_id || !linea_id || !tipo || !descripcion || !String(descripcion).trim()) {
    return json({ error: "Completa Área, Línea, Tipo y Descripción." }, 400);
  }
  if (!turnstile_token) return json({ error: "Falta la verificación de seguridad." }, 400);

  // 1) Verificar Turnstile con Cloudflare
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "0.0.0.0";
  const tsRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: Deno.env.get("TURNSTILE_SECRET_KEY"),
      response: turnstile_token,
      remoteip: ip,
    }),
  });
  const tsJson = await tsRes.json();
  if (!tsJson.success) return json({ error: "No se pudo verificar que eres una persona. Intenta de nuevo." }, 400);

  // 2) Límite de tasa por IP (defensa adicional a Turnstile)
  const ipHash = await hashIp(ip);
  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60_000).toISOString();
  const { count } = await admin
    .from("invitado_rate_limit")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("creado_en", desde);
  if ((count ?? 0) >= LIMITE_POR_VENTANA) {
    return json({ error: "Demasiadas solicitudes seguidas. Espera unos minutos e intenta de nuevo." }, 429);
  }
  await admin.from("invitado_rate_limit").insert({ ip_hash: ipHash });

  // 3) Crear la solicitud (bypassa RLS porque usa service_role;
  //    por eso toda la validación de forma ocurre aquí, a mano)
  const prioridadFinal = PRIORIDADES.includes(prioridad) ? prioridad : "Media";
  const { data, error } = await admin
    .from("solicitudes")
    .insert({
      area_id,
      linea_id,
      tipo: String(tipo).slice(0, 80),
      actividad: String(descripcion).trim().slice(0, 600), // la descripción del invitado es el título/actividad
      descripcion: "",
      prioridad: prioridadFinal,
      solicitante: String(solicitante ?? "").trim().slice(0, 120),
      estado: "Pendiente",
      origen: "invitado",
      creado_por: null,
      fecha_solicitud: new Date().toISOString().slice(0, 10),
    })
    .select("id, consecutivo")
    .single();

  if (error) return json({ error: "No se pudo registrar la solicitud. Intenta de nuevo." }, 500);

  // Historial: aquí se inserta directo (no vía RPC) porque no hay
  // sesión de usuario; usuario_id queda null = invitado, como en
  // cualquier evento del sistema sin autor humano.
  await admin.from("historial_solicitudes").insert({
    solicitud_id: data.id,
    usuario_id: null,
    accion: "creacion",
    comentario: "Creada por invitado vía formulario público",
  });

  return json({ consecutivo: data.consecutivo });
});
