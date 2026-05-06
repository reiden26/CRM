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
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { AuditDiffDialogComponent } from './audit-diff-dialog.component';
import { TranslateModule } from '@ngx-translate/core';

export interface AuditEntry {
  id:        string;
  userId:    string | null;
  userName:  string;
  action:    'INSERT' | 'UPDATE' | 'DELETE';
  tableName: string;
  recordId:  string;
  oldData:   Record<string, unknown> | null;
  newData:   Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  INSERT: '#22c55e', UPDATE: '#f59e0b', DELETE: '#ef4444',
};

const TABLES = ['contacts','companies','deals','activities','profiles','tags','tenants'];

@Component({
  selector: 'app-audit-log',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatTableModule, MatPaginatorModule,
    MatButtonModule, MatIconModule, MatFormFieldModule,
    MatSelectModule, MatInputModule, MatDatepickerModule,
    MatNativeDateModule, MatDialogModule, MatChipsModule,
    MatProgressBarModule, MatTooltipModule, TimeAgoPipe,
    TranslateModule,
  ],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.scss',
})
export class AuditLogComponent implements OnInit, OnDestroy {

  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly notify   = inject(NotificationService);
  private readonly dialog   = inject(MatDialog);
  private readonly fb       = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();

  readonly entries   = signal<AuditEntry[]>([]);
  readonly total     = signal(0);
  readonly loading   = signal(true);
  readonly pageIndex = signal(0);
  readonly pageSize  = signal(25);

  readonly columns = ['action', 'user', 'table', 'record', 'ip', 'time', 'view'];
  readonly ACTION_COLORS = ACTION_COLORS;
  readonly TABLES = TABLES;

  readonly filterForm = this.fb.group({
    userId:    [null as string | null],
    tableName: [null as string | null],
    dateFrom:  [null as string | null],
    dateTo:    [null as string | null],
  });

  readonly teamMembers = signal<{ id: string; fullName: string }[]>([]);

  ngOnInit(): void {
    this._loadTeamMembers();
    this._loadEntries();
    this.filterForm.valueChanges.pipe(
      debounceTime(400), takeUntil(this.destroy$),
    ).subscribe(() => { this.pageIndex.set(0); this._loadEntries(); });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private async _loadTeamMembers(): Promise<void> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;
    const { data } = await this.supabase.client
      .from('profiles').select('id, full_name').eq('tenant_id', tenantId).order('full_name');
    this.teamMembers.set(
      (data ?? []).map((m: any) => ({ id: m.id, fullName: m.full_name })),
    );
  }

  async _loadEntries(): Promise<void> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;
    this.loading.set(true);
    const f = this.filterForm.getRawValue();
    const from = this.pageIndex() * this.pageSize();
    const to   = from + this.pageSize() - 1;

    let q = this.supabase.client
      .from('audit_logs')
      .select('id, user_id, action, table_name, record_id, old_data, new_data, ip_address, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (f.userId)    q = q.eq('user_id', f.userId);
    if (f.tableName) q = q.eq('table_name', f.tableName);
    if (f.dateFrom)  q = q.gte('created_at', new Date(f.dateFrom).toISOString());
    if (f.dateTo)    q = q.lte('created_at', new Date(f.dateTo).toISOString());

    const { data, count, error } = await q;
    this.loading.set(false);
    if (error) { this.notify.error('Failed to load audit log.'); return; }

    // Resolve user names
    const userIds = [...new Set((data ?? []).map((e: any) => e.user_id).filter(Boolean))];
    const nameMap = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles } = await this.supabase.client
        .from('profiles').select('id, full_name').in('id', userIds);
      (profiles ?? []).forEach((p: any) => nameMap.set(p.id, p.full_name));
    }

    this.entries.set(
      (data ?? []).map((e: any) => ({
        id:        e.id,
        userId:    e.user_id,
        userName:  nameMap.get(e.user_id) ?? 'System',
        action:    e.action,
        tableName: e.table_name,
        recordId:  e.record_id,
        oldData:   e.old_data,
        newData:   e.new_data,
        ipAddress: e.ip_address,
        createdAt: e.created_at,
      })),
    );
    this.total.set(count ?? 0);
  }

  onPageChange(e: PageEvent): void {
    this.pageIndex.set(e.pageIndex);
    this.pageSize.set(e.pageSize);
    this._loadEntries();
  }

  openDiff(entry: AuditEntry): void {
    this.dialog.open(AuditDiffDialogComponent, {
      data: entry, width: '700px', maxWidth: '95vw', maxHeight: '90vh',
    });
  }

  exportCsv(): void {
    const headers = ['Action','Table','Record ID','User','IP','Date'];
    const rows = this.entries().map(e => [
      e.action, e.tableName, e.recordId, e.userName,
      e.ipAddress ?? '', e.createdAt,
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  trackById(_: number, e: AuditEntry): string { return e.id; }
}
