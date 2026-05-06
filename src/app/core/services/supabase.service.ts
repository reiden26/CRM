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

  private readonly _client: SupabaseClient = createClient(
    environment.supabase.url,
    environment.supabase.anonKey,
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
}
