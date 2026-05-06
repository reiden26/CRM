import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Protects routes that require an authenticated session.
 * If no session exists, redirects to /auth/login.
 *
 * Uses a 5-second timeout on resolveSession() to prevent the app
 * from hanging if the Supabase client lock fails to acquire.
 */
export const authGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  // Fast path: signal already has a session (navigating between pages)
  if (auth.isAuthenticated()) return true;

  // Slow path: resolve from storage with a timeout to prevent hanging
  try {
    const session = await Promise.race([
      auth.resolveSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    if (session) return true;
  } catch {
    // resolveSession failed — treat as unauthenticated
  }

  return router.createUrlTree(['/auth/login']);
};
