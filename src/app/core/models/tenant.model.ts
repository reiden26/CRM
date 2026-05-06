// ─────────────────────────────────────────────────────────────────────────────
// Tenant domain model
// Mirrors the `tenants` table from migration 002
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum TenantPlan {
  FREE       = 'free',
  PRO        = 'pro',
  ENTERPRISE = 'enterprise',
}

// ── Settings stored in tenants.settings (JSONB) ───────────────────────────────

export interface TenantSettings {
  primaryColor: string;   // hex, e.g. '#1a237e'
  accentColor:  string;   // hex, e.g. '#0288d1'
  logo:         string | null;
  timezone:     string;   // IANA, e.g. 'America/New_York'
  currency:     string;   // ISO 4217, e.g. 'USD'
  language:     string;   // BCP 47, e.g. 'en'
}

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  primaryColor: '#1a237e',
  accentColor:  '#0288d1',
  logo:         null,
  timezone:     'UTC',
  currency:     'USD',
  language:     'en',
};

// ── Plan limits ───────────────────────────────────────────────────────────────

export interface PlanLimits {
  maxUsers:    number;   // -1 = unlimited
  maxContacts: number;
  maxDeals:    number;
  maxStorage:  number;   // MB, -1 = unlimited
  features:    string[]; // feature flags enabled for this plan
}

export const PLAN_LIMITS: Record<TenantPlan, PlanLimits> = {
  [TenantPlan.FREE]: {
    maxUsers:    3,
    maxContacts: 100,
    maxDeals:    50,
    maxStorage:  100,
    features:    ['contacts', 'deals', 'activities'],
  },
  [TenantPlan.PRO]: {
    maxUsers:    25,
    maxContacts: 5_000,
    maxDeals:    2_500,
    maxStorage:  5_000,
    features:    [
      'contacts', 'deals', 'activities',
      'reports', 'email_templates', 'pipeline_custom_stages',
      'bulk_import', 'api_access',
    ],
  },
  [TenantPlan.ENTERPRISE]: {
    maxUsers:    -1,
    maxContacts: -1,
    maxDeals:    -1,
    maxStorage:  -1,
    features:    [
      'contacts', 'deals', 'activities',
      'reports', 'email_templates', 'pipeline_custom_stages',
      'bulk_import', 'api_access',
      'sso', 'audit_logs', 'custom_roles', 'white_label',
      'dedicated_support', 'sla',
    ],
  },
};

// ── Domain model ──────────────────────────────────────────────────────────────

export interface Tenant {
  id:        string;
  name:      string;
  slug:      string;
  plan:      TenantPlan;
  maxUsers:  number;
  isActive:  boolean;
  settings:  TenantSettings;
  createdAt: string;
  updatedAt: string;
}

// ── Raw DB row (snake_case) ───────────────────────────────────────────────────

export interface TenantRow {
  id:         string;
  name:       string;
  slug:       string;
  plan:       string;
  max_users:  number;
  is_active:  boolean;
  settings:   Partial<TenantSettings>;
  created_at: string;
  updated_at: string;
}

// ── Mapper ────────────────────────────────────────────────────────────────────

export function mapTenantRow(row: TenantRow): Tenant {
  return {
    id:       row.id,
    name:     row.name,
    slug:     row.slug,
    plan:     (row.plan as TenantPlan) ?? TenantPlan.FREE,
    maxUsers: row.max_users,
    isActive: row.is_active,
    settings: { ...DEFAULT_TENANT_SETTINGS, ...row.settings },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Resource keys used by plan-limit checks ───────────────────────────────────

export type PlanResource = 'contacts' | 'deals' | 'users' | 'storage';

export interface ResourceCount {
  resource: PlanResource;
  current:  number;
  limit:    number;
  reached:  boolean;
}
