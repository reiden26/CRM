import {
  Component, OnInit, OnDestroy, inject, signal, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { TranslateModule } from '@ngx-translate/core';

type EmailStatus = 'pending' | 'sent' | 'failed' | 'bounced';

interface EmailLog {
  id:           string;
  toEmail:      string;
  subject:      string;
  templateName: string | null;
  status:       EmailStatus;
  sentAt:       string | null;
  errorMessage: string | null;
  createdAt:    string;
}

const STATUS_CONFIG: Record<EmailStatus, { color: string; icon: string; label: string }> = {
  pending: { color: '#9ca3af', icon: 'schedule',      label: 'Pending' },
  sent:    { color: '#22c55e', icon: 'check_circle',   label: 'Sent' },
  failed:  { color: '#ef4444', icon: 'error',          label: 'Failed' },
  bounced: { color: '#f59e0b', icon: 'warning',        label: 'Bounced' },
};

@Component({
  selector: 'app-email-logs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatTableModule, MatPaginatorModule,
    MatButtonModule, MatIconModule, MatFormFieldModule,
    MatSelectModule, MatInputModule, MatDatepickerModule,
    MatNativeDateModule, MatChipsModule, MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule, TimeAgoPipe,
    TranslateModule,
  ],
  templateUrl: './email-logs.component.html',
  styleUrl: './email-logs.component.scss',
})
export class EmailLogsComponent implements OnInit, OnDestroy {

  private readonly supabase  = inject(SupabaseService);
  private readonly auth      = inject(AuthService);
  private readonly notify    = inject(NotificationService);
  private readonly fb        = inject(FormBuilder);
  private readonly destroy$  = new Subject<void>();

  readonly logs      = signal<EmailLog[]>([]);
  readonly total     = signal(0);
  readonly loading   = signal(true);
  readonly retrying  = signal<Set<string>>(new Set());
  readonly pageIndex = signal(0);
  readonly pageSize  = signal(25);

  readonly columns = ['status', 'to', 'subject', 'template', 'time', 'actions'];
  readonly STATUS_CONFIG = STATUS_CONFIG;

  readonly filterForm = this.fb.group({
    status:   [null as EmailStatus | null],
    search:   [''],
    dateFrom: [null as string | null],
    dateTo:   [null as string | null],
  });

  readonly statusOptions: { value: EmailStatus; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'sent',    label: 'Sent' },
    { value: 'failed',  label: 'Failed' },
    { value: 'bounced', label: 'Bounced' },
  ];

  ngOnInit(): void {
    this._load();
    this.filterForm.valueChanges.pipe(
      debounceTime(400), takeUntil(this.destroy$),
    ).subscribe(() => { this.pageIndex.set(0); this._load(); });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  async _load(): Promise<void> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;
    this.loading.set(true);
    const f    = this.filterForm.getRawValue();
    const from = this.pageIndex() * this.pageSize();
    const to   = from + this.pageSize() - 1;

    let q = this.supabase.client
      .from('email_logs')
      .select('id, to_email, subject, template_id, status, sent_at, error_message, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (f.status)   q = q.eq('status', f.status);
    if (f.search)   q = q.ilike('to_email', `%${f.search}%`);
    if (f.dateFrom) q = q.gte('created_at', new Date(f.dateFrom).toISOString());
    if (f.dateTo)   q = q.lte('created_at', new Date(f.dateTo).toISOString());

    const { data, count, error } = await q;
    this.loading.set(false);
    if (error) { this.notify.error('Failed to load email logs.'); return; }

    // Resolve template names
    const templateIds = [...new Set((data ?? []).map((e: any) => e.template_id).filter(Boolean))];
    const nameMap = new Map<string, string>();
    if (templateIds.length) {
      const { data: tpls } = await this.supabase.client
        .from('email_templates').select('id, name').in('id', templateIds);
      (tpls ?? []).forEach((t: any) => nameMap.set(t.id, t.name));
    }

    this.logs.set(
      (data ?? []).map((e: any) => ({
        id:           e.id,
        toEmail:      e.to_email,
        subject:      e.subject,
        templateName: nameMap.get(e.template_id) ?? null,
        status:       e.status,
        sentAt:       e.sent_at,
        errorMessage: e.error_message,
        createdAt:    e.created_at,
      })),
    );
    this.total.set(count ?? 0);
  }

  onPageChange(e: PageEvent): void {
    this.pageIndex.set(e.pageIndex);
    this.pageSize.set(e.pageSize);
    this._load();
  }

  async retry(log: EmailLog): Promise<void> {
    this.retrying.update(s => new Set([...s, log.id]));
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId || !log.templateName) {
      this.notify.error('Cannot retry: template not found.');
      this.retrying.update(s => { const n = new Set(s); n.delete(log.id); return n; });
      return;
    }
    // Re-enqueue in email_queue
    const { error } = await this.supabase.client.from('email_queue').insert({
      tenant_id:    tenantId,
      to_email:     log.toEmail,
      template_id:  (await this.supabase.client.from('email_templates').select('id').eq('name', log.templateName).eq('tenant_id', tenantId).single()).data?.id,
      variables:    {},
      scheduled_at: new Date().toISOString(),
      attempts:     0,
      max_attempts: 3,
    });
    this.retrying.update(s => { const n = new Set(s); n.delete(log.id); return n; });
    if (error) { this.notify.error('Failed to retry.'); return; }
    this.notify.success('Email re-queued for delivery.');
  }

  isRetrying(id: string): boolean { return this.retrying().has(id); }

  getStatusConfig(status: string) {
    return STATUS_CONFIG[status as EmailStatus] ?? STATUS_CONFIG.pending;
  }

  trackById(_: number, e: EmailLog): string { return e.id; }
}
