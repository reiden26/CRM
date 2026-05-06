import {
  Injectable,
  inject,
  signal,
  OnDestroy,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

// ─────────────────────────────────────────────────────────────────────────────
// PushNotificationService
//
// Manages Web Push subscriptions using the browser's Push API + VAPID.
// Stores subscriptions in the Supabase `push_subscriptions` table.
// ─────────────────────────────────────────────────────────────────────────────

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

@Injectable({ providedIn: 'root' })
export class PushNotificationService implements OnDestroy {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);

  // ── State ────────────────────────────────────────────────────────────────────
  private readonly _isSubscribed  = signal<boolean>(false);
  private readonly _permission    = signal<PushPermissionState>('default');
  private readonly _swRegistration = signal<ServiceWorkerRegistration | null>(null);

  /** True when the user has an active push subscription. */
  readonly isSubscribed$ = this._isSubscribed.asReadonly();

  /** Current browser push permission state. */
  readonly permission$ = this._permission.asReadonly();

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  constructor() {
    this._initPermissionState();
  }

  ngOnDestroy(): void {}

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Returns the current push permission state without prompting the user.
   */
  checkPermission(): PushPermissionState {
    if (!this._isPushSupported()) return 'unsupported';
    const state = Notification.permission as PushPermissionState;
    this._permission.set(state);
    return state;
  }

  /**
   * Requests push notification permission from the browser.
   * Shows a pre-prompt dialog explaining why push notifications are useful
   * before calling the native browser API.
   *
   * Returns the resulting permission state.
   */
  async requestPermission(): Promise<PushPermissionState> {
    if (!this._isPushSupported()) {
      this._permission.set('unsupported');
      return 'unsupported';
    }

    if (Notification.permission === 'granted') {
      this._permission.set('granted');
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      this._permission.set('denied');
      return 'denied';
    }

    // Show a pre-prompt dialog before the native browser dialog
    const confirmed = await this._showPrePromptDialog();
    if (!confirmed) return 'default';

    const result = await Notification.requestPermission();
    const state = result as PushPermissionState;
    this._permission.set(state);
    return state;
  }

  /**
   * Registers the Service Worker, creates a push subscription and saves it
   * to Supabase. Requests permission first if not already granted.
   *
   * Returns true on success.
   */
  async subscribeToPush(): Promise<boolean> {
    if (!this._isPushSupported()) {
      console.warn('[PushNotificationService] Push not supported in this browser.');
      return false;
    }

    // Ensure permission
    const permission = await this.requestPermission();
    if (permission !== 'granted') return false;

    try {
      // ── 1. Register (or get existing) Service Worker ──────────────────────
      const registration = await this._getOrRegisterSW();
      if (!registration) return false;
      this._swRegistration.set(registration);

      // ── 2. Create push subscription ───────────────────────────────────────
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: this._urlBase64ToUint8Array(environment.vapid.publicKey),
      });

      // ── 3. Persist to Supabase ────────────────────────────────────────────
      const saved = await this._saveSubscription(subscription);
      if (!saved) return false;

      this._isSubscribed.set(true);
      return true;

    } catch (err) {
      console.error('[PushNotificationService] subscribeToPush error:', err);
      return false;
    }
  }

  /**
   * Unsubscribes from push notifications:
   *   1. Cancels the browser push subscription
   *   2. Removes the record from Supabase
   */
  async unsubscribeFromPush(): Promise<boolean> {
    try {
      const registration = this._swRegistration()
        ?? await navigator.serviceWorker.getRegistration('/sw.js');

      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await this._deleteSubscriptionFromDb(subscription.endpoint);
          await subscription.unsubscribe();
        }
      }

      this._isSubscribed.set(false);
      return true;

    } catch (err) {
      console.error('[PushNotificationService] unsubscribeFromPush error:', err);
      return false;
    }
  }

  /**
   * Checks whether the user already has an active subscription
   * (both in the browser and in Supabase) and updates the signal.
   */
  async checkSubscriptionStatus(): Promise<void> {
    if (!this._isPushSupported()) return;

    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!registration) {
        this._isSubscribed.set(false);
        return;
      }

      const subscription = await registration.pushManager.getSubscription();
      this._isSubscribed.set(!!subscription);
    } catch {
      this._isSubscribed.set(false);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _isPushSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  private _initPermissionState(): void {
    if (this._isPushSupported()) {
      this._permission.set(Notification.permission as PushPermissionState);
    } else {
      this._permission.set('unsupported');
    }
  }

  private async _getOrRegisterSW(): Promise<ServiceWorkerRegistration | null> {
    try {
      // Check if already registered
      const existing = await navigator.serviceWorker.getRegistration('/sw.js');
      if (existing) return existing;

      // Register the service worker
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      // Wait for it to be active
      await navigator.serviceWorker.ready;
      return registration;

    } catch (err) {
      console.error('[PushNotificationService] SW registration failed:', err);
      return null;
    }
  }

  private async _saveSubscription(subscription: PushSubscription): Promise<boolean> {
    const userId   = this.auth.session()?.user.id;
    const tenantId = this.auth.profile()?.tenantId;
    if (!userId || !tenantId) return false;

    const json = subscription.toJSON();
    const keys = json.keys as { p256dh: string; auth: string } | undefined;

    if (!keys?.p256dh || !keys?.auth) {
      console.error('[PushNotificationService] Missing VAPID keys in subscription');
      return false;
    }

    const { error } = await this.supabase.client
      .from('push_subscriptions')
      .upsert(
        {
          user_id:    userId,
          tenant_id:  tenantId,
          endpoint:   subscription.endpoint,
          p256dh:     keys.p256dh,
          auth:       keys.auth,
          user_agent: navigator.userAgent.slice(0, 255),
        },
        { onConflict: 'user_id,endpoint' },
      );

    if (error) {
      console.error('[PushNotificationService] saveSubscription error:', error.message);
      return false;
    }

    return true;
  }

  private async _deleteSubscriptionFromDb(endpoint: string): Promise<void> {
    const userId = this.auth.session()?.user.id;
    if (!userId) return;

    const { error } = await this.supabase.client
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) {
      console.error('[PushNotificationService] deleteSubscription error:', error.message);
    }
  }

  /**
   * Shows a simple confirm dialog explaining push notifications before
   * triggering the native browser permission prompt.
   * Returns true if the user wants to proceed.
   */
  private async _showPrePromptDialog(): Promise<boolean> {
    // Use a native confirm as a lightweight pre-prompt.
    // Replace with a MatDialog component for a polished UX.
    return window.confirm(
      'CRM would like to send you push notifications for:\n\n' +
      '• New deals assigned to you\n' +
      '• Task reminders\n' +
      '• Mentions and updates\n\n' +
      'You can turn these off at any time in Settings.',
    );
  }

  /**
   * Converts a base64url VAPID public key to a Uint8Array
   * as required by pushManager.subscribe().
   */
  private _urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
  }
}
