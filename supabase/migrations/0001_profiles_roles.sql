-- ============================================================
-- 0001 · Perfiles y roles (Fase 1)
-- Requiere: proyecto Supabase con Auth habilitado.
-- Ejecutar UNA vez, en orden, en el proyecto de PRUEBA primero.
-- ============================================================

-- Extensión necesaria para uuid/gen_random_uuid (normalmente ya viene activa)
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Tabla de perfiles: 1 fila por usuario de auth.users.
-- No hay registro público: los perfiles solo los crea la
-- Edge Function admin-create-user (rol Administrador).
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null check (char_length(btrim(nombre_completo)) between 1 and 120),
  correo          text not null,
  rol             text not null check (rol in ('administrador','coordinador_produccion','mantenimiento')),
  activo          boolean not null default true,
  area_id         uuid,   -- referencia añadida en 0002 (catálogo de áreas)
  linea_id        uuid,   -- referencia añadida en 0002 (catálogo de líneas)
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create unique index if not exists profiles_correo_idx on public.profiles (lower(correo));
create index if not exists profiles_rol_idx on public.profiles (rol) where activo;

-- Mantiene actualizado_en al día
create or replace function public._tocar_actualizado_en() returns trigger
language plpgsql as $$
begin new.actualizado_en = now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public._tocar_actualizado_en();

-- ---------------------------------------------------------------
-- Helpers de rol, para usar dentro de políticas RLS y funciones.
-- SECURITY DEFINER es obligatorio aquí: si fuera SECURITY INVOKER,
-- la consulta interna a "profiles" volvería a disparar la política
-- de RLS de profiles, que a su vez llama a esta función → recursión
-- infinita. Al ser DEFINER (dueño: el rol que corre la migración,
-- normalmente "postgres", con privilegio de saltar RLS) la consulta
-- interna no vuelve a evaluar la política.
-- ---------------------------------------------------------------
create or replace function public.rol_actual() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.profiles where user_id = auth.uid() and activo;
$$;

create or replace function public.es_administrador() returns boolean
language sql stable as $$ select public.rol_actual() = 'administrador'; $$;

create or replace function public.es_coordinador() returns boolean
language sql stable as $$ select public.rol_actual() = 'coordinador_produccion'; $$;

create or replace function public.es_mantenimiento() returns boolean
language sql stable as $$ select public.rol_actual() = 'mantenimiento'; $$;

create or replace function public.es_interno() returns boolean
language sql stable as $$ select public.rol_actual() is not null; $$;

-- ---------------------------------------------------------------
-- RLS de profiles
-- Lectura: cualquier usuario interno activo puede ver la lista
--   (se necesita para el desplegable de Responsable y para mostrar
--   nombres en historial/comentarios).
-- Escritura: NADIE la hace por REST directo; solo la Edge Function
--   admin-create-user (usa la service_role, que ignora RLS) y la
--   función actualizar_usuario (0007) para editar nombre/estado/rol.
-- ---------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "leer perfiles" on public.profiles;
create policy "leer perfiles" on public.profiles
  for select to authenticated
  using (public.es_interno());
-- (sin políticas de insert/update/delete → bloqueadas por defecto)
