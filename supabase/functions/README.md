# CRM Edge Functions

## Functions overview

| Function | Trigger | Description |
|---|---|---|
| `send-email` | HTTP POST | Sends transactional email via Resend API |
| `process-email-queue` | Cron (5 min) | Processes pending emails from `email_queue` |
| `send-push-notification` | HTTP POST | Sends Web Push to user's subscriptions |
| `notify-on-deal-assigned` | DB Webhook | Notifies user when a deal is assigned |

## Required secrets

Set these via the Supabase Dashboard (Project Settings → Edge Functions → Secrets)
or with the CLI:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set RESEND_FROM_EMAIL="CRM <noreply@yourdomain.com>"
supabase secrets set VAPID_PUBLIC_KEY=Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set VAPID_SUBJECT=mailto:admin@yourdomain.com
```

Generate VAPID keys with:
```bash
npx web-push generate-vapid-keys
```

## Local development

```bash
# Start Supabase locally
supabase start

# Serve all functions with hot reload
supabase functions serve --env-file .env.local

# Invoke a function manually
supabase functions invoke send-email --body '{"to":"test@example.com","templateName":"welcome","variables":{"name":"John"},"tenantId":"<uuid>"}'

# Trigger the email queue processor manually
supabase functions invoke process-email-queue
```

## Database webhook setup (notify-on-deal-assigned)

In the Supabase Dashboard:
1. Go to **Database → Webhooks**
2. Create a new webhook:
   - **Name**: `on-deal-assigned`
   - **Table**: `deals`
   - **Events**: `INSERT`, `UPDATE`
   - **URL**: `https://<project-ref>.supabase.co/functions/v1/notify-on-deal-assigned`
   - **HTTP Headers**: `Authorization: Bearer <service-role-key>`

## Cron job (process-email-queue)

The cron job is configured in `config.toml` and uses `pg_cron` + `pg_net`.
On Supabase Cloud, both extensions are available by default.

To verify it's running:
```sql
select * from cron.job_run_details order by start_time desc limit 10;
```
