import { $, esc, showToast, mensajeError, todayStr } from "./utils.js";
import { sb, CONFIGURADO } from "./supabase-client.js";
import { catalogs, cargarCatalogos, nombreArea, llenarSelectAreas } from "./catalogs.js";
import { store, refrescar } from "./data.js";
import { esAdmin } from "./auth.js";

const ROLES = [
  ["administrador", "Administrador"],
  ["coordinador_produccion", "Coordinador de Producción"],
  ["mantenimiento", "Mantenimiento"],
];
let subtab = "usuarios";

export function puedeVerAdmin() { return esAdmin(); }

export function renderAdmin() {
  if (!puedeVerAdmin()) { $("adminPanel").innerHTML = ""; return; }
  $("adminPanel").innerHTML = `
    <div class="admin-tabs">
      <button data-s="usuarios" class="${subtab === "usuarios" ? "on" : ""}">Usuarios</button>
      <button data-s="catalogos" class="${subtab === "catalogos" ? "on" : ""}">Áreas y líneas</button>
      <button data-s="excel" class="${subtab === "excel" ? "on" : ""}">Excel</button>
    </div>
    <div id="adminBody"></div>
  `;
  $("adminPanel").querySelectorAll(".admin-tabs button").forEach((b) => (b.onclick = () => { subtab = b.getAttribute("data-s"); renderAdmin(); }));
  if (subtab === "usuarios") renderUsuarios();
  else if (subtab === "catalogos") renderCatalogos();
  else renderExcel();
}

// ---------------- Usuarios ----------------
function renderUsuarios() {
  const body = $("adminBody");
  body.innerHTML = `
    <div class="srow" style="justify-content:flex-start;margin-bottom:12px">
      <button class="btn primary" id="btnNuevoUsuario">+ Nuevo usuario</button>
    </div>
    <table class="tbl"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
    <tbody>${catalogs.usuarios.map((u) => `
      <tr data-id="${u.user_id}">
        <td>${esc(u.nombre_completo)}</td><td>${esc(u.correo)}</td>
        <td><span class="badge-rol">${ROLES.find((r) => r[0] === u.rol)?.[1] || u.rol}</span></td>
        <td>${u.activo ? "Activo" : `<span class="badge-inactivo">Inactivo</span>`}</td>
        <td><button class="btn" data-editar="${u.user_id}">Editar</button></td>
      </tr>`).join("")}</tbody></table>
  `;
  $("btnNuevoUsuario").onclick = () => abrirModalUsuario(null);
  body.querySelectorAll("[data-editar]").forEach((b) => (b.onclick = () => abrirModalUsuario(b.getAttribute("data-editar"))));
}

function abrirModalUsuario(userId) {
  const u = userId ? catalogs.usuarios.find((x) => x.user_id === userId) : null;
  $("umT").textContent = u ? "Editar usuario" : "Nuevo usuario";
  $("umNombre").value = u?.nombre_completo || "";
  $("umCorreo").value = u?.correo || ""; $("umCorreo").disabled = !!u;
  $("umPass").parentElement.style.display = u ? "none" : "block";
  $("umPass").value = "";
  $("umRol").innerHTML = ROLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  $("umRol").value = u?.rol || "mantenimiento";
  $("umActivo").checked = u ? u.activo : true;
  $("umActivo").parentElement.style.display = u ? "block" : "none";
  $("umErr").textContent = "";
  $("ovUsuario").dataset.editId = userId || "";
  document.getElementById("ovUsuario").classList.add("show");
}
$("umCancel")?.addEventListener("click", () => document.getElementById("ovUsuario").classList.remove("show"));

$("umSave")?.addEventListener("click", async () => {
  const editId = $("ovUsuario").dataset.editId;
  const nombre = $("umNombre").value.trim(), correo = $("umCorreo").value.trim(), rol = $("umRol").value;
  if (!nombre) { $("umErr").textContent = "Escribe el nombre completo."; return; }
  $("umSave").disabled = true; $("umErr").textContent = "";
  try {
    if (editId) {
      const { error } = await sb.rpc("actualizar_usuario", {
        p_user_id: editId, p_nombre_completo: nombre, p_rol: rol, p_activo: $("umActivo").checked,
      });
      if (error) throw error;
      showToast("Usuario actualizado.", "ok");
    } else {
      if (!correo) { $("umErr").textContent = "Escribe el correo."; $("umSave").disabled = false; return; }
      const pass = $("umPass").value;
      if (pass.length < 8) { $("umErr").textContent = "La contraseña temporal debe tener al menos 8 caracteres."; $("umSave").disabled = false; return; }
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`${window.APP_CONFIG.SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ nombre_completo: nombre, correo, password_temporal: pass, rol }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo crear el usuario.");
      showToast("Usuario creado. Comparte la contraseña temporal por un medio seguro.", "ok");
    }
    document.getElementById("ovUsuario").classList.remove("show");
    await cargarCatalogos();
    renderUsuarios();
  } catch (e) {
    $("umErr").textContent = e.message || mensajeError(e);
  }
  $("umSave").disabled = false;
});

// ---------------- Catálogos ----------------
function renderCatalogos() {
  const body = $("adminBody");
  body.innerHTML = `
    <div class="two" style="align-items:end;margin-bottom:16px">
      <div class="fld"><label>Nueva área</label><input id="catArea" placeholder="Ej: Empaque"></div>
      <button class="btn primary" id="catAreaBtn" style="height:42px">+ Agregar área</button>
    </div>
    <table class="tbl" style="margin-bottom:20px"><thead><tr><th>Área</th></tr></thead>
      <tbody>${catalogs.areas.map((a) => `<tr><td>${esc(a.nombre)}</td></tr>`).join("")}</tbody></table>

    <div class="two" style="align-items:end;margin-bottom:12px">
      <div class="fld"><label>Área</label><select id="catLineaArea"></select></div>
      <div class="fld"><label>Nueva línea</label><input id="catLinea" placeholder="Ej: Línea 5"></div>
    </div>
    <button class="btn primary" id="catLineaBtn">+ Agregar línea</button>
    <table class="tbl" style="margin-top:14px"><thead><tr><th>Área</th><th>Línea</th></tr></thead>
      <tbody>${catalogs.lineas.map((l) => `<tr><td>${esc(nombreArea(l.area_id))}</td><td>${esc(l.nombre)}</td></tr>`).join("")}</tbody></table>
  `;
  llenarSelectAreas($("catLineaArea"));
  $("catAreaBtn").onclick = async () => {
    const nombre = $("catArea").value.trim(); if (!nombre) return;
    const { error } = await sb.rpc("crear_area", { p_nombre: nombre });
    if (error) { showToast(mensajeError(error), "err"); return; }
    await cargarCatalogos(); renderCatalogos(); showToast("Área creada.", "ok");
  };
  $("catLineaBtn").onclick = async () => {
    const nombre = $("catLinea").value.trim(), area = $("catLineaArea").value;
    if (!nombre || !area) return;
    const { error } = await sb.rpc("crear_linea", { p_area_id: area, p_nombre: nombre });
    if (error) { showToast(mensajeError(error), "err"); return; }
    await cargarCatalogos(); renderCatalogos(); showToast("Línea creada.", "ok");
  };
}

// ---------------- Excel ----------------
const COLS = {
  linea: "linea", tipo: "tipo de actividad", actividad: "actividad", aviso: "nro aviso", responsable: "responsable",
  fechaSolicitud: "fecha de solicitud", fechaEjecucion: "fecha de ejecucion", estado: "estado",
  prioridad: "prioridad", solicitante: "solicitante", observaciones: "observaciones",
};
function norm(s) { return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " "); }
function toDateStr(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 12 * 3600 * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  if (typeof v === "number") { const p = XLSX.SSF.parse_date_code(v); return p ? `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}` : null; }
  const s = String(v).trim(); let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(s))) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}
function parseWorkbook(wb) {
  const names = wb.SheetNames.slice();
  const pref = names.filter((n) => norm(n) === "solicitudes");
  const orden = pref.concat(names.filter((n) => !pref.includes(n)));
  for (const name of orden) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "", blankrows: false });
    let hi = -1;
    for (let i = 0; i < Math.min(rows.length, 60); i++) if (rows[i].some((c) => norm(c) === "linea")) { hi = i; break; }
    if (hi < 0) continue;
    const idx = {};
    rows[hi].forEach((c, j) => { const n = norm(c); Object.keys(COLS).forEach((k) => { if (COLS[k] === n && idx[k] == null) idx[k] = j; }); });
    const out = [];
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r], g = (k) => (idx[k] == null ? "" : row[idx[k]]);
      const actividad = String(g("actividad") ?? "").trim();
      if (!actividad) continue;
      const estado = ["Pendiente", "En Proceso", "Finalizada", "Cancelada"].includes(g("estado")) ? g("estado") : "Pendiente";
      const prioridad = ["Alta", "Media", "Baja"].includes(g("prioridad")) ? g("prioridad") : "Media";
      out.push({
        linea: String(g("linea")).trim(), tipo: String(g("tipo")).trim(), actividad, aviso: String(g("aviso") ?? "").trim(),
        descripcion: "", responsable: String(g("responsable")).trim(), prioridad, solicitante: String(g("solicitante")).trim(),
        observaciones: String(g("observaciones")).trim(), estado,
        fecha_solicitud: toDateStr(g("fechaSolicitud")), fecha_ejecucion: toDateStr(g("fechaEjecucion")),
      });
    }
    return out;
  }
  return null;
}
function renderExcel() {
  const body = $("adminBody");
  body.innerHTML = `
    <p style="color:var(--ink2);font-size:13.5px;max-width:520px">Solo el Administrador puede importar o exportar. Importar no asigna responsable
      (esa columna llega como referencia y se debe asignar desde cada tarea); tampoco crea el área/línea si ya existen.</p>
    <div class="srow" style="justify-content:flex-start">
      <button class="btn" id="btnImportar">⬆ Importar Excel</button>
      <button class="btn" id="btnExportar">⬇ Exportar Excel</button>
    </div>
    <input type="file" id="excelFile" accept=".xlsx,.xls" hidden>
    <div id="excelMsg" style="margin-top:10px;font-size:13.5px;color:var(--ink2)"></div>
  `;
  $("btnImportar").onclick = () => $("excelFile").click();
  $("excelFile").onchange = async () => {
    const file = $("excelFile").files[0]; if (!file) return;
    $("excelMsg").textContent = "Leyendo archivo…";
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const recs = parseWorkbook(wb);
      if (recs == null) { $("excelMsg").textContent = "No se encontró una fila de encabezados con «Línea» en el archivo."; return; }
      if (!recs.length) { $("excelMsg").textContent = "El archivo no tiene tareas con Actividad para importar."; return; }
      $("excelMsg").textContent = `Importando ${recs.length} tareas…`;
      let total = 0;
      for (let i = 0; i < recs.length; i += 200) {
        const { data, error } = await sb.rpc("importar_tareas", { p_tareas: recs.slice(i, i + 200) });
        if (error) { $("excelMsg").textContent = `Se detuvo tras ${total} tareas: ${mensajeError(error)}`; return; }
        total += data;
      }
      await cargarCatalogos(); await refrescar();
      $("excelMsg").textContent = `Se importaron ${total} tareas desde el Excel.`;
    } catch (e) { $("excelMsg").textContent = "No se pudo leer el archivo Excel."; }
  };
  $("btnExportar").onclick = () => {
    const head = ["Consecutivo", "Área", "Línea", "Tipo de Actividad", "Actividad", "Nro AVISO", "Responsable",
      "Fecha de Solicitud", "Fecha de Ejecución", "Estado", "Prioridad", "Solicitante", "Observaciones"];
    const rows = store.items.slice().sort((a, b) => (b.fecha_solicitud || "").localeCompare(a.fecha_solicitud || "")).map((t) => {
      const nombreLinea = catalogs.lineas.find((l) => l.id === t.linea_id)?.nombre || t.linea_legacy || "";
      const nombreResp = catalogs.usuarios.find((u) => u.user_id === t.responsable_id)?.nombre_completo || t.responsable_legacy || "";
      const obs = [t.descripcion, t.observaciones].filter((x) => x && x.trim()).join(" | ");
      return [t.consecutivo, nombreArea(t.area_id), nombreLinea, t.tipo || "", t.actividad || "", t.aviso || "", nombreResp,
        t.fecha_solicitud || "", t.fecha_ejecucion || "", t.estado, t.prioridad || "", t.solicitante || "", obs];
    });
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
    ws["!cols"] = [12, 14, 18, 18, 46, 13, 20, 14, 14, 20, 10, 20, 40].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Solicitudes");
    const arr = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `Gestion_Solicitudes_Mantenimiento_${todayStr()}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast(`Excel exportado (${rows.length} tareas).`, "ok");
  };
}
