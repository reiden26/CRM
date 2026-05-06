import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { PermissionService } from '../services/permission.service';
import { Resource, Action } from '../models/permission.model';

/**
 * permission.guard
 *
 * Granular guard that checks a specific resource + action combination.
 * More fine-grained than roleGuard — use when a route requires a specific
 * capability rather than just a role level.
 *
 * Usage in route definition:
 *
 *   {
 *     path: 'audit-logs',
 *     canActivate: [authGuard, tenantGuard, permissionGuard],
 *     data: { permission: { resource: 'audit_logs', action: 'read' } }
 *   }
 *
 * Also supports shorthand string:
 *   data: { permission: 'audit_logs:read' }
 *
 * On failure → redirects to /forbidden
 */
export const permissionGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const auth        = inject(AuthService);
  const permissions = inject(PermissionService);
  const router      = inject(Router);

  // ── Resolve session if needed ─────────────────────────────────────────────
  if (!auth.isAuthenticated()) {
    await auth.resolveSession();
  }

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/auth/login']);
  }

  // ── Read permission requirement from route data ───────────────────────────
  const permData = route.data?.['permission'] as
    | string
    | { resource: Resource; action: Action }
    | undefined;

  if (!permData) {
    console.warn('[permissionGuard] No permission defined in route data. Allowing navigation.');
    return true;
  }

  // ── Resolve resource + action ─────────────────────────────────────────────
  let resource: Resource;
  let action: Action;

  if (typeof permData === 'string') {
    const parts = permData.split(':');
    resource = parts[0] as Resource;
    action   = parts[1] as Action;
  } else {
    resource = permData.resource;
    action   = permData.action;
  }

  if (!resource || !action) {
    console.error('[permissionGuard] Invalid permission data in route:', permData);
    return router.createUrlTree(['/forbidden']);
  }

  // ── Check permission ──────────────────────────────────────────────────────
  if (permissions.hasPermission(resource, action)) return true;

  return router.createUrlTree(['/forbidden'], {
    queryParams: {
      resource,
      action,
      currentRole: permissions.currentRole() ?? 'none',
      from:        route.url.map(s => s.path).join('/'),
    },
  });
};
