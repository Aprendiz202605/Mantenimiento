import { sb } from "./supabase-client.js";
import { esc } from "./utils.js";

export const catalogs = { areas: [], lineas: [], mantenimiento: [], usuarios: [] };

export async function cargarCatalogos() {
  const [areasR, lineasR, usuariosR] = await Promise.all([
    sb.from("areas").select("*").order("nombre"),
    sb.from("lineas").select("*").order("nombre"),
    sb.from("profiles").select("*").order("nombre_completo"),
  ]);
  catalogs.areas = areasR.data || [];
  catalogs.lineas = lineasR.data || [];
  catalogs.usuarios = usuariosR.data || [];
  catalogs.mantenimiento = catalogs.usuarios.filter((u) => u.rol === "mantenimiento" && u.activo);
}

export function lineasDeArea(areaId) {
  return catalogs.lineas.filter((l) => l.area_id === areaId);
}
export function nombreArea(id) { return catalogs.areas.find((a) => a.id === id)?.nombre || "—"; }
export function nombreLinea(id) { return catalogs.lineas.find((l) => l.id === id)?.nombre || "—"; }
export function nombreUsuario(id) { return catalogs.usuarios.find((u) => u.user_id === id)?.nombre_completo || "—"; }

export function llenarSelectAreas(sel, valor) {
  sel.innerHTML = catalogs.areas.map((a) => `<option value="${a.id}">${esc(a.nombre)}</option>`).join("");
  if (valor) sel.value = valor;
}
export function llenarSelectLineas(sel, areaId, valor) {
  const opts = lineasDeArea(areaId);
  sel.innerHTML = opts.map((l) => `<option value="${l.id}">${esc(l.nombre)}</option>`).join("");
  if (valor && opts.some((l) => l.id === valor)) sel.value = valor;
}
export function llenarSelectResponsables(sel, valor) {
  sel.innerHTML = `<option value="">Sin asignar</option>` +
    catalogs.mantenimiento.map((u) => `<option value="${u.user_id}">${esc(u.nombre_completo)}</option>`).join("");
  if (valor) sel.value = valor;
}
