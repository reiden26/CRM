/**
 * send-email
 * ──────────────────────────────────────────────────────────────
 * Sends a transactional email using Resend API.
 *
 * Request body:
 *   { to, templateName, variables, tenantId }
 *
 * Secrets required (supabase secrets set):
 *   RESEND_API_KEY
 *   RESEND_FROM_EMAIL   (e.g. "CRM <noreply@yourdomain.com>")
 */

import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import type { SendEmailPayload, EmailTemplate, EmailLog } from '../_shared/types.ts';

// ── Template variable interpolation ─────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ── Resend API call ──────────────────────────────────────────────────────────

interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
}

async function sendViaResend(payload: ResendPayload): Promise<{ id: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY secret is not set');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error ${res.status}: ${err}`);
  }

  return res.json();
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createServiceClient();
  const fromEmail =
    Deno.env.get('RESEND_FROM_EMAIL') ?? 'CRM <noreply@example.com>';

  let payload: SendEmailPayload;

  try {
    payload = await req.json() as SendEmailPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { to, templateName, variables, tenantId } = payload;

  if (!to || !templateName || !tenantId) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: to, templateName, tenantId' }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── 1. Fetch template ────────────────────────────────────────────────────
  const { data: template, error: tplError } = await supabase
    .from('email_templates')
    .select('id, tenant_id, name, subject, html_body, variables, type')
    .eq('tenant_id', tenantId)
    .eq('name', templateName)
    .eq('is_active', true)
    .single<EmailTemplate>();

  if (tplError || !template) {
    return new Response(
      JSON.stringify({ error: `Template "${templateName}" not found for tenant ${tenantId}` }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── 2. Interpolate subject & body ────────────────────────────────────────
  const subject = interpolate(template.subject, variables ?? {});
  const htmlBody = interpolate(template.html_body, variables ?? {});

  // ── 3. Send via Resend ───────────────────────────────────────────────────
  const logEntry: Omit<EmailLog, 'id'> = {
    tenant_id: tenantId,
    to_email: to,
    subject,
    template_id: template.id,
    status: 'pending',
    metadata: { templateName, variables },
  };

  let resendId: string | null = null;
  let sendError: string | null = null;

  try {
    const result = await sendViaResend({
      from: fromEmail,
      to: [to],
      subject,
      html: htmlBody,
    });
    resendId = result.id;
    logEntry.status = 'sent';
    logEntry.sent_at = new Date().toISOString();
    logEntry.metadata = { ...logEntry.metadata as object, resendId };
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
    logEntry.status = 'failed';
    logEntry.error_message = sendError;
  }

  // ── 4. Write to email_logs ───────────────────────────────────────────────
  const { error: logError } = await supabase
    .from('email_logs')
    .insert(logEntry);

  if (logError) {
    console.error('Failed to write email_log:', logError.message);
  }

  // ── 5. On failure: enqueue for retry if not already from queue ───────────
  if (sendError) {
    const isRetry = req.headers.get('x-from-queue') === 'true';

    if (!isRetry) {
      await supabase.from('email_queue').insert({
        tenant_id: tenantId,
        to_email: to,
        template_id: template.id,
        variables: variables ?? {},
        scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // retry in 5 min
        attempts: 1,
        max_attempts: 3,
      });
    }

    return new Response(
      JSON.stringify({ error: sendError }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ success: true, resendId }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
