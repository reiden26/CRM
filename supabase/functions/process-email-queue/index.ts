/**
 * process-email-queue
 * ──────────────────────────────────────────────────────────────
 * Cron job that processes pending emails from email_queue.
 * Invoked every 5 minutes via supabase/config.toml schedule.
 *
 * Flow:
 *   1. Fetch up to 50 pending items where scheduled_at <= now()
 *      and attempts < max_attempts
 *   2. For each item, call send-email (internal invoke)
 *   3. Update processed_at on success, increment attempts on failure
 */

import { handleCors, resolveCorsHeaders } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import type { EmailQueueItem } from '../_shared/types.ts';

const BATCH_SIZE = 50;

// ── Internal call to send-email function ────────────────────────────────────

async function dispatchEmail(item: EmailQueueItem): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) throw new Error('SUPABASE_URL not set');

  // Fetch template name from template_id
  const supabase = createServiceClient();
  const { data: tpl } = await supabase
    .from('email_templates')
    .select('name')
    .eq('id', item.template_id)
    .single();

  if (!tpl) {
    console.error(`Template ${item.template_id} not found for queue item ${item.id}`);
    return false;
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Service-role key so send-email can authenticate
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      // Signal to send-email that this is a retry (skip re-queuing on failure)
      'x-from-queue': 'true',
    },
    body: JSON.stringify({
      to: item.to_email,
      templateName: tpl.name,
      variables: item.variables,
      tenantId: item.tenant_id,
    }),
  });

  return res.ok;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Allow manual HTTP trigger (useful for testing) as well as cron invocation
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = resolveCorsHeaders(req);

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // ── 1. Fetch pending queue items ─────────────────────────────────────────
  // Supabase JS doesn't support column-to-column comparison directly,
  // so we use a raw filter via PostgREST syntax.
  const { data: pendingItems, error: queueError } = await supabase
    .from('email_queue')
    .select('*')
    .is('processed_at', null)
    .lte('scheduled_at', now)
    .filter('attempts', 'lt', 'max_attempts') // PostgREST column filter
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (queueError) {
    console.error('Failed to fetch email queue:', queueError.message);
    return new Response(
      JSON.stringify({ error: queueError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const queue = (pendingItems ?? []) as EmailQueueItem[];

  if (queue.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, message: 'Queue is empty' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── 2. Process each item ─────────────────────────────────────────────────
  const results = await Promise.allSettled(
    queue.map(async (item) => {
      const success = await dispatchEmail(item);

      if (success) {
        // Mark as processed
        await supabase
          .from('email_queue')
          .update({
            processed_at: new Date().toISOString(),
            attempts: item.attempts + 1,
          })
          .eq('id', item.id);
      } else {
        const nextAttempt = item.attempts + 1;
        const backoffMinutes = Math.pow(2, nextAttempt); // exponential: 2, 4, 8 min

        await supabase
          .from('email_queue')
          .update({
            attempts: nextAttempt,
            // Reschedule with exponential backoff
            scheduled_at: new Date(
              Date.now() + backoffMinutes * 60 * 1000,
            ).toISOString(),
          })
          .eq('id', item.id);
      }

      return { id: item.id, success };
    }),
  );

  const succeeded = results.filter(
    (r) => r.status === 'fulfilled' && r.value.success,
  ).length;
  const failed = results.length - succeeded;

  console.log(`Email queue processed: ${succeeded} sent, ${failed} failed`);

  return new Response(
    JSON.stringify({ processed: results.length, succeeded, failed }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
