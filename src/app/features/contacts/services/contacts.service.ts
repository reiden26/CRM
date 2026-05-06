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
  Contact,
  ContactRow,
  ContactPage,
  ContactFilters,
  PaginationParams,
  ContactFormValue,
  DEFAULT_PAGINATION,
  mapContactRow,
} from '../models/contact.model';

// ─────────────────────────────────────────────────────────────────────────────
// ContactsService
// ─────────────────────────────────────────────────────────────────────────────

const CONTACT_SELECT = `
  id, tenant_id, company_id, first_name, last_name, email, phone,
  position, source, status, assigned_to, created_by, created_at, updated_at,
  companies ( name ),
  profiles!contacts_assigned_to_fkey ( full_name ),
  contact_tags ( tags ( id, name, color ) )
`.trim();

@Injectable({ providedIn: 'root' })
export class ContactsService implements OnDestroy {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly supabase       = inject(SupabaseService);
  private readonly auth           = inject(AuthService);
  private readonly permissions    = inject(PermissionService);
  private readonly notify         = inject(NotificationService);
  private readonly emailService   = inject(EmailService);
  private readonly notifCreator   = inject(NotificationCreatorService);

  // ── State ────────────────────────────────────────────────────────────────────
  private readonly _contacts    = signal<Contact[]>([]);
  private readonly _total       = signal<number>(0);
  private readonly _loading     = signal<boolean>(false);
  private readonly _saving      = signal<boolean>(false);
  private readonly _selected    = signal<Set<string>>(new Set());

  readonly contacts$    = this._contacts.asReadonly();
  readonly total$       = this._total.asReadonly();
  readonly loading$     = this._loading.asReadonly();
  readonly saving$      = this._saving.asReadonly();
  readonly selectedIds$ = this._selected.asReadonly();
  readonly selectedCount$ = computed(() => this._selected().size);

  // ── Realtime ─────────────────────────────────────────────────────────────────
  private _channel: RealtimeChannel | null = null;

  ngOnDestroy(): void {
    this._unsubscribe();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // READ
  // ══════════════════════════════════════════════════════════════════════════════

  async getContacts(
    filters: ContactFilters,
    pagination: PaginationParams = DEFAULT_PAGINATION,
  ): Promise<ContactPage> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return { data: [], total: 0, page: 0, pageSize: pagination.pageSize };

    this._loading.set(true);
    try {
      let query = this.supabase.client
        .from('contacts')
        .select(CONTACT_SELECT, { count: 'exact' })
        .eq('tenant_id', tenantId);

      // ── Apply filters ────────────────────────────────────────────────────
      if (filters.status)     query = query.eq('status', filters.status);
      if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo);
      if (filters.companyId)  query = query.eq('company_id', filters.companyId);
      if (filters.dateFrom)   query = query.gte('created_at', filters.dateFrom);
      if (filters.dateTo)     query = query.lte('created_at', filters.dateTo);

      if (filters.search.trim()) {
        const q = `%${filters.search.trim()}%`;
        query = query.or(
          `first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q}`,
        );
      }

      // ── Sorting + pagination ─────────────────────────────────────────────
      query = query
        .order(pagination.sortBy as string, { ascending: pagination.sortDir === 'asc' })
        .range(
          pagination.page * pagination.pageSize,
          (pagination.page + 1) * pagination.pageSize - 1,
        );

      const { data, error, count } = await query.returns<ContactRow[]>();

      if (error) {
        console.error('[ContactsService] getContacts:', error.message);
        this.notify.error('Failed to load contacts.');
        return { data: [], total: 0, page: pagination.page, pageSize: pagination.pageSize };
      }

      const contacts = (data ?? []).map(mapContactRow);
      this._contacts.set(contacts);
      this._total.set(count ?? 0);

      return {
        data:     contacts,
        total:    count ?? 0,
        page:     pagination.page,
        pageSize: pagination.pageSize,
      };
    } finally {
      this._loading.set(false);
    }
  }

  async getContactById(id: string): Promise<Contact | null> {
    const { data, error } = await this.supabase.client
      .from('contacts')
      .select(CONTACT_SELECT)
      .eq('id', id)
      .single<ContactRow>();

    if (error) {
      console.error('[ContactsService] getContactById:', error.message);
      return null;
    }
    return data ? mapContactRow(data) : null;
  }

  async searchContacts(query: string, limit = 10): Promise<Contact[]> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId || !query.trim()) return [];

    const q = `%${query.trim()}%`;
    const { data, error } = await this.supabase.client
      .from('contacts')
      .select(CONTACT_SELECT)
      .eq('tenant_id', tenantId)
      .or(`first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q}`)
      .limit(limit)
      .returns<ContactRow[]>();

    if (error) {
      console.error('[ContactsService] searchContacts:', error.message);
      return [];
    }
    return (data ?? []).map(mapContactRow);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // WRITE
  // ══════════════════════════════════════════════════════════════════════════════

  async createContact(formValue: ContactFormValue): Promise<Contact | null> {
    if (!this.permissions.hasPermission('contacts', 'create')) {
      this.notify.error('You do not have permission to create contacts.');
      return null;
    }

    const tenantId = this.auth.profile()?.tenantId;
    const userId   = this.auth.session()?.user.id;
    if (!tenantId || !userId) return null;

    this._saving.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('contacts')
        .insert({
          tenant_id:   tenantId,
          company_id:  formValue.companyId,
          first_name:  formValue.firstName.trim(),
          last_name:   formValue.lastName.trim(),
          email:       formValue.email?.trim() || null,
          phone:       formValue.phone?.trim() || null,
          position:    formValue.position?.trim() || null,
          source:      formValue.source,
          status:      formValue.status,
          assigned_to: formValue.assignedTo ?? userId,
          created_by:  userId,
        })
        .select(CONTACT_SELECT)
        .single<ContactRow>();

      if (error) {
        console.error('[ContactsService] createContact:', error.message);
        this.notify.error('Failed to create contact.');
        return null;
      }

      const contact = mapContactRow(data);
      this._contacts.update(list => [contact, ...list]);
      this._total.update(n => n + 1);
      this.notify.success(`Contact "${contact.fullName}" created.`);
      return contact;

    } finally {
      this._saving.set(false);
    }
  }

  async updateContact(id: string, formValue: Partial<ContactFormValue>): Promise<Contact | null> {
    if (!this.permissions.hasPermission('contacts', 'update')) {
      this.notify.error('You do not have permission to update contacts.');
      return null;
    }

    // Capture previous assignedTo to detect reassignment
    const previousContact = this._contacts().find(c => c.id === id);
    const previousAssignedTo = previousContact?.assignedTo ?? null;

    this._saving.set(true);
    try {
      const patch: Record<string, unknown> = {};
      if (formValue.firstName  !== undefined) patch['first_name']  = formValue.firstName.trim();
      if (formValue.lastName   !== undefined) patch['last_name']   = formValue.lastName.trim();
      if (formValue.email      !== undefined) patch['email']       = formValue.email?.trim() || null;
      if (formValue.phone      !== undefined) patch['phone']       = formValue.phone?.trim() || null;
      if (formValue.companyId  !== undefined) patch['company_id']  = formValue.companyId;
      if (formValue.position   !== undefined) patch['position']    = formValue.position?.trim() || null;
      if (formValue.source     !== undefined) patch['source']      = formValue.source;
      if (formValue.status     !== undefined) patch['status']      = formValue.status;
      if (formValue.assignedTo !== undefined) patch['assigned_to'] = formValue.assignedTo;

      const { data, error } = await this.supabase.client
        .from('contacts')
        .update(patch)
        .eq('id', id)
        .select(CONTACT_SELECT)
        .single<ContactRow>();

      if (error) {
        console.error('[ContactsService] updateContact:', error.message);
        this.notify.error('Failed to update contact.');
        return null;
      }

      const updated = mapContactRow(data);
      this._contacts.update(list =>
        list.map(c => c.id === id ? updated : c),
      );
      this.notify.success('Contact updated.');

      // ── Fire email + in-app notification on reassignment ─────────────────
      const newAssignedTo = formValue.assignedTo;
      const tenantId      = this.auth.profile()?.tenantId;
      const currentUserId = this.auth.session()?.user.id;

      if (
        newAssignedTo &&
        newAssignedTo !== previousAssignedTo &&
        newAssignedTo !== currentUserId &&
        tenantId
      ) {
        const contactName = updated.fullName;

        // In-app notification
        this.notifCreator.notifyContactAssigned(newAssignedTo, tenantId, contactName, id);

        // Email notification — fetch assignee email
        this._sendContactAssignedEmail(newAssignedTo, contactName, tenantId);
      }

      return updated;

    } finally {
      this._saving.set(false);
    }
  }

  private async _sendContactAssignedEmail(
    assignedToId: string,
    contactName: string,
    tenantId: string,
  ): Promise<void> {
    const { data } = await this.supabase.client.auth.admin
      .getUserById(assignedToId)
      .catch(() => ({ data: null }));

    const email    = (data as any)?.user?.email;
    const fullName = (await this.supabase.client
      .from('profiles').select('full_name').eq('id', assignedToId).single()
    ).data?.full_name ?? 'Team member';

    if (email) {
      this.emailService.sendEmail({
        to:           email,
        templateName: 'contact_assigned',
        variables:    { user_name: fullName, contact_name: contactName },
        tenantId,
      });
    }
  }

  /** Soft delete: sets status = 'archived' */
  async deleteContact(id: string): Promise<boolean> {
    if (!this.permissions.hasPermission('contacts', 'delete')) {
      this.notify.error('You do not have permission to delete contacts.');
      return false;
    }

    this._saving.set(true);
    try {
      const { error } = await this.supabase.client
        .from('contacts')
        .update({ status: 'archived' })
        .eq('id', id);

      if (error) {
        console.error('[ContactsService] deleteContact:', error.message);
        this.notify.error('Failed to archive contact.');
        return false;
      }

      this._contacts.update(list => list.filter(c => c.id !== id));
      this._total.update(n => Math.max(0, n - 1));
      this.notify.success('Contact archived.');
      return true;

    } finally {
      this._saving.set(false);
    }
  }

  // ── Bulk operations ───────────────────────────────────────────────────────────

  async bulkAssign(ids: string[], assignedTo: string): Promise<boolean> {
    if (!this.permissions.hasPermission('contacts', 'update')) {
      this.notify.error('You do not have permission to reassign contacts.');
      return false;
    }

    const { error } = await this.supabase.client
      .from('contacts')
      .update({ assigned_to: assignedTo })
      .in('id', ids);

    if (error) {
      this.notify.error('Failed to reassign contacts.');
      return false;
    }

    this.notify.success(`${ids.length} contact(s) reassigned.`);
    this._selected.set(new Set());
    return true;
  }

  async bulkDelete(ids: string[]): Promise<boolean> {
    if (!this.permissions.hasPermission('contacts', 'delete')) {
      this.notify.error('You do not have permission to delete contacts.');
      return false;
    }

    const { error } = await this.supabase.client
      .from('contacts')
      .update({ status: 'archived' })
      .in('id', ids);

    if (error) {
      this.notify.error('Failed to archive contacts.');
      return false;
    }

    this._contacts.update(list => list.filter(c => !ids.includes(c.id)));
    this._total.update(n => Math.max(0, n - ids.length));
    this.notify.success(`${ids.length} contact(s) archived.`);
    this._selected.set(new Set());
    return true;
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  exportToCsv(contacts: Contact[]): void {
    if (!this.permissions.hasPermission('contacts', 'export')) {
      this.notify.error('You do not have permission to export contacts.');
      return;
    }

    const headers = [
      'First Name', 'Last Name', 'Email', 'Phone',
      'Company', 'Position', 'Status', 'Source',
      'Assigned To', 'Created At',
    ];

    const rows = contacts.map(c => [
      c.firstName, c.lastName, c.email ?? '', c.phone ?? '',
      c.companyName ?? '', c.position ?? '', c.status, c.source ?? '',
      c.assignedToName ?? '', c.createdAt,
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Selection helpers ─────────────────────────────────────────────────────────

  toggleSelect(id: string): void {
    this._selected.update(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  selectAll(ids: string[]): void {
    this._selected.set(new Set(ids));
  }

  clearSelection(): void {
    this._selected.set(new Set());
  }

  isSelected(id: string): boolean {
    return this._selected().has(id);
  }

  // ── Realtime ──────────────────────────────────────────────────────────────────

  subscribeToChanges(): void {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;

    this._unsubscribe();

    this._channel = this.supabase.client
      .channel(`contacts:${tenantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contacts',
          filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          // Fetch full row with joins
          const contact = await this.getContactById((payload.new as { id: string }).id);
          if (contact) {
            this._contacts.update(list => [contact, ...list]);
            this._total.update(n => n + 1);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'contacts',
          filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          const contact = await this.getContactById((payload.new as { id: string }).id);
          if (contact) {
            this._contacts.update(list =>
              list.map(c => c.id === contact.id ? contact : c),
            );
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'contacts',
          filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const id = (payload.old as { id: string }).id;
          this._contacts.update(list => list.filter(c => c.id !== id));
          this._total.update(n => Math.max(0, n - 1));
        },
      )
      .subscribe();
  }

  unsubscribeFromChanges(): void {
    this._unsubscribe();
  }

  private _unsubscribe(): void {
    if (this._channel) {
      this.supabase.client.removeChannel(this._channel);
      this._channel = null;
    }
  }
}
