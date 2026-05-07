import {
  Injectable,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthError as SupabaseAuthError, Session } from '@supabase/supabase-js';
import { Subscription } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';
import { SecurityService } from './security.service';
import { InactivityService } from './inactivity.service';
import { EmailService } from './email.service';
import {
  Profile,
  ProfileRow,
  CurrentUser,
  AuthError,
  mapProfileRow,
} from '../../models/user.model';

// ─────────────────────────────────────────────────────────────────────────────
// Typed result wrappers
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthResult {
  success: boolean;
  error?: AuthError;
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthService
//
// Owns all authentication operations and the current-user state.
// After login, loads the profile AND the tenant via TenantService.
// Uses inject() instead of constructor injection.
// Exposes Angular Signals for reactive UI binding.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {

  // ── Injected dependencies ───────────────────────────────────────────────────
  private readonly supabase          = inject(SupabaseService);
  private readonly router            = inject(Router);
  private readonly tenantService     = inject(TenantService);
  private readonly securityService   = inject(SecurityService);
  private readonly inactivityService = inject(InactivityService);
  private readonly emailService      = inject(EmailService);

  // ── Private writable signals ────────────────────────────────────────────────
  private readonly _session = signal<Session | null>(null);
  private readonly _profile = signal<Profile | null>(null);
  private readonly _loading = signal<boolean>(false);

  // ── Public read-only signals ─────────────────────────────────────────────────

  /** The raw Supabase session (contains JWT, user, expiry). */
  readonly session = this._session.asReadonly();

  /** The full profile row from the `profiles` table (includes role, tenant, etc.). */
  readonly profile = this._profile.asReadonly();

  /** True while any auth operation is in flight. */
  readonly loading = this._loading.asReadonly();

  /** The combined auth + profile view. Null when signed out. */
  readonly currentUser = computed<CurrentUser | null>(() => {
    const session = this._session();
    const profile = this._profile();
    if (!session || !profile) return null;
    return {
      auth: {
        id:               session.user.id,
        email:            session.user.email ?? '',
        emailConfirmedAt: session.user.email_confirmed_at ?? null,
        createdAt:        session.user.created_at,
      },
      profile,
    };
  });

  /** True when the user has an active session. */
  readonly isAuthenticated = computed(() => !!this._session());

  /** The user's role. Null when signed out. */
  readonly userRole = computed(() => this._profile()?.role ?? null);

  /** True when the user is a super_admin. */
  readonly isSuperAdmin = computed(() => this._profile()?.role === 'super_admin');

  /** True when the user is admin or super_admin. */
  readonly isAdmin = computed(
    () => this._profile()?.role === 'admin' || this.isSuperAdmin(),
  );

  /** True when the user is manager, admin, or super_admin. */
  readonly isManager = computed(
    () => this._profile()?.role === 'manager' || this.isAdmin(),
  );

  // ── RxJS subscription handle ────────────────────────────────────────────────
  private _sessionSub: Subscription | null = null;

  // ── Constructor ─────────────────────────────────────────────────────────────

  constructor() {
    this._initAuthStateListener();
    this._initCrossTabListener();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this._sessionSub?.unsubscribe();
  }

  // ── Public auth operations ──────────────────────────────────────────────────

  /**
   * Signs in with email + password.
   * Loads profile + tenant on success, then navigates to /dashboard.
   */
  async signIn(email: string, password: string): Promise<AuthResult> {
    // ── Rate limit check ────────────────────────────────────────────────────
    if (this.securityService.isLockedOut()) {
      const secs = this.securityService.lockoutSecondsRemaining();
      return {
        success: false,
        error: {
          code:    'RATE_LIMITED',
          message: `Too many failed attempts. Try again in ${Math.ceil(secs / 60)} minute(s).`,
        },
      };
    }

    this._loading.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        // Record failed attempt for rate limiting
        this.securityService.recordFailedAttempt();
        return this._handleAuthError(error);
      }

      // Successful login — reset rate limit
      this.securityService.resetRateLimit();

      if (data.session) {
        this._session.set(data.session);
        await this._loadProfileAndTenant(data.session.user.id);
        await this._updateLastAccess(data.session.user.id);
        this.inactivityService.start(async () => { await this.signOut(); });
        this.securityService.broadcastSessionEvent('SIGNED_IN');
      }

      await this.router.navigate(['/dashboard']);
      return { success: true };

    } catch (err) {
      return this._handleUnknownError(err);
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Creates a new auth user and inserts a profile row.
   * The DB trigger handle_new_user() also creates the profile, but we
   * upsert here to set full_name immediately without waiting for the trigger.
   * New users have no tenant yet → redirected to /onboarding by tenantGuard.
   */
  async signUp(
    email: string,
    password: string,
    fullName: string,
  ): Promise<AuthResult> {
    this._loading.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) return this._handleAuthError(error);

      if (data.session) {
        this._session.set(data.session);
        await this._upsertProfile(data.session.user.id, fullName.trim());
        await this._loadProfileAndTenant(data.session.user.id);
        // New user has no tenant → tenantGuard will redirect to /onboarding
        await this.router.navigate(['/dashboard']);

        // Send welcome email (fire-and-forget)
        const userEmail = data.session.user.email;
        if (userEmail) {
          // tenantId is null at signup (no tenant yet) — welcome email sent after onboarding
          const tenantId = this._profile()?.tenantId;
          if (tenantId) {
            this.emailService.sendWelcome(userEmail, fullName.trim(), 'CRM', tenantId);
          }
        }
      }

      return { success: true };

    } catch (err) {
      return this._handleUnknownError(err);
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Signs out the current user, clears all state (including tenant),
   * and redirects to login.
   */
  async signOut(): Promise<AuthResult> {
    this._loading.set(true);
    try {
      const { error } = await this.supabase.client.auth.signOut();
      if (error) return this._handleAuthError(error);

      // Stop inactivity monitoring and broadcast sign-out
      this.inactivityService.stop();
      this.securityService.broadcastSessionEvent('SIGNED_OUT');

      this._clearState();
      await this.router.navigate(['/auth/login']);
      return { success: true };

    } catch (err) {
      return this._handleUnknownError(err);
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Sends a password-reset email.
   */
  async resetPassword(email: string): Promise<AuthResult> {
    this._loading.set(true);
    try {
      const { error } = await this.supabase.client.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/auth/reset-password` },
      );

      if (error) return this._handleAuthError(error);
      return { success: true };

    } catch (err) {
      return this._handleUnknownError(err);
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Updates the password for the currently authenticated user.
   */
  async updatePassword(newPassword: string): Promise<AuthResult> {
    this._loading.set(true);
    try {
      const { error } = await this.supabase.client.auth.updateUser({
        password: newPassword,
      });

      if (error) return this._handleAuthError(error);
      return { success: true };

    } catch (err) {
      return this._handleUnknownError(err);
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Resolves the current session from storage.
   * Call this in authGuard before the first route renders.
   */
  async resolveSession(): Promise<Session | null> {
    const session = await this.supabase.resolveSession();
    if (session) {
      this._session.set(session);
      await this._loadProfileAndTenant(session.user.id);
      // Resume inactivity monitoring after page refresh
      this.inactivityService.start(async () => { await this.signOut(); });
    }
    return session;
  }

  /**
   * Refreshes the profile (and tenant) from the DB.
   * Useful after the user updates their own profile data.
   */
  async refreshProfile(): Promise<void> {
    const userId = this._session()?.user.id;
    if (userId) await this._loadProfileAndTenant(userId);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Subscribes to Supabase auth state changes via SupabaseService.session$.
   * Single source of truth for session updates.
   */
  private _initAuthStateListener(): void {
    this._sessionSub = this.supabase.session$.subscribe(
      async (sessionOrUndefined) => {
        if (sessionOrUndefined === undefined) return; // not yet resolved

        const session = sessionOrUndefined;
        this._session.set(session);

        if (session) {
          await this._loadProfileAndTenant(session.user.id);
        } else {
          this._clearState();
        }
      },
    );
  }

  /**
   * Loads the profile row, then loads the tenant if the profile has a tenant_id.
   * This is the single place where both are fetched together after any auth event.
   */
  private async _loadProfileAndTenant(userId: string): Promise<void> {
    await this._loadProfile(userId);

    const tenantId = this._profile()?.tenantId;
    if (tenantId) {
      await this.tenantService.loadTenant(tenantId);
    } else {
      // User has no tenant yet — clear any stale tenant state
      this.tenantService.clear();
    }
  }

  /**
   * Fetches the profile row and updates the signal.
   */
  private async _loadProfile(userId: string): Promise<void> {
    // Retry up to 3 times with a short delay — the profile trigger may not
    // have fired yet immediately after signup/signin.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 500 * attempt));
      }

      const { data, error } = await this.supabase.client
        .from('profiles')
        .select(
          'id, full_name, avatar_url, role, company_id, tenant_id, is_active, created_at, updated_at',
        )
        .eq('id', userId)
        .maybeSingle<ProfileRow>();

      if (!error && data) {
        this._profile.set(mapProfileRow(data));
        return;
      }

      if (error) {
        // PGRST116 = no rows yet (trigger hasn't fired) — retry
        // 406 = RLS blocked — run the SQL fix in Supabase dashboard
        if (error.code === 'PGRST116') continue;
        console.error('[AuthService] loadProfile error:', error.code, error.message);
        return;
      }
    }
  }

  /**
   * Upserts the profile row — used right after signUp to set full_name.
   */
  private async _upsertProfile(userId: string, fullName: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('profiles')
      .upsert(
        { id: userId, full_name: fullName },
        { onConflict: 'id', ignoreDuplicates: false },
      );

    if (error) console.error('[AuthService] upsertProfile error:', error.message);
  }

  /** Clears all local auth + tenant state. */
  private _clearState(): void {
    this._session.set(null);
    this._profile.set(null);
    this.tenantService.clear();
  }

  /** Updates the last_access timestamp in the profiles table. */
  private async _updateLastAccess(userId: string): Promise<void> {
    // last_access column may not exist yet — ignore errors silently
    await this.supabase.client
      .from('profiles')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', userId);
  }

  /** Listens for session events from other browser tabs. */
  private _initCrossTabListener(): void {
    this.securityService.onSessionEvent(async (event) => {
      if (event === 'SIGNED_OUT' && this.isAuthenticated()) {
        // Another tab signed out — sign out this tab too
        this._clearState();
        this.inactivityService.stop();
        await this.router.navigate(['/auth/login']);
      } else if (event === 'SIGNED_IN' && !this.isAuthenticated()) {
        // Another tab signed in — reload session
        await this.resolveSession();
      }
    });
  }

  private _handleAuthError(error: SupabaseAuthError): AuthResult {
    console.error('[AuthService] auth error:', error.message);
    return {
      success: false,
      error: {
        code:    error.status?.toString() ?? 'AUTH_ERROR',
        message: this._friendlyMessage(error),
      },
    };
  }

  private _handleUnknownError(err: unknown): AuthResult {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    console.error('[AuthService] unexpected error:', message);
    return { success: false, error: { code: 'UNKNOWN', message } };
  }

  private _friendlyMessage(error: SupabaseAuthError): string {
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid login credentials'))  return 'Incorrect email or password.';
    if (msg.includes('email not confirmed'))         return 'Please confirm your email before signing in.';
    if (msg.includes('user already registered'))     return 'An account with this email already exists.';
    if (msg.includes('password should be at least')) return 'Password must be at least 8 characters.';
    if (msg.includes('rate limit'))                  return 'Too many attempts. Please wait a moment and try again.';
    if (msg.includes('network'))                     return 'Network error. Please check your connection.';
    return error.message;
  }
}
