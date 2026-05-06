# CRM Pro — Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Supabase Setup](#supabase-setup)
3. [Environment Variables](#environment-variables)
4. [Deploy to Vercel](#deploy-to-vercel)
5. [Deploy with Docker](#deploy-with-docker)
6. [Custom Domain](#custom-domain)
7. [Email (Resend)](#email-resend)
8. [Push Notifications (VAPID)](#push-notifications-vapid)
9. [Multi-tenant Subdomain Routing](#multi-tenant-subdomain-routing)

---

## Prerequisites

- Node.js 20+
- npm 10+
- Supabase account (free tier works for development)
- Vercel account (for Vercel deploy) OR Docker + any VPS

---

## Supabase Setup

### 1. Create a new Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Note your **Project URL** and **anon key** from Settings → API

### 2. Run migrations

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Run all migrations in order
supabase db push
```

Or run them manually in the SQL Editor:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_multitenancy_email_notifications.sql`
3. `supabase/migrations/003_roles_rls_complete.sql`

### 3. Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy send-email
supabase functions deploy process-email-queue
supabase functions deploy send-push-notification
supabase functions deploy notify-on-deal-assigned

# Set secrets
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set RESEND_FROM_EMAIL="CRM Pro <noreply@yourdomain.com>"
supabase secrets set VAPID_PUBLIC_KEY=Bxxxxxxxxxxxxxxxx
supabase secrets set VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxx
supabase secrets set VAPID_SUBJECT=mailto:admin@yourdomain.com
```

### 4. Configure Database Webhook (notify-on-deal-assigned)

In Supabase Dashboard → Database → Webhooks:
- **Name**: `on-deal-assigned`
- **Table**: `deals`
- **Events**: INSERT, UPDATE
- **URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-on-deal-assigned`
- **HTTP Headers**: `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`

### 5. Enable pg_cron (for email queue processing)

In SQL Editor:
```sql
-- Enable pg_cron extension (already available on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule email queue processing every 5 minutes
SELECT cron.schedule(
  'process-email-queue',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url    := current_setting('app.supabase_url') || '/functions/v1/process-email-queue',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
```

### 6. Configure Supabase Auth

In Dashboard → Authentication → Settings:
- **Site URL**: `https://yourdomain.com`
- **Redirect URLs**: `https://yourdomain.com/auth/callback`
- Enable **Email confirmations** (recommended for production)
- Set **JWT expiry**: 3600 (1 hour)

---

## Environment Variables

### Required

| Variable | Description | Example |
|---|---|---|
| `SUPABASE_URL` | Your Supabase project URL | `https://abc123.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key | `eyJhbGci...` |
| `VAPID_PUBLIC_KEY` | VAPID public key for push notifications | `Bxxxxxxxx...` |

### Optional

| Variable | Description | Default |
|---|---|---|
| `ENVIRONMENT` | Environment name | `production` |
| `APP_VERSION` | App version (injected by CI) | `1.0.0` |

### Setting variables in `src/environments/environment.prod.ts`

```typescript
export const environment = {
  production: true,
  supabase: {
    url:      window.__env?.SUPABASE_URL      ?? 'YOUR_SUPABASE_URL',
    anonKey:  window.__env?.SUPABASE_ANON_KEY ?? 'YOUR_SUPABASE_ANON_KEY',
  },
  vapid: {
    publicKey: window.__env?.VAPID_PUBLIC_KEY ?? 'YOUR_VAPID_PUBLIC_KEY',
  },
};
```

---

## Deploy to Vercel

### Automatic (GitHub Actions)

1. Fork/push this repo to GitHub
2. Connect to Vercel: [vercel.com/new](https://vercel.com/new)
3. Set environment variables in Vercel Dashboard → Settings → Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `VAPID_PUBLIC_KEY`
4. Add GitHub secrets for CI/CD:
   - `VERCEL_TOKEN` (from vercel.com/account/tokens)
   - `VERCEL_ORG_ID` (from `.vercel/project.json` after first deploy)
   - `VERCEL_PROJECT_ID` (from `.vercel/project.json`)

### Manual

```bash
npm install -g vercel
cd CRM
vercel --prod
```

---

## Deploy with Docker

### Build and run locally

```bash
cd CRM

# Build image
docker build -t crm-pro .

# Run with environment variables
docker run -p 8080:80 \
  -e SUPABASE_URL=https://abc123.supabase.co \
  -e SUPABASE_ANON_KEY=eyJhbGci... \
  -e VAPID_PUBLIC_KEY=Bxxxxxxxx \
  crm-pro
```

### Docker Compose

```yaml
version: '3.8'
services:
  crm:
    image: ghcr.io/YOUR_ORG/crm:latest
    ports:
      - "80:80"
    environment:
      SUPABASE_URL:      ${SUPABASE_URL}
      SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}
      VAPID_PUBLIC_KEY:  ${VAPID_PUBLIC_KEY}
    restart: unless-stopped
```

---

## Custom Domain

### Vercel
1. Dashboard → Project → Settings → Domains
2. Add your domain and follow DNS instructions

### Docker + nginx
1. Point your domain's A record to your server IP
2. Install Certbot: `apt install certbot python3-certbot-nginx`
3. Get SSL: `certbot --nginx -d yourdomain.com`

---

## Email (Resend)

1. Create account at [resend.com](https://resend.com)
2. Add and verify your sending domain
3. Create an API key
4. Set in Supabase secrets:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
   supabase secrets set RESEND_FROM_EMAIL="CRM Pro <noreply@yourdomain.com>"
   ```
5. Create email templates in Settings → Email Templates

---

## Push Notifications (VAPID)

### Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

Output:
```
Public Key:  Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Private Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Set in Supabase secrets

```bash
supabase secrets set VAPID_PUBLIC_KEY=Bxxxxxxxx...
supabase secrets set VAPID_PRIVATE_KEY=xxxxxxxx...
supabase secrets set VAPID_SUBJECT=mailto:admin@yourdomain.com
```

### Set in Angular environment

```typescript
// src/environments/environment.prod.ts
vapid: {
  publicKey: 'Bxxxxxxxx...'  // Same as VAPID_PUBLIC_KEY
}
```

---

## Multi-tenant Subdomain Routing

### DNS Configuration

Add a wildcard DNS record:
```
*.yourdomain.com  →  A  →  YOUR_SERVER_IP
```

### nginx Configuration (for Docker)

The included `nginx.conf` already handles SPA routing. For subdomain support, update it:

```nginx
server {
    listen 80;
    server_name ~^(?<tenant>[^.]+)\.yourdomain\.com$;
    # ... rest of config
}
```

### Vercel Configuration

Add to `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The `TenantResolver` in `src/app/core/resolvers/tenant.resolver.ts` automatically reads the subdomain from `window.location.hostname` and loads the corresponding tenant.

### Local Development with Subdomains

Add to `/etc/hosts` (Linux/Mac) or `C:\Windows\System32\drivers\etc\hosts` (Windows):
```
127.0.0.1  acme.localhost
127.0.0.1  beta.localhost
```

Then access: `http://acme.localhost:4200`

---

## Role Structure

| Role | Description | Access |
|---|---|---|
| `super_admin` | Platform administrator | All tenants, all data |
| `admin` | Workspace administrator | Full access within tenant |
| `manager` | Team manager | Team's records + reports |
| `agent` | Sales agent | Own records only |
| `viewer` | Read-only user | Read access to own tenant |

---

## Adding a New Module

1. Create feature directory: `src/app/features/my-feature/`
2. Add routes file: `my-feature.routes.ts`
3. Register in `app.routes.ts` under the shell children
4. Add nav item in `sidebar.component.ts`
5. Add permission entries in `permission.model.ts` → `PERMISSIONS_MAP`
6. Add RLS policies in a new migration file
7. Create the service extending `BaseSupabaseService`

---

## Troubleshooting

### "Missing SUPABASE_URL" error
Ensure `env-config.js` is being served and the Docker entrypoint ran correctly.

### Push notifications not working
- Verify VAPID keys match between frontend and Edge Function
- Check browser console for SW registration errors
- Ensure HTTPS is configured (push requires HTTPS)

### RLS policy errors
- Check that `tenant_id` is set on all records
- Verify the user's `profiles.tenant_id` matches the data's `tenant_id`
- Run `SELECT * FROM role_permissions_reference` to verify permissions

### Email not sending
- Check Supabase Edge Function logs: Dashboard → Edge Functions → Logs
- Verify `RESEND_API_KEY` secret is set
- Check `email_logs` table for error messages
