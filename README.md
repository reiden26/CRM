# CRM Pro

A professional, full-featured CRM built with Angular 17 and Supabase. Designed for small and medium-sized sales teams who need a centralized platform to manage contacts, deals, tasks, and team collaboration.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Project Structure](#project-structure)
- [Role System](#role-system)
- [Adding a New Module](#adding-a-new-module)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Features

- Multi-tenant architecture with subdomain routing support
- Contact and company management with full CRUD
- Visual Kanban pipeline with drag-and-drop deal management
- Task and activity tracking with due-date reminders
- Real-time updates via Supabase Realtime (WebSockets)
- In-app notification center with push notification support (Web Push / VAPID)
- Transactional email system via Resend API and Supabase Edge Functions
- Role-based access control (RBAC) with 5 permission levels
- Audit log for all data changes
- Dashboard with KPI cards and Chart.js visualizations
- Settings panel: users, pipeline stages, email templates, billing
- Dark/light theme toggle with per-tenant brand color customization
- Internationalization (Spanish / English) via ngx-translate
- Progressive Web App (PWA) with offline support
- Inactivity detection with session expiry warning
- Client-side rate limiting for login attempts

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Angular 17 (Standalone Components + Signals) |
| UI components | Angular Material 17 |
| State management | Angular Signals + RxJS |
| Backend / Database | Supabase (PostgreSQL + Row Level Security) |
| Authentication | Supabase Auth (JWT + email confirmation) |
| Real-time | Supabase Realtime (WebSockets) |
| Edge Functions | Deno + TypeScript (Supabase Functions) |
| Email delivery | Resend API |
| Push notifications | Web Push API (VAPID) |
| Charts | Chart.js 4 |
| Internationalization | ngx-translate |
| Drag and drop | Angular CDK DragDrop |
| PWA | @angular/service-worker |
| Styling | Angular Material + SCSS + CSS Custom Properties |
| Deployment | Vercel / Docker + nginx |

---

## Architecture

The application follows a feature-based architecture with lazy loading:

```
src/app/
  core/           Singleton services, guards, interceptors, handlers
  shared/         Reusable components, pipes, directives, animations
  features/       Lazy-loaded feature modules
    auth/         Login, signup, email confirmation
    dashboard/    KPIs, charts, activity feed
    contacts/     Contact CRUD and detail view
    pipeline/     Kanban board and deal management
    tasks/        Task and activity management
    notifications/ Notification center
    settings/     Users, pipeline config, audit log, billing
    onboarding/   Tenant creation flow
  layout/         Shell, navbar, sidebar
  models/         Global domain models
```

The backend uses Supabase with:
- PostgreSQL for data storage
- Row Level Security (RLS) for multi-tenant data isolation
- Edge Functions for email sending and push notifications
- Realtime subscriptions for live updates

---

## Getting Started

### Prerequisites

- Node.js 20 or higher
- npm 10 or higher
- A Supabase account (free tier works for development)

### Installation

```bash
# Clone the repository
git clone https://github.com/reiden26/CRM.git
cd CRM/CRM

# Install dependencies
npm install --legacy-peer-deps

# Configure environment variables (see next section)
cp src/environments/environment.example.ts src/environments/environment.ts
# Edit environment.ts with your Supabase credentials

# Start the development server
npm start
```

Open `http://localhost:4200` in your browser.

---

## Environment Variables

Copy `src/environments/environment.example.ts` to `src/environments/environment.ts` and fill in your values:

```typescript
export const environment = {
  production: false,
  supabase: {
    url:     'https://YOUR_PROJECT_REF.supabase.co',
    anonKey: 'YOUR_SUPABASE_ANON_KEY',
  },
  vapid: {
    publicKey: 'YOUR_VAPID_PUBLIC_KEY',
  },
};
```

| Variable | Where to find it |
|---|---|
| `supabase.url` | Supabase Dashboard → Settings → API → Project URL |
| `supabase.anonKey` | Supabase Dashboard → Settings → API → anon public key |
| `vapid.publicKey` | Run `npx web-push generate-vapid-keys` |

For production, set these as environment variables in your hosting platform (Vercel, Docker, etc.). See `DEPLOYMENT.md` for details.

---

## Database Setup

Run the SQL migrations in order from the Supabase SQL Editor:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_multitenancy_email_notifications.sql
supabase/migrations/003a_add_super_admin_enum.sql   (run first, separate transaction)
supabase/migrations/003_roles_rls_complete.sql
```

Then deploy the Edge Functions:

```bash
supabase functions deploy send-email
supabase functions deploy process-email-queue
supabase functions deploy send-push-notification
supabase functions deploy notify-on-deal-assigned
```

Set the required secrets:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set RESEND_FROM_EMAIL="CRM Pro <noreply@yourdomain.com>"
supabase secrets set VAPID_PUBLIC_KEY=Bxxxxxxxx
supabase secrets set VAPID_PRIVATE_KEY=xxxxxxxx
supabase secrets set VAPID_SUBJECT=mailto:admin@yourdomain.com
```

---

## Project Structure

```
CRM/
  src/
    app/
      core/
        guards/           authGuard, tenantGuard, roleGuard, permissionGuard, unsavedChangesGuard
        handlers/         GlobalErrorHandler
        interceptors/     auth, tenant, loading, error
        models/           permission.model, tenant.model, notification.model
        resolvers/        TenantResolver (subdomain routing)
        services/         AuthService, SupabaseService, TenantService, PermissionService,
                          NotificationService, EmailService, SecurityService, ThemeService,
                          LanguageService, InactivityService, and more
      shared/
        animations/       auth.animations (Angular Animations)
        components/       NotificationBell, ConfirmDialog, Skeleton, InactivityDialog
        directives/       PermissionDirective ([appPermission])
        pipes/            HasPermissionPipe, TimeAgoPipe
      features/
        auth/             Login, Signup, EmailSent, AuthCallback
        contacts/         List, Detail, Form, Filters
        dashboard/        KPIs, Charts, Activity Feed, Tasks
        notifications/    Notification center with filters and bulk actions
        onboarding/       Workspace creation
        pipeline/         Kanban board, Deal form, Stage color pipe
        reports/          (placeholder, ready for extension)
        settings/         Users, Pipeline config, Roles, Email templates,
                          Email logs, Notification preferences, Audit log,
                          Company profile with billing
        tasks/            Task CRUD with due-date reminders
      layout/
        shell/            Responsive sidenav container
        navbar/           Breadcrumb, notifications, theme/language toggles
        sidebar/          Permission-filtered navigation
    assets/
      i18n/               es.json, en.json (ngx-translate)
      icons/              PWA icons (replace placeholders before production)
    environments/
      environment.example.ts   Template — copy and fill in credentials
      environment.ts           Local dev (gitignored if contains real keys)
      environment.prod.ts      Production (gitignored if contains real keys)
  supabase/
    functions/            Edge Functions (Deno + TypeScript)
    migrations/           SQL migration files
  Dockerfile              Multi-stage build (node:20-alpine + nginx:alpine)
  nginx.conf              SPA routing, gzip, cache headers
  DEPLOYMENT.md           Full deployment guide
```

---

## Role System

| Role | Description | Contacts | Deals | Reports | Settings |
|---|---|---|---|---|---|
| super_admin | Platform administrator | All tenants | All tenants | Full | Full |
| admin | Workspace administrator | Full tenant | Full tenant | Full | Full |
| manager | Team manager | Team scope | Team scope | Full | Read only |
| agent | Sales agent | Own records | Own records | None | None |
| viewer | Read-only user | Read | Read | Read | None |

Permissions are enforced at two levels:
1. Frontend: `PermissionDirective` hides/disables UI elements, `roleGuard` and `permissionGuard` protect routes
2. Backend: PostgreSQL Row Level Security policies enforce the same rules at the database level

---

## Adding a New Module

1. Create the feature directory: `src/app/features/my-feature/`
2. Add a routes file: `my-feature.routes.ts`
3. Register the route in `app.routes.ts` under the shell children
4. Add a navigation item in `sidebar.component.ts` with the translation key
5. Add translation keys to `src/assets/i18n/es.json` and `en.json`
6. Add permission entries in `core/models/permission.model.ts` (PERMISSIONS_MAP)
7. Create a SQL migration with RLS policies for the new table
8. Create the service extending `BaseSupabaseService` for automatic tenant scoping

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete instructions covering:

- Supabase project setup and migrations
- Vercel deployment with GitHub Actions CI/CD
- Docker deployment with nginx
- Custom domain configuration
- SMTP setup with Resend
- VAPID key generation for push notifications
- Multi-tenant subdomain routing

---

## Available Scripts

```bash
npm start                          # Development server (http://localhost:4200)
npm run build                      # Production build
npm run build -- --configuration development   # Development build
```

---

## Security

- All database queries are scoped to the current tenant via RLS policies
- JWT tokens are managed by Supabase Auth with automatic refresh
- Client-side rate limiting blocks login after 5 failed attempts (5-minute lockout)
- Inactivity detection signs out users after 30 minutes of inactivity
- Cross-tab session synchronization via BroadcastChannel API
- Input sanitization against XSS in SecurityService
- Content Security Policy headers in index.html

---

## License

MIT License. See LICENSE file for details.
