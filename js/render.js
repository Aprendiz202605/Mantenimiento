import { $, esc, fmtDate, norm, uniqBy } from "./utils.js";
import { store, BOARD_PENDIENTES, BOARD_EJECUCION, BOARD_FINALIZADAS } from "./data.js";
import { catalogs, nombreArea, nombreLinea, nombreUsuario } from "./catalogs.js";

export let tabActual = "pendientes"; // pendientes | ejecucion | finalizadas
export function setTab(t) { tabActual = t; }

const TABS = {
  pendientes: { estados: BOARD_PENDIENTES, label: "Tareas pendientes" },
  ejecucion: { estados: BOARD_EJECUCION, label: "Tareas en ejecución" },
  finalizadas: { estados: BOARD_FINALIZADAS, label: "Tareas finalizadas" },
};

const ICONS = {
  total: '<path d="M6 3h8v3H6z"/><rect x="4" y="4" width="12" height="14" rx="1.5"/><path d="M7 10h6M7 13h6M7 16h4"/>',
  clock: '<circle cx="10" cy="10" r="7.5"/><path d="M10 5.5V10l3.2 2"/>',
  proc: '<path d="M4 10a6 6 0 0 1 10.2-4.3M16 10a6 6 0 0 1-10.2 4.3"/><path d="M14.2 3.5v2.6h-2.6M5.8 16.5v-2.6h2.6"/>',
  valida: '<path d="M10 3l2 4 4.4.6-3.2 3 .8 4.4L10 13l-4 2 .8-4.4-3.2-3L8 7z"/>',
  check: '<circle cx="10" cy="10" r="7.5"/><path d="M6.7 10.2l2.1 2.1 4.3-4.6"/>',
  alta: '<path d="M10 2.8 18 16.5H2z"/><path d="M10 8v3.6M10 14v.1"/>',
  media: '<path d="M4 6h12M4 10h12M4 14h8"/>',
  baja: '<path d="M10 3v11.5M5.5 10 10 14.5 14.5 10"/><path d="M4 17h12"/>',
};
function statCard(cls, icon, n, label) {
  return `<div class="stat ${cls}"><div class="si"><svg viewBox="0 0 20 20">${icon}</svg></div>
    <div><div class="n">${n}</div><div class="l">${esc(label)}</div></div></div>`;
}

export function renderStats() {
  const cnt = (s) => store.items.filter((t) => t.estado === s).length;
  const activas = store.items.filter((t) => BOARD_PENDIENTES.includes(t.estado));
  const pa = activas.filter((t) => t.prioridad === "Alta").length;
  const pm = activas.filter((t) => t.prioridad === "Media").length;
  const pb = activas.filter((t) => t.prioridad === "Baja").length;
  $("stats").innerHTML =
    statCard("t", ICONS.total, store.items.length, "Total") +
    statCard("p", ICONS.clock, cnt("Pendiente"), "Pendientes") +
    statCard("e", ICONS.proc, cnt("En Proceso"), "En proceso") +
    statCard("v", ICONS.valida, cnt("Pendiente de Validación"), "Por validar") +
    statCard("f", ICONS.check, cnt("Finalizada"), "Finalizadas") +
    statCard("pa", ICONS.alta, pa, "Prioridad alta") +
    statCard("pm", ICONS.media, pm, "Prioridad media") +
    statCard("pb", ICONS.baja, pb, "Prioridad baja");

  $("cPend").textContent = store.items.filter((t) => BOARD_PENDIENTES.includes(t.estado)).length;
  $("cEjec").textContent = store.items.filter((t) => BOARD_EJECUCION.includes(t.estado)).length;
  $("cFin").textContent = store.items.filter((t) => BOARD_FINALIZADAS.includes(t.estado)).length;
}

function itemsDeTab() {
  return store.items.filter((t) => TABS[tabActual].estados.includes(t.estado));
}

export function renderChart() {
  const base = itemsDeTab();
  const byLine = {};
  base.forEach((t) => { const k = nombreLinea(t.linea_id) || "Sin línea"; byLine[k] = (byLine[k] || 0) + 1; });
  const top = Object.entries(byLine).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).slice(0, 6);
  const max = top.length ? top[0][1] : 1;
  $("chartT").textContent = "Tareas por línea · " + TABS[tabActual].label;
  $("chart").innerHTML = top.length
    ? top.map(([nombre, n]) => `<div class="bar"><span class="nm" title="${esc(nombre)}">${esc(nombre)}</span>
        <span class="tr"><span class="fl" style="display:block;width:${Math.round((n / max) * 100)}%"></span></span>
        <span class="ct">${n}</span></div>`).join("")
    : `<div style="color:var(--ink3);font-size:13px">Sin datos en esta pestaña.</div>`;
}

function fillSelect(sel, label, values) {
  const cur = sel.value;
  sel.innerHTML = `<option value="">${esc(label)}</option>` + values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  sel.value = values.includes(cur) ? cur : "";
}

export function renderFiltros() {
  fillSelect($("fe"), "Estado", TABS[tabActual].estados);
  fillSelect($("fl"), "Línea", uniqBy(catalogs.lineas.map((l) => l.nombre), (v) => norm(v)).sort((a, b) => a.localeCompare(b, "es")));
  fillSelect($("fr"), "Responsable", uniqBy(catalogs.mantenimiento.map((u) => u.nombre_completo), (v) => norm(v)).sort((a, b) => a.localeCompare(b, "es")));
  fillSelect($("ft"), "Tipo", uniqBy(store.items.map((t) => t.tipo).filter(Boolean), (v) => norm(v)).sort((a, b) => a.localeCompare(b, "es")));
}

function sorted(list) {
  return list.slice().sort((a, b) =>
    (b.fecha_solicitud || "").localeCompare(a.fecha_solicitud || "") ||
    new Date(b.creado) - new Date(a.creado));
}

export function renderList() {
  const q = norm($("fq").value), fe = $("fe").value, fl = $("fl").value, fr = $("fr").value, ft = $("ft").value;
  const list = sorted(itemsDeTab()).filter((t) => {
    if (fe && t.estado !== fe) return false;
    if (fl && nombreLinea(t.linea_id) !== fl) return false;
    if (fr && nombreUsuario(t.responsable_id) !== fr) return false;
    if (ft && t.tipo !== ft) return false;
    if (q) {
      const hay = norm([t.consecutivo, nombreLinea(t.linea_id), t.tipo, t.actividad, t.aviso, t.descripcion,
        nombreUsuario(t.responsable_id), t.solicitante, t.observaciones].join(" "));
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
  $("list").innerHTML = list.length
    ? list.map(cardHtml).join("")
    : `<div class="empty">No hay solicitudes para mostrar.</div>`;
}

function cardHtml(t) {
  const badge = t.aviso
    ? `<div class="badge-aviso"><span class="bl">AVISO</span><span class="bn">#${esc(t.aviso)}</span></div>`
    : `<div class="badge-aviso empty"><span class="bl">AVISO</span><span class="bn">SIN AVISO</span></div>`;
  const slug = String(t.estado).replace(/\s+/g, "-");
  const nComentarios = store.comentarioConteo[t.id] || 0;
  return `<article class="card s-${esc(slug)}" data-id="${esc(t.id)}">
    <div class="card-top">
      <div class="tags">
        <span class="chip">${esc(t.consecutivo)}</span>
        <span class="chip">${esc(nombreArea(t.area_id))}</span>
        <span class="chip">${esc(nombreLinea(t.linea_id))}</span>
        <span class="chip">${esc(t.tipo || "—")}</span>
      </div>
      ${badge}
    </div>
    <h3>${esc(t.actividad)}</h3>
    <div class="meta">
      <div><b>Responsable</b>${esc(nombreUsuario(t.responsable_id))}</div>
      <div><b>Solicitante</b>${esc(t.solicitante || "—")}</div>
      <div><b>Prioridad</b><span class="pill pr-${esc(t.prioridad)}">${esc(t.prioridad || "—")}</span></div>
      <div><b>Solicitud</b>${esc(fmtDate(t.fecha_solicitud))}</div>
      <div><b>Estado</b><span class="pill st-${esc(slug)}">${esc(t.estado)}</span></div>
    </div>
    <div class="card-foot">
      <span class="origen-invitado">${t.origen === "invitado" ? "🧑‍🤝‍🧑 Reportada por invitado" : ""}</span>
      <span class="com-count">💬 ${nComentarios} comentario${nComentarios === 1 ? "" : "s"}</span>
    </div>
  </article>`;
}
