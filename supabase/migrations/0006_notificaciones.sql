-- ============================================================
-- 0006 · Cola de notificaciones por correo (Fase 5)
-- Patrón: las funciones RPC insertan una fila aquí; un trigger
-- llama automáticamente a la Edge Function "enviar-notificacion"
-- vía pg_net (HTTP asíncrono desde Postgres). La función actualiza
-- estado_envio al terminar.
-- ============================================================

create extension if not exists pg_net;

create table if not exists public.notificaciones_email (
  id             uuid primary key default gen_random_uuid(),
  solicitud_id   uuid not null references public.solicitudes(id) on delete cascade,
  evento         text not null check (evento in ('asignacion','reasignacion','aprobacion','rechazo')),
  destinatario   text not null,
  estado_envio   text not null default 'pendiente' check (estado_envio in ('pendiente','enviado','fallido')),
  intentos       integer not null default 0,
  error_detalle  text,
  creado_en      timestamptz not null default now(),
  enviado_en     timestamptz
);
create index if not exists notif_estado_idx on public.notificaciones_email (estado_envio, creado_en);

alter table public.notificaciones_email enable row level security;
drop policy if exists "leer notificaciones" on public.notificaciones_email;
create policy "leer notificaciones" on public.notificaciones_email
  for select to authenticated using (public.es_administrador());
-- Sin insert/update por REST: solo las funciones RPC insertan, y solo
-- la Edge Function (con service_role) actualiza estado_envio.

-- ---------------------------------------------------------------
-- Disparo automático hacia la Edge Function.
-- Requiere DOS secretos guardados en Supabase Vault (una sola vez,
-- desde el SQL Editor, y SOLO ahí — nunca en un archivo del repo):
--
--   select vault.create_secret('https://TU-PROYECTO.supabase.co/functions/v1/enviar-notificacion', 'edge_notif_url');
--   select vault.create_secret('TU_SERVICE_ROLE_KEY', 'edge_notif_key');
--
-- El service_role key es la llave maestra del proyecto: jamás va en
-- config.js, en GitHub, ni en ningún archivo versionado.
-- ---------------------------------------------------------------
create or replace function public._disparar_notificacion() returns trigger
language plpgsql security definer set search_path = public, extensions, vault as $$
declare v_url text; v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_notif_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'edge_notif_key';
  if v_url is null or v_key is null then
    return new; -- Vault aún no configurado: la fila queda "pendiente" para un reintento manual/CRON.
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
    body := jsonb_build_object('notificacion_id', new.id)
  );
  return new;
end $$;

drop trigger if exists notificaciones_disparo on public.notificaciones_email;
create trigger notificaciones_disparo after insert on public.notificaciones_email
  for each row execute function public._disparar_notificacion();

-- ---------------------------------------------------------------
-- Reintentos: una función que puedes llamar por cron (pg_cron, no
-- incluido por defecto en el plan gratuito) o manualmente, para
-- reintentar lo que quedó "pendiente" o "fallido" con pocos intentos.
-- ---------------------------------------------------------------
create or replace function public.reintentar_notificaciones_pendientes() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record; v_url text; v_key text;
begin
  if not public.es_administrador() then
    raise exception 'NO_AUTORIZADO';
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_notif_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'edge_notif_key';
  if v_url is null or v_key is null then return 0; end if;
  for r in
    select id from public.notificaciones_email
     where estado_envio in ('pendiente','fallido') and intentos < 5
     order by creado_en asc
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
      body := jsonb_build_object('notificacion_id', r.id)
    );
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.reintentar_notificaciones_pendientes() from public;
grant execute on function public.reintentar_notificaciones_pendientes() to authenticated;
