// ─────────────────────────────────────────────────────────────────────────────
// Notification domain models
// Mirror the notifications, push_subscriptions and notification_preferences
// tables from migration 002.
// ─────────────────────────────────────────────────────────────────────────────

// ── In-app notification ───────────────────────────────────────────────────────

export type InAppNotificationType = 'info' | 'success' | 'warning' | 'danger';

export interface InAppNotification {
  id:           string;
  tenantId:     string;
  userId:       string;
  title:        string;
  body:         string | null;
  type:         InAppNotificationType;
  resourceType: string | null;   // 'deal' | 'contact' | 'task' | …
  resourceId:   string | null;   // UUID of the related record
  isRead:       boolean;
  readAt:       string | null;
  createdAt:    string;
}

// Raw DB row (snake_case)
export interface InAppNotificationRow {
  id:            string;
  tenant_id:     string;
  user_id:       string;
  title:         string;
  body:          string | null;
  type:          InAppNotificationType;
  resource_type: string | null;
  resource_id:   string | null;
  is_read:       boolean;
  read_at:       string | null;
  created_at:    string;
}

export function mapNotificationRow(row: InAppNotificationRow): InAppNotification {
  return {
    id:           row.id,
    tenantId:     row.tenant_id,
    userId:       row.user_id,
    title:        row.title,
    body:         row.body,
    type:         row.type,
    resourceType: row.resource_type,
    resourceId:   row.resource_id,
    isRead:       row.is_read,
    readAt:       row.read_at,
    createdAt:    row.created_at,
  };
}

// ── Push subscription ─────────────────────────────────────────────────────────

export interface PushSubscriptionRecord {
  id:        string;
  userId:    string;
  tenantId:  string;
  endpoint:  string;
  p256dh:    string;
  auth:      string;
  userAgent: string | null;
  createdAt: string;
}

// ── Notification preferences ──────────────────────────────────────────────────

export interface NotificationPreferences {
  userId:               string;
  tenantId:             string;
  emailOnDealAssigned:  boolean;
  emailOnTaskDue:       boolean;
  emailOnMention:       boolean;
  pushOnDealAssigned:   boolean;
  pushOnTaskDue:        boolean;
  pushOnMention:        boolean;
  updatedAt:            string;
}

export interface NotificationPreferencesRow {
  user_id:                string;
  tenant_id:              string;
  email_on_deal_assigned: boolean;
  email_on_task_due:      boolean;
  email_on_mention:       boolean;
  push_on_deal_assigned:  boolean;
  push_on_task_due:       boolean;
  push_on_mention:        boolean;
  updated_at:             string;
}

export function mapPreferencesRow(row: NotificationPreferencesRow): NotificationPreferences {
  return {
    userId:              row.user_id,
    tenantId:            row.tenant_id,
    emailOnDealAssigned: row.email_on_deal_assigned,
    emailOnTaskDue:      row.email_on_task_due,
    emailOnMention:      row.email_on_mention,
    pushOnDealAssigned:  row.push_on_deal_assigned,
    pushOnTaskDue:       row.push_on_task_due,
    pushOnMention:       row.push_on_mention,
    updatedAt:           row.updated_at,
  };
}

export const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'userId' | 'tenantId' | 'updatedAt'> = {
  emailOnDealAssigned: true,
  emailOnTaskDue:      true,
  emailOnMention:      true,
  pushOnDealAssigned:  true,
  pushOnTaskDue:       true,
  pushOnMention:       true,
};

// ── Toast notification (UI-only, not persisted) ───────────────────────────────
// Used by the existing NotificationService for ephemeral toasts.

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id:       string;
  message:  string;
  type:     ToastType;
  duration: number;
}
