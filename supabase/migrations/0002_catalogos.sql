-- ============================================================
-- 0002 · Catálogos de Áreas y Líneas (Fase 2)
-- ============================================================

create table if not exists public.areas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (char_length(btrim(nombre)) between 1 and 80),
  coordinador_id  uuid references public.profiles(user_id),
  creado_en       timestamptz not null default now()
);
create unique index if not exists areas_nombre_idx on public.areas (lower(nombre));

create table if not exists public.lineas (
  id         uuid primary key default gen_random_uuid(),
  area_id    uuid not null references public.areas(id),
  nombre     text not null check (char_length(btrim(nombre)) between 1 and 100),
  creado_en  timestamptz not null default now(),
  unique (area_id, nombre)
);

-- Ahora que existe public.areas, cerramos las referencias de profiles
alter table public.profiles
  add constraint profiles_area_fk  foreign key (area_id)  references public.areas(id),
  add constraint profiles_linea_fk foreign key (linea_id) references public.lineas(id);

-- ---------------------------------------------------------------
-- Área "Planta" por defecto: aquí caen, de entrada, todas las
-- líneas que hoy existen como texto libre en las solicitudes.
-- Reorganízalas luego desde el panel de Administración.
-- ---------------------------------------------------------------
insert into public.areas (nombre)
  values ('Planta') on conflict (lower(nombre)) do nothing;

-- Nota: en 0003 se migran las líneas de texto existentes hacia esta
-- tabla, una vez que la tabla solicitudes ya tenga sus columnas nuevas.

-- ---------------------------------------------------------------
-- RLS: lectura abierta a cualquier usuario interno; escritura solo
-- vía funciones RPC de administración (0007), reservadas al rol
-- Administrador.
-- ---------------------------------------------------------------
alter table public.areas  enable row level security;
alter table public.lineas enable row level security;

drop policy if exists "leer areas" on public.areas;
create policy "leer areas" on public.areas for select to authenticated using (public.es_interno());
drop policy if exists "leer lineas" on public.lineas;
create policy "leer lineas" on public.lineas for select to authenticated using (public.es_interno());
