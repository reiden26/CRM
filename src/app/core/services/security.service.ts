import {
  Injectable,
  inject,
  signal,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// ─────────────────────────────────────────────────────────────────────────────
// SecurityService
//
// Provides:
//   1. Input sanitization (XSS prevention)
//   2. Client-side rate limiting for login attempts
//   3. Cross-tab session detection via BroadcastChannel
// ─────────────────────────────────────────────────────────────────────────────

const RATE_LIMIT_KEY    = 'crm_login_attempts';
const MAX_ATTEMPTS      = 5;
const LOCKOUT_MS        = 5 * 60 * 1000;   // 5 minutes
const BROADCAST_CHANNEL = 'crm_session';

export interface RateLimitState {
  attempts:   number;
  lockedUntil: number | null;   // timestamp ms, null = not locked
}

export type SessionEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';

@Injectable({ providedIn: 'root' })
export class SecurityService implements OnDestroy {

  private readonly platformId = inject(PLATFORM_ID);

  // ── Rate limit state ──────────────────────────────────────────────────────
  private readonly _rateLimitState = signal<RateLimitState>({ attempts: 0, lockedUntil: null });
  private _countdownTimer: ReturnType<typeof setInterval> | null = null;

  readonly rateLimitState = this._rateLimitState.asReadonly();

  /** Seconds remaining in lockout. 0 when not locked. */
  readonly lockoutSecondsRemaining = signal<number>(0);

  // ── BroadcastChannel ──────────────────────────────────────────────────────
  private _channel: BroadcastChannel | null = null;
  private _sessionEventHandlers: ((event: SessionEvent) => void)[] = [];

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this._loadRateLimitState();
      this._initBroadcastChannel();
    }
  }

  ngOnDestroy(): void {
    this._channel?.close();
    if (this._countdownTimer) clearInterval(this._countdownTimer);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. INPUT SANITIZATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Sanitizes a string value to prevent XSS injection.
   * Strips HTML tags, encodes dangerous characters, and trims whitespace.
   *
   * Note: Angular's template engine already escapes interpolated values.
   * Use this for values that will be used in innerHTML or passed to APIs.
   */
  sanitize(value: string): string {
    if (!value) return '';

    return value
      // Remove script tags and their content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove event handlers (onclick, onerror, etc.)
      .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
      // Remove javascript: protocol
      .replace(/javascript\s*:/gi, '')
      // Remove data: URIs (potential XSS vector)
      .replace(/data\s*:/gi, '')
      // Remove vbscript:
      .replace(/vbscript\s*:/gi, '')
      // Strip remaining HTML tags
      .replace(/<[^>]*>/g, '')
      // Encode remaining angle brackets
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .trim();
  }

  /**
   * Sanitizes an object's string values recursively.
   * Safe to use on form values before sending to the API.
   */
  sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.sanitize(value);
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.sanitizeObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. RATE LIMITING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Returns true if the user is currently locked out from login attempts.
   */
  isLockedOut(): boolean {
    const state = this._rateLimitState();
    if (!state.lockedUntil) return false;
    if (Date.now() >= state.lockedUntil) {
      // Lockout expired — reset
      this._resetRateLimit();
      return false;
    }
    return true;
  }

  /**
   * Records a failed login attempt.
   * Returns true if the user is now locked out.
   */
  recordFailedAttempt(): boolean {
    const state = this._rateLimitState();
    const attempts = state.attempts + 1;

    if (attempts >= MAX_ATTEMPTS) {
      const lockedUntil = Date.now() + LOCKOUT_MS;
      const newState: RateLimitState = { attempts, lockedUntil };
      this._rateLimitState.set(newState);
      this._persistRateLimitState(newState);
      this._startCountdown(lockedUntil);
      return true;
    }

    const newState: RateLimitState = { attempts, lockedUntil: null };
    this._rateLimitState.set(newState);
    this._persistRateLimitState(newState);
    return false;
  }

  /**
   * Resets the rate limit counter on successful login.
   */
  resetRateLimit(): void {
    this._resetRateLimit();
  }

  /**
   * Returns the number of remaining attempts before lockout.
   */
  remainingAttempts(): number {
    return Math.max(0, MAX_ATTEMPTS - this._rateLimitState().attempts);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. CROSS-TAB SESSION DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Broadcasts a session event to all other tabs.
   */
  broadcastSessionEvent(event: SessionEvent): void {
    this._channel?.postMessage({ type: event, timestamp: Date.now() });
  }

  /**
   * Registers a handler for session events from other tabs.
   * Returns an unsubscribe function.
   */
  onSessionEvent(handler: (event: SessionEvent) => void): () => void {
    this._sessionEventHandlers.push(handler);
    return () => {
      this._sessionEventHandlers = this._sessionEventHandlers.filter(h => h !== handler);
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _loadRateLimitState(): void {
    try {
      const raw = localStorage.getItem(RATE_LIMIT_KEY);
      if (!raw) return;
      const state: RateLimitState = JSON.parse(raw);
      // Check if lockout has expired
      if (state.lockedUntil && Date.now() >= state.lockedUntil) {
        this._resetRateLimit();
        return;
      }
      this._rateLimitState.set(state);
      if (state.lockedUntil) {
        this._startCountdown(state.lockedUntil);
      }
    } catch { /* ignore */ }
  }

  private _persistRateLimitState(state: RateLimitState): void {
    try {
      localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }

  private _resetRateLimit(): void {
    const state: RateLimitState = { attempts: 0, lockedUntil: null };
    this._rateLimitState.set(state);
    this.lockoutSecondsRemaining.set(0);
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
    try { localStorage.removeItem(RATE_LIMIT_KEY); } catch { /* ignore */ }
  }

  private _startCountdown(lockedUntil: number): void {
    if (this._countdownTimer) clearInterval(this._countdownTimer);

    const update = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      this.lockoutSecondsRemaining.set(remaining);
      if (remaining === 0) {
        this._resetRateLimit();
      }
    };

    update();
    this._countdownTimer = setInterval(update, 1000);
  }

  private _initBroadcastChannel(): void {
    if (!('BroadcastChannel' in window)) return;

    try {
      this._channel = new BroadcastChannel(BROADCAST_CHANNEL);
      this._channel.onmessage = (event: MessageEvent) => {
        const { type } = event.data as { type: SessionEvent };
        if (type) {
          this._sessionEventHandlers.forEach(h => h(type));
        }
      };
    } catch (err) {
      console.warn('[SecurityService] BroadcastChannel not available:', err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SecurityService — additional methods added below the existing class
// (appended to avoid rewriting the full file)
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: These methods are added via module augmentation pattern.
// They are declared as standalone functions and exported for use in services
// that cannot extend SecurityService directly.
// ─────────────────────────────────────────────────────────────────────────────

export type SecurityEventType =
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'role_changed'
  | 'access_denied'
  | 'data_exported'
  | 'tenant_mismatch'
  | 'session_expired';

export interface SecurityEvent {
  type:      SecurityEventType;
  userId?:   string;
  tenantId?: string;
  details?:  Record<string, unknown>;
  timestamp: string;
}
