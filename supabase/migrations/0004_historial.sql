-- ============================================================
-- 0004 · Historial de auditoría (Fase 7)
-- Solo lo escriben las funciones RPC (0007), nunca el cliente.
-- ============================================================

create table if not exists public.historial_solicitudes (
  id            uuid primary key default gen_random_uuid(),
  solicitud_id  uuid not null references public.solicitudes(id) on delete cascade,
  usuario_id    uuid references public.profiles(user_id),  -- null = invitado o sistema
  accion        text not null check (accion in (
                  'creacion','asignacion','reasignacion','inicio','terminacion',
                  'aprobacion','rechazo','cancelacion','reapertura','edicion_aviso'
                )),
  comentario    text,
  creado_en     timestamptz not null default now()
);
create index if not exists historial_solicitud_idx on public.historial_solicitudes (solicitud_id, creado_en);

alter table public.historial_solicitudes enable row level security;
drop policy if exists "leer historial" on public.historial_solicitudes;
create policy "leer historial" on public.historial_solicitudes
  for select to authenticated using (public.es_interno());
-- Sin políticas de insert: solo lo insertan las funciones SECURITY DEFINER.
