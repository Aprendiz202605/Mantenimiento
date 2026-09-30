-- ============================================================
-- 0003 · Evolución de "solicitudes" (Fases 2, 3, 4, 6)
-- Conserva las columnas de texto libre actuales (linea, responsable)
-- renombradas con sufijo _legacy, en vez de borrarlas: así no se
-- pierde nada si hay que hacer rollback.
-- ============================================================

-- 1) Nuevo estado del ciclo de vida ------------------------------
alter table public.solicitudes drop constraint if exists solicitudes_estado_check;
alter table public.solicitudes
  add constraint solicitudes_estado_check check (
    estado in ('Pendiente','En Proceso','Pendiente de Validación','Finalizada','Cancelada')
  );

-- 2) Renombrar columnas de texto libre a *_legacy (se conservan) --
alter table public.solicitudes rename column linea to linea_legacy;
alter table public.solicitudes rename column responsable to responsable_legacy;

-- 3) Columnas nuevas ------------------------------------------------
alter table public.solicitudes
  add column if not exists consecutivo      text,
  add column if not exists area_id          uuid references public.areas(id),
  add column if not exists linea_id         uuid references public.lineas(id),
  add column if not exists responsable_id   uuid references public.profiles(user_id),
  add column if not exists origen           text not null default 'usuario' check (origen in ('usuario','invitado')),
  add column if not exists creado_por       uuid references public.profiles(user_id),
  add column if not exists fecha_inicio     date,
  add column if not exists fecha_terminado  timestamptz,
  add column if not exists terminado_por    uuid references public.profiles(user_id),
  add column if not exists fecha_validacion timestamptz,
  add column if not exists validado_por     uuid references public.profiles(user_id),
  add column if not exists motivo_rechazo   text;

-- 4) Consecutivo SOL-000001, continuo, atómico ---------------------
create sequence if not exists public.solicitudes_consecutivo_seq;

create or replace function public._asignar_consecutivo() returns trigger
language plpgsql as $$
begin
  if new.consecutivo is null then
    new.consecutivo := 'SOL-' || lpad(nextval('public.solicitudes_consecutivo_seq')::text, 6, '0');
  end if;
  return new;
end $$;

drop trigger if exists solicitudes_consecutivo on public.solicitudes;
create trigger solicitudes_consecutivo before insert on public.solicitudes
  for each row execute function public._asignar_consecutivo();

-- 5) Migración de datos existentes ---------------------------------
-- 5a) Todas las líneas de texto que ya existan pasan a la tabla
--     "lineas", colgadas del área "Planta" creada en 0002.
insert into public.lineas (area_id, nombre)
  select (select id from public.areas where lower(nombre) = 'planta'),
         d.linea_legacy
    from (select distinct btrim(linea_legacy) as linea_legacy
            from public.solicitudes
           where btrim(coalesce(linea_legacy,'')) <> '') d
  on conflict (area_id, nombre) do nothing;

-- 5b) Enlazar cada solicitud existente a su línea recién creada,
--     y de ahí a su área.
update public.solicitudes s
   set linea_id = l.id,
       area_id  = l.area_id
  from public.lineas l
 where s.linea_id is null
   and btrim(coalesce(s.linea_legacy,'')) <> ''
   and l.nombre = btrim(s.linea_legacy)
   and l.area_id = (select id from public.areas where lower(nombre) = 'planta');

-- 5c) Solicitudes sin línea de origen: quedan solo con área "Planta".
update public.solicitudes
   set area_id = (select id from public.areas where lower(nombre) = 'planta')
 where area_id is null;

-- 5d) Consecutivo retroactivo para filas ya existentes, en orden de
--     creación (creado ascendente), para que la numeración tenga
--     sentido cronológico.
with numeradas as (
  select id, row_number() over (order by creado asc, id asc) as n
    from public.solicitudes
   where consecutivo is null
)
update public.solicitudes s
   set consecutivo = 'SOL-' || lpad(nu.n::text, 6, '0')
  from numeradas nu
 where s.id = nu.id;

-- Ajusta la secuencia para que el próximo consecutivo nuevo no choque
-- con los que se acaban de asignar arriba.
select setval('public.solicitudes_consecutivo_seq',
  greatest(1, (select count(*) from public.solicitudes)), true);

-- 5e) responsable_legacy (texto) NO se migra automáticamente a
--     responsable_id: requiere que primero existan los usuarios de
--     Mantenimiento (se crean en Fase 1 vía admin-create-user) y
--     luego que un Administrador asigne responsable_id manualmente
--     desde el panel, uno por uno o por línea. Ver riesgo en README.

alter table public.solicitudes alter column consecutivo set not null;
create unique index if not exists solicitudes_consecutivo_idx on public.solicitudes (consecutivo);
create index if not exists solicitudes_responsable_idx on public.solicitudes (responsable_id);
create index if not exists solicitudes_estado2_idx on public.solicitudes (estado);
