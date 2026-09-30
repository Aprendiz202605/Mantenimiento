import { $, openOv, closeOv, showToast, mensajeError } from "./utils.js";
import { catalogs, llenarSelectAreas, llenarSelectLineas, llenarSelectResponsables } from "./catalogs.js";
import { crearSolicitud } from "./actions.js";
import { aplicarFila } from "./data.js";

export function abrirNuevaSolicitud() {
  llenarSelectAreas($("nArea"), catalogs.areas[0]?.id);
  llenarSelectLineas($("nLinea"), $("nArea").value);
  llenarSelectResponsables($("nResp"), "");
  ["nTipo", "nAct", "nAviso", "nDesc", "nSol"].forEach((id) => ($(id).value = ""));
  $("nPrio").value = "Media"; $("nErr").textContent = "";
  openOv("ovNew");
  setTimeout(() => $("nTipo").focus(), 60);
}

$("nArea")?.addEventListener("change", () => llenarSelectLineas($("nLinea"), $("nArea").value));
$("nCancel")?.addEventListener("click", () => closeOv("ovNew"));

let guardando = false;
$("nSave")?.addEventListener("click", async () => {
  if (guardando) return;
  const area_id = $("nArea").value, linea_id = $("nLinea").value;
  const tipo = $("nTipo").value.trim(), actividad = $("nAct").value.trim();
  if (!area_id || !linea_id || !tipo || !actividad) {
    $("nErr").textContent = "Completa Área, Línea, Tipo de actividad y Actividad.";
    return;
  }
  guardando = true; $("nSave").disabled = true; $("nErr").textContent = "";
  const r = await crearSolicitud({
    p_area_id: area_id, p_linea_id: linea_id, p_tipo: tipo, p_actividad: actividad,
    p_descripcion: $("nDesc").value.trim(), p_aviso: $("nAviso").value.trim(),
    p_prioridad: $("nPrio").value, p_solicitante: $("nSol").value.trim(),
    p_responsable_id: $("nResp").value || null,
  });
  guardando = false; $("nSave").disabled = false;
  if (!r.ok) { $("nErr").textContent = mensajeError(r.error); return; }
  aplicarFila(r.data);
  closeOv("ovNew");
  showToast("Solicitud registrada.", "ok");
});
