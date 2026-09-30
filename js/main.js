import { $, showToast } from "./utils.js";
import { CONFIGURADO, sb } from "./supabase-client.js";
import { authState, iniciarAuth, iniciarSesion, cerrarSesion, sesionValida, pintarQuienSoy } from "./auth.js";
import { cargarCatalogos } from "./catalogs.js";
import { store, refrescar, suscribirRealtime, cargarConteoComentarios, alCambiar } from "./data.js";
import { renderStats, renderChart, renderFiltros, renderList, setTab, tabActual } from "./render.js";
import { abrirDetalle, alRefrescarSiAbierto } from "./detail.js";
import { abrirNuevaSolicitud } from "./nueva-solicitud.js";
import { renderAdmin, puedeVerAdmin } from "./admin.js";
import "./actions.js"; // sin uso directo aquí; se importa para que los módulos que dependen de él ya estén listos

let vista = "tablero"; // tablero | admin
let bannerMsg = "";

function pintarBanner(kind) {
  const el = $("banner");
  let html = "";
  if (!CONFIGURADO) html = `<div class="bn err">Falta configurar la conexión: completa <b>js/config.js</b> con la URL y la clave pública de tu proyecto Supabase.</div>`;
  else if (!store.loaded) html = `<div class="bn">Cargando solicitudes…</div>`;
  if (bannerMsg) html += `<div class="bn ${kind || ""}">${bannerMsg}</div>`;
  el.innerHTML = html;
}
function flash(msg, kind, ms) {
  bannerMsg = msg; pintarBanner(kind); 
  if (ms) setTimeout(() => { bannerMsg = ""; pintarBanner(); }, ms);
}

function renderTodo() {
  pintarBanner();
  if (vista === "admin") { renderAdmin(); return; }
  renderStats(); renderChart(); renderFiltros(); renderList();
  alRefrescarSiAbierto();
}

function irAVista(v) {
  vista = v;
  $("vistaTablero").style.display = v === "tablero" ? "" : "none";
  $("vistaAdmin").style.display = v === "admin" ? "" : "none";
  $("fab").style.display = v === "tablero" ? "" : "none";
  renderTodo();
}

async function cargarInicial() {
  alCambiar(renderTodo);
  await cargarCatalogos();
  await Promise.all([refrescar().catch((e) => { flash("No se pudieron cargar las solicitudes: " + (e.message || "error de red"), "err"); }), cargarConteoComentarios()]);
  store.loaded = true;
  renderTodo();
  suscribirRealtime((status) => {
    if (status === "SUBSCRIBED") { if (store.liveDown) { store.liveDown = false; refrescar(); } bannerMsg = ""; pintarBanner(); }
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      store.liveDown = true;
      flash("Sin conexión en vivo: los cambios de otras personas pueden no verse hasta recargar.", "warn");
    }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refrescar().catch(() => {}); });
}

function mostrarApp() {
  $("loginScreen").style.display = "none";
  $("appShell").style.display = "";
  pintarQuienSoy();
  $("bAdmin").style.display = puedeVerAdmin() ? "" : "none";
  cargarInicial();
}
function mostrarLogin(mensaje) {
  $("appShell").style.display = "none";
  $("loginScreen").style.display = "flex";
  if (mensaje) $("loginErr").textContent = mensaje;
}

async function iniciar() {
  if (!CONFIGURADO) { mostrarLogin(); pintarBanner(); return; }
  const ok = await iniciarAuth();
  if (ok) mostrarApp(); else mostrarLogin();
}

$("loginBtn")?.addEventListener("click", async () => {
  $("loginBtn").disabled = true; $("loginErr").textContent = "";
  const err = await iniciarSesion($("loginCorreo").value, $("loginPass").value);
  $("loginBtn").disabled = false;
  if (err) { $("loginErr").textContent = err; return; }
  mostrarApp();
});
$("loginPass")?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("loginBtn").click(); });

$("bLogout")?.addEventListener("click", async () => { await cerrarSesion(); vista = "tablero"; mostrarLogin(); });
$("bAdmin")?.addEventListener("click", () => irAVista(vista === "admin" ? "tablero" : "admin"));
$("bNew")?.addEventListener("click", abrirNuevaSolicitud);
$("fab")?.addEventListener("click", abrirNuevaSolicitud);

document.querySelectorAll(".tab").forEach((b) => {
  b.onclick = () => {
    setTab(b.getAttribute("data-tab"));
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === b));
    renderTodo();
  };
});
$("fq")?.addEventListener("input", renderList);
["fe", "fl", "fr", "ft"].forEach((id) => $(id)?.addEventListener("change", renderList));
$("list")?.addEventListener("click", (e) => {
  const card = e.target.closest(".card[data-id]");
  if (card) abrirDetalle(card.getAttribute("data-id"));
});

iniciar();
