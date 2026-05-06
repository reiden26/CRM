# CRM Pro

CRM profesional y completo construido con Angular 17 y Supabase. Diseñado para equipos de ventas pequeños y medianos que necesitan una plataforma centralizada para gestionar contactos, deals, tareas y colaboración en equipo.

---

## Tabla de contenidos

- [Funcionalidades](#funcionalidades)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Inicio rápido](#inicio-rápido)
- [Variables de entorno](#variables-de-entorno)
- [Configuración de la base de datos](#configuración-de-la-base-de-datos)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Sistema de roles](#sistema-de-roles)
- [Agregar un nuevo módulo](#agregar-un-nuevo-módulo)
- [Despliegue](#despliegue)

---

## Funcionalidades

- Arquitectura multi-tenant con soporte de enrutamiento por subdominio
- Gestión de contactos y empresas con CRUD completo
- Pipeline visual de ventas con tablero Kanban y drag-and-drop
- Seguimiento de tareas y actividades con recordatorios de vencimiento
- Actualizaciones en tiempo real mediante Supabase Realtime (WebSockets)
- Centro de notificaciones in-app con soporte de notificaciones push (Web Push / VAPID)
- Sistema de email transaccional mediante Resend API y Supabase Edge Functions
- Control de acceso basado en roles (RBAC) con 5 niveles de permisos
- Bitácora de auditoría para todos los cambios de datos
- Dashboard con tarjetas KPI y visualizaciones con Chart.js
- Panel de configuración: usuarios, etapas del pipeline, plantillas de email, facturación
- Toggle de tema claro/oscuro con personalización de colores por tenant
- Internacionalización (Español / Inglés) mediante ngx-translate
- Aplicación Web Progresiva (PWA) con soporte offline
- Detección de inactividad con advertencia de expiración de sesión
- Limitación de intentos de login en el cliente

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework frontend | Angular 17 (Standalone Components + Signals) |
| Componentes UI | Angular Material 17 |
| Gestión de estado | Angular Signals + RxJS |
| Backend / Base de datos | Supabase (PostgreSQL + Row Level Security) |
| Autenticación | Supabase Auth (JWT + confirmación por email) |
| Tiempo real | Supabase Realtime (WebSockets) |
| Edge Functions | Deno + TypeScript (Supabase Functions) |
| Envío de emails | Resend API |
| Notificaciones push | Web Push API (VAPID) |
| Gráficos | Chart.js 4 |
| Internacionalización | ngx-translate |
| Drag and drop | Angular CDK DragDrop |
| PWA | @angular/service-worker |
| Estilos | Angular Material + SCSS + CSS Custom Properties |
| Despliegue | Vercel / Docker + nginx |

---

## Arquitectura

La aplicación sigue una arquitectura basada en features con lazy loading:

```
src/app/
  core/           Servicios singleton, guards, interceptors, handlers
  shared/         Componentes, pipes, directivas y animaciones reutilizables
  features/       Módulos de funcionalidades con lazy loading
    auth/         Login, registro, confirmación de email
    dashboard/    KPIs, gráficos, feed de actividad
    contacts/     CRUD de contactos y vista de detalle
    pipeline/     Tablero Kanban y gestión de deals
    tasks/        Gestión de tareas y actividades
    notifications/ Centro de notificaciones
    settings/     Usuarios, configuración del pipeline, bitácora, facturación
    onboarding/   Flujo de creación del workspace
  layout/         Shell, navbar, sidebar
  models/         Modelos de dominio globales
```

El backend usa Supabase con:
- PostgreSQL para almacenamiento de datos
- Row Level Security (RLS) para aislamiento de datos multi-tenant
- Edge Functions para envío de emails y notificaciones push
- Suscripciones Realtime para actualizaciones en vivo

---

## Inicio rápido

### Requisitos previos

- Node.js 20 o superior
- npm 10 o superior
- Una cuenta de Supabase (el plan gratuito funciona para desarrollo)

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/reiden26/CRM.git
cd CRM

# Instalar dependencias
npm install --legacy-peer-deps

# Configurar variables de entorno (ver siguiente sección)
cp src/environments/environment.example.ts src/environments/environment.ts
# Editar environment.ts con tus credenciales de Supabase

# Iniciar el servidor de desarrollo
npm start
```

Abre `http://localhost:4200` en tu navegador.

---

## Variables de entorno

Copia `src/environments/environment.example.ts` a `src/environments/environment.ts` y completa los valores:

```typescript
export const environment = {
  production: false,
  supabase: {
    url:     'https://TU_PROJECT_REF.supabase.co',
    anonKey: 'TU_SUPABASE_ANON_KEY',
  },
  vapid: {
    publicKey: 'TU_VAPID_PUBLIC_KEY',
  },
};
```

| Variable | Dónde encontrarla |
|---|---|
| `supabase.url` | Supabase Dashboard → Settings → API → Project URL |
| `supabase.anonKey` | Supabase Dashboard → Settings → API → anon public key |
| `vapid.publicKey` | Ejecutar `npx web-push generate-vapid-keys` |

Para producción, configura estas variables en tu plataforma de hosting (Vercel, Docker, etc.). Consulta `DEPLOYMENT.md` para más detalles.

---

## Configuración de la base de datos

Ejecuta las migraciones SQL en orden desde el Editor SQL de Supabase:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_multitenancy_email_notifications.sql
supabase/migrations/003a_add_super_admin_enum.sql   (ejecutar primero, transacción separada)
supabase/migrations/003_roles_rls_complete.sql
```

Luego despliega las Edge Functions:

```bash
supabase functions deploy send-email
supabase functions deploy process-email-queue
supabase functions deploy send-push-notification
supabase functions deploy notify-on-deal-assigned
```

Configura los secretos requeridos:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set RESEND_FROM_EMAIL="CRM Pro <noreply@tudominio.com>"
supabase secrets set VAPID_PUBLIC_KEY=Bxxxxxxxx
supabase secrets set VAPID_PRIVATE_KEY=xxxxxxxx
supabase secrets set VAPID_SUBJECT=mailto:admin@tudominio.com
```

---

## Estructura del proyecto

```
CRM/
  src/
    app/
      core/
        guards/           authGuard, tenantGuard, roleGuard, permissionGuard, unsavedChangesGuard
        handlers/         GlobalErrorHandler (mensajes de error en español)
        interceptors/     auth, tenant, loading, error
        models/           permission.model, tenant.model, notification.model
        resolvers/        TenantResolver (enrutamiento por subdominio)
        services/         AuthService, SupabaseService, TenantService, PermissionService,
                          NotificationService, EmailService, SecurityService, ThemeService,
                          LanguageService, InactivityService, y más
      shared/
        animations/       auth.animations (Angular Animations)
        components/       NotificationBell, ConfirmDialog, Skeleton, InactivityDialog
        directives/       PermissionDirective ([appPermission])
        pipes/            HasPermissionPipe, TimeAgoPipe
      features/
        auth/             Login, Registro, EmailEnviado, AuthCallback
        contacts/         Lista, Detalle, Formulario, Filtros
        dashboard/        KPIs, Gráficos, Feed de actividad, Tareas
        notifications/    Centro de notificaciones con filtros y acciones masivas
        onboarding/       Creación del workspace
        pipeline/         Tablero Kanban, Formulario de deal, Pipe de color de etapa
        reports/          (placeholder, listo para extender)
        settings/         Usuarios, Configuración del pipeline, Roles, Plantillas de email,
                          Registros de email, Preferencias de notificaciones, Bitácora,
                          Perfil de empresa con facturación
        tasks/            CRUD de tareas con recordatorios de vencimiento
      layout/
        shell/            Contenedor sidenav responsivo
        navbar/           Breadcrumb, notificaciones, toggles de tema e idioma
        sidebar/          Navegación filtrada por permisos
    assets/
      i18n/               es.json, en.json (ngx-translate)
      icons/              Íconos PWA (reemplazar placeholders antes de producción)
    environments/
      environment.example.ts   Plantilla — copiar y completar con credenciales
      environment.ts           Desarrollo local (no subir si contiene claves reales)
      environment.prod.ts      Producción (no subir si contiene claves reales)
  supabase/
    functions/            Edge Functions (Deno + TypeScript)
    migrations/           Archivos de migración SQL
  Dockerfile              Build multi-etapa (node:20-alpine + nginx:alpine)
  nginx.conf              Enrutamiento SPA, gzip, cabeceras de caché
  DEPLOYMENT.md           Guía completa de despliegue
```

---

## Sistema de roles

| Rol | Descripción | Contactos | Deals | Reportes | Configuración |
|---|---|---|---|---|---|
| super_admin | Administrador de plataforma | Todos los tenants | Todos los tenants | Completo | Completo |
| admin | Administrador del workspace | Todo el tenant | Todo el tenant | Completo | Completo |
| manager | Gerente de equipo | Alcance del equipo | Alcance del equipo | Completo | Solo lectura |
| agent | Agente de ventas | Propios | Propios | Ninguno | Ninguno |
| viewer | Usuario de solo lectura | Lectura | Lectura | Lectura | Ninguno |

Los permisos se aplican en dos niveles:
1. Frontend: `PermissionDirective` oculta/deshabilita elementos de UI, `roleGuard` y `permissionGuard` protegen rutas
2. Backend: Las políticas de Row Level Security de PostgreSQL aplican las mismas reglas a nivel de base de datos

---

## Agregar un nuevo módulo

1. Crear el directorio del feature: `src/app/features/mi-feature/`
2. Agregar el archivo de rutas: `mi-feature.routes.ts`
3. Registrar la ruta en `app.routes.ts` dentro de los hijos del shell
4. Agregar un ítem de navegación en `sidebar.component.ts` con la clave de traducción
5. Agregar claves de traducción en `src/assets/i18n/es.json` y `en.json`
6. Agregar entradas de permisos en `core/models/permission.model.ts` (PERMISSIONS_MAP)
7. Crear una migración SQL con políticas RLS para la nueva tabla
8. Crear el servicio extendiendo `BaseSupabaseService` para el alcance automático por tenant

---

## Despliegue

Consulta [DEPLOYMENT.md](./DEPLOYMENT.md) para instrucciones completas que cubren:

- Configuración del proyecto Supabase y migraciones
- Despliegue en Vercel con CI/CD mediante GitHub Actions
- Despliegue con Docker y nginx
- Configuración de dominio personalizado
- Configuración de SMTP con Resend
- Generación de claves VAPID para notificaciones push
- Enrutamiento multi-tenant por subdominio

---

## Scripts disponibles

```bash
npm start                                              # Servidor de desarrollo (http://localhost:4200)
npm run build                                          # Build de producción
npm run build -- --configuration development           # Build de desarrollo
```

---

## Seguridad

- Todas las consultas a la base de datos están limitadas al tenant actual mediante políticas RLS
- Los tokens JWT son gestionados por Supabase Auth con renovación automática
- Limitación de intentos de login en el cliente: bloqueo de 5 minutos tras 5 intentos fallidos
- Detección de inactividad: cierre de sesión automático tras 30 minutos sin actividad
- Sincronización de sesión entre pestañas mediante BroadcastChannel API
- Sanitización de inputs contra XSS en SecurityService
- Cabeceras de Content Security Policy en index.html

---

## Licencia

MIT. Consulta el archivo LICENSE para más detalles.
