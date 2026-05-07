import {
  Injectable,
  inject,
  signal,
  computed,
  OnDestroy,
} from '@angular/core';
import { MatSnackBar, MatSnackBarRef, TextOnlySnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import {
  InAppNotification,
  InAppNotificationRow,
  mapNotificationRow,
  Toast,
  ToastType,
} from '../models/notification.model';

// ─────────────────────────────────────────────────────────────────────────────
// NotificationService
//
// Manages two distinct concerns:
//
//   1. In-app notifications (persisted in Supabase `notifications` table)
//      - Loaded on demand, updated via Realtime
//      - Displayed as MatSnackBar toasts when received live
//
//   2. Ephemeral UI toasts (not persisted)
//      - success(), error(), warning(), info() helpers
//      - Used throughout the app for operation feedback
// ─────────────────────────────────────────────────────────────────────────────

const MAX_NOTIFICATIONS = 50;

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly supabase  = inject(SupabaseService);
  private readonly auth      = inject(AuthService);
  private readonly snackBar  = inject(MatSnackBar);
  private readonly router    = inject(Router);

  // ── In-app notifications state ───────────────────────────────────────────────
  private readonly _notifications = signal<InAppNotification[]>([]);
  private readonly _loading       = signal<boolean>(false);

  /** All loaded in-app notifications, newest first. */
  readonly notifications$ = this._notifications.asReadonly();

  /** Count of unread in-app notifications. */
  readonly unreadCount$ = computed(
    () => this._notifications().filter(n => !n.isRead).length,
  );

  /** True while notifications are being fetched. */
  readonly loading$ = this._loading.asReadonly();

  // ── Ephemeral toasts state ───────────────────────────────────────────────────
  private readonly _toasts = signal<Toast[]>([]);

  /** Active UI toasts (for a custom toast component if needed). */
  readonly toasts$ = this._toasts.asReadonly();

  // ── Realtime channel ─────────────────────────────────────────────────────────
  private _realtimeChannel: RealtimeChannel | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this._unsubscribeRealtime();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // IN-APP NOTIFICATIONS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Loads the latest 50 notifications for the current user from Supabase.
   * Replaces the current signal value.
   */
  async loadNotifications(): Promise<void> {
    const userId   = this.auth.session()?.user.id;
    const tenantId = this.auth.profile()?.tenantId;
    if (!userId || !tenantId) return;

    this._loading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('notifications')
        .select('id, tenant_id, user_id, title, body, type, resource_type, resource_id, is_read, read_at, created_at')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(MAX_NOTIFICATIONS)
        .returns<InAppNotificationRow[]>();

      if (error) {
        console.error('[NotificationService] loadNotifications:', error.message);
        return;
      }

      this._notifications.set((data ?? []).map(mapNotificationRow));
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Subscribes to the Supabase Realtime channel for the current user's
   * notifications. Inserts new notifications at the top of the list and
   * shows a MatSnackBar toast.
   *
   * Call this once after the user is authenticated.
   * Safe to call multiple times — unsubscribes the previous channel first.
   */
  subscribeToRealtime(): void {
    const userId   = this.auth.session()?.user.id;
    const tenantId = this.auth.profile()?.tenantId;
    if (!userId || !tenantId) return;

    // Prevent duplicate subscriptions
    this._unsubscribeRealtime();

    this._realtimeChannel = this.supabase.client
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as InAppNotificationRow;
          const notification = mapNotificationRow(row);

          // Prepend to the list (newest first), cap at MAX_NOTIFICATIONS
          this._notifications.update(current =>
            [notification, ...current].slice(0, MAX_NOTIFICATIONS),
          );

          // Show a snackbar toast with a "View" action
          this._showRealtimeToast(notification);
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = mapNotificationRow(payload.new as InAppNotificationRow);
          this._notifications.update(current =>
            current.map(n => n.id === updated.id ? updated : n),
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'DELETE',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          this._notifications.update(current =>
            current.filter(n => n.id !== deletedId),
          );
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') return;
      });
  }

  /** Unsubscribes from the Realtime channel. */
  unsubscribeFromRealtime(): void {
    this._unsubscribeRealtime();
  }

  /**
   * Marks a single notification as read.
   * Updates the local signal optimistically before the DB call.
   */
  async markAsRead(notificationId: string): Promise<void> {
    // Optimistic update
    this._notifications.update(current =>
      current.map(n =>
        n.id === notificationId
          ? { ...n, isRead: true, readAt: new Date().toISOString() }
          : n,
      ),
    );

    const { error } = await this.supabase.client
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (error) {
      console.error('[NotificationService] markAsRead:', error.message);
      // Revert optimistic update on failure
      await this.loadNotifications();
    }
  }

  /**
   * Marks all unread notifications as read using the DB function.
   */
  async markAllAsRead(): Promise<void> {
    const userId = this.auth.session()?.user.id;
    if (!userId) return;

    // Optimistic update
    const now = new Date().toISOString();
    this._notifications.update(current =>
      current.map(n => ({ ...n, isRead: true, readAt: now })),
    );

    const { error } = await this.supabase.client
      .rpc('mark_notifications_read', {
        p_user_id:          userId,
        p_notification_ids: null, // null = mark all
      });

    if (error) {
      console.error('[NotificationService] markAllAsRead:', error.message);
      await this.loadNotifications();
    }
  }

  /**
   * Deletes a notification from Supabase and removes it from the local signal.
   */
  async deleteNotification(id: string): Promise<void> {
    // Optimistic removal
    this._notifications.update(current => current.filter(n => n.id !== id));

    const { error } = await this.supabase.client
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[NotificationService] deleteNotification:', error.message);
      await this.loadNotifications();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // EPHEMERAL UI TOASTS
  // ══════════════════════════════════════════════════════════════════════════════

  /** Shows a success snackbar. */
  success(message: string, duration = 4000): void {
    this._openSnackBar(message, 'success', duration);
  }

  /** Shows an error snackbar (longer duration). */
  error(message: string, duration = 6000): void {
    this._openSnackBar(message, 'error', duration);
  }

  /** Shows a warning snackbar. */
  warning(message: string, duration = 5000): void {
    this._openSnackBar(message, 'warning', duration);
  }

  /** Shows an info snackbar. */
  info(message: string, duration = 4000): void {
    this._openSnackBar(message, 'info', duration);
  }

  /** Shows a generic message (alias for info). */
  show(message: string, type: ToastType = 'info', duration = 4000): void {
    this._openSnackBar(message, type, duration);
  }

  /** Dismisses all open snackbars. */
  dismissAll(): void {
    this.snackBar.dismiss();
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _openSnackBar(
    message: string,
    type: ToastType,
    duration: number,
  ): MatSnackBarRef<TextOnlySnackBar> {
    return this.snackBar.open(message, 'Cerrar', {
      duration,
      panelClass: [`snack-${type}`],
      horizontalPosition: 'right',
      verticalPosition:   'bottom',
    });
  }

  /**
   * Shows a snackbar for a live Realtime notification with a "View" action
   * that navigates to the related resource.
   */
  private _showRealtimeToast(notification: InAppNotification): void {
    const ref = this.snackBar.open(
      notification.title,
      'Ver',
      {
        duration:           6000,
        panelClass:         [`snack-${notification.type}`, 'snack-realtime'],
        horizontalPosition: 'right',
        verticalPosition:   'bottom',
      },
    );

    ref.onAction().subscribe(() => {
      const url = this._buildResourceUrl(notification);
      if (url) this.router.navigateByUrl(url);
    });
  }

  /** Builds a navigation URL from a notification's resource type + id. */
  private _buildResourceUrl(notification: InAppNotification): string | null {
    const { resourceType, resourceId } = notification;
    if (!resourceType || !resourceId) return null;

    const routeMap: Record<string, string> = {
      deal:    `/pipeline`,
      contact: `/contacts/${resourceId}`,
      task:    `/tasks`,
    };

    return routeMap[resourceType] ?? null;
  }

  private _unsubscribeRealtime(): void {
    if (this._realtimeChannel) {
      this.supabase.client.removeChannel(this._realtimeChannel);
      this._realtimeChannel = null;
    }
  }
}
