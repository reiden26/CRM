import { inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { PostgrestFilterBuilder } from '@supabase/postgrest-js';

// ─────────────────────────────────────────────────────────────────────────────
// BaseSupabaseService
//
// Base class for all feature services that query Supabase.
// Guarantees that every query includes a tenant_id filter, preventing
// accidental cross-tenant data leakage.
//
// Usage:
//   @Injectable({ providedIn: 'root' })
//   export class ContactsService extends BaseSupabaseService {
//     async getContacts() {
//       const tenantId = this.requireTenantId();   // throws if null
//       return this.supabase.client
//         .from('contacts')
//         .select('*')
//         .eq('tenant_id', tenantId);              // always scoped
//     }
//   }
// ─────────────────────────────────────────────────────────────────────────────

export abstract class BaseSupabaseService {

  protected readonly supabase = inject(SupabaseService);
  protected readonly auth     = inject(AuthService);

  // ── Tenant guard ──────────────────────────────────────────────────────────

  /**
   * Returns the current tenant ID.
   * Throws a typed error if the user has no tenant assigned.
   * Call this at the start of every query method.
   */
  protected requireTenantId(): string {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) {
      throw new TenantRequiredError(
        'Query attempted without a tenant context. ' +
        'Ensure the user is authenticated and has a tenant assigned.',
      );
    }
    return tenantId;
  }

  /**
   * Returns the current tenant ID or null (no throw).
   * Use when the tenant is optional (e.g. super_admin cross-tenant queries).
   */
  protected getTenantId(): string | null {
    return this.auth.profile()?.tenantId ?? null;
  }

  /**
   * Returns the current user ID.
   * Throws if the user is not authenticated.
   */
  protected requireUserId(): string {
    const userId = this.auth.session()?.user.id;
    if (!userId) {
      throw new Error('Query attempted without an authenticated user.');
    }
    return userId;
  }

  /**
   * Applies .eq('tenant_id', tenantId) to any Supabase query builder.
   * This is the canonical way to scope a query to the current tenant.
   *
   * @example
   * const query = this.supabase.client.from('contacts').select('*');
   * return this.withTenant(query);
   */
  protected withTenant<T>(
    query: PostgrestFilterBuilder<any, any, T>,
  ): PostgrestFilterBuilder<any, any, T> {
    const tenantId = this.requireTenantId();
    return query.eq('tenant_id', tenantId);
  }

  /**
   * Builds a base query for a table, already scoped to the current tenant.
   * Equivalent to: supabase.from(table).select(columns).eq('tenant_id', id)
   */
  protected tenantQuery(table: string, columns = '*') {
    const tenantId = this.requireTenantId();
    return this.supabase.client
      .from(table)
      .select(columns)
      .eq('tenant_id', tenantId);
  }
}

// ── Custom error ──────────────────────────────────────────────────────────────

export class TenantRequiredError extends Error {
  readonly code = 'TENANT_REQUIRED';
  constructor(message: string) {
    super(message);
    this.name = 'TenantRequiredError';
  }
}
