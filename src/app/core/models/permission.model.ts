// ─────────────────────────────────────────────────────────────────────────────
// RBAC Permission Model
// Single source of truth for roles, resources, actions and the permission map.
// Mirrors the user_role ENUM in Supabase (migrations 001 + 003).
// ─────────────────────────────────────────────────────────────────────────────

// ── Roles ─────────────────────────────────────────────────────────────────────

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN       = 'admin',
  MANAGER     = 'manager',
  AGENT       = 'agent',
  VIEWER      = 'viewer',
}

// Ordered from highest to lowest privilege — used for hierarchy checks
export const ROLE_HIERARCHY: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.AGENT,
  UserRole.VIEWER,
];

// ── Actions ───────────────────────────────────────────────────────────────────

export type Action = 'create' | 'read' | 'update' | 'delete' | 'export' | 'import';

export const ALL_ACTIONS: Action[] = ['create', 'read', 'update', 'delete', 'export', 'import'];

// ── Resources ─────────────────────────────────────────────────────────────────

export type Resource =
  | 'contacts'
  | 'companies'
  | 'deals'
  | 'activities'
  | 'reports'
  | 'settings'
  | 'users'
  | 'tags'
  | 'audit_logs'
  | 'email_templates'
  | 'notifications'
  | 'tenants';

// ── Permission interface ──────────────────────────────────────────────────────

export interface Permission {
  resource: Resource;
  actions:  Action[];
}

// ── Route access map ──────────────────────────────────────────────────────────
// Maps URL path prefixes to the minimum role required to access them.

export interface RouteAccess {
  path:         string;   // prefix match, e.g. '/settings'
  minRole:      UserRole;
  allowedRoles: UserRole[];
}

export const ROUTE_ACCESS_MAP: RouteAccess[] = [
  {
    path:         '/dashboard',
    minRole:      UserRole.VIEWER,
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT, UserRole.VIEWER],
  },
  {
    path:         '/contacts',
    minRole:      UserRole.AGENT,
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT],
  },
  {
    path:         '/pipeline',
    minRole:      UserRole.AGENT,
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT],
  },
  {
    path:         '/tasks',
    minRole:      UserRole.AGENT,
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT],
  },
  {
    path:         '/reports',
    minRole:      UserRole.MANAGER,
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
  },
  {
    path:         '/settings',
    minRole:      UserRole.ADMIN,
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },
  {
    path:         '/settings/users',
    minRole:      UserRole.ADMIN,
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },
  {
    path:         '/settings/billing',
    minRole:      UserRole.ADMIN,
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },
];

// ── PERMISSIONS_MAP ───────────────────────────────────────────────────────────
// Defines exactly what each role can do on each resource.
// super_admin inherits everything — handled programmatically in PermissionService.

export const PERMISSIONS_MAP: Record<UserRole, Permission[]> = {

  // ── super_admin: unrestricted across all tenants ──────────────────────────
  [UserRole.SUPER_ADMIN]: ALL_ACTIONS
    ? (['contacts','companies','deals','activities','reports','settings',
        'users','tags','audit_logs','email_templates','notifications','tenants'] as Resource[])
        .map(resource => ({ resource, actions: [...ALL_ACTIONS] }))
    : [],

  // ── admin: full access within their tenant ────────────────────────────────
  [UserRole.ADMIN]: [
    { resource: 'contacts',        actions: ['create','read','update','delete','export','import'] },
    { resource: 'companies',       actions: ['create','read','update','delete','export'] },
    { resource: 'deals',           actions: ['create','read','update','delete','export'] },
    { resource: 'activities',      actions: ['create','read','update','delete'] },
    { resource: 'reports',         actions: ['read','export'] },
    { resource: 'settings',        actions: ['read','update'] },
    { resource: 'users',           actions: ['create','read','update','delete'] },
    { resource: 'tags',            actions: ['create','read','update','delete'] },
    { resource: 'audit_logs',      actions: ['read','export'] },
    { resource: 'email_templates', actions: ['create','read','update','delete'] },
    { resource: 'notifications',   actions: ['read','delete'] },
    { resource: 'tenants',         actions: ['read','update'] },
  ],

  // ── manager: team-scoped access, no user/settings management ─────────────
  [UserRole.MANAGER]: [
    { resource: 'contacts',        actions: ['create','read','update','delete','export','import'] },
    { resource: 'companies',       actions: ['create','read','update','export'] },
    { resource: 'deals',           actions: ['create','read','update','delete','export'] },
    { resource: 'activities',      actions: ['create','read','update','delete'] },
    { resource: 'reports',         actions: ['read','export'] },
    { resource: 'settings',        actions: ['read'] },
    { resource: 'users',           actions: ['read'] },
    { resource: 'tags',            actions: ['create','read','update','delete'] },
    { resource: 'audit_logs',      actions: ['read'] },
    { resource: 'email_templates', actions: ['read'] },
    { resource: 'notifications',   actions: ['read','delete'] },
    { resource: 'tenants',         actions: ['read'] },
  ],

  // ── agent: own records only ───────────────────────────────────────────────
  [UserRole.AGENT]: [
    { resource: 'contacts',        actions: ['create','read','update'] },
    { resource: 'companies',       actions: ['read'] },
    { resource: 'deals',           actions: ['create','read','update'] },
    { resource: 'activities',      actions: ['create','read','update','delete'] },
    { resource: 'reports',         actions: [] },
    { resource: 'settings',        actions: [] },
    { resource: 'users',           actions: ['read'] },
    { resource: 'tags',            actions: ['create','read'] },
    { resource: 'audit_logs',      actions: [] },
    { resource: 'email_templates', actions: [] },
    { resource: 'notifications',   actions: ['read','delete'] },
    { resource: 'tenants',         actions: [] },
  ],

  // ── viewer: read-only on non-sensitive resources ──────────────────────────
  [UserRole.VIEWER]: [
    { resource: 'contacts',        actions: ['read'] },
    { resource: 'companies',       actions: ['read'] },
    { resource: 'deals',           actions: ['read'] },
    { resource: 'activities',      actions: ['read'] },
    { resource: 'reports',         actions: ['read'] },
    { resource: 'settings',        actions: [] },
    { resource: 'users',           actions: [] },
    { resource: 'tags',            actions: ['read'] },
    { resource: 'audit_logs',      actions: [] },
    { resource: 'email_templates', actions: [] },
    { resource: 'notifications',   actions: ['read'] },
    { resource: 'tenants',         actions: [] },
  ],
};

// ── Lookup helper (used internally by PermissionService) ─────────────────────

/**
 * Returns the allowed actions for a given role + resource combination.
 * Returns all actions for super_admin regardless of the map.
 */
export function getActionsForRole(role: UserRole, resource: Resource): Action[] {
  if (role === UserRole.SUPER_ADMIN) return [...ALL_ACTIONS];
  const perms = PERMISSIONS_MAP[role];
  return perms.find(p => p.resource === resource)?.actions ?? [];
}

/**
 * Returns true if `role` is at least as privileged as `minRole`
 * according to ROLE_HIERARCHY.
 */
export function roleAtLeast(role: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY.indexOf(role) <= ROLE_HIERARCHY.indexOf(minRole);
}
