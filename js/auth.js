import { sb, CONFIGURADO } from "./supabase-client.js";
import { $ } from "./utils.js";

export const authState = { session: null, profile: null };

export function esAdmin() { return authState.profile?.rol === "administrador"; }
export function esCoordinador() { return authState.profile?.rol === "coordinador_produccion"; }
export function esMantenimiento() { return authState.profile?.rol === "mantenimiento"; }
export function esValidador() { return esAdmin() || esCoordinador(); }

async function cargarPerfil(userId) {
  const { data, error } = await sb.from("profiles").select("*").eq("user_id", userId).single();
  if (error) return null;
  return data;
}

// Devuelve true si hay una sesión con perfil activo válido; false si hay
// que mostrar la pantalla de login (o un mensaje de cuenta inactiva).
export async function iniciarAuth() {
  if (!CONFIGURADO) return false;
  const { data } = await sb.auth.getSession();
  authState.session = data.session;
  if (authState.session) {
    authState.profile = await cargarPerfil(authState.session.user.id);
  }
  sb.auth.onAuthStateChange(async (_event, session) => {
    authState.session = session;
    authState.profile = session ? await cargarPerfil(session.user.id) : null;
    window.dispatchEvent(new CustomEvent("auth-changed"));
  });
  return !!(authState.session && authState.profile?.activo);
}

export function sesionValida() {
  return !!(authState.session && authState.profile?.activo);
}

export async function iniciarSesion(correo, password) {
  const { error } = await sb.auth.signInWithPassword({ email: correo.trim(), password });
  if (error) return "Correo o contraseña incorrectos.";
  const perfil = await cargarPerfil(authState.session?.user?.id || (await sb.auth.getUser()).data.user.id);
  authState.profile = perfil;
  if (!perfil) { await sb.auth.signOut(); return "Tu cuenta no tiene un perfil asignado. Contacta al Administrador."; }
  if (!perfil.activo) { await sb.auth.signOut(); return "Tu cuenta está inactiva. Contacta al Administrador."; }
  return null; // éxito
}

export async function cerrarSesion() {
  await sb.auth.signOut();
  authState.session = null; authState.profile = null;
}

export function pintarQuienSoy() {
  const el = $("who");
  if (!el || !authState.profile) return;
  const roles = { administrador: "Administrador", coordinador_produccion: "Coordinador de Producción", mantenimiento: "Mantenimiento" };
  el.innerHTML = `<b>${authState.profile.nombre_completo}</b>${roles[authState.profile.rol] || ""}`;
}
