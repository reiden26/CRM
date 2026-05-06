import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { AuditEntry } from './audit-log.component';

@Component({
  selector: 'app-audit-diff-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatChipsModule],
  template: `
    <h2 mat-dialog-title class="diff-title">
      <span class="action-badge" [style.background]="actionColor + '22'" [style.color]="actionColor">
        {{ entry.action }}
      </span>
      {{ entry.tableName }} — {{ entry.recordId | slice:0:8 }}…
    </h2>

    <mat-dialog-content class="diff-content">
      <div class="diff-meta">
        <span><strong>User:</strong> {{ entry.userName }}</span>
        <span><strong>IP:</strong> {{ entry.ipAddress ?? '—' }}</span>
        <span><strong>Date:</strong> {{ entry.createdAt | date:'medium' }}</span>
      </div>

      <div class="diff-panels">
        @if (entry.oldData) {
          <div class="diff-panel diff-old">
            <div class="diff-panel-header">
              <mat-icon>remove_circle_outline</mat-icon> Before
            </div>
            <pre class="diff-json">{{ entry.oldData | json }}</pre>
          </div>
        }
        @if (entry.newData) {
          <div class="diff-panel diff-new">
            <div class="diff-panel-header">
              <mat-icon>add_circle_outline</mat-icon> After
            </div>
            <pre class="diff-json">{{ entry.newData | json }}</pre>
          </div>
        }
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .diff-title { display: flex; align-items: center; gap: 10px; font-size: 1rem !important; }
    .action-badge { padding: 2px 10px; border-radius: 12px; font-size: 0.78rem; font-weight: 700; }
    .diff-content { padding: 0 24px 8px !important; }
    .diff-meta { display: flex; gap: 20px; flex-wrap: wrap; font-size: 0.82rem;
      color: var(--crm-text-secondary); margin-bottom: 16px; }
    .diff-panels { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .diff-panel { border-radius: 8px; overflow: hidden; }
    .diff-old { background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.2); }
    .diff-new { background: rgba(34,197,94,0.05); border: 1px solid rgba(34,197,94,0.2); }
    .diff-panel-header {
      display: flex; align-items: center; gap: 6px; padding: 8px 12px;
      font-size: 0.78rem; font-weight: 700;
      .diff-old & { color: #dc2626; background: rgba(239,68,68,0.08); }
      .diff-new & { color: #16a34a; background: rgba(34,197,94,0.08); }
      mat-icon { font-size: 14px; width: 14px; height: 14px; }
    }
    .diff-json {
      margin: 0; padding: 12px; font-size: 0.75rem; line-height: 1.5;
      overflow-x: auto; max-height: 320px; overflow-y: auto;
      font-family: 'Courier New', monospace; white-space: pre-wrap; word-break: break-all;
    }
    @media (max-width: 599px) { .diff-panels { grid-template-columns: 1fr; } }
  `],
})
export class AuditDiffDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) readonly entry: AuditEntry) {}

  get actionColor(): string {
    return { INSERT: '#22c55e', UPDATE: '#f59e0b', DELETE: '#ef4444' }[this.entry.action] ?? '#9ca3af';
  }
}
