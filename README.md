# Solicitudes de mantenimiento · Hada — v2 (roles, validación doble, invitado)

Reescritura sobre Supabase + Netlify + GitHub, con Auth, roles, catálogos,
asignación, notificaciones por correo, doble validación de cierre,
historial, comentarios y una página pública de reporte con Turnstile.

```
index.html            la app (requiere sesión)
reportar.html          formulario público de Invitado (/reportar)
css/styles.css
js/                    módulos ES: config, supabase-client, auth, catalogs,
                        data, render, detail, actions, admin, nueva-solicitud,
                        main, reportar
logo.png
vendor/                supabase-js y SheetJS, sin depender de un CDN
supabase/migrations/    0001 a 0009, en orden
supabase/functions/     3 Edge Functions (Deno)
netlify.toml
```

## 0. Antes de empezar

Vas a necesitar, además de Supabase/GitHub/Netlify:
- Una cuenta en **Cloudflare** para Turnstile (gratis) → https://dash.cloudflare.com/?to=/:account/turnstile
- Una cuenta en **Resend** para el correo (gratis para este volumen) → https://resend.com

Como confirmaste, usa primero un **proyecto Supabase de prueba** aparte del
que ya tenías con la v1 (PIN). Todo lo de abajo se hace en ese proyecto de
prueba; migras a producción solo cuando ya probaste todo.

## 1. Supabase — migraciones

En **SQL Editor → New query**, pega y corre **cada archivo por separado, en
orden** (0001, 0002, … 0009). No los pegues todos juntos: algunos dependen
de que el anterior ya haya corrido.

```
supabase/migrations/0001_profiles_roles.sql
supabase/migrations/0002_catalogos.sql
supabase/migrations/0003_solicitudes_v2.sql
supabase/migrations/0004_historial.sql
supabase/migrations/0005_comentarios.sql
supabase/migrations/0006_notificaciones.sql
supabase/migrations/0007_funciones.sql
supabase/migrations/0008_rls_solicitudes.sql
supabase/migrations/0009_invitado_rate_limit.sql
```

Si es un proyecto nuevo (sin la tabla `solicitudes` de la v1), 0003 no tiene
nada que migrar y simplemente crea las columnas — es seguro correrla igual.

## 2. Primer usuario Administrador (huevo y gallina)

Nadie puede crear el primer Administrador desde la app, porque crear
usuarios ya requiere ser Administrador. Se hace una única vez a mano:

1. **Authentication → Users → Add user** (en el dashboard de Supabase).
   Correo y contraseña que tú definas. Marca "Auto Confirm User".
2. Copia el **UUID** del usuario que se creó.
3. **SQL Editor → New query**:
   ```sql
   insert into public.profiles (user_id, nombre_completo, correo, rol, activo)
   values ('PEGA-AQUI-EL-UUID', 'Tu nombre', 'tu-correo@hada.com', 'administrador', true);
   ```
4. Ya puedes iniciar sesión en `index.html` con ese correo/contraseña, y
   desde ahí crear a los demás usuarios (Coordinador, Mantenimiento) con el
   botón **⚙ Administración → Usuarios → + Nuevo usuario**.

## 3. Turnstile (verificación del formulario público)

1. En Cloudflare, crea un **Widget** de Turnstile. Tipo "Managed" está bien.
   Dominio: el que te dé Netlify (lo puedes editar después si cambias de
   dominio).
2. Copia el **Site Key** (público) y el **Secret Key** (privado).

## 4. Variables de entorno de las Edge Functions

En **Supabase → Edge Functions → Secrets** (o con la CLI, ver abajo), agrega:

| Variable | Para qué función | Valor |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | `reportar-solicitud` | El Secret Key de Turnstile |
| `RESEND_API_KEY` | `enviar-notificacion` | Tu API key de Resend |
| `REMITENTE_CORREO` | `enviar-notificacion` | Ej: `Hada Mantenimiento <mantenimiento@tudominio.com>` (mientras no verifiques un dominio propio en Resend, usa `onboarding@resend.dev`) |
| `APP_URL` | `enviar-notificacion` | La URL de tu sitio en Netlify, para el link del correo |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya las
inyecta la plataforma sola; no las declares tú.

## 5. Desplegar las Edge Functions

Necesitas la [CLI de Supabase](https://supabase.com/docs/guides/cli) instalada y con sesión iniciada (`supabase login`), y el proyecto enlazado (`supabase link --project-ref TU-REF`).

```bash
# Pública: sin verificación de JWT, porque el Invitado no tiene sesión
supabase functions deploy reportar-solicitud --no-verify-jwt

# Estas dos SÍ requieren sesión válida
supabase functions deploy admin-create-user
supabase functions deploy enviar-notificacion
```

## 6. Disparo automático de correos (Vault)

En **SQL Editor**, una sola vez, con tus valores reales (mira 0006 para el
detalle):

```sql
select vault.create_secret('https://TU-PROYECTO.supabase.co/functions/v1/enviar-notificacion', 'edge_notif_url');
select vault.create_secret('TU_SERVICE_ROLE_KEY', 'edge_notif_key');
```

**Nunca** pongas esto en un archivo del repositorio: solo se ejecuta a mano
en el SQL Editor, una vez. El `service_role key` es la llave maestra del
proyecto.

## 7. config.js

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "tu-clave-publica-anon",
  TURNSTILE_SITE_KEY: "tu-site-key-de-turnstile",
};
```

## 8. GitHub y Netlify

Igual que en la v1: repo en GitHub, importar en Netlify sin build command,
publish directory `.`. `reportar.html` queda accesible en
`https://tu-sitio.netlify.app/reportar.html` (compártelo así, o en el QR de
planta).

## 9. Lista de verificación antes de pasar a producción

- [ ] Iniciar sesión con cada uno de los 3 roles y confirmar que cada uno ve
      lo que le corresponde (matriz de permisos que ya aprobaste).
- [ ] `/reportar` desde el celular: se ve el catálogo, Turnstile carga, y al
      enviar aparece el consecutivo (SOL-000001…).
- [ ] Asignar responsable → llega el correo (revisa también la carpeta de
      spam la primera vez).
- [ ] Ciclo completo: crear → asignar → iniciar → terminar → **un usuario
      distinto** aprueba → Finalizada.
- [ ] Rechazo: exige motivo, vuelve a En Proceso.
- [ ] Reabrir desde Finalizada → En Proceso; desde Cancelada → Pendiente.
- [ ] Comentarios en tiempo real entre dos pestañas/dispositivos distintos.
- [ ] Importar/Exportar Excel, solo visible para Administrador.
- [ ] Probar `reintentar_notificaciones_pendientes()` si algún correo quedó
      en "fallido" (revisa la tabla `notificaciones_email`).

## 10. Migrar de prueba a producción

Cuando todo lo anterior esté validado: repite los pasos 1 a 6 en tu
proyecto Supabase real (o usa `supabase db push` si prefieres manejarlo por
CLI), actualiza `config.js` con las claves de producción, y crea un nuevo
sitio en Netlify apuntando al mismo repositorio (o cambia las variables del
sitio actual). Antes de migrar, exporta un respaldo de los datos de tu
proyecto de prueba y de tu v1 actual si vas a reemplazarla.

## 11. Rollback

- El PIN de la v1 sigue ahí sin usarse (columna `app_config`); si algo sale
  mal con Auth en producción, puedes volver a publicar el `index.html` de
  la v1 en Netlify mientras corriges, sin perder las solicitudes nuevas
  (las columnas viejas y nuevas conviven en la misma tabla).
- Netlify guarda cada despliegue anterior: "Deploys → (uno viejo) → Publish
  deploy" revierte el sitio al instante.

## 12. Supuestos que tomé (revísalos)

- **Cancelada → Reabrir** vuelve a **Pendiente** (Finalizada → Reabrir
  vuelve a **En Proceso**, eso sí lo confirmaste). Si prefieres otra cosa,
  es un cambio de una línea en `reabrir_tarea` (0007).
- Áreas/Líneas existentes de tu Excel quedaron todas bajo un área "Planta"
  por defecto; reorganízalas desde **Administración → Áreas y líneas**.
- El campo `responsable_legacy` (texto) de las tareas importadas por Excel
  **no** se asigna solo a un usuario del catálogo — el Excel no trae ese
  vínculo. Asigna el responsable real desde el detalle de cada tarea.

## Notas

- Fechas en hora de Colombia (`America/Bogota`).
- El plan gratuito de Supabase puede pausar proyectos muy inactivos.
- El diálogo de "Rechazar" (motivo) y "Eliminar" (confirmación) usan los
  diálogos nativos del navegador (`prompt`/`confirm`) para mantener el
  alcance del proyecto manejable; si más adelante quieres reemplazarlos por
  modales con el estilo de Hada, es un cambio aislado en `js/detail.js`.
