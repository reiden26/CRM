import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

// ─────────────────────────────────────────────────────────────────────────────
// EmailService
//
// Calls the Supabase Edge Function `send-email`.
// Fire-and-forget — errors are logged but never thrown.
//
// IMPORTANT: Does NOT inject AuthService to avoid circular dependency.
// The tenantId must be passed explicitly by the caller.
// ─────────────────────────────────────────────────────────────────────────────

export interface EmailPayload {
  to:           string;
  templateName: string;
  variables:    Record<string, string>;
  tenantId:     string;   // required — caller must provide it
}

@Injectable({ providedIn: 'root' })
export class EmailService {

  // Only inject SupabaseService — no AuthService to avoid circular dep
  private readonly supabase = inject(SupabaseService);

  async sendEmail(payload: EmailPayload): Promise<boolean> {
    if (!payload.tenantId) {
      console.warn('[EmailService] sendEmail skipped: no tenantId');
      return false;
    }

    try {
      const { error } = await this.supabase.client.functions.invoke('send-email', {
        body: {
          to:           payload.to,
          templateName: payload.templateName,
          variables:    payload.variables,
          tenantId:     payload.tenantId,
        },
      });

      if (error) {
        console.error('[EmailService] send-email error:', error.message);
        return false;
      }
      return true;

    } catch (err) {
      console.error('[EmailService] unexpected error:', err);
      return false;
    }
  }

  // ── Convenience helpers — caller must pass tenantId ───────────────────────

  sendWelcome(to: string, userName: string, companyName: string, tenantId: string): void {
    void this.sendEmail({
      to, templateName: 'welcome', tenantId,
      variables: { user_name: userName, company_name: companyName },
    });
  }

  sendDealWon(to: string, userName: string, dealTitle: string, dealValue: string, tenantId: string): void {
    void this.sendEmail({
      to, templateName: 'deal_won', tenantId,
      variables: { user_name: userName, deal_title: dealTitle, deal_value: dealValue },
    });
  }

  sendTaskReminder(to: string, userName: string, taskTitle: string, dueDate: string, tenantId: string, contactName = ''): void {
    void this.sendEmail({
      to, templateName: 'task_reminder', tenantId,
      variables: { user_name: userName, task_title: taskTitle, due_date: dueDate, contact_name: contactName },
    });
  }
}
