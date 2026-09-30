export const $ = (id) => document.getElementById(id);

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
export function norm(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
}
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function fmtDate(s) {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function avisoValido(v) {
  return /^[A-Za-z0-9][A-Za-z0-9 \-]{0,29}$/.test(v);
}
export function uniqBy(arr, keyFn) {
  const seen = new Set(), out = [];
  for (const v of arr) { const k = keyFn(v); if (!seen.has(k)) { seen.add(k); out.push(v); } }
  return out;
}

export function showToast(text, kind) {
  const wrap = $("toastWrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = text;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); }, 3200);
}

export function openOv(id) { $(id).classList.add("show"); }
export function closeOv(id) { $(id).classList.remove("show"); }

// Mensajes legibles para los códigos de error que lanzan las funciones RPC (ver 0007_funciones.sql)
export const ERRORES = {
  NO_AUTORIZADO: "No tienes permiso para hacer esto.",
  NO_ENCONTRADA: "La solicitud ya no existe (puede que otra persona la haya eliminado).",
  ESTADO_INVALIDO: "La tarea cambió de estado mientras tanto; recarga para ver el estado actual.",
  ESTADO_NO_PERMITE_ASIGNAR: "No se puede asignar responsable en el estado actual de la tarea.",
  SIN_RESPONSABLE: "Asigna un responsable antes de iniciar la tarea.",
  RESPONSABLE_INVALIDO: "El responsable debe ser un usuario activo de Mantenimiento.",
  MISMO_USUARIO_NO_PUEDE_VALIDAR: "Quien ejecutó la tarea no puede validarla: pide a otro Coordinador o al Administrador.",
  MOTIVO_OBLIGATORIO: "Escribe el motivo del rechazo.",
  AVISO_INVALIDO: "Usa solo letras, números, espacios y guiones (máx. 30 caracteres).",
  TEXTO_VACIO: "Escribe un comentario antes de guardar.",
  ROL_INVALIDO: "Rol inválido.",
};
export function mensajeError(err) {
  const code = (err && err.message || "").trim();
  return ERRORES[code] || "No se pudo completar la acción. Intenta de nuevo.";
}
