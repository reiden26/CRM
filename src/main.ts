import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// ─────────────────────────────────────────────────────────────────────────────
// NavigatorLock patch
//
// Supabase uses the Web Locks API (navigator.locks) to coordinate token
// refresh across tabs. In some browsers/environments the lock acquisition
// fails immediately with NavigatorLockAcquireTimeoutError, which prevents
// signIn/getSession from working.
//
// This patch replaces navigator.locks.request with a no-op implementation
// that simply executes the callback directly, bypassing the lock entirely.
// This is safe for a SPA — each tab manages its own token refresh.
// ─────────────────────────────────────────────────────────────────────────────
if (typeof navigator !== 'undefined' && navigator.locks) {
  const originalRequest = navigator.locks.request.bind(navigator.locks);

  // Override: execute the callback immediately without acquiring a lock
  (navigator.locks as any).request = (
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback,
    maybeCallback?: LockGrantedCallback,
  ): Promise<unknown> => {
    const callback = typeof optionsOrCallback === 'function'
      ? optionsOrCallback
      : maybeCallback!;

    // Execute the callback with a fake lock object
    return Promise.resolve(callback({ name, mode: 'exclusive' } as Lock));
  };
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
