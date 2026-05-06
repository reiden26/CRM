import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { TenantService } from '../services/tenant.service';

/**
 * tenant.guard
 *
 * Runs after authGuard. Verifies:
 *   1. The user has a tenant_id on their profile → else /onboarding
 *   2. The tenant is active (not suspended/expired) → else /subscription-expired
 *
 * Also ensures the tenant is loaded into TenantService before the route renders.
 */
export const tenantGuard: CanActivateFn = async () => {
  const auth          = inject(AuthService);
  const tenantService = inject(TenantService);
  const router        = inject(Router);

  const profile = auth.profile();

  // ── 1. Profile must exist (authGuard should have ensured this) ────────────
  if (!profile) {
    return router.createUrlTree(['/auth/login']);
  }

  // ── 2. User must have a tenant assigned ───────────────────────────────────
  if (!profile.tenantId) {
    return router.createUrlTree(['/onboarding']);
  }

  // ── 3. Load tenant if not already in memory ───────────────────────────────
  let tenant = tenantService.currentTenant();

  if (!tenant || tenant.id !== profile.tenantId) {
    tenant = await tenantService.loadTenant(profile.tenantId);
  }

  if (!tenant) {
    // Tenant record missing — treat as no tenant
    return router.createUrlTree(['/onboarding']);
  }

  // ── 4. Tenant must be active ──────────────────────────────────────────────
  if (!tenant.isActive) {
    return router.createUrlTree(['/subscription-expired']);
  }

  return true;
};
