-- ============================================================
-- 0008 · RLS de "solicitudes" para el modelo con roles (Fase 1)
-- Reemplaza las políticas del modelo con PIN:
--   - Ya NO hay lectura ni inserción para el rol "anon".
--   - El Invitado entra exclusivamente por la Edge Function
--     "reportar-solicitud", que usa la service_role y por lo tanto
--     no pasa por estas políticas (las funciones con service_role
--     ignoran RLS). Así se cumple "Invitado sin acceso directo a
--     tablas operativas": ni siquiera tiene una policy a su nombre.
--   - Todas las mutaciones (cambios de estado, edición de aviso,
--     eliminar) siguen yendo solo por las funciones RPC de 0007.
-- ============================================================

drop policy if exists "leer solicitudes" on public.solicitudes;
drop policy if exists "reportar solicitudes" on public.solicitudes;

create policy "leer solicitudes" on public.solicitudes
  for select to authenticated
  using (public.es_interno());

create policy "crear solicitudes" on public.solicitudes
  for insert to authenticated
  with check (public.es_interno() and estado = 'Pendiente' and origen = 'usuario' and creado_por = auth.uid());
-- (sin políticas de update/delete → solo las funciones SECURITY DEFINER pueden)

-- El PIN queda en desuso. No se borra "app_config" por si hace falta
-- volver atrás (ver estrategia de rollback), pero ya nada lo usa.
comment on table public.app_config is 'En desuso desde la v2 (roles). Se conserva solo para rollback a la versión con PIN.';
