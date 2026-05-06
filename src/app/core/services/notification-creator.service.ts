import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

// ─────────────────────────────────────────────────────────────────────────────
// NotificationCreatorService
//
// Creates in-app notifications in the `notifications` table.
// The Supabase Realtime subscription in NotificationService picks these up
// automatically and shows them in the bell panel.
//
// All methods are fire-and-forget — errors are logged but never thrown.
// ─────────────────────────────────────────────────────────────────────────────

type NotifType = 'info' | 'success' | 'warning' | 'danger';

interface CreateNotifPayload {
  userId:       string;
  tenantId:     string;
  title:        string;
  body?:        string;
  type?:        NotifType;
  resourceType?: string;
  resourceId?:   string;
}

@Injectable({ providedIn: 'root' })
export class NotificationCreatorService {

  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);

  // ── Core method ───────────────────────────────────────────────────────────

  async create(payload: CreateNotifPayload): Promise<void> {
    const { error } = await this.supabase.client
      .from('notifications')
      .insert({
        tenant_id:     payload.tenantId,
        user_id:       payload.userId,
        title:         payload.title,
        body:          payload.body ?? null,
        type:          payload.type ?? 'info',
        resource_type: payload.resourceType ?? null,
        resource_id:   payload.resourceId ?? null,
      });

    if (error) {
      console.error('[NotificationCreatorService] create error:', error.message);
    }
  }

  // ── Domain helpers ────────────────────────────────────────────────────────

  /** Notify a user that a deal was assigned to them. */
  notifyDealAssigned(
    assignedToUserId: string,
    tenantId: string,
    dealTitle: string,
    dealId: string,
  ): void {
    void this.create({
      userId:       assignedToUserId,
      tenantId,
      title:        'New deal assigned to you',
      body:         `Deal "${dealTitle}" has been assigned to you.`,
      type:         'info',
      resourceType: 'deal',
      resourceId:   dealId,
    });
  }

  /** Notify a user that a deal was won. */
  notifyDealWon(
    assignedToUserId: string,
    tenantId: string,
    dealTitle: string,
    dealId: string,
  ): void {
    void this.create({
      userId:       assignedToUserId,
      tenantId,
      title:        '🎉 Deal won!',
      body:         `Congratulations! "${dealTitle}" has been marked as won.`,
      type:         'success',
      resourceType: 'deal',
      resourceId:   dealId,
    });
  }

  /** Notify a user that a task was assigned to them. */
  notifyTaskAssigned(
    assignedToUserId: string,
    tenantId: string,
    taskTitle: string,
    activityId: string,
  ): void {
    void this.create({
      userId:       assignedToUserId,
      tenantId,
      title:        'New task assigned to you',
      body:         `Task "${taskTitle}" has been assigned to you.`,
      type:         'info',
      resourceType: 'task',
      resourceId:   activityId,
    });
  }

  /** Notify a user that a task is due soon (< 24h). */
  notifyTaskDueSoon(
    assignedToUserId: string,
    tenantId: string,
    taskTitle: string,
    activityId: string,
    hoursLeft: number,
  ): void {
    void this.create({
      userId:       assignedToUserId,
      tenantId,
      title:        `Task due in ${hoursLeft}h`,
      body:         `"${taskTitle}" is due soon. Don't forget to complete it.`,
      type:         hoursLeft <= 2 ? 'danger' : 'warning',
      resourceType: 'task',
      resourceId:   activityId,
    });
  }

  /** Notify a user that a contact was assigned to them. */
  notifyContactAssigned(
    assignedToUserId: string,
    tenantId: string,
    contactName: string,
    contactId: string,
  ): void {
    void this.create({
      userId:       assignedToUserId,
      tenantId,
      title:        'Contact assigned to you',
      body:         `${contactName} has been assigned to you.`,
      type:         'info',
      resourceType: 'contact',
      resourceId:   contactId,
    });
  }

  /**
   * Scans a note body for @mentions (e.g. "@john.doe") and notifies
   * each mentioned user if they exist in the tenant.
   */
  async notifyMentions(
    noteBody: string,
    tenantId: string,
    authorName: string,
    resourceType: string,
    resourceId: string,
  ): Promise<void> {
    // Extract @mentions — match @word.word or @word
    const mentions = [...new Set(
      (noteBody.match(/@([\w.]+)/g) ?? []).map(m => m.slice(1).toLowerCase()),
    )];

    if (!mentions.length) return;

    // Look up users by full_name fragment (case-insensitive)
    for (const mention of mentions) {
      const { data } = await this.supabase.client
        .from('profiles')
        .select('id, full_name')
        .eq('tenant_id', tenantId)
        .ilike('full_name', `%${mention.replace('.', ' ')}%`)
        .limit(1);

      const user = data?.[0] as { id: string; full_name: string } | undefined;
      if (!user) continue;

      void this.create({
        userId:       user.id,
        tenantId,
        title:        `${authorName} mentioned you`,
        body:         noteBody.slice(0, 120) + (noteBody.length > 120 ? '…' : ''),
        type:         'info',
        resourceType,
        resourceId,
      });
    }
  }
}
