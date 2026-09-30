import { sb } from "./supabase-client.js";

export const BOARD_PENDIENTES = ["Pendiente", "En Proceso", "Pendiente de Validación"];
export const BOARD_EJECUCION = ["En Proceso", "Pendiente de Validación"];
export const BOARD_FINALIZADAS = ["Finalizada", "Cancelada"];

export const store = { items: [], loaded: false, liveDown: false, comentarioConteo: {} };
let onChange = () => {};
export function alCambiar(fn) { onChange = fn; }

// Conteo de comentarios por solicitud, para el "💬 N" de cada tarjeta.
// Se recalcula completo (liviano: solo trae el id de solicitud) cada
// vez que cambia algo en comentarios, vía Realtime.
export async function cargarConteoComentarios() {
  const { data, error } = await sb.from("comentarios").select("solicitud_id").is("eliminado_en", null);
  if (error) return;
  const mapa = {};
  for (const row of data) mapa[row.solicitud_id] = (mapa[row.solicitud_id] || 0) + 1;
  store.comentarioConteo = mapa;
}

function upsertLocal(row) {
  const i = store.items.findIndex((x) => x.id === row.id);
  if (i >= 0) store.items[i] = row; else store.items.push(row);
}
function removeLocal(id) { store.items = store.items.filter((x) => x.id !== id); }

export async function cargarTodo() {
  const all = [];
  let from = 0;
  const step = 1000;
  for (;;) {
    const { data, error } = await sb.from("solicitudes").select("*").order("creado", { ascending: false }).range(from, from + step - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  store.items = all;
}

export async function refrescar() {
  try { await cargarTodo(); } catch (e) { /* el llamador decide cómo avisar */ throw e; }
  onChange();
}

let canal = null;
export function suscribirRealtime(onStatus) {
  canal = sb.channel("solicitudes-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "solicitudes" }, (p) => {
      if (p.eventType === "DELETE") removeLocal(p.old.id); else upsertLocal(p.new);
      onChange();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "comentarios" }, async () => {
      await cargarConteoComentarios();
      onChange();
    })
    .subscribe((status) => onStatus(status));
}

export function aplicarFila(row) {
  if (row && row.id) { upsertLocal(row); onChange(); }
}
export function quitarLocal(id) { removeLocal(id); onChange(); }

// Para cuando algo cambió en la base (ej. se agregó un comentario) sin
// pasar por Realtime todavía: fuerza un repintado con los datos que ya
// están en memoria (store.comentarioConteo, etc.).
export function notificarCambio() { onChange(); }
