import {
  Component,
  Inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable } from 'rxjs';

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmDialogData — input config
// ─────────────────────────────────────────────────────────────────────────────

export type ConfirmDialogType = 'danger' | 'warning' | 'info';

export interface ConfirmDialogData {
  title:        string;
  message:      string;
  confirmText?: string;   // default: 'Confirm'
  cancelText?:  string;   // default: 'Cancel'
  type?:        ConfirmDialogType;
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmDialogService — open helper
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly dialog = inject(MatDialog);

  /**
   * Opens a confirmation dialog and returns an Observable<boolean>.
   * true  = user confirmed
   * false = user cancelled or dismissed
   */
  confirm(data: ConfirmDialogData): Observable<boolean> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data,
      width:      '420px',
      maxWidth:   '95vw',
      panelClass: 'confirm-dialog-panel',
      disableClose: false,
    });
    return new Observable<boolean>(observer => {
      ref.afterClosed().subscribe((result: boolean | undefined) => {
        observer.next(result === true);
        observer.complete();
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmDialogComponent
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ConfirmDialogType, { icon: string; color: string; btnColor: string }> = {
  danger:  { icon: 'delete_forever', color: '#ef4444', btnColor: 'warn' },
  warning: { icon: 'warning_amber',  color: '#f59e0b', btnColor: 'accent' },
  info:    { icon: 'info_outline',   color: '#0288d1', btnColor: 'primary' },
};

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, TranslateModule],
  template: `
    <div class="confirm-dialog">

      <!-- Icon header -->
      <div class="confirm-icon-wrap" [style.background]="typeConfig.color + '18'">
        <mat-icon [style.color]="typeConfig.color">{{ typeConfig.icon }}</mat-icon>
      </div>

      <!-- Content -->
      <h2 mat-dialog-title class="confirm-title">{{ data.title }}</h2>

      <mat-dialog-content class="confirm-message">
        <p>{{ data.message }}</p>
      </mat-dialog-content>

      <!-- Actions -->
      <mat-dialog-actions align="end" class="confirm-actions">
        <button mat-stroked-button [mat-dialog-close]="false">
          {{ data.cancelText ?? ('CONFIRM_DIALOG.CANCEL' | translate) }}
        </button>
        <button
          mat-flat-button
          [color]="typeConfig.btnColor"
          [mat-dialog-close]="true"
          cdkFocusInitial
        >
          {{ data.confirmText ?? ('CONFIRM_DIALOG.CONFIRM' | translate) }}
        </button>
      </mat-dialog-actions>

    </div>
  `,
  styles: [`
    .confirm-dialog {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 0 0;
      text-align: center;
    }

    .confirm-icon-wrap {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;

      mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }
    }

    .confirm-title {
      font-size: 1.1rem !important;
      font-weight: 700 !important;
      margin: 0 0 4px !important;
      padding: 0 !important;
    }

    .confirm-message {
      padding: 0 24px 8px !important;
      p {
        margin: 0;
        font-size: 0.9rem;
        color: #6b7280;
        line-height: 1.5;
      }
    }

    .confirm-actions {
      padding: 8px 16px 16px !important;
      gap: 8px;
    }
  `],
})
export class ConfirmDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: ConfirmDialogData,
    readonly dialogRef: MatDialogRef<ConfirmDialogComponent>,
  ) {}

  get typeConfig() {
    return TYPE_CONFIG[this.data.type ?? 'info'];
  }
}
