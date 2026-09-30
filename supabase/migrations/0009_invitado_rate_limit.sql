-- ============================================================
-- 0009 · Límite de tasa para /reportar (Fase 3)
-- Sin políticas de RLS a favor de "anon" ni "authenticated": solo la
-- Edge Function (service_role) lee y escribe aquí. Guarda un hash de
-- la IP, nunca la IP en claro.
-- ============================================================

create table if not exists public.invitado_rate_limit (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  creado_en  timestamptz not null default now()
);
create index if not exists invitado_rate_limit_idx on public.invitado_rate_limit (ip_hash, creado_en);
alter table public.invitado_rate_limit enable row level security;
-- Sin políticas → ni anon ni authenticated pueden leer/escribir; solo service_role (Edge Function).

-- Limpieza de registros viejos (se puede llamar por cron o al vuelo)
create or replace function public._limpiar_rate_limit() returns void
language sql security definer set search_path = public as $$
  delete from public.invitado_rate_limit where creado_en < now() - interval '1 day';
$$;
