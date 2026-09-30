const CFG = window.APP_CONFIG || {};
const $ = (id) => document.getElementById(id);
const FN_URL = `${CFG.SUPABASE_URL}/functions/v1/reportar-solicitud`;

let catalogo = { areas: [], lineas: [] };
let widgetId = null;

function llenarLineas() {
  const areaId = $("rArea").value;
  const opts = catalogo.lineas.filter((l) => l.area_id === areaId);
  $("rLinea").innerHTML = opts.map((l) => `<option value="${l.id}">${l.nombre}</option>`).join("");
}

async function cargarCatalogo() {
  try {
    const res = await fetch(FN_URL, { method: "GET" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error");
    catalogo = json;
    $("rArea").innerHTML = catalogo.areas.map((a) => `<option value="${a.id}">${a.nombre}</option>`).join("");
    llenarLineas();
  } catch (e) {
    $("rErr").textContent = "No se pudo cargar el formulario. Recarga la página.";
    $("rSend").disabled = true;
  }
}

function initTurnstile() {
  if (!window.turnstile || !CFG.TURNSTILE_SITE_KEY || /TU_TURNSTILE/.test(CFG.TURNSTILE_SITE_KEY)) {
    setTimeout(initTurnstile, 300); // el script de Cloudflare puede tardar un poco en cargar
    return;
  }
  widgetId = window.turnstile.render("#cf-turnstile", { sitekey: CFG.TURNSTILE_SITE_KEY });
}

$("rArea").addEventListener("change", llenarLineas);

let enviando = false;
$("rSend").addEventListener("click", async () => {
  if (enviando) return;
  const area_id = $("rArea").value, linea_id = $("rLinea").value, tipo = $("rTipo").value;
  const descripcion = $("rDesc").value.trim();
  if (!area_id || !linea_id || !tipo || !descripcion) {
    $("rErr").textContent = "Completa Área, Línea, Tipo y Descripción.";
    return;
  }
  const token = window.turnstile && widgetId != null ? window.turnstile.getResponse(widgetId) : null;
  if (!token) { $("rErr").textContent = "Completa la verificación de seguridad."; return; }

  enviando = true; $("rSend").disabled = true; $("rErr").textContent = "";
  try {
    const res = await fetch(FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        area_id, linea_id, tipo, descripcion, prioridad: $("rPrio").value,
        solicitante: $("rSol").value.trim(), turnstile_token: token,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "No se pudo enviar.");
    $("okConsec").textContent = json.consecutivo;
    $("formWrap").style.display = "none";
    $("okWrap").style.display = "block";
  } catch (e) {
    $("rErr").textContent = e.message || "No se pudo enviar. Intenta de nuevo.";
    if (window.turnstile && widgetId != null) window.turnstile.reset(widgetId);
  }
  enviando = false; $("rSend").disabled = false;
});

$("rOtra").addEventListener("click", () => {
  $("rDesc").value = ""; $("rSol").value = ""; $("rPrio").value = "Media";
  $("formWrap").style.display = "block"; $("okWrap").style.display = "none";
  if (window.turnstile && widgetId != null) window.turnstile.reset(widgetId);
});

cargarCatalogo();
initTurnstile();
