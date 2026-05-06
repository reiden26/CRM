import {
  Injectable,
  inject,
  signal,
  computed,
} from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import {
  NotificationPreferences,
  NotificationPreferencesRow,
  mapPreferencesRow,
  DEFAULT_PREFERENCES,
} from '../models/notification.model';

// ─────────────────────────────────────────────────────────────────────────────
// NotificationPreferencesService
//
// Loads and persists the user's notification preferences from/to the
// `notification_preferences` table in Supabase.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class NotificationPreferencesService {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);

  // ── State ────────────────────────────────────────────────────────────────────
  private readonly _preferences = signal<NotificationPreferences | null>(null);
  private readonly _loading     = signal<boolean>(false);
  private readonly _saving      = signal<boolean>(false);

  /** Current notification preferences. Null until loadPreferences() resolves. */
  readonly preferences$ = this._preferences.asReadonly();

  /** True while preferences are being fetched. */
  readonly loading$ = this._loading.asReadonly();

  /** True while preferences are being saved. */
  readonly saving$ = this._saving.asReadonly();

  /** Convenience computed: email notifications enabled for any event. */
  readonly anyEmailEnabled = computed(() => {
    const p = this._preferences();
    if (!p) return false;
    return p.emailOnDealAssigned || p.emailOnTaskDue || p.emailOnMention;
  });

  /** Convenience computed: push notifications enabled for any event. */
  readonly anyPushEnabled = computed(() => {
    const p = this._preferences();
    if (!p) return false;
    return p.pushOnDealAssigned || p.pushOnTaskDue || p.pushOnMention;
  });

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Loads the user's notification preferences from Supabase.
   * If no row exists yet, returns and stores the default preferences.
   */
  async loadPreferences(): Promise<NotificationPreferences | null> {
    const userId   = this.auth.session()?.user.id;
    const tenantId = this.auth.profile()?.tenantId;
    if (!userId || !tenantId) return null;

    this._loading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .single<NotificationPreferencesRow>();

      if (error) {
        // PGRST116 = no row found → use defaults
        if (error.code === 'PGRST116') {
          const defaults: NotificationPreferences = {
            userId,
            tenantId,
            updatedAt: new Date().toISOString(),
            ...DEFAULT_PREFERENCES,
          };
          this._preferences.set(defaults);
          return defaults;
        }
        console.error('[NotificationPreferencesService] loadPreferences:', error.message);
        return null;
      }

      const prefs = mapPreferencesRow(data);
      this._preferences.set(prefs);
      return prefs;

    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Updates the user's notification preferences in Supabase.
   * Performs an upsert so it works whether or not a row already exists.
   * Updates the local signal optimistically.
   *
   * @param updates  Partial preferences to merge with the current state.
   */
  async updatePreferences(
    updates: Partial<Omit<NotificationPreferences, 'userId' | 'tenantId' | 'updatedAt'>>,
  ): Promise<boolean> {
    const userId   = this.auth.session()?.user.id;
    const tenantId = this.auth.profile()?.tenantId;
    if (!userId || !tenantId) return false;

    // Optimistic update
    const current = this._preferences();
    const merged: NotificationPreferences = {
      ...(current ?? { userId, tenantId, updatedAt: '', ...DEFAULT_PREFERENCES }),
      ...updates,
      userId,
      tenantId,
      updatedAt: new Date().toISOString(),
    };
    this._preferences.set(merged);

    this._saving.set(true);
    try {
      const { error } = await this.supabase.client
        .from('notification_preferences')
        .upsert(
          {
            user_id:                userId,
            tenant_id:              tenantId,
            email_on_deal_assigned: merged.emailOnDealAssigned,
            email_on_task_due:      merged.emailOnTaskDue,
            email_on_mention:       merged.emailOnMention,
            push_on_deal_assigned:  merged.pushOnDealAssigned,
            push_on_task_due:       merged.pushOnTaskDue,
            push_on_mention:        merged.pushOnMention,
          },
          { onConflict: 'user_id,tenant_id' },
        );

      if (error) {
        console.error('[NotificationPreferencesService] updatePreferences:', error.message);
        // Revert optimistic update
        this._preferences.set(current);
        return false;
      }

      return true;

    } finally {
      this._saving.set(false);
    }
  }

  /**
   * Resets all preferences to their default values and persists to Supabase.
   */
  async resetToDefaults(): Promise<boolean> {
    return this.updatePreferences(DEFAULT_PREFERENCES);
  }
}
