import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { SecurityEventType, SecurityEvent } from './security.service';

// ─────────────────────────────────────────────────────────────────────────────
// SecurityAuditService
//
// Logs security events to the audit_logs table and detects tenant mismatches.
// Kept separate from SecurityService to avoid circular dependencies
// (SecurityService ← AuthService ← SecurityAuditService).
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class SecurityAuditService {

  private readonly supabase = inject(SupabaseService);

  /**
   * Logs a security event to the audit_logs table.
   * Fire-and-forget — never throws.
   */
  async logSecurityEvent(
    type: SecurityEventType,
    userId: string | null,
    tenantId: string | null,
    details?: Record<string, unknown>,
  ): Promise<void> {
    const event: SecurityEvent = {
      type,
      userId:    userId ?? undefined,
      tenantId:  tenantId ?? undefined,
      details,
      timestamp: new Date().toISOString(),
    };

    try {
      // Use a synthetic record_id for security events
      const { error } = await this.supabase.client
        .from('audit_logs')
        .insert({
          user_id:    userId,
          tenant_id:  tenantId,
          action:     'INSERT',
          table_name: '_security_events',
          record_id:  crypto.randomUUID(),
          old_data:   null,
          new_data:   event as unknown as Record<string, unknown>,
        });

      if (error) {
        console.error('[SecurityAuditService] logSecurityEvent error:', error.message);
      }
    } catch (err) {
      console.error('[SecurityAuditService] unexpected error:', err);
    }
  }

  /**
   * Detects a tenant mismatch between the JWT claim and the profile signal.
   *
   * Supabase embeds the user's metadata in the JWT. If the tenant_id in the
   * JWT differs from what's in the profiles table, it could indicate a
   * session hijacking or stale token scenario.
   *
   * Returns true if a mismatch is detected (caller should force logout).
   */
  async detectTenantMismatch(
    jwtUserId: string,
    profileTenantId: string | null,
  ): Promise<boolean> {
    if (!profileTenantId) return false;

    try {
      // Fetch the tenant_id directly from the DB (bypasses any cached signal)
      const { data, error } = await this.supabase.client
        .from('profiles')
        .select('tenant_id')
        .eq('id', jwtUserId)
        .single<{ tenant_id: string | null }>();

      if (error || !data) return false;

      const dbTenantId = data.tenant_id;

      if (dbTenantId && dbTenantId !== profileTenantId) {
        console.error(
          '[SecurityAuditService] TENANT MISMATCH detected!',
          { jwt: jwtUserId, signal: profileTenantId, db: dbTenantId },
        );

        await this.logSecurityEvent(
          'tenant_mismatch',
          jwtUserId,
          profileTenantId,
          { signalTenantId: profileTenantId, dbTenantId },
        );

        return true;
      }

      return false;

    } catch (err) {
      console.error('[SecurityAuditService] detectTenantMismatch error:', err);
      return false;
    }
  }
}
