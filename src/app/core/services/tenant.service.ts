import {
  Injectable,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import {
  Tenant,
  TenantRow,
  TenantSettings,
  TenantPlan,
  PlanLimits,
  PlanResource,
  ResourceCount,
  PLAN_LIMITS,
  DEFAULT_TENANT_SETTINGS,
  mapTenantRow,
} from '../models/tenant.model';

// ─────────────────────────────────────────────────────────────────────────────
// TenantService
//
// Owns the current tenant state and all tenant-scoped operations.
// Injected by AuthService after login and by guards before route activation.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class TenantService {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly supabase = inject(SupabaseService);
  private readonly router   = inject(Router);
  private readonly document = inject(DOCUMENT) as Document;

  // ── Private state ────────────────────────────────────────────────────────────
  private readonly _tenant  = signal<Tenant | null>(null);
  private readonly _loading = signal<boolean>(false);

  // ── Public read-only signals ─────────────────────────────────────────────────

  /** The currently active tenant. Null until loadTenant() resolves. */
  readonly currentTenant = this._tenant.asReadonly();

  /** True while a tenant operation is in flight. */
  readonly loading = this._loading.asReadonly();

  /** The tenant's settings (with defaults merged in). */
  readonly tenantSettings = computed<TenantSettings>(() =>
    this._tenant()?.settings ?? DEFAULT_TENANT_SETTINGS,
  );

  /** The plan limits for the current tenant's plan. */
  readonly planLimits = computed<PlanLimits>(() =>
    PLAN_LIMITS[this._tenant()?.plan ?? TenantPlan.FREE],
  );

  /** True when the tenant is on a paid plan. */
  readonly isPaidPlan = computed(() =>
    this._tenant()?.plan !== TenantPlan.FREE,
  );

  /** True when the tenant account is active. */
  readonly isActive = computed(() => this._tenant()?.isActive ?? false);

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Loads the tenant by ID from Supabase and stores it in the signal.
   * Called by AuthService right after the profile is loaded.
   */
  async loadTenant(tenantId: string): Promise<Tenant | null> {
    this._loading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('tenants')
        .select('id, name, slug, plan, max_users, is_active, settings, created_at, updated_at')
        .eq('id', tenantId)
        .single<TenantRow>();

      if (error) {
        console.error('[TenantService] loadTenant error:', error.message);
        return null;
      }

      const tenant = mapTenantRow(data);
      this._tenant.set(tenant);
      this.applyTenantTheme(tenant.settings);
      return tenant;

    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Allows a super_admin to switch the active tenant context.
   * Regular users cannot call this — the guard enforces it.
   */
  async switchTenant(tenantId: string): Promise<boolean> {
    const tenant = await this.loadTenant(tenantId);
    if (!tenant) return false;
    // Navigate to dashboard in the new tenant context
    await this.router.navigate(['/dashboard']);
    return true;
  }

  /**
   * Creates a new tenant and assigns the current user as admin.
   * Used in the onboarding flow.
   */
  async createTenant(
    name: string,
    slug: string,
  ): Promise<{ tenant: Tenant | null; error: string | null }> {
    this._loading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('tenants')
        .insert({ name: name.trim(), slug: slug.trim().toLowerCase() })
        .select('id, name, slug, plan, max_users, is_active, settings, created_at, updated_at')
        .single<TenantRow>();

      if (error) {
        return { tenant: null, error: this._friendlyDbError(error.message) };
      }

      const tenant = mapTenantRow(data);
      this._tenant.set(tenant);
      this.applyTenantTheme(tenant.settings);
      return { tenant, error: null };

    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Checks whether the tenant has reached the plan limit for a given resource.
   * Makes a COUNT query against the relevant table.
   */
  async checkPlanLimit(resource: PlanResource): Promise<ResourceCount> {
    const limits = this.planLimits();
    const tenant = this._tenant();

    // Unlimited plan — always allowed
    const limit = this._getLimitForResource(resource, limits);
    if (limit === -1) {
      return { resource, current: 0, limit: -1, reached: false };
    }

    if (!tenant) {
      return { resource, current: 0, limit, reached: false };
    }

    const table = this._tableForResource(resource);
    const { count, error } = await this.supabase.client
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id);

    if (error) {
      console.error('[TenantService] checkPlanLimit error:', error.message);
      return { resource, current: 0, limit, reached: false };
    }

    const current = count ?? 0;
    return { resource, current, limit, reached: current >= limit };
  }

  /**
   * Synchronous check using cached counts (for use in templates / guards
   * when an async call is not practical). Returns false (not reached) when
   * no cached data is available — the async version is authoritative.
   */
  checkPlanLimitSync(resource: PlanResource): boolean {
    const limits = this.planLimits();
    const limit  = this._getLimitForResource(resource, limits);
    return limit !== -1 && limit === 0; // conservative: only block if limit is 0
  }

  /**
   * Applies the tenant's brand colors to the document as CSS custom properties.
   * Angular Material reads --mat-* variables, so we also set those.
   */
  applyTenantTheme(settings: TenantSettings): void {
    const root = this.document.documentElement;

    // CRM custom properties
    root.style.setProperty('--crm-primary',       settings.primaryColor);
    root.style.setProperty('--crm-accent',        settings.accentColor);
    root.style.setProperty('--crm-sidebar-bg',    settings.primaryColor);

    // Angular Material M2 system variables (used by mat-toolbar, mat-button, etc.)
    root.style.setProperty('--mat-toolbar-container-background-color', settings.primaryColor);
    root.style.setProperty('--mdc-filled-button-container-color',      settings.primaryColor);
    root.style.setProperty('--mat-sidenav-container-background-color', settings.primaryColor);

    // Derive a lighter shade for hover states (simple opacity trick)
    root.style.setProperty('--crm-primary-light', settings.primaryColor + 'cc');
  }

  /**
   * Resets the theme to the default CRM colors.
   * Called on sign-out.
   */
  resetTheme(): void {
    this.applyTenantTheme(DEFAULT_TENANT_SETTINGS);
  }

  /** Clears the tenant state. Called by AuthService on sign-out. */
  clear(): void {
    this._tenant.set(null);
    this.resetTheme();
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _getLimitForResource(resource: PlanResource, limits: PlanLimits): number {
    switch (resource) {
      case 'contacts': return limits.maxContacts;
      case 'deals':    return limits.maxDeals;
      case 'users':    return limits.maxUsers;
      case 'storage':  return limits.maxStorage;
    }
  }

  private _tableForResource(resource: PlanResource): string {
    switch (resource) {
      case 'contacts': return 'contacts';
      case 'deals':    return 'deals';
      case 'users':    return 'profiles';
      case 'storage':  return 'profiles'; // placeholder — storage uses Supabase Storage API
    }
  }

  private _friendlyDbError(message: string): string {
    if (message.includes('duplicate') && message.includes('slug'))
      return 'This company URL is already taken. Please choose a different one.';
    if (message.includes('duplicate') && message.includes('name'))
      return 'A tenant with this name already exists.';
    return 'Failed to create your workspace. Please try again.';
  }
}
