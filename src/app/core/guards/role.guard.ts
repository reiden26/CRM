import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { PermissionService } from '../services/permission.service';
import { UserRole } from '../models/permission.model';

/**
 * role.guard
 *
 * Protects routes that require a specific role (or set of roles).
 * Runs after authGuard — assumes the user is already authenticated.
 *
 * Usage in route definition:
 *
 *   {
 *     path: 'settings',
 *     canActivate: [authGuard, tenantGuard, roleGuard],
 *     data: { roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }
 *   }
 *
 * On failure → redirects to /forbidden
 */
export const roleGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const auth        = inject(AuthService);
  const permissions = inject(PermissionService);
  const router      = inject(Router);

  // ── Resolve session if not yet loaded ────────────────────────────────────
  if (!auth.isAuthenticated()) {
    await auth.resolveSession();
  }

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/auth/login']);
  }

  // ── Read required roles from route data ──────────────────────────────────
  const requiredRoles = route.data?.['roles'] as UserRole[] | undefined;

  if (!requiredRoles || requiredRoles.length === 0) {
    console.warn('[roleGuard] No roles defined in route data. Allowing navigation.');
    return true;
  }

  // ── Check role ────────────────────────────────────────────────────────────
  if (permissions.hasRole(requiredRoles)) return true;

  // ── Redirect to /forbidden with context ──────────────────────────────────
  return router.createUrlTree(['/forbidden'], {
    queryParams: {
      requiredRoles: requiredRoles.join(','),
      currentRole:   permissions.currentRole() ?? 'none',
      from:          route.url.map(s => s.path).join('/'),
    },
  });
};
