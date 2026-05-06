import { inject } from '@angular/core';
import { ResolveFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { TenantService } from '../services/tenant.service';
import { AuthService } from '../services/auth.service';
import { Tenant, mapTenantRow, TenantRow } from '../models/tenant.model';

// ─────────────────────────────────────────────────────────────────────────────
// TenantResolver
//
// Detects the tenant from the subdomain and loads it before any protected
// route renders. Enables multi-tenant subdomain routing:
//
//   acme.crm.app  →  loads tenant with slug = 'acme'
//   beta.crm.app  →  loads tenant with slug = 'beta'
//
// Production setup:
//   1. Configure a wildcard DNS record: *.crm.app → your server IP
//   2. Configure nginx/Vercel to pass the Host header to the Angular app
//   3. The resolver reads window.location.hostname to extract the slug
//
// Local development:
//   Add to /etc/hosts:  127.0.0.1  acme.localhost
//   Then access:        http://acme.localhost:4200
// ─────────────────────────────────────────────────────────────────────────────

/** Extracts the tenant slug from the current hostname. */
export function extractTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;

  const hostname = window.location.hostname;

  // Skip localhost and IP addresses
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  // Extract subdomain: acme.crm.app → 'acme'
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const subdomain = parts[0];
    // Skip 'www' and 'app' subdomains
    if (subdomain !== 'www' && subdomain !== 'app') {
      return subdomain;
    }
  }

  return null;
}

/**
 * TenantResolver
 *
 * Resolves the tenant from the subdomain before the route activates.
 * If the subdomain doesn't match any tenant, redirects to a 404 page.
 *
 * Usage in routes:
 *   {
 *     path: '',
 *     resolve: { tenant: tenantResolver },
 *     canActivate: [authGuard],
 *     ...
 *   }
 */
export const tenantResolver: ResolveFn<Tenant | null> = async () => {
  const supabase      = inject(SupabaseService);
  const tenantService = inject(TenantService);
  const auth          = inject(AuthService);
  const router        = inject(Router);

  // If tenant is already loaded (e.g. from profile), use it
  const existingTenant = tenantService.currentTenant();
  if (existingTenant) return existingTenant;

  // Try to detect from subdomain
  const slug = extractTenantSlug();
  if (!slug) {
    // No subdomain — fall back to profile-based tenant loading
    const profileTenantId = auth.profile()?.tenantId;
    if (profileTenantId) {
      return tenantService.loadTenant(profileTenantId);
    }
    return null;
  }

  // Load tenant by slug
  const { data, error } = await supabase.client
    .from('tenants')
    .select('id, name, slug, plan, max_users, is_active, settings, created_at, updated_at')
    .eq('slug', slug)
    .eq('is_active', true)
    .single<TenantRow>();

  if (error || !data) {
    console.error('[TenantResolver] Tenant not found for slug:', slug);
    router.navigate(['/not-found']);
    return null;
  }

  const tenant = mapTenantRow(data);

  // Verify the authenticated user belongs to this tenant
  const userTenantId = auth.profile()?.tenantId;
  if (userTenantId && userTenantId !== tenant.id) {
    console.error('[TenantResolver] User does not belong to tenant:', slug);
    router.navigate(['/forbidden']);
    return null;
  }

  // Load and apply the tenant theme
  await tenantService.loadTenant(tenant.id);
  return tenant;
};
