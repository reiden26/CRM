import {
  Injectable,
  inject,
  signal,
  OnDestroy,
  PLATFORM_ID,
  NgZone,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { InactivityDialogComponent } from '../../shared/components/inactivity-dialog/inactivity-dialog.component';

// ─────────────────────────────────────────────────────────────────────────────
// InactivityService
//
// Monitors user activity and shows a warning dialog before auto-logout.
//
// Timeline:
//   0 ──────────────── 30 min ──── 35 min ──── auto-logout
//                      ↑           ↑
//                      warn        force logout if no action
// ─────────────────────────────────────────────────────────────────────────────

const INACTIVITY_WARN_MS  = 30 * 60 * 1000;   // 30 min → show warning
const INACTIVITY_GRACE_MS =  5 * 60 * 1000;   //  5 min → grace period after warning
const ACTIVITY_EVENTS     = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

@Injectable({ providedIn: 'root' })
export class InactivityService implements OnDestroy {

  private readonly platformId = inject(PLATFORM_ID);
  private readonly dialog     = inject(MatDialog);
  private readonly zone       = inject(NgZone);

  private _warnTimer:   ReturnType<typeof setTimeout> | null = null;
  private _logoutTimer: ReturnType<typeof setTimeout> | null = null;
  private _dialogRef:   MatDialogRef<InactivityDialogComponent> | null = null;
  private _signOutFn:   (() => Promise<void>) | null = null;
  private _boundReset:  (() => void) | null = null;

  readonly isWarningVisible = signal(false);

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Starts inactivity monitoring.
   * Call this after the user successfully signs in.
   * @param signOutFn  Callback to execute when the session expires.
   */
  start(signOutFn: () => Promise<void>): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this._signOutFn = signOutFn;
    this._boundReset = this._resetTimers.bind(this);
    ACTIVITY_EVENTS.forEach(e =>
      document.addEventListener(e, this._boundReset!, { passive: true }),
    );
    this._scheduleWarning();
  }

  /** Stops all timers and removes event listeners. Call on sign-out. */
  stop(): void {
    this._clearTimers();
    if (this._boundReset) {
      ACTIVITY_EVENTS.forEach(e =>
        document.removeEventListener(e, this._boundReset!),
      );
      this._boundReset = null;
    }
    this._dialogRef?.close();
    this._dialogRef = null;
    this.isWarningVisible.set(false);
  }

  /** Resets the inactivity timer (called on user activity). */
  resetActivity(): void {
    this._resetTimers();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _resetTimers(): void {
    // If warning is already showing, don't reset — let the user decide
    if (this.isWarningVisible()) return;
    this._clearTimers();
    this._scheduleWarning();
  }

  private _scheduleWarning(): void {
    this.zone.runOutsideAngular(() => {
      this._warnTimer = setTimeout(() => {
        this.zone.run(() => this._showWarning());
      }, INACTIVITY_WARN_MS);
    });
  }

  private _showWarning(): void {
    if (this._dialogRef) return;
    this.isWarningVisible.set(true);

    this._dialogRef = this.dialog.open(InactivityDialogComponent, {
      data:         { graceMs: INACTIVITY_GRACE_MS },
      disableClose: true,
      width:        '400px',
      panelClass:   'inactivity-dialog-panel',
    });

    // Schedule forced logout after grace period
    this.zone.runOutsideAngular(() => {
      this._logoutTimer = setTimeout(() => {
        this.zone.run(() => this._forceLogout());
      }, INACTIVITY_GRACE_MS);
    });

    this._dialogRef.afterClosed().subscribe((action: 'renew' | 'logout' | undefined) => {
      this._dialogRef = null;
      this.isWarningVisible.set(false);
      this._clearLogoutTimer();

      if (action === 'logout') {
        this._forceLogout();
      } else {
        // User chose to renew — reset timers
        this._scheduleWarning();
      }
    });
  }

  private _forceLogout(): void {
    this.stop();
    this._signOutFn?.();
  }

  private _clearTimers(): void {
    if (this._warnTimer)   { clearTimeout(this._warnTimer);   this._warnTimer   = null; }
    this._clearLogoutTimer();
  }

  private _clearLogoutTimer(): void {
    if (this._logoutTimer) { clearTimeout(this._logoutTimer); this._logoutTimer = null; }
  }
}
