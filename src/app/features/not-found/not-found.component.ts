import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-not-found',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, TranslateModule],
  template: `
    <div class="not-found-page">
      <div class="not-found-illustration">
        <div class="error-circle">
          <mat-icon class="error-icon">search_off</mat-icon>
        </div>
        <div class="error-code">404</div>
      </div>
      <div class="not-found-content">
        <h1>{{ 'NOT_FOUND_PAGE.TITLE' | translate }}</h1>
        <p>{{ 'NOT_FOUND_PAGE.SUBTITLE' | translate }}</p>
        <div class="not-found-actions">
          <button mat-flat-button color="primary" (click)="goDashboard()">
            <mat-icon>home</mat-icon> {{ 'COMMON.GO_DASHBOARD' | translate }}
          </button>
          <button mat-stroked-button (click)="goBack()">
            <mat-icon>arrow_back</mat-icon> {{ 'COMMON.GO_BACK' | translate }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .not-found-page {
      min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 32px;
      padding: 40px 24px; background: var(--crm-bg-surface);
    }
    .not-found-illustration { position: relative; display: flex; align-items: center; justify-content: center; }
    .error-circle {
      width: 120px; height: 120px; border-radius: 50%;
      background: linear-gradient(135deg, rgba(2,136,209,0.12), rgba(2,136,209,0.06));
      border: 2px solid rgba(2,136,209,0.2);
      display: flex; align-items: center; justify-content: center;
      animation: float 3s ease-in-out infinite;
    }
    @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    .error-icon { font-size: 56px; width: 56px; height: 56px; color: #0288d1; }
    .error-code {
      position: absolute; bottom: -12px; right: -12px;
      font-size: 4rem; font-weight: 900; color: rgba(2,136,209,0.12);
      line-height: 1; user-select: none;
    }
    .not-found-content { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; max-width: 400px; }
    h1 { font-size: 2rem; font-weight: 800; color: var(--crm-text-primary); margin: 0; }
    p  { color: var(--crm-text-secondary); margin: 0; }
    .not-found-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
  `],
})
export class NotFoundComponent {
  private readonly router = inject(Router);
  goDashboard(): void { this.router.navigate(['/dashboard']); }
  goBack(): void       { window.history.back(); }
}
