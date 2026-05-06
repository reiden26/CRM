import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Prevents authenticated users from accessing auth pages (login, signup).
 * If a session exists, redirects to /dashboard.
 */
export const noAuthGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  // Fast path
  if (auth.isAuthenticated()) return router.createUrlTree(['/dashboard']);

  // Slow path with timeout
  try {
    const session = await Promise.race([
      auth.resolveSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    if (session) return router.createUrlTree(['/dashboard']);
  } catch {
    // treat as unauthenticated
  }

  return true;
};
