// ── Shared domain types used across Edge Functions ──────────────────────────

export interface EmailTemplate {
  id: string;
  tenant_id: string;
  name: string;
  subject: string;
  html_body: string;
  variables: string[];
  type: string;
}

export interface EmailLog {
  id?: string;
  tenant_id: string;
  to_email: string;
  subject: string;
  template_id: string | null;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  sent_at?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown>;
}

export interface EmailQueueItem {
  id: string;
  tenant_id: string;
  to_email: string;
  template_id: string;
  variables: Record<string, string>;
  scheduled_at: string;
  processed_at: string | null;
  attempts: number;
  max_attempts: number;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  tenant_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface NotificationPreferences {
  user_id: string;
  tenant_id: string;
  email_on_deal_assigned: boolean;
  email_on_task_due: boolean;
  email_on_mention: boolean;
  push_on_deal_assigned: boolean;
  push_on_task_due: boolean;
  push_on_mention: boolean;
}

export interface SendEmailPayload {
  to: string;
  templateName: string;
  variables: Record<string, string>;
  tenantId?: string;
}

export interface SendPushPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface DealAssignedPayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  record: {
    id: string;
    title: string;
    assigned_to: string;
    tenant_id: string;
    created_by: string;
  };
  old_record?: {
    assigned_to: string | null;
  };
}
