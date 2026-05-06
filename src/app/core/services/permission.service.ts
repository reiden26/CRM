import { Injectable, inject, computed, Signal } from '@angular/core';
import { AuthService } from './auth.service';
import {
  UserRole,
  Action,
  Resource,
  Permission,
  PERMISSIONS_MAP,
  ROUTE_ACCESS_MAP,
  getActionsForRole,
  roleAtLeast,
} from '../models/permission.model';

// ─────────────────────────────────────────────────────────────────────────────
// PermissionService
//
// Single source of truth for all RBAC checks in the Angular app.
// All methods are synchronous and Signal-based — safe to call in templates,
// computed signals, guards and directives without async overhead.
//
// The service reads the user's role from AuthService.profile (a Signal),
// so every computed that depends on it auto-updates when the role changes.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PermissionService {

  private readonly auth = inject(AuthService);

  // ── Current role as a Signal ──────────────────────────────────────────────

  /**
   * The current user's UserRole enum value, or null when signed out.
   * Derived from AuthService.profile so it updates reactively.
   */
  readonly currentRole: Signal<UserRole | null> = computed(() => {
    const role = this.auth.profile()?.role;
    if (!role) return null;
    // Map the string union type from user.model to the enum
    return role as UserRole;
  });

  /**
   * Pre-computed permission list for the current role.
   * Recalculated automatically when the role changes.
   */
  readonly currentPermissions: Signal<Permission[]> = computed(() => {
    const role = this.currentRole();
    if (!role) return [];
    return PERMISSIONS_MAP[role] ?? [];
  });

  // ── Core permission checks ────────────────────────────────────────────────

  /**
   * Returns true if the current user can perform `action` on `resource`.
   *
   * @example
   * permissionService.hasPermission('contacts', 'delete') // false for agent
   */
  hasPermission(resource: Resource, action: Action): boolean {
    const role = this.currentRole();
    if (!role) return false;
    const actions = getActionsForRole(role, resource);
    return actions.includes(action);
  }

  /**
   * Returns true if the current user has ANY of the given actions on the resource.
   *
   * @example
   * permissionService.hasAnyPermission('deals', ['create', 'update'])
   */
  hasAnyPermission(resource: Resource, actions: Action[]): boolean {
    return actions.some(action => this.hasPermission(resource, action));
  }

  /**
   * Returns true if the current user has ALL of the given actions on the resource.
   */
  hasAllPermissions(resource: Resource, actions: Action[]): boolean {
    return actions.every(action => this.hasPermission(resource, action));
  }

  // ── Role checks ───────────────────────────────────────────────────────────

  /**
   * Returns true if the current user has exactly one of the given roles.
   *
   * @example
   * permissionService.hasRole(UserRole.ADMIN)
   * permissionService.hasRole([UserRole.ADMIN, UserRole.MANAGER])
   */
  hasRole(role: UserRole | UserRole[]): boolean {
    const current = this.currentRole();
    if (!current) return false;
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(current);
  }

  /**
   * Returns true if the current user's role is at least as privileged
   * as `minRole` (i.e. same level or higher in the hierarchy).
   *
   * @example
   * permissionService.hasMinRole(UserRole.MANAGER) // true for admin, super_admin, manager
   */
  hasMinRole(minRole: UserRole): boolean {
    const current = this.currentRole();
    if (!current) return false;
    return roleAtLeast(current, minRole);
  }

  // ── Route access ──────────────────────────────────────────────────────────

  /**
   * Returns true if the current user can access the given route path.
   * Uses prefix matching against ROUTE_ACCESS_MAP.
   *
   * @example
   * permissionService.canAccessRoute('/settings/users') // false for manager
   */
  canAccessRoute(route: string): boolean {
    const current = this.currentRole();
    if (!current) return false;

    // super_admin bypasses all route restrictions
    if (current === UserRole.SUPER_ADMIN) return true;

    // Find the most specific matching route (longest prefix wins)
    const normalized = route.startsWith('/') ? route : `/${route}`;
    const match = ROUTE_ACCESS_MAP
      .filter(r => normalized.startsWith(r.path))
      .sort((a, b) => b.path.length - a.path.length)[0];

    if (!match) return true; // no restriction defined → allow
    return match.allowedRoles.includes(current);
  }

  // ── Computed Signals for template binding ─────────────────────────────────

  /**
   * Returns a computed Signal that resolves to true when the user
   * has the given permission. Use this in components to avoid calling
   * hasPermission() directly in templates (which creates new function calls
   * on every change detection cycle).
   *
   * @example
   * readonly canCreateContact = this.permissions.permissionSignal('contacts', 'create');
   * // template: @if (canCreateContact()) { ... }
   */
  permissionSignal(resource: Resource, action: Action): Signal<boolean> {
    return computed(() => this.hasPermission(resource, action));
  }

  /**
   * Returns a computed Signal for a role check.
   *
   * @example
   * readonly isAdmin = this.permissions.roleSignal([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
   */
  roleSignal(role: UserRole | UserRole[]): Signal<boolean> {
    return computed(() => this.hasRole(role));
  }

  // ── Convenience role predicates (Signal-based) ────────────────────────────

  readonly isSuperAdmin = computed(() => this.hasRole(UserRole.SUPER_ADMIN));
  readonly isAdmin      = computed(() => this.hasMinRole(UserRole.ADMIN));
  readonly isManager    = computed(() => this.hasMinRole(UserRole.MANAGER));
  readonly isAgent      = computed(() => this.hasMinRole(UserRole.AGENT));
  readonly isViewer     = computed(() => this.hasRole(UserRole.VIEWER));

  // ── Parse "resource:action" shorthand ────────────────────────────────────

  /**
   * Parses a "resource:action" string and returns the permission check result.
   * Used by the HasPermissionPipe and PermissionDirective.
   *
   * @example
   * permissionService.checkShorthand('contacts:delete') // false for agent
   */
  checkShorthand(shorthand: string): boolean {
    const [resource, action] = shorthand.split(':') as [Resource, Action];
    if (!resource || !action) {
      console.warn(`[PermissionService] Invalid shorthand: "${shorthand}". Expected "resource:action".`);
      return false;
    }
    return this.hasPermission(resource, action);
  }
}
