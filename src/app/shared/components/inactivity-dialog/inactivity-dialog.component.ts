import {
  Component,
  Inject,
  OnInit,
  OnDestroy,
  signal,
  ChangeDetectionStrategy,
  NgZone,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslateModule } from '@ngx-translate/core';

export interface InactivityDialogData {
  graceMs: number;
}

@Component({
  selector: 'app-inactivity-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslateModule,
  ],
  template: `
    <div class="inactivity-dialog">

      <div class="inactivity-icon">
        <mat-icon>access_time</mat-icon>
      </div>

      <h2 mat-dialog-title class="inactivity-title">{{ 'INACTIVITY.TITLE' | translate }}</h2>

      <mat-dialog-content class="inactivity-content">
        <p>{{ 'INACTIVITY.MESSAGE' | translate }}</p>
        <div class="countdown-wrap">
          <span class="countdown-label">{{ 'INACTIVITY.REMAINING' | translate }}</span>
          <span class="countdown-value" [class.urgent]="secondsLeft() <= 60">
            {{ formatTime(secondsLeft()) }}
          </span>
        </div>
        <mat-progress-bar
          mode="determinate"
          [value]="progressPct()"
          [color]="secondsLeft() <= 60 ? 'warn' : 'primary'"
          class="progress-bar"
        />
      </mat-dialog-content>

      <mat-dialog-actions align="center" class="inactivity-actions">
        <button mat-stroked-button color="warn" [mat-dialog-close]="'logout'">
          <mat-icon>logout</mat-icon> {{ 'INACTIVITY.LOGOUT' | translate }}
        </button>
        <button mat-flat-button color="primary" [mat-dialog-close]="'renew'" cdkFocusInitial>
          <mat-icon>refresh</mat-icon> {{ 'INACTIVITY.STAY' | translate }}
        </button>
      </mat-dialog-actions>

    </div>
  `,
  styles: [`
    .inactivity-dialog {
      display: flex; flex-direction: column; align-items: center;
      padding: 8px 0 0; text-align: center;
    }
    .inactivity-icon {
      width: 64px; height: 64px; border-radius: 50%;
      background: rgba(245,158,11,0.12);
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 12px;
      mat-icon { font-size: 32px; width: 32px; height: 32px; color: #f59e0b; }
    }
    .inactivity-title { font-size: 1.1rem !important; font-weight: 700 !important; margin: 0 0 4px !important; padding: 0 !important; }
    .inactivity-content { padding: 0 24px 8px !important;
      p { margin: 0 0 16px; font-size: 0.9rem; color: #6b7280; }
    }
    .countdown-wrap { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px; }
    .countdown-label { font-size: 0.875rem; color: #6b7280; }
    .countdown-value { font-size: 1.5rem; font-weight: 700; color: #1a237e; font-variant-numeric: tabular-nums;
      &.urgent { color: #ef4444; animation: pulse 1s infinite; }
    }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
    .progress-bar { border-radius: 4px; }
    .inactivity-actions { padding: 12px 16px 16px !important; gap: 10px; }
  `],
})
export class InactivityDialogComponent implements OnInit, OnDestroy {

  private readonly zone = inject(NgZone);

  readonly secondsLeft = signal<number>(0);
  readonly progressPct = signal<number>(100);

  private _timer: ReturnType<typeof setInterval> | null = null;
  private readonly totalSeconds: number;

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: InactivityDialogData,
    readonly dialogRef: MatDialogRef<InactivityDialogComponent>,
  ) {
    this.totalSeconds = Math.ceil(data.graceMs / 1000);
    this.secondsLeft.set(this.totalSeconds);
  }

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      this._timer = setInterval(() => {
        this.zone.run(() => {
          const remaining = this.secondsLeft() - 1;
          this.secondsLeft.set(Math.max(0, remaining));
          this.progressPct.set(Math.max(0, (remaining / this.totalSeconds) * 100));
          if (remaining <= 0) {
            this.dialogRef.close('logout');
          }
        });
      }, 1000);
    });
  }

  ngOnDestroy(): void {
    if (this._timer) clearInterval(this._timer);
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
