import { $, esc, fmtDate, fmtDateTime, openOv, closeOv, showToast, mensajeError, avisoValido } from "./utils.js";
import { store, aplicarFila, quitarLocal, cargarConteoComentarios, notificarCambio } from "./data.js";
import { catalogs, nombreArea, nombreLinea, nombreUsuario, llenarSelectResponsables } from "./catalogs.js";
import { authState, esAdmin, esCoordinador, esMantenimiento } from "./auth.js";
import * as A from "./actions.js";

let solicitudId = null;

function tarea() { return store.items.find((t) => t.id === solicitudId); }

const ACCION_LABEL = {
  creacion: "Creada", asignacion: "Responsable asignado", reasignacion: "Responsable reasignado",
  inicio: "Iniciada", terminacion: "Marcada como terminada", aprobacion: "Aprobada",
  rechazo: "Rechazada", cancelacion: "Cancelada", reapertura: "Reabierta", edicion_aviso: "Aviso editado",
};

export async function abrirDetalle(id) {
  solicitudId = id;
  await Promise.all([renderCuerpo(), cargarComentariosPanel(), cargarHistorialPanel()]);
  openOv("ovDet");
}
function cerrarDetalle() { closeOv("ovDet"); solicitudId = null; }

function puedeAsignar() { return esAdmin() || esCoordinador(); }
function puedeValidar() { return esAdmin() || esCoordinador(); }
function esMiTarea(t) { return esMantenimiento() && t.responsable_id === authState.profile.user_id; }
function puedeEditarAviso(t) { return esAdmin() || esCoordinador() || esMiTarea(t); }

async function renderCuerpo() {
  const t = tarea();
  if (!t) { cerrarDetalle(); return; }
  const slug = String(t.estado).replace(/\s+/g, "-");

  $("detBody").innerHTML = `
    <div class="det-head">
      <div>
        <div class="det-consec">${esc(t.consecutivo)}</div>
        <h2 style="margin:2px 0 0">${esc(t.actividad)}</h2>
      </div>
      <span class="pill st-${esc(slug)}">${esc(t.estado)}</span>
    </div>
    <div class="tags" style="margin-bottom:8px">
      <span class="chip">${esc(nombreArea(t.area_id))}</span>
      <span class="chip">${esc(nombreLinea(t.linea_id))}</span>
      <span class="chip">${esc(t.tipo || "—")}</span>
      <span class="chip">${t.origen === "invitado" ? "Origen: invitado" : "Origen: usuario"}</span>
    </div>
    ${t.descripcion ? `<p class="desc">${esc(t.descripcion)}</p>` : ""}
    <div class="badge-aviso ${t.aviso ? "" : "empty"}" style="display:inline-block;margin-bottom:10px">
      <span class="bl">AVISO</span><span class="bn">${t.aviso ? "#" + esc(t.aviso) : "SIN AVISO"}</span>
    </div>
    <div class="meta">
      <div><b>Responsable</b>${esc(nombreUsuario(t.responsable_id))}</div>
      <div><b>Solicitante</b>${esc(t.solicitante || "—")}</div>
      <div><b>Prioridad</b><span class="pill pr-${esc(t.prioridad)}">${esc(t.prioridad || "—")}</span></div>
      <div><b>Fecha solicitud</b>${esc(fmtDate(t.fecha_solicitud))}</div>
      <div><b>Fecha inicio</b>${esc(fmtDate(t.fecha_inicio))}</div>
      <div><b>Fecha ejecución</b>${esc(fmtDate(t.fecha_ejecucion))}</div>
    </div>
    ${t.motivo_rechazo ? `<div class="obs" style="margin-top:10px"><b>Motivo del último rechazo:</b> ${esc(t.motivo_rechazo)}</div>` : ""}
    ${t.observaciones ? `<div class="obs" style="margin-top:8px">${esc(t.observaciones)}</div>` : ""}

    <div class="det-section" id="detAcciones"><h4>Acciones</h4><div class="det-acts" id="detActsRow"></div></div>
  `;
  renderAcciones(t);
}

function botonesResponsable(t) {
  if (!puedeAsignar()) return "";
  return `
    <div class="fld" style="width:100%">
      <label>${t.responsable_id ? "Reasignar responsable" : "Asignar responsable"}</label>
      <div style="display:flex;gap:8px">
        <select id="detResp" style="flex:1"></select>
        <button class="btn primary" id="detAsignarBtn">Guardar</button>
      </div>
    </div>`;
}

function renderAcciones(t) {
  const row = $("detActsRow");
  let html = botonesResponsable(t);

  if (t.estado === "Pendiente") {
    if (t.responsable_id && (esAdmin() || esMiTarea(t))) html += `<button class="btn primary" data-a="iniciar">Iniciar tarea</button>`;
    if (puedeAsignar()) html += `<button class="btn" data-a="cancelar">Cancelar</button>`;
  } else if (t.estado === "En Proceso") {
    if (esAdmin() || esMiTarea(t)) html += `<button class="btn primary" data-a="terminar">Marcar terminada</button>`;
    if (puedeAsignar()) html += `<button class="btn" data-a="cancelar">Cancelar</button>`;
  } else if (t.estado === "Pendiente de Validación") {
    if (puedeValidar()) {
      html += `<button class="btn primary" data-a="aprobar">✅ Aprobar</button>`;
      html += `<button class="btn red" data-a="rechazar">❌ Rechazar</button>`;
    }
  } else if (t.estado === "Finalizada" || t.estado === "Cancelada") {
    if (puedeAsignar()) html += `<button class="btn" data-a="reabrir">Reabrir</button>`;
  }

  if (puedeEditarAviso(t)) html += `<button class="btn" data-a="aviso">${t.aviso ? "Editar aviso" : "Agregar aviso"}</button>`;
  if (esAdmin()) html += `<button class="btn red" data-a="eliminar">🗑 Eliminar</button>`;

  row.innerHTML = html;
  if (puedeAsignar()) llenarSelectResponsables($("detResp"), t.responsable_id);

  row.querySelectorAll("button[data-a]").forEach((b) => (b.onclick = () => ejecutar(b.getAttribute("data-a"))));
  const asignarBtn = $("detAsignarBtn");
  if (asignarBtn) asignarBtn.onclick = async () => {
    const val = $("detResp").value;
    if (!val) { showToast("Elige un responsable de la lista.", "err"); return; }
    const r = await A.asignarResponsable(t.id, val);
    if (!r.ok) { showToast(mensajeError(r.error), "err"); return; }
    aplicarFila(r.data); showToast("Responsable guardado.", "ok"); renderCuerpo();
  };
}

async function ejecutar(accion) {
  const t = tarea();
  if (!t) return;
  if (accion === "iniciar") return llamar(A.iniciarTarea(t.id), "Tarea iniciada.");
  if (accion === "terminar") return llamar(A.terminarTarea(t.id), "Tarea marcada como terminada. Queda pendiente de validación.");
  if (accion === "aprobar") return llamar(A.aprobarTarea(t.id), "Tarea aprobada y finalizada.");
  if (accion === "cancelar") return llamar(A.cancelarTarea(t.id), "Tarea cancelada.");
  if (accion === "reabrir") return llamar(A.reabrirTarea(t.id), "Tarea reabierta.");
  if (accion === "rechazar") return pedirMotivoYRechazar(t.id);
  if (accion === "aviso") return abrirModalAviso(t);
  if (accion === "eliminar") return confirmarEliminar(t.id);
}

async function llamar(promesa, mensajeOk) {
  const r = await promesa;
  if (!r.ok) { showToast(mensajeError(r.error), "err"); return; }
  aplicarFila(r.data);
  showToast(mensajeOk, "ok");
  renderCuerpo();
  await cargarHistorialPanel();
}

// --- Rechazo (pide motivo obligatorio) ---
function pedirMotivoYRechazar(id) {
  const motivo = prompt("Motivo del rechazo (obligatorio):");
  if (motivo === null) return;
  if (!motivo.trim()) { showToast("El motivo no puede quedar vacío.", "err"); return; }
  llamar(A.rechazarTarea(id, motivo.trim()), "Tarea rechazada; vuelve a En Proceso.");
}

// --- Eliminar (confirmación simple; ya requiere sesión de Administrador) ---
function confirmarEliminar(id) {
  if (!confirm("¿Eliminar esta solicitud? No se puede deshacer.")) return;
  (async () => {
    const r = await A.eliminarSolicitud(id);
    if (!r.ok) { showToast(mensajeError(r.error), "err"); return; }
    quitarLocal(id);
    showToast("Solicitud eliminada.", "ok");
    cerrarDetalle();
  })();
}

// --- Aviso ---
function abrirModalAviso(t) {
  $("avT").textContent = t.aviso ? "Editar número de aviso" : "Agregar número de aviso";
  $("avIn").value = t.aviso || ""; $("avErr").textContent = "";
  openOv("ovAviso");
  setTimeout(() => $("avIn").focus(), 60);
}
$("avCancel")?.addEventListener("click", () => closeOv("ovAviso"));
$("avSave")?.addEventListener("click", async () => {
  const t = tarea(); if (!t) return;
  const v = $("avIn").value.trim();
  if (!v && t.aviso) { $("avErr").textContent = "No puedes dejar vacío un aviso ya existente."; return; }
  if (v && !avisoValido(v)) { $("avErr").textContent = "Usa solo letras, números, espacios y guiones (máx. 30 caracteres)."; return; }
  const r = await A.editarAviso(t.id, v);
  if (!r.ok) { $("avErr").textContent = mensajeError(r.error); return; }
  aplicarFila(r.data);
  closeOv("ovAviso");
  showToast(v ? "Aviso guardado." : "Aviso eliminado.", "ok");
  renderCuerpo();
});

// --- Comentarios ---
async function cargarComentariosPanel() {
  const id = solicitudId; if (!id) return;
  const lista = await A.comentariosDe(id);
  const box = $("comList");
  box.innerHTML = lista.length ? lista.map((c) => `
    <div class="com-item ${c.tipo === "sistema" ? "sistema" : ""}">
      <div class="ch"><b>${c.tipo === "sistema" ? "Sistema" : esc(nombreUsuario(c.usuario_id))}</b><span>${esc(fmtDateTime(c.creado_en))}</span></div>
      ${esc(c.texto)}
    </div>`).join("") : `<div style="color:var(--ink3);font-size:13px">Sin comentarios todavía.</div>`;
  $("comCount").textContent = lista.length;
  box.scrollTop = box.scrollHeight;
}
$("comAddBtn")?.addEventListener("click", async () => {
  const id = solicitudId; if (!id) return;
  const txt = $("comIn").value;
  const r = await A.agregarComentario(id, txt);
  if (!r.ok) { showToast(mensajeError(r.error), "err"); return; }
  $("comIn").value = "";
  await cargarComentariosPanel();
  await cargarConteoComentarios();
  notificarCambio(); // repinta la tarjeta detrás del modal con el nuevo contador
});

// --- Historial ---
async function cargarHistorialPanel() {
  const id = solicitudId; if (!id) return;
  const lista = await A.historialDe(id);
  $("histList").innerHTML = lista.length ? lista.map((h) => `
    <div class="hist-item"><span class="dot"></span>
      <div><b>${ACCION_LABEL[h.accion] || h.accion}</b>
      ${h.usuario_id ? esc(nombreUsuario(h.usuario_id)) : "Invitado / sistema"} · <span>${esc(fmtDateTime(h.creado_en))}</span>
      ${h.comentario ? `<div style="color:var(--ink2)">${esc(h.comentario)}</div>` : ""}</div>
    </div>`).join("") : `<div style="color:var(--ink3);font-size:13px">Sin eventos.</div>`;
}

$("detClose")?.addEventListener("click", cerrarDetalle);
$("ovDet")?.addEventListener("click", (e) => { if (e.target.id === "ovDet") cerrarDetalle(); });

// Si Realtime trae un cambio de la tarea abierta (otra persona la editó),
// refresca el detalle sin que el usuario tenga que cerrar y volver a abrir.
export function alRefrescarSiAbierto() {
  if (solicitudId && document.getElementById("ovDet")?.classList.contains("show")) renderCuerpo();
}
