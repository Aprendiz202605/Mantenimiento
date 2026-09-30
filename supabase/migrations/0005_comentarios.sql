-- ============================================================
-- 0005 · Comentarios y Observaciones (Fase 7.5)
-- Borrado lógico (eliminado_en): así "solo Administrador elimina"
-- también queda auditado, en vez de desaparecer sin rastro.
-- ============================================================

create table if not exists public.comentarios (
  id            uuid primary key default gen_random_uuid(),
  solicitud_id  uuid not null references public.solicitudes(id) on delete cascade,
  usuario_id    uuid references public.profiles(user_id),
  tipo          text not null default 'usuario' check (tipo in ('usuario','sistema')),
  texto         text not null check (char_length(btrim(texto)) between 1 and 2000),
  creado_en     timestamptz not null default now(),
  eliminado_en  timestamptz,
  eliminado_por uuid references public.profiles(user_id)
);
create index if not exists comentarios_solicitud_idx on public.comentarios (solicitud_id, creado_en);

alter table public.comentarios enable row level security;
alter publication supabase_realtime add table public.comentarios;

drop policy if exists "leer comentarios" on public.comentarios;
create policy "leer comentarios" on public.comentarios
  for select to authenticated using (public.es_interno());
-- Sin políticas de insert/update/delete: todo pasa por las funciones
-- agregar_comentario / eliminar_comentario (0007).
