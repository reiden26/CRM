import {
  Injectable,
  OnDestroy,
  signal,
  computed,
} from '@angular/core';
import {
  createClient,
  SupabaseClient,
  Session,
  AuthChangeEvent,
  RealtimeChannel,
} from '@supabase/supabase-js';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService implements OnDestroy {

  private readonly _config = this._getValidatedConfig();
  private readonly _client: SupabaseClient = createClient(
    this._config.url,
    this._config.anonKey,
    {
      auth: {
        persistSession:     true,
        autoRefreshToken:   true,
        detectSessionInUrl: true,
      },
    },
  );

  private readonly _session$ = new BehaviorSubject<Session | null | undefined>(undefined);

  readonly session$: Observable<Session | null | undefined> = this._session$.asObservable();
  readonly currentUser$: Observable<Session['user'] | null> = this.session$.pipe(
    map(s => s ? s.user : null),
  );

  private readonly _sessionSignal = signal<Session | null | undefined>(undefined);
  readonly sessionSignal   = this._sessionSignal.asReadonly();
  readonly sessionResolved = computed(() => this._sessionSignal() !== undefined);

  private _authSub: { unsubscribe: () => void } | null = null;

  constructor() {
    this._initAuthListener();
    void this._recoverFromInvalidRefreshToken();
  }

  get client(): SupabaseClient { return this._client; }

  /**
   * Resolves the current session.
   * Uses a 3-second timeout to prevent hanging if the NavigatorLock fails.
   */
  async resolveSession(): Promise<Session | null> {
    try {
      const result = await Promise.race([
        this._client.auth.getSession(),
        new Promise<{ data: { session: null }; error: null }>(resolve =>
          setTimeout(() => resolve({ data: { session: null }, error: null }), 3000),
        ),
      ]);

      const session = result.data?.session ?? null;
      this._updateSession(session);
      return session;

    } catch {
      this._updateSession(null);
      return null;
    }
  }

  channel(name: string): RealtimeChannel {
    return this._client.channel(name);
  }

  ngOnDestroy(): void {
    this._authSub?.unsubscribe();
    this._session$.complete();
  }

  private _initAuthListener(): void {
    const { data } = this._client.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        this._updateSession(session);
      },
    );
    this._authSub = data.subscription;
  }

  private _updateSession(session: Session | null): void {
    this._session$.next(session);
    this._sessionSignal.set(session);
  }

  private async _recoverFromInvalidRefreshToken(): Promise<void> {
    const { error } = await this._client.auth.getSession();
    if (!error) return;

    const msg = error.message.toLowerCase();
    if (msg.includes('invalid refresh token') || msg.includes('refresh token not found')) {
      await this._client.auth.signOut();
      this._updateSession(null);
    }
  }

  private _getValidatedConfig(): { url: string; anonKey: string } {
    const url = environment.supabase.url?.trim() ?? '';
    const anonKey = environment.supabase.anonKey?.trim() ?? '';

    if (!url || !anonKey) {
      throw new Error(
        'Supabase no configurado. Define SUPABASE_URL y SUPABASE_ANON_KEY en src/assets/env-config.js o src/environments/environment.ts',
      );
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('invalid protocol');
      }
    } catch {
      throw new Error(`SUPABASE_URL invalida: "${url}"`);
    }

    return { url, anonKey };
  }
}
