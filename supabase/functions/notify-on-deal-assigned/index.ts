/**
 * notify-on-deal-assigned
 * ──────────────────────────────────────────────────────────────
 * Database webhook triggered on INSERT or UPDATE of the deals table
 * when assigned_to changes.
 *
 * Configured in Supabase Dashboard:
 *   Database → Webhooks → deals → INSERT + UPDATE
 *   URL: <project-url>/functions/v1/notify-on-deal-assigned
 *
 * Actions performed:
 *   1. Creates an in-app notification in the notifications table
 *   2. If push_on_deal_assigned = true  → calls send-push-notification
 *   3. If email_on_deal_assigned = true → enqueues in email_queue
 */

import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import type {
  DealAssignedPayload,
  NotificationPreferences,
} from '../_shared/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ── Internal function invoker ────────────────────────────────────────────────

async function invokeFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Function ${name} returned ${res.status}: ${text}`);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  let webhookPayload: DealAssignedPayload;
  try {
    webhookPayload = await req.json() as DealAssignedPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { type, record, old_record } = webhookPayload;

  // ── Guard: only act when assigned_to actually changed ───────────────────
  const assignedTo = record.assigned_to;

  if (!assignedTo) {
    return new Response(
      JSON.stringify({ skipped: 'No assigned_to on record' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // On UPDATE, skip if assigned_to didn't change
  if (type === 'UPDATE' && old_record?.assigned_to === assignedTo) {
    return new Response(
      JSON.stringify({ skipped: 'assigned_to unchanged' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Don't notify if the creator assigned it to themselves
  if (record.created_by === assignedTo && type === 'INSERT') {
    return new Response(
      JSON.stringify({ skipped: 'Self-assignment on insert' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createServiceClient();
  const tenantId = record.tenant_id;

  // ── 1. Fetch assignee profile ────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', assignedTo)
    .single();

  const assigneeName: string = profile?.full_name ?? 'A team member';

  // ── 2. Create in-app notification ────────────────────────────────────────
  const { error: notifError } = await supabase
    .from('notifications')
    .insert({
      tenant_id: tenantId,
      user_id: assignedTo,
      title: 'New deal assigned to you',
      body: `Deal "${record.title}" has been assigned to you.`,
      type: 'info',
      resource_type: 'deal',
      resource_id: record.id,
    });

  if (notifError) {
    console.error('Failed to create notification:', notifError.message);
  }

  // ── 3. Fetch notification preferences ────────────────────────────────────
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select(
      'push_on_deal_assigned, email_on_deal_assigned',
    )
    .eq('user_id', assignedTo)
    .eq('tenant_id', tenantId)
    .single<Pick<NotificationPreferences, 'push_on_deal_assigned' | 'email_on_deal_assigned'>>();

  // Default to true if no preferences row exists yet
  const pushEnabled = prefs?.push_on_deal_assigned ?? true;
  const emailEnabled = prefs?.email_on_deal_assigned ?? true;

  // ── 4. Send push notification ─────────────────────────────────────────────
  if (pushEnabled) {
    await invokeFunction('send-push-notification', {
      userId: assignedTo,
      title: 'New deal assigned to you',
      body: `Deal "${record.title}" has been assigned to you.`,
      data: {
        resourceType: 'deal',
        resourceId: record.id,
        tenantId,
      },
    });
  }

  // ── 5. Enqueue email notification ─────────────────────────────────────────
  if (emailEnabled) {
    // Fetch assignee email from auth.users via profiles join
    const { data: userEmail } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', assignedTo)
      .single();

    // Get email from auth admin API
    const { data: authUser } = await supabase.auth.admin.getUserById(assignedTo);
    const toEmail = authUser?.user?.email;

    if (toEmail) {
      // Fetch the deal_assigned template id
      const { data: template } = await supabase
        .from('email_templates')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('type', 'deal_won')  // use deal_assigned type if you add it
        .eq('is_active', true)
        .limit(1)
        .single();

      if (template) {
        await supabase.from('email_queue').insert({
          tenant_id: tenantId,
          to_email: toEmail,
          template_id: template.id,
          variables: {
            assignee_name: assigneeName,
            deal_title: record.title,
            deal_id: record.id,
          },
          scheduled_at: new Date().toISOString(),
          attempts: 0,
          max_attempts: 3,
        });
      } else {
        // Fallback: call send-email directly with a custom template name
        await invokeFunction('send-email', {
          to: toEmail,
          templateName: 'deal_assigned',
          variables: {
            assignee_name: assigneeName,
            deal_title: record.title,
            deal_id: record.id,
          },
          tenantId,
        });
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      dealId: record.id,
      assignedTo,
      notificationCreated: !notifError,
      pushSent: pushEnabled,
      emailQueued: emailEnabled,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
