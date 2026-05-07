import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard data types
// ─────────────────────────────────────────────────────────────────────────────

export interface KPIData {
  totalContacts:     number;
  contactsChange:    number;   // % vs previous period
  activeDeals:       number;
  dealsChange:       number;
  pipelineValue:     number;
  pipelineChange:    number;
  conversionRate:    number;   // closed_won / (closed_won + closed_lost) * 100
  conversionChange:  number;
  currency:          string;
}

export interface DealsByStage {
  stage:      string; // canonical stage key: new, qualified, ...
  count:      number;
  value:      number;
  color:      string;
}

export interface RevenueByMonth {
  month:    string;   // 'Jan', 'Feb', …
  revenue:  number;
  deals:    number;
}

export interface ActivityFeedItem {
  id:          string;
  type:        string;
  title:       string;
  description: string | null;
  userName:    string;
  userAvatar:  string | null;
  contactName: string | null;
  createdAt:   string;
}

export interface MyTask {
  id:          string;
  type:        string;
  title:       string;
  description: string | null;
  dueDate:     string | null;
  contactName: string | null;
  dealTitle:   string | null;
  isOverdue:   boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// DashboardService
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DashboardService {

  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);

  // ── KPIs ──────────────────────────────────────────────────────────────────────

  async getKPIs(dateFrom?: string, dateTo?: string): Promise<KPIData> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return this._emptyKPIs();

    const now      = new Date();
    const thisFrom = dateFrom ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisTo   = dateTo   ?? now.toISOString();

    // Previous period: same duration, one period back
    const duration = new Date(thisTo).getTime() - new Date(thisFrom).getTime();
    const prevFrom = new Date(new Date(thisFrom).getTime() - duration).toISOString();
    const prevTo   = thisFrom;

    const [
      contactsNow, contactsPrev,
      dealsNow, dealsPrev,
      wonNow, wonPrev,
      lostNow, lostPrev,
    ] = await Promise.all([
      this._countTable('contacts', tenantId, thisFrom, thisTo),
      this._countTable('contacts', tenantId, prevFrom, prevTo),
      this._countActiveDeals(tenantId),
      this._countActiveDeals(tenantId, prevFrom, prevTo),
      this._countDeals(tenantId, 'closed_won', thisFrom, thisTo),
      this._countDeals(tenantId, 'closed_won', prevFrom, prevTo),
      this._countDeals(tenantId, 'closed_lost', thisFrom, thisTo),
      this._countDeals(tenantId, 'closed_lost', prevFrom, prevTo),
    ]);

    const pipelineValue = await this._getPipelineValue(tenantId);
    const prevPipelineValue = await this._getPipelineValue(tenantId, prevFrom, prevTo);

    const conversionRate = wonNow + lostNow > 0
      ? Math.round((wonNow / (wonNow + lostNow)) * 100)
      : 0;
    const prevConversionRate = wonPrev + lostPrev > 0
      ? Math.round((wonPrev / (wonPrev + lostPrev)) * 100)
      : 0;

    return {
      totalContacts:    contactsNow,
      contactsChange:   this._pctChange(contactsNow, contactsPrev),
      activeDeals:      dealsNow,
      dealsChange:      this._pctChange(dealsNow, dealsPrev),
      pipelineValue,
      pipelineChange:   this._pctChange(pipelineValue, prevPipelineValue),
      conversionRate,
      conversionChange: conversionRate - prevConversionRate,
      currency:         'USD',
    };
  }

  // ── Deals by stage ────────────────────────────────────────────────────────────

  async getDealsByStage(dateFrom?: string, dateTo?: string): Promise<DealsByStage[]> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return [];

    // Get stages with their colors
    const { data: stages } = await this.supabase.client
      .from('deal_stages')
      .select('name, color, order_position, tenant_id')
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order('order_position');

    if (!stages) return [];

    // Get deal counts + values per stage
    let query = this.supabase.client
      .from('deals')
      .select('stage, value')
      .eq('tenant_id', tenantId);

    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo)   query = query.lte('created_at', dateTo);

    const { data: deals } = await query;
    if (!deals) return [];

    // Aggregate
    const stageMap = new Map<string, { count: number; value: number }>();
    for (const deal of deals as { stage: string; value: number }[]) {
      const existing = stageMap.get(deal.stage) ?? { count: 0, value: 0 };
      stageMap.set(deal.stage, {
        count: existing.count + 1,
        value: existing.value + deal.value,
      });
    }

    const byKey = new Map<string, { name: string; color: string; tenant_id?: string | null; order_position: number }>();
    for (const s of stages as { name: string; color: string; tenant_id?: string | null; order_position: number }[]) {
      const key = this._normalizeStageName(s.name);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, s);
        continue;
      }
      const currentIsTenant = Boolean(s.tenant_id);
      const existingIsTenant = Boolean(existing.tenant_id);
      if (currentIsTenant && !existingIsTenant) {
        byKey.set(key, s);
      }
    }

    return Array.from(byKey.entries()).map(([key, s]) => {
      const stats = stageMap.get(key) ?? stageMap.get(s.name) ?? { count: 0, value: 0 };
      return {
        stage: key,
        count: stats.count,
        value: stats.value,
        color: s.color,
      };
    }).filter(s => s.count > 0 || s.stage !== 'closed_lost');
  }

  // ── Revenue by month ──────────────────────────────────────────────────────────

  async getRevenueByMonth(year: number): Promise<RevenueByMonth[]> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return [];

    const { data } = await this.supabase.client
      .from('deals')
      .select('value, expected_close_date')
      .eq('tenant_id', tenantId)
      .eq('stage', 'closed_won')
      .gte('expected_close_date', `${year}-01-01`)
      .lte('expected_close_date', `${year}-12-31`);

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const result: RevenueByMonth[] = months.map(m => ({ month: m, revenue: 0, deals: 0 }));

    for (const deal of (data ?? []) as { value: number; expected_close_date: string }[]) {
      const monthIdx = new Date(deal.expected_close_date).getMonth();
      result[monthIdx].revenue += deal.value;
      result[monthIdx].deals   += 1;
    }

    return result;
  }

  // ── Activity feed ─────────────────────────────────────────────────────────────

  async getActivityFeed(limit = 20): Promise<ActivityFeedItem[]> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return [];

    const { data, error } = await this.supabase.client
      .from('activities')
      .select(`
        id, type, title, description, created_at, created_by,
        contacts ( first_name, last_name )
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    const creatorIds = [...new Set((data as any[]).map((a) => a.created_by).filter(Boolean))];
    let creators = new Map<string, { full_name: string | null; avatar_url: string | null }>();
    if (creatorIds.length > 0) {
      const { data: profiles } = await this.supabase.client
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', creatorIds);
      creators = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    }

    return (data as any[]).map(a => {
      const creator = creators.get(a.created_by);
      return {
        id:          a.id,
        type:        a.type,
        title:       a.title,
        description: a.description,
        userName:    creator?.full_name ?? 'Unknown',
        userAvatar:  creator?.avatar_url ?? null,
        contactName: a.contacts
          ? `${a.contacts.first_name} ${a.contacts.last_name}`.trim()
          : null,
        createdAt:   a.created_at,
      };
    });
  }

  // ── My tasks ──────────────────────────────────────────────────────────────────

  async getMyTasks(): Promise<MyTask[]> {
    const userId   = this.auth.session()?.user.id;
    const tenantId = this.auth.profile()?.tenantId;
    if (!userId || !tenantId) return [];

    const { data, error } = await this.supabase.client
      .from('activities')
      .select(`
        id, type, title, description, due_date,
        contacts ( first_name, last_name ),
        deals ( title )
      `)
      .eq('tenant_id', tenantId)
      .eq('assigned_to', userId)
      .is('completed_at', null)
      .in('type', ['task', 'call', 'meeting', 'email'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20);

    if (error || !data) return [];

    const now = new Date();
    return (data as any[]).map(a => {
      const dueDate  = a.due_date ? new Date(a.due_date) : null;
      const isOverdue = dueDate ? dueDate < now : false;
      return {
        id:          a.id,
        type:        a.type,
        title:       a.title,
        description: a.description,
        dueDate:     a.due_date,
        contactName: a.contacts
          ? `${a.contacts.first_name} ${a.contacts.last_name}`.trim()
          : null,
        dealTitle:   a.deals?.title ?? null,
        isOverdue,
      };
    });
  }

  // ── Complete task ─────────────────────────────────────────────────────────────

  async completeTask(taskId: string): Promise<boolean> {
    const { error } = await this.supabase.client
      .from('activities')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', taskId);
    return !error;
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async _countTable(
    table: string,
    tenantId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const { count } = await this.supabase.client
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', from)
      .lte('created_at', to);
    return count ?? 0;
  }

  private async _countActiveDeals(
    tenantId: string,
    from?: string,
    to?: string,
  ): Promise<number> {
    let q = this.supabase.client
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('stage', 'in', '("closed_won","closed_lost")');
    if (from) q = q.gte('created_at', from);
    if (to)   q = q.lte('created_at', to);
    const { count } = await q;
    return count ?? 0;
  }

  private async _countDeals(
    tenantId: string,
    stage: string,
    from: string,
    to: string,
  ): Promise<number> {
    const { count } = await this.supabase.client
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('stage', stage)
      .gte('created_at', from)
      .lte('created_at', to);
    return count ?? 0;
  }

  private async _getPipelineValue(
    tenantId: string,
    from?: string,
    to?: string,
  ): Promise<number> {
    let q = this.supabase.client
      .from('deals')
      .select('value')
      .eq('tenant_id', tenantId)
      .not('stage', 'in', '("closed_won","closed_lost")');
    if (from) q = q.gte('created_at', from);
    if (to)   q = q.lte('created_at', to);
    const { data } = await q;
    return (data ?? []).reduce((sum: number, d: any) => sum + (d.value ?? 0), 0);
  }

  private _pctChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  private _emptyKPIs(): KPIData {
    return {
      totalContacts: 0, contactsChange: 0,
      activeDeals: 0,   dealsChange: 0,
      pipelineValue: 0, pipelineChange: 0,
      conversionRate: 0, conversionChange: 0,
      currency: 'USD',
    };
  }

  private _normalizeStageName(name: string): string {
    const normalized = name.toLowerCase().trim().replace(/[\s-]+/g, '_');
    const map: Record<string, string> = {
      new: 'new',
      nuevo: 'new',
      qualified: 'qualified',
      calificado: 'qualified',
      proposal: 'proposal',
      propuesta: 'proposal',
      negotiation: 'negotiation',
      negociacion: 'negotiation',
      'negociación': 'negotiation',
      closed_won: 'closed_won',
      ganado: 'closed_won',
      cerrada_ganada: 'closed_won',
      closed_lost: 'closed_lost',
      perdido: 'closed_lost',
      cerrada_perdida: 'closed_lost',
    };
    return map[normalized] ?? normalized;
  }
}
