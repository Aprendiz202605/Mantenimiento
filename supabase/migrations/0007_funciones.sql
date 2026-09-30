-- ============================================================
-- 0007 · Funciones RPC (Fases 4, 6, 7, 7.5)
-- Todas SECURITY DEFINER: el cliente nunca hace UPDATE/INSERT/DELETE
-- directo sobre solicitudes/comentarios/historial. Cada función valida
-- el rol de quien llama (auth.uid()) antes de tocar nada.
-- ============================================================

-- Atajo interno: nombre completo de un usuario, para comentarios de sistema.
create or replace function public._nombre(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nombre_completo, 'alguien') from public.profiles where user_id = p_user;
$$;

create or replace function public._registrar_historial(
  p_solicitud uuid, p_accion text, p_comentario text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.historial_solicitudes (solicitud_id, usuario_id, accion, comentario)
  values (p_solicitud, auth.uid(), p_accion, p_comentario);
end $$;

create or replace function public._comentario_sistema(p_solicitud uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.comentarios (solicitud_id, usuario_id, tipo, texto)
  values (p_solicitud, auth.uid(), 'sistema', p_texto);
end $$;

create or replace function public._encolar_notificacion(p_solicitud uuid, p_evento text, p_destinatario text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_destinatario is not null and p_destinatario <> '' then
    insert into public.notificaciones_email (solicitud_id, evento, destinatario)
    values (p_solicitud, p_evento, p_destinatario);
  end if;
end $$;

-- ================================================================
-- CREAR (usuario interno; el invitado usa la Edge Function, no esto)
-- ================================================================
create or replace function public.crear_solicitud(
  p_area_id uuid, p_linea_id uuid, p_tipo text, p_actividad text, p_descripcion text,
  p_aviso text, p_prioridad text, p_solicitante text, p_responsable_id uuid default null
) returns public.solicitudes
language plpgsql security definer set search_path = public as $$
declare r public.solicitudes; v_correo text; v_rol text;
begin
  if not public.es_interno() then raise exception 'NO_AUTORIZADO'; end if;
  if p_responsable_id is not null then
    select rol into v_rol from public.profiles where user_id = p_responsable_id and activo;
    if v_rol is distinct from 'mantenimiento' then raise exception 'RESPONSABLE_INVALIDO'; end if;
  end if;
  insert into public.solicitudes
    (area_id, linea_id, tipo, actividad, descripcion, aviso, prioridad, solicitante,
     responsable_id, estado, origen, creado_por, fecha_solicitud)
  values
    (p_area_id, p_linea_id, coalesce(p_tipo,''), btrim(p_actividad), coalesce(p_descripcion,''),
     btrim(coalesce(p_aviso,'')),
     case when p_prioridad in ('Alta','Media','Baja') then p_prioridad else 'Media' end,
     coalesce(p_solicitante,''), p_responsable_id, 'Pendiente', 'usuario', auth.uid(),
     (now() at time zone 'America/Bogota')::date)
  returning * into r;
  perform public._registrar_historial(r.id, 'creacion');
  if p_responsable_id is not null then
    select correo into v_correo from public.profiles where user_id = p_responsable_id;
    perform public._comentario_sistema(r.id, 'Responsable asignado: ' || public._nombre(p_responsable_id));
    perform public._encolar_notificacion(r.id, 'asignacion', v_correo);
  end if;
  return r;
end $$;

-- ================================================================
-- ASIGNAR / REASIGNAR responsable
-- ================================================================
create or replace function public.asignar_responsable(p_solicitud_id uuid, p_responsable_id uuid) returns public.solicitudes
language plpgsql security definer set search_path = public as $$
declare r public.solicitudes; v_anterior uuid; v_correo text; v_rol text;
begin
  if not (public.es_administrador() or public.es_coordinador()) then raise exception 'NO_AUTORIZADO'; end if;
  select rol into v_rol from public.profiles where user_id = p_responsable_id and activo;
  if v_rol is distinct from 'mantenimiento' then raise exception 'RESPONSABLE_INVALIDO'; end if;

  select * into r from public.solicitudes where id = p_solicitud_id;
  if r.id is null then raise exception 'NO_ENCONTRADA'; end if;
  if r.estado not in ('Pendiente','En Proceso') then raise exception 'ESTADO_NO_PERMITE_ASIGNAR'; end if;

  v_anterior := r.responsable_id;
  update public.solicitudes set responsable_id = p_responsable_id where id = p_solicitud_id returning * into r;
  select correo into v_correo from public.profiles where user_id = p_responsable_id;

  if v_anterior is null then
    perform public._registrar_historial(r.id, 'asignacion');
    perform public._comentario_sistema(r.id, 'Responsable asignado: ' || public._nombre(p_responsable_id));
    perform public._encolar_notificacion(r.id, 'asignacion', v_correo);
  else
    perform public._registrar_historial(r.id, 'reasignacion');
    perform public._comentario_sistema(r.id, 'Responsable cambiado de ' || public._nombre(v_anterior) || ' a ' || public._nombre(p_responsable_id));
    perform public._encolar_notificacion(r.id, 'reasignacion', v_correo);
  end if;
  return r;
end $$;

-- ================================================================
-- INICIAR (Pendiente → En Proceso)
-- ================================================================
create or replace function public.iniciar_tarea(p_solicitud_id uuid) returns public.solicitudes
language plpgsql security definer set search_path = public as $$
declare r public.solicitudes;
begin
  select * into r from public.solicitudes where id = p_solicitud_id;
  if r.id is null then raise exception 'NO_ENCONTRADA'; end if;
  if not (public.es_administrador() or (public.es_mantenimiento() and r.responsable_id = auth.uid())) then
    raise exception 'NO_AUTORIZADO';
  end if;
  if r.responsable_id is null then raise exception 'SIN_RESPONSABLE'; end if;
  if r.estado <> 'Pendiente' then raise exception 'ESTADO_INVALIDO'; end if;
  update public.solicitudes
     set estado = 'En Proceso', fecha_inicio = (now() at time zone 'America/Bogota')::date
   where id = p_solicitud_id returning * into r;
  perform public._registrar_historial(r.id, 'inicio');
  return r;
end $$;

-- ================================================================
-- TERMINAR (En Proceso → Pendiente de Validación)
-- ================================================================
create or replace function public.terminar_tarea(p_solicitud_id uuid) returns public.solicitudes
language plpgsql security definer set search_path = public as $$
declare r public.solicitudes;
begin
  select * into r from public.solicitudes where id = p_solicitud_id;
  if r.id is null then raise exception 'NO_ENCONTRADA'; end if;
  if not (public.es_administrador() or (public.es_mantenimiento() and r.responsable_id = auth.uid())) then
    raise exception 'NO_AUTORIZADO';
  end if;
  if r.estado <> 'En Proceso' then raise exception 'ESTADO_INVALIDO'; end if;
  update public.solicitudes
     set estado = 'Pendiente de Validación', fecha_terminado = now(), terminado_por = auth.uid()
   where id = p_solicitud_id returning * into r;
  perform public._registrar_historial(r.id, 'terminacion');
  return r;
end $$;

-- ================================================================
-- APROBAR (Pendiente de Validación → Finalizada)
-- ================================================================
create or replace function public.aprobar_tarea(p_solicitud_id uuid) returns public.solicitudes
language plpgsql security definer set search_path = public as $$
declare r public.solicitudes;
begin
  if not (public.es_administrador() or public.es_coordinador()) then raise exception 'NO_AUTORIZADO'; end if;
  select * into r from public.solicitudes where id = p_solicitud_id;
  if r.id is null then raise exception 'NO_ENCONTRADA'; end if;
  if r.estado <> 'Pendiente de Validación' then raise exception 'ESTADO_INVALIDO'; end if;
  if r.terminado_por = auth.uid() then raise exception 'MISMO_USUARIO_NO_PUEDE_VALIDAR'; end if;
  update public.solicitudes
     set estado = 'Finalizada', fecha_validacion = now(), validado_por = auth.uid(),
         fecha_ejecucion = (now() at time zone 'America/Bogota')::date
   where id = p_solicitud_id returning * into r;
  perform public._registrar_historial(r.id, 'aprobacion');
  perform public._comentario_sistema(r.id, 'Solicitud aprobada por ' || public._nombre(auth.uid()));
  perform public._encolar_notificacion(r.id, 'aprobacion', (select correo from public.profiles where user_id = r.responsable_id));
  return r;
end $$;

-- ================================================================
-- RECHAZAR (Pendiente de Validación → En Proceso; motivo obligatorio)
-- ================================================================
create or replace function public.rechazar_tarea(p_solicitud_id uuid, p_motivo text) returns public.solicitudes
language plpgsql security definer set search_path = public as $$
declare r public.solicitudes;
begin
  if not (public.es_administrador() or public.es_coordinador()) then raise exception 'NO_AUTORIZADO'; end if;
  if btrim(coalesce(p_motivo,'')) = '' then raise exception 'MOTIVO_OBLIGATORIO'; end if;
  select * into r from public.solicitudes where id = p_solicitud_id;
  if r.id is null then raise exception 'NO_ENCONTRADA'; end if;
  if r.estado <> 'Pendiente de Validación' then raise exception 'ESTADO_INVALIDO'; end if;
  if r.terminado_por = auth.uid() then raise exception 'MISMO_USUARIO_NO_PUEDE_VALIDAR'; end if;
  update public.solicitudes
     set estado = 'En Proceso', validado_por = auth.uid(), fecha_validacion = now(),
         motivo_rechazo = btrim(p_motivo)
   where id = p_solicitud_id returning * into r;
  perform public._registrar_historial(r.id, 'rechazo', btrim(p_motivo));
  perform public._comentario_sistema(r.id, 'Solicitud rechazada: ' || btrim(p_motivo));
  perform public._encolar_notificacion(r.id, 'rechazo', (select correo from public.profiles where user_id = r.responsable_id));
  return r;
end $$;

-- ================================================================
-- CANCELAR
-- ================================================================
create or replace function public.cancelar_tarea(p_solicitud_id uuid) returns public.solicitudes
language plpgsql security definer set search_path = public as $$
declare r public.solicitudes;
begin
  if not (public.es_administrador() or public.es_coordinador()) then raise exception 'NO_AUTORIZADO'; end if;
  select * into r from public.solicitudes where id = p_solicitud_id;
  if r.id is null then raise exception 'NO_ENCONTRADA'; end if;
  if r.estado not in ('Pendiente','En Proceso') then raise exception 'ESTADO_INVALIDO'; end if;
  update public.solicitudes set estado = 'Cancelada' where id = p_solicitud_id returning * into r;
  perform public._registrar_historial(r.id, 'cancelacion');
  return r;
end $$;

-- ================================================================
-- REABRIR
--   Finalizada  → En Proceso  (confirmado)
--   Cancelada   → Pendiente   (supuesto: nunca tuvo ejecución;
--                               ajustar aquí si prefieres otra cosa)
-- ================================================================
create or replace function public.reabrir_tarea(p_solicitud_id uuid) returns public.solicitudes
language plpgsql security definer set search_path = public as $$
declare r public.solicitudes; v_destino text;
begin
  if not (public.es_administrador() or public.es_coordinador()) then raise exception 'NO_AUTORIZADO'; end if;
  select * into r from public.solicitudes where id = p_solicitud_id;
  if r.id is null then raise exception 'NO_ENCONTRADA'; end if;
  if r.estado not in ('Finalizada','Cancelada') then raise exception 'ESTADO_INVALIDO'; end if;
  v_destino := case when r.estado = 'Finalizada' then 'En Proceso' else 'Pendiente' end;
  update public.solicitudes
     set estado = v_destino, fecha_ejecucion = null, fecha_terminado = null,
         terminado_por = null, fecha_validacion = null, validado_por = null, motivo_rechazo = null
   where id = p_solicitud_id returning * into r;
  perform public._registrar_historial(r.id, 'reapertura');
  return r;
end $$;

-- ================================================================
-- ELIMINAR (solo Administrador)
-- ================================================================
create or replace function public.eliminar_solicitud(p_solicitud_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_administrador() then raise exception 'NO_AUTORIZADO'; end if;
  delete from public.solicitudes where id = p_solicitud_id;
end $$;

-- ================================================================
-- AVISO (Administrador, Coordinador, o Mantenimiento si es responsable)
-- ================================================================
create or replace function public.editar_aviso(p_id uuid, p_aviso text) returns public.solicitudes
language plpgsql security definer set search_path = public as $$
declare r public.solicitudes; v text;
begin
  select * into r from public.solicitudes where id = p_id;
  if r.id is null then raise exception 'NO_ENCONTRADA'; end if;
  if not (public.es_administrador() or public.es_coordinador()
          or (public.es_mantenimiento() and r.responsable_id = auth.uid())) then
    raise exception 'NO_AUTORIZADO';
  end if;
  v := btrim(coalesce(p_aviso, ''));
  if v <> '' and v !~ '^[A-Za-z0-9][A-Za-z0-9 \-]{0,29}$' then raise exception 'AVISO_INVALIDO'; end if;
  update public.solicitudes set aviso = v where id = p_id returning * into r;
  perform public._registrar_historial(r.id, 'edicion_aviso');
  return r;
end $$;

-- ================================================================
-- COMENTARIOS
-- ================================================================
create or replace function public.agregar_comentario(p_solicitud_id uuid, p_texto text) returns public.comentarios
language plpgsql security definer set search_path = public as $$
declare c public.comentarios;
begin
  if not public.es_interno() then raise exception 'NO_AUTORIZADO'; end if;
  if btrim(coalesce(p_texto,'')) = '' then raise exception 'TEXTO_VACIO'; end if;
  insert into public.comentarios (solicitud_id, usuario_id, tipo, texto)
  values (p_solicitud_id, auth.uid(), 'usuario', btrim(p_texto))
  returning * into c;
  return c;
end $$;

create or replace function public.eliminar_comentario(p_comentario_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_administrador() then raise exception 'NO_AUTORIZADO'; end if;
  update public.comentarios set eliminado_en = now(), eliminado_por = auth.uid()
   where id = p_comentario_id;
end $$;

-- ================================================================
-- CATÁLOGOS (solo Administrador)
-- ================================================================
create or replace function public.crear_area(p_nombre text, p_coordinador_id uuid default null) returns public.areas
language plpgsql security definer set search_path = public as $$
declare a public.areas;
begin
  if not public.es_administrador() then raise exception 'NO_AUTORIZADO'; end if;
  insert into public.areas (nombre, coordinador_id) values (btrim(p_nombre), p_coordinador_id) returning * into a;
  return a;
end $$;

create or replace function public.crear_linea(p_area_id uuid, p_nombre text) returns public.lineas
language plpgsql security definer set search_path = public as $$
declare l public.lineas;
begin
  if not public.es_administrador() then raise exception 'NO_AUTORIZADO'; end if;
  insert into public.lineas (area_id, nombre) values (p_area_id, btrim(p_nombre)) returning * into l;
  return l;
end $$;

-- Editar nombre/rol/estado/área/línea de un perfil ya creado
-- (la creación en sí, con su cuenta de auth.users, va por la Edge
--  Function admin-create-user, porque necesita la service_role key).
create or replace function public.actualizar_usuario(
  p_user_id uuid, p_nombre_completo text, p_rol text, p_activo boolean,
  p_area_id uuid default null, p_linea_id uuid default null
) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if not public.es_administrador() then raise exception 'NO_AUTORIZADO'; end if;
  if p_rol not in ('administrador','coordinador_produccion','mantenimiento') then raise exception 'ROL_INVALIDO'; end if;
  update public.profiles
     set nombre_completo = btrim(p_nombre_completo), rol = p_rol, activo = p_activo,
         area_id = p_area_id, linea_id = p_linea_id
   where user_id = p_user_id
   returning * into p;
  return p;
end $$;

-- ================================================================
-- IMPORTAR EXCEL (solo Administrador; sin PIN)
-- responsable NO se asigna desde el Excel: llega solo como texto en
-- responsable_legacy, para trazabilidad; asígnalo desde la app.
-- ================================================================
create or replace function public.importar_tareas(p_tareas jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; v_planta uuid;
begin
  if not public.es_administrador() then raise exception 'NO_AUTORIZADO'; end if;
  select id into v_planta from public.areas where lower(nombre) = 'planta';

  -- Crea, si hacen falta, las líneas nuevas que traiga el Excel (bajo "Planta")
  insert into public.lineas (area_id, nombre)
    select v_planta, distinct_linea from (
      select distinct btrim(t.linea) as distinct_linea
        from jsonb_to_recordset(p_tareas) as t(linea text)
       where btrim(coalesce(t.linea,'')) <> ''
    ) d
  on conflict (area_id, nombre) do nothing;

  insert into public.solicitudes
    (area_id, linea_id, linea_legacy, tipo, actividad, aviso, descripcion, responsable_legacy,
     prioridad, solicitante, observaciones, estado, origen, fecha_solicitud, fecha_ejecucion)
  select v_planta,
         (select id from public.lineas where area_id = v_planta and nombre = btrim(t.linea)),
         coalesce(t.linea,''), coalesce(t.tipo,''), btrim(t.actividad), coalesce(t.aviso,''),
         coalesce(t.descripcion,''), coalesce(t.responsable,''),
         case when t.prioridad in ('Alta','Media','Baja') then t.prioridad else 'Media' end,
         coalesce(t.solicitante,''), coalesce(t.observaciones,''),
         case when t.estado in ('Pendiente','En Proceso','Finalizada','Cancelada') then t.estado else 'Pendiente' end,
         'usuario',
         coalesce(t.fecha_solicitud, (now() at time zone 'America/Bogota')::date),
         t.fecha_ejecucion
    from jsonb_to_recordset(p_tareas) as t(
      linea text, tipo text, actividad text, aviso text, descripcion text, responsable text,
      prioridad text, solicitante text, observaciones text, estado text,
      fecha_solicitud date, fecha_ejecucion date)
   where coalesce(btrim(t.actividad),'') <> '';
  get diagnostics n = row_count;
  return n;
end $$;

-- ================================================================
-- Permisos de ejecución (revoke general + grant a authenticated)
-- ================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'crear_solicitud(uuid,uuid,text,text,text,text,text,text,uuid)',
    'asignar_responsable(uuid,uuid)', 'iniciar_tarea(uuid)', 'terminar_tarea(uuid)',
    'aprobar_tarea(uuid)', 'rechazar_tarea(uuid,text)', 'cancelar_tarea(uuid)',
    'reabrir_tarea(uuid)', 'eliminar_solicitud(uuid)', 'editar_aviso(uuid,text)',
    'agregar_comentario(uuid,text)', 'eliminar_comentario(uuid)',
    'crear_area(text,uuid)', 'crear_linea(uuid,text)', 'actualizar_usuario(uuid,text,text,boolean,uuid,uuid)',
    'importar_tareas(jsonb)'
  ]
  loop
    execute format('revoke all on function public.%s from public;', f);
    execute format('grant execute on function public.%s to authenticated;', f);
  end loop;
end $$;
