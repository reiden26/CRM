import {
  Injectable,
  inject,
  signal,
  OnDestroy,
} from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { PermissionService } from '../../../core/services/permission.service';
import { NotificationService } from '../../../core/services/notification.service';
import { EmailService } from '../../../core/services/email.service';
import { NotificationCreatorService } from '../../../core/services/notification-creator.service';

// ─────────────────────────────────────────────────────────────────────────────
// Task / Activity types
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityType = 'call' | 'email' | 'meeting' | 'task' | 'note';

export interface Task {
  id:          string;
  tenantId:    string;
  type:        ActivityType;
  title:       string;
  description: string | null;
  contactId:   string | null;
  contactName: string | null;
  dealId:      string | null;
  dealTitle:   string | null;
  assignedTo:  string | null;
  assignedToName: string | null;
  createdBy:   string | null;
  dueDate:     string | null;
  completedAt: string | null;
  createdAt:   string;
  updatedAt:   string;
  isOverdue:   boolean;
  isDueSoon:   boolean;   // due within 24h
}

export interface TaskFormValue {
  type:        ActivityType;
  title:       string;
  description: string | null;
  contactId:   string | null;
  dealId:      string | null;
  assignedTo:  string | null;
  dueDate:     string | null;
}

interface TaskRow {
  id:           string;
  tenant_id:    string;
  type:         ActivityType;
  title:        string;
  description:  string | null;
  contact_id:   string | null;
  deal_id:      string | null;
  assigned_to:  string | null;
  created_by:   string | null;
  due_date:     string | null;
  completed_at: string | null;
  created_at:   string;
  updated_at:   string;
  contacts?:    { first_name: string; last_name: string } | null;
  deals?:       { title: string } | null;
}

const TASK_SELECT = `
  id, tenant_id, type, title, description, contact_id, deal_id,
  assigned_to, created_by, due_date, completed_at, created_at, updated_at,
  contacts ( first_name, last_name ),
  deals ( title )
`.trim();

function mapTaskRow(r: TaskRow): Task {
  const now     = new Date();
  const dueDate = r.due_date ? new Date(r.due_date) : null;
  const hoursLeft = dueDate
    ? (dueDate.getTime() - now.getTime()) / 3_600_000
    : null;

  return {
    id:             r.id,
    tenantId:       r.tenant_id,
    type:           r.type,
    title:          r.title,
    description:    r.description,
    contactId:      r.contact_id,
    contactName:    r.contacts
      ? `${r.contacts.first_name} ${r.contacts.last_name}`.trim()
      : null,
    dealId:         r.deal_id,
    dealTitle:      r.deals?.title ?? null,
    assignedTo:     r.assigned_to,
    assignedToName: null,
    createdBy:      r.created_by,
    dueDate:        r.due_date,
    completedAt:    r.completed_at,
    createdAt:      r.created_at,
    updatedAt:      r.updated_at,
    isOverdue:      hoursLeft !== null && hoursLeft < 0 && !r.completed_at,
    isDueSoon:      hoursLeft !== null && hoursLeft >= 0 && hoursLeft <= 24 && !r.completed_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TasksService
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class TasksService implements OnDestroy {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly supabase      = inject(SupabaseService);
  private readonly auth          = inject(AuthService);
  private readonly permissions   = inject(PermissionService);
  private readonly notify        = inject(NotificationService);
  private readonly emailService  = inject(EmailService);
  private readonly notifCreator  = inject(NotificationCreatorService);

  // ── State ────────────────────────────────────────────────────────────────────
  private readonly _tasks   = signal<Task[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _saving  = signal<boolean>(false);

  readonly tasks$   = this._tasks.asReadonly();
  readonly loading$ = this._loading.asReadonly();
  readonly saving$  = this._saving.asReadonly();

  private _channel: RealtimeChannel | null = null;

  ngOnDestroy(): void { this._unsubscribe(); }

  // ══════════════════════════════════════════════════════════════════════════
  // READ
  // ══════════════════════════════════════════════════════════════════════════

  async getTasks(filters: {
    assignedTo?: string;
    contactId?:  string;
    dealId?:     string;
    completed?:  boolean;
    dueSoon?:    boolean;
  } = {}): Promise<Task[]> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return [];

    this._loading.set(true);
    try {
      let q = this.supabase.client
        .from('activities')
        .select(TASK_SELECT)
        .eq('tenant_id', tenantId)
        .in('type', ['task', 'call', 'meeting', 'email'])
        .order('due_date', { ascending: true, nullsFirst: false });

      if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo);
      if (filters.contactId)  q = q.eq('contact_id', filters.contactId);
      if (filters.dealId)     q = q.eq('deal_id', filters.dealId);
      if (filters.completed === false) q = q.is('completed_at', null);
      if (filters.completed === true)  q = q.not('completed_at', 'is', null);
      if (filters.dueSoon) {
        const in24h = new Date(Date.now() + 24 * 3_600_000).toISOString();
        q = q.lte('due_date', in24h).is('completed_at', null);
      }

      const { data, error } = await q.returns<TaskRow[]>();
      if (error) {
        console.error('[TasksService] getTasks:', error.message);
        return [];
      }

      const tasks = (data ?? []).map(mapTaskRow);
      this._tasks.set(tasks);
      return tasks;

    } finally {
      this._loading.set(false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRITE
  // ══════════════════════════════════════════════════════════════════════════

  async createTask(formValue: TaskFormValue): Promise<Task | null> {
    if (!this.permissions.hasPermission('activities', 'create')) {
      this.notify.error('You do not have permission to create tasks.');
      return null;
    }

    const tenantId = this.auth.profile()?.tenantId;
    const userId   = this.auth.session()?.user.id;
    if (!tenantId || !userId) return null;

    this._saving.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('activities')
        .insert({
          tenant_id:   tenantId,
          type:        formValue.type,
          title:       formValue.title.trim(),
          description: formValue.description,
          contact_id:  formValue.contactId,
          deal_id:     formValue.dealId,
          assigned_to: formValue.assignedTo ?? userId,
          created_by:  userId,
          due_date:    formValue.dueDate,
        })
        .select(TASK_SELECT)
        .single<TaskRow>();

      if (error) {
        console.error('[TasksService] createTask:', error.message);
        this.notify.error('Failed to create task.');
        return null;
      }

      const task = mapTaskRow(data);
      this._tasks.update(list => [task, ...list]);
      this.notify.success('Task created.');

      // ── Notify assignee if different from creator ─────────────────────────
      if (task.assignedTo && task.assignedTo !== userId) {
        this.notifCreator.notifyTaskAssigned(task.assignedTo, tenantId, task.title, task.id);
        this._sendTaskAssignedEmail(task.assignedTo, task.title, task.dueDate, tenantId);
      }

      return task;

    } finally {
      this._saving.set(false);
    }
  }

  async updateTask(id: string, formValue: Partial<TaskFormValue>): Promise<Task | null> {
    if (!this.permissions.hasPermission('activities', 'update')) {
      this.notify.error('You do not have permission to update tasks.');
      return null;
    }

    const previousTask   = this._tasks().find(t => t.id === id);
    const prevAssignedTo = previousTask?.assignedTo ?? null;
    const currentUserId  = this.auth.session()?.user.id;

    this._saving.set(true);
    try {
      const patch: Record<string, unknown> = {};
      if (formValue.type        !== undefined) patch['type']        = formValue.type;
      if (formValue.title       !== undefined) patch['title']       = formValue.title.trim();
      if (formValue.description !== undefined) patch['description'] = formValue.description;
      if (formValue.contactId   !== undefined) patch['contact_id']  = formValue.contactId;
      if (formValue.dealId      !== undefined) patch['deal_id']     = formValue.dealId;
      if (formValue.assignedTo  !== undefined) patch['assigned_to'] = formValue.assignedTo;
      if (formValue.dueDate     !== undefined) patch['due_date']    = formValue.dueDate;

      const { data, error } = await this.supabase.client
        .from('activities')
        .update(patch)
        .eq('id', id)
        .select(TASK_SELECT)
        .single<TaskRow>();

      if (error) {
        console.error('[TasksService] updateTask:', error.message);
        this.notify.error('Failed to update task.');
        return null;
      }

      const updated = mapTaskRow(data);
      this._tasks.update(list => list.map(t => t.id === id ? updated : t));
      this.notify.success('Task updated.');

      // ── Notify on reassignment ────────────────────────────────────────────
      const newAssignedTo = formValue.assignedTo;
      const tenantId      = this.auth.profile()?.tenantId;
      if (
        newAssignedTo &&
        newAssignedTo !== prevAssignedTo &&
        newAssignedTo !== currentUserId &&
        tenantId
      ) {
        this.notifCreator.notifyTaskAssigned(newAssignedTo, tenantId, updated.title, id);
        this._sendTaskAssignedEmail(newAssignedTo, updated.title, updated.dueDate, tenantId);
      }

      return updated;

    } finally {
      this._saving.set(false);
    }
  }

  async completeTask(id: string): Promise<boolean> {
    const { error } = await this.supabase.client
      .from('activities')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      this.notify.error('Failed to complete task.');
      return false;
    }

    this._tasks.update(list =>
      list.map(t => t.id === id
        ? { ...t, completedAt: new Date().toISOString(), isOverdue: false, isDueSoon: false }
        : t,
      ),
    );
    return true;
  }

  async deleteTask(id: string): Promise<boolean> {
    if (!this.permissions.hasPermission('activities', 'delete')) {
      this.notify.error('You do not have permission to delete tasks.');
      return false;
    }

    const { error } = await this.supabase.client
      .from('activities').delete().eq('id', id);

    if (error) { this.notify.error('Failed to delete task.'); return false; }
    this._tasks.update(list => list.filter(t => t.id !== id));
    this.notify.success('Task deleted.');
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DUE-SOON CHECK (called from dashboard on load)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Checks for tasks due within the next 24 hours assigned to the current user
   * and enqueues reminder emails for those that haven't been reminded yet.
   * Called from the dashboard on load — fire-and-forget.
   */
  async checkAndEnqueueDueSoonReminders(): Promise<void> {
    const tenantId = this.auth.profile()?.tenantId;
    const userId   = this.auth.session()?.user.id;
    if (!tenantId || !userId) return;

    const in24h = new Date(Date.now() + 24 * 3_600_000).toISOString();

    const { data } = await this.supabase.client
      .from('activities')
      .select('id, title, due_date, assigned_to')
      .eq('tenant_id', tenantId)
      .eq('assigned_to', userId)
      .is('completed_at', null)
      .lte('due_date', in24h)
      .gte('due_date', new Date().toISOString())
      .in('type', ['task', 'call', 'meeting']);

    if (!data?.length) return;

    // Check which ones already have a reminder in email_queue (avoid duplicates)
    const { data: queued } = await this.supabase.client
      .from('email_queue')
      .select('variables')
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(Date.now() - 24 * 3_600_000).toISOString());

    const alreadyQueued = new Set(
      (queued ?? []).map((q: any) => q.variables?.task_id as string).filter(Boolean),
    );

    // Get assignee email
    const authUser = await this.supabase.client.auth.admin
      .getUserById(userId).catch(() => ({ data: null }));
    const email    = (authUser.data as any)?.user?.email;
    const profile  = await this.supabase.client
      .from('profiles').select('full_name').eq('id', userId).single();
    const fullName = (profile.data as any)?.full_name ?? 'Team member';

    for (const task of data as { id: string; title: string; due_date: string }[]) {
      if (alreadyQueued.has(task.id)) continue;

      const hoursLeft = Math.ceil(
        (new Date(task.due_date).getTime() - Date.now()) / 3_600_000,
      );

      // In-app notification
      this.notifCreator.notifyTaskDueSoon(userId, tenantId, task.title, task.id, hoursLeft);

      // Email reminder
      if (email) {
        const dueLabel = hoursLeft <= 1 ? 'in less than 1 hour'
          : hoursLeft <= 3 ? `in ${hoursLeft} hours`
          : 'today';

        this.emailService.sendEmail({
          to:           email,
          templateName: 'task_reminder',
          variables: {
            user_name:  fullName,
            task_title: task.title,
            due_date:   dueLabel,
            task_id:    task.id,
          },
          tenantId,
        });
      }
    }
  }

  // ── Realtime ──────────────────────────────────────────────────────────────

  subscribeToChanges(): void {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;
    this._unsubscribe();

    this._channel = this.supabase.client
      .channel(`tasks:${tenantId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activities',
          filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          const { data } = await this.supabase.client
            .from('activities').select(TASK_SELECT)
            .eq('id', (payload.new as { id: string }).id).single<TaskRow>();
          if (data) this._tasks.update(list => [mapTaskRow(data), ...list]);
        },
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'activities',
          filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          const { data } = await this.supabase.client
            .from('activities').select(TASK_SELECT)
            .eq('id', (payload.new as { id: string }).id).single<TaskRow>();
          if (data) {
            const updated = mapTaskRow(data);
            this._tasks.update(list => list.map(t => t.id === updated.id ? updated : t));
          }
        },
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'activities',
          filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const id = (payload.old as { id: string }).id;
          this._tasks.update(list => list.filter(t => t.id !== id));
        },
      )
      .subscribe();
  }

  unsubscribeFromChanges(): void { this._unsubscribe(); }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async _sendTaskAssignedEmail(
    assignedToId: string,
    taskTitle: string,
    dueDate: string | null,
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
        to: email, templateName: 'task_assigned', tenantId,
        variables: {
          user_name:  fullName,
          task_title: taskTitle,
          due_date:   dueDate
            ? new Date(dueDate).toLocaleDateString('en-US', { dateStyle: 'medium' })
            : 'No due date',
        },
      });
    }
  }

  private _unsubscribe(): void {
    if (this._channel) {
      this.supabase.client.removeChannel(this._channel);
      this._channel = null;
    }
  }
}
