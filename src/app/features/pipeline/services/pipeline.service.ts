import {
  Injectable,
  inject,
  signal,
  computed,
  OnDestroy,
} from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { PermissionService } from '../../../core/services/permission.service';
import { NotificationService } from '../../../core/services/notification.service';
import { EmailService } from '../../../core/services/email.service';
import { NotificationCreatorService } from '../../../core/services/notification-creator.service';
import {
  Deal,
  DealRow,
  DealStage,
  DealStageRow,
  DealStageType,
  DealFilters,
  DealFormValue,
  StageStats,
  mapDealRow,
  mapDealStageRow,
} from '../models/deal.model';

const DEAL_SELECT = `
  id, tenant_id, title, contact_id, company_id, stage, value, currency,
  probability, expected_close_date, assigned_to, created_by, created_at, updated_at,
  contacts ( first_name, last_name ),
  companies ( name ),
  profiles!deals_assigned_to_fkey ( full_name, avatar_url )
`.trim();

@Injectable({ providedIn: 'root' })
export class PipelineService implements OnDestroy {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly supabase      = inject(SupabaseService);
  private readonly auth          = inject(AuthService);
  private readonly permissions   = inject(PermissionService);
  private readonly notify        = inject(NotificationService);
  private readonly emailService  = inject(EmailService);
  private readonly notifCreator  = inject(NotificationCreatorService);

  // ── State ────────────────────────────────────────────────────────────────────
  private readonly _deals   = signal<Deal[]>([]);
  private readonly _stages  = signal<DealStage[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _saving  = signal<boolean>(false);

  readonly deals$   = this._deals.asReadonly();
  readonly stages$  = this._stages.asReadonly();
  readonly loading$ = this._loading.asReadonly();
  readonly saving$  = this._saving.asReadonly();

  /** Deals grouped by stage id — used by the Kanban board */
  readonly dealsByStage = computed<Map<string, Deal[]>>(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of this._stages()) {
      map.set(stage.id, []);
    }
    for (const deal of this._deals()) {
      // Match by stage name (deal.stage is the ENUM value, stage.name is the display name)
      const stage = this._stages().find(
        s => s.name.toLowerCase().replace(/\s+/g, '_') === deal.stage ||
             s.name === deal.stage,
      );
      const key = stage?.id ?? deal.stage;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(deal);
    }
    return map;
  });

  /** Per-stage stats for column headers */
  readonly stageStats = computed<Map<string, StageStats>>(() => {
    const map = new Map<string, StageStats>();
    for (const stage of this._stages()) {
      const deals = this.dealsByStage().get(stage.id) ?? [];
      map.set(stage.id, {
        stageId:    stage.id,
        stageName:  stage.name,
        count:      deals.length,
        totalValue: deals.reduce((sum, d) => sum + d.value, 0),
        currency:   deals[0]?.currency ?? 'USD',
      });
    }
    return map;
  });

  // ── Realtime ─────────────────────────────────────────────────────────────────
  private _channel: RealtimeChannel | null = null;

  ngOnDestroy(): void {
    this._unsubscribe();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // READ
  // ══════════════════════════════════════════════════════════════════════════════

  async getStages(): Promise<DealStage[]> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return [];

    const { data, error } = await this.supabase.client
      .from('deal_stages')
      .select('id, name, order_position, color, is_default')
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order('order_position', { ascending: true })
      .returns<DealStageRow[]>();

    if (error) {
      console.error('[PipelineService] getStages:', error.message);
      return [];
    }

    const stages = (data ?? []).map(mapDealStageRow);
    this._stages.set(stages);
    return stages;
  }

  async getDeals(filters: DealFilters = {
    stage: null, assignedTo: null, minValue: null,
    maxValue: null, dateFrom: null, dateTo: null, search: '',
  }): Promise<Deal[]> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return [];

    this._loading.set(true);
    try {
      let query = this.supabase.client
        .from('deals')
        .select(DEAL_SELECT)
        .eq('tenant_id', tenantId)
        .neq('stage', 'closed_lost'); // exclude lost by default

      if (filters.stage)      query = query.eq('stage', filters.stage);
      if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo);
      if (filters.minValue)   query = query.gte('value', filters.minValue);
      if (filters.maxValue)   query = query.lte('value', filters.maxValue);
      if (filters.dateFrom)   query = query.gte('expected_close_date', filters.dateFrom);
      if (filters.dateTo)     query = query.lte('expected_close_date', filters.dateTo);
      if (filters.search.trim()) {
        query = query.ilike('title', `%${filters.search.trim()}%`);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query.returns<DealRow[]>();

      if (error) {
        console.error('[PipelineService] getDeals:', error.message);
        this.notify.error('Failed to load deals.');
        return [];
      }

      const deals = (data ?? []).map(mapDealRow);
      this._deals.set(deals);
      return deals;

    } finally {
      this._loading.set(false);
    }
  }

  async getDealById(id: string): Promise<Deal | null> {
    const { data, error } = await this.supabase.client
      .from('deals')
      .select(DEAL_SELECT)
      .eq('id', id)
      .single<DealRow>();

    if (error) return null;
    return data ? mapDealRow(data) : null;
  }

  getDealStats(): Map<string, StageStats> {
    return this.stageStats();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // WRITE
  // ══════════════════════════════════════════════════════════════════════════════

  async createDeal(formValue: DealFormValue): Promise<Deal | null> {
    if (!this.permissions.hasPermission('deals', 'create')) {
      this.notify.error('You do not have permission to create deals.');
      return null;
    }

    const tenantId = this.auth.profile()?.tenantId;
    const userId   = this.auth.session()?.user.id;
    if (!tenantId || !userId) return null;

    this._saving.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('deals')
        .insert({
          tenant_id:            tenantId,
          title:                formValue.title.trim(),
          contact_id:           formValue.contactId,
          company_id:           formValue.companyId,
          stage:                formValue.stage,
          value:                formValue.value,
          currency:             formValue.currency,
          probability:          formValue.probability,
          expected_close_date:  formValue.expectedCloseDate,
          assigned_to:          formValue.assignedTo ?? userId,
          created_by:           userId,
        })
        .select(DEAL_SELECT)
        .single<DealRow>();

      if (error) {
        console.error('[PipelineService] createDeal:', error.message);
        this.notify.error('Failed to create deal.');
        return null;
      }

      const deal = mapDealRow(data);
      this._deals.update(list => [deal, ...list]);
      this.notify.success(`Deal "${deal.title}" created.`);
      return deal;

    } finally {
      this._saving.set(false);
    }
  }

  async updateDeal(id: string, patch: Partial<DealFormValue>): Promise<Deal | null> {
    if (!this.permissions.hasPermission('deals', 'update')) {
      this.notify.error('You do not have permission to update deals.');
      return null;
    }

    // Capture previous assignedTo to detect reassignment
    const previousDeal       = this._deals().find(d => d.id === id);
    const previousAssignedTo = previousDeal?.assignedTo ?? null;

    this._saving.set(true);
    try {
      const dbPatch: Record<string, unknown> = {};
      if (patch.title             !== undefined) dbPatch['title']               = patch.title.trim();
      if (patch.contactId         !== undefined) dbPatch['contact_id']          = patch.contactId;
      if (patch.companyId         !== undefined) dbPatch['company_id']          = patch.companyId;
      if (patch.stage             !== undefined) dbPatch['stage']               = patch.stage;
      if (patch.value             !== undefined) dbPatch['value']               = patch.value;
      if (patch.currency          !== undefined) dbPatch['currency']            = patch.currency;
      if (patch.probability       !== undefined) dbPatch['probability']         = patch.probability;
      if (patch.expectedCloseDate !== undefined) dbPatch['expected_close_date'] = patch.expectedCloseDate;
      if (patch.assignedTo        !== undefined) dbPatch['assigned_to']         = patch.assignedTo;

      const { data, error } = await this.supabase.client
        .from('deals')
        .update(dbPatch)
        .eq('id', id)
        .select(DEAL_SELECT)
        .single<DealRow>();

      if (error) {
        console.error('[PipelineService] updateDeal:', error.message);
        this.notify.error('Failed to update deal.');
        return null;
      }

      const updated = mapDealRow(data);
      this._deals.update(list => list.map(d => d.id === id ? updated : d));

      // ── Fire deal_assigned notifications on reassignment ─────────────────
      const newAssignedTo = patch.assignedTo;
      const tenantId      = this.auth.profile()?.tenantId;
      const currentUserId = this.auth.session()?.user.id;

      if (
        newAssignedTo &&
        newAssignedTo !== previousAssignedTo &&
        newAssignedTo !== currentUserId &&
        tenantId
      ) {
        this.notifCreator.notifyDealAssigned(newAssignedTo, tenantId, updated.title, id);
        this._sendDealAssignedEmail(newAssignedTo, updated.title, tenantId);
      }

      return updated;

    } finally {
      this._saving.set(false);
    }
  }

  /**
   * Moves a deal to a new stage.
   * Performs an optimistic update, then persists to Supabase.
   * Returns the previous stage so the caller can undo.
   */
  async moveDeal(
    dealId: string,
    newStage: DealStageType,
  ): Promise<{ previousStage: DealStageType; success: boolean }> {
    const deal = this._deals().find(d => d.id === dealId);
    if (!deal) return { previousStage: 'new', success: false };

    const previousStage = deal.stage;

    // Optimistic update
    this._deals.update(list =>
      list.map(d => d.id === dealId ? { ...d, stage: newStage } : d),
    );

    const { error } = await this.supabase.client
      .from('deals')
      .update({ stage: newStage })
      .eq('id', dealId);

    if (error) {
      console.error('[PipelineService] moveDeal:', error.message);
      // Revert optimistic update
      this._deals.update(list =>
        list.map(d => d.id === dealId ? { ...d, stage: previousStage } : d),
      );
      this.notify.error('Failed to move deal.');
      return { previousStage, success: false };
    }

    // ── Fire deal_won notifications ──────────────────────────────────────────
    if (newStage === 'closed_won' && deal.assignedTo) {
      const tenantId = this.auth.profile()?.tenantId;
      if (tenantId) {
        // In-app notification
        this.notifCreator.notifyDealWon(deal.assignedTo, tenantId, deal.title, dealId);

        // Email to assignee
        this._sendDealWonEmail(deal.assignedTo, deal.title, deal.value, deal.currency, tenantId);
      }
    }

    return { previousStage, success: true };
  }

  /** Reverts a deal to its previous stage (used by Undo in snackbar). */
  async undoMoveDeal(dealId: string, previousStage: DealStageType): Promise<void> {
    await this.moveDeal(dealId, previousStage);
    this.notify.info('Move undone.');
  }

  async deleteDeal(id: string): Promise<boolean> {
    if (!this.permissions.hasPermission('deals', 'delete')) {
      this.notify.error('You do not have permission to delete deals.');
      return false;
    }

    const { error } = await this.supabase.client
      .from('deals')
      .update({ stage: 'closed_lost' })
      .eq('id', id);

    if (error) {
      this.notify.error('Failed to close deal.');
      return false;
    }

    this._deals.update(list => list.filter(d => d.id !== id));
    this.notify.success('Deal marked as lost.');
    return true;
  }

  // ── Realtime ──────────────────────────────────────────────────────────────────

  subscribeToDeals(): void {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;

    this._unsubscribe();

    this._channel = this.supabase.client
      .channel(`deals:${tenantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deals',
          filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          const deal = await this.getDealById((payload.new as { id: string }).id);
          if (deal) this._deals.update(list => [deal, ...list]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'deals',
          filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          const deal = await this.getDealById((payload.new as { id: string }).id);
          if (deal) {
            this._deals.update(list =>
              list.map(d => d.id === deal.id ? deal : d),
            );
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'deals',
          filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const id = (payload.old as { id: string }).id;
          this._deals.update(list => list.filter(d => d.id !== id));
        },
      )
      .subscribe();
  }

  unsubscribeFromDeals(): void {
    this._unsubscribe();
  }

  private _unsubscribe(): void {
    if (this._channel) {
      this.supabase.client.removeChannel(this._channel);
      this._channel = null;
    }
  }

  // ── Email helpers ─────────────────────────────────────────────────────────

  private async _sendDealWonEmail(
    assignedToId: string,
    dealTitle: string,
    dealValue: number,
    currency: string,
    tenantId: string,
  ): Promise<void> {
    const profile = await this.supabase.client
      .from('profiles').select('full_name').eq('id', assignedToId).single();
    const fullName = (profile.data as any)?.full_name ?? 'Team member';
    const formattedValue = new Intl.NumberFormat('en-US', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(dealValue);

    const authUser = await this.supabase.client.auth.admin
      .getUserById(assignedToId).catch(() => ({ data: null }));
    const email = (authUser.data as any)?.user?.email;
    if (email) {
      this.emailService.sendEmail({
        to: email, templateName: 'deal_won', tenantId,
        variables: { user_name: fullName, deal_title: dealTitle, deal_value: formattedValue },
      });
    }
  }

  private async _sendDealAssignedEmail(
    assignedToId: string,
    dealTitle: string,
    tenantId: string,
  ): Promise<void> {
    const profile = await this.supabase.client
      .from('profiles').select('full_name').eq('id', assignedToId).single();
    const fullName = (profile.data as any)?.full_name ?? 'Team member';

    const authUser = await this.supabase.client.auth.admin
      .getUserById(assignedToId).catch(() => ({ data: null }));
    const email = (authUser.data as any)?.user?.email;
    if (email) {
      this.emailService.sendEmail({
        to: email, templateName: 'deal_assigned', tenantId,
        variables: { user_name: fullName, deal_title: dealTitle },
      });
    }
  }
}
