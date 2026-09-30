// ============================================================
// Edge Function: enviar-notificacion
// Deploy CON verificación de JWT, pero aquí "el usuario" es el propio
// trigger de Postgres, que llama con el service_role key como Bearer
// token (ver 0006_notificaciones.sql) — por eso NO se valida un perfil
// aquí, se confía en que solo el trigger conoce esa llave.
//
// Body esperado: { notificacion_id: uuid }
//
// Variables de entorno requeridas:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (ya inyectadas)
//   RESEND_API_KEY                            (tu clave de Resend)
//   REMITENTE_CORREO   ej. "Hada Mantenimiento <mantenimiento@tu-dominio.com>"
//   APP_URL            ej. "https://hada-mantenimiento.netlify.app"
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ASUNTOS: Record<string, string> = {
  asignacion: "Nueva tarea asignada",
  reasignacion: "Tarea reasignada a ti",
  aprobacion: "Tu tarea fue aprobada",
  rechazo: "Tu tarea fue rechazada — requiere corrección",
};

function cuerpo(evento: string, consecutivo: string, actividad: string, appUrl: string): string {
  const linea1: Record<string, string> = {
    asignacion: "Se te asignó una nueva solicitud de mantenimiento.",
    reasignacion: "Una solicitud fue reasignada a ti.",
    aprobacion: "El Coordinador de Producción aprobó tu trabajo.",
    rechazo: "El Coordinador de Producción rechazó el cierre y la tarea volvió a En Proceso.",
  };
  return `<p>${linea1[evento] ?? ""}</p>
    <p><b>${consecutivo}</b> — ${actividad}</p>
    <p><a href="${appUrl}">Abrir la aplicación</a></p>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido." }, 400); }
  const notifId = body?.notificacion_id;
  if (!notifId) return json({ error: "Falta notificacion_id." }, 400);

  const { data: n } = await admin
    .from("notificaciones_email")
    .select("id, evento, destinatario, intentos, solicitud_id, solicitudes(consecutivo, actividad)")
    .eq("id", notifId)
    .single();
  if (!n) return json({ error: "Notificación no encontrada." }, 404);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const remitente = Deno.env.get("REMITENTE_CORREO") ?? "Hada Mantenimiento <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "";

  if (!resendKey) {
    await admin.from("notificaciones_email").update({
      estado_envio: "fallido", intentos: n.intentos + 1, error_detalle: "RESEND_API_KEY no configurada",
    }).eq("id", notifId);
    return json({ error: "RESEND_API_KEY no configurada." }, 500);
  }

  try {
    const sol = Array.isArray(n.solicitudes) ? n.solicitudes[0] : n.solicitudes;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: remitente,
        to: [n.destinatario],
        subject: `${ASUNTOS[n.evento] ?? "Actualización de solicitud"} · ${sol?.consecutivo ?? ""}`,
        html: cuerpo(n.evento, sol?.consecutivo ?? "", sol?.actividad ?? "", appUrl),
      }),
    });
    if (!res.ok) {
      const detalle = await res.text();
      await admin.from("notificaciones_email").update({
        estado_envio: "fallido", intentos: n.intentos + 1, error_detalle: detalle.slice(0, 500),
      }).eq("id", notifId);
      return json({ error: "Resend rechazó el envío." }, 502);
    }
    await admin.from("notificaciones_email").update({
      estado_envio: "enviado", intentos: n.intentos + 1, enviado_en: new Date().toISOString(), error_detalle: null,
    }).eq("id", notifId);
    return json({ ok: true });
  } catch (e) {
    await admin.from("notificaciones_email").update({
      estado_envio: "fallido", intentos: n.intentos + 1, error_detalle: String(e).slice(0, 500),
    }).eq("id", notifId);
    return json({ error: "Error de red al enviar." }, 500);
  }
});
