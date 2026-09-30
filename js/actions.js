import { sb } from "./supabase-client.js";

// Cada función devuelve { ok, data, error }. "error" ya es el objeto
// de Supabase (para leer error.message con ERRORES en utils.js).
async function rpc(name, args) {
  const r = await sb.rpc(name, args);
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, data: r.data };
}

export const crearSolicitud = (args) => rpc("crear_solicitud", args);
export const asignarResponsable = (solicitudId, responsableId) =>
  rpc("asignar_responsable", { p_solicitud_id: solicitudId, p_responsable_id: responsableId });
export const iniciarTarea = (id) => rpc("iniciar_tarea", { p_solicitud_id: id });
export const terminarTarea = (id) => rpc("terminar_tarea", { p_solicitud_id: id });
export const aprobarTarea = (id) => rpc("aprobar_tarea", { p_solicitud_id: id });
export const rechazarTarea = (id, motivo) => rpc("rechazar_tarea", { p_solicitud_id: id, p_motivo: motivo });
export const cancelarTarea = (id) => rpc("cancelar_tarea", { p_solicitud_id: id });
export const reabrirTarea = (id) => rpc("reabrir_tarea", { p_solicitud_id: id });
export const eliminarSolicitud = (id) => rpc("eliminar_solicitud", { p_solicitud_id: id });
export const editarAviso = (id, aviso) => rpc("editar_aviso", { p_id: id, p_aviso: aviso });
export const agregarComentario = (solicitudId, texto) =>
  rpc("agregar_comentario", { p_solicitud_id: solicitudId, p_texto: texto });
export const eliminarComentario = (id) => rpc("eliminar_comentario", { p_comentario_id: id });

export async function comentariosDe(solicitudId) {
  const { data, error } = await sb.from("comentarios").select("*").eq("solicitud_id", solicitudId)
    .is("eliminado_en", null).order("creado_en", { ascending: true });
  return error ? [] : data;
}
export async function historialDe(solicitudId) {
  const { data, error } = await sb.from("historial_solicitudes").select("*").eq("solicitud_id", solicitudId)
    .order("creado_en", { ascending: true });
  return error ? [] : data;
}
