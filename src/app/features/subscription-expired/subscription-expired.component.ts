import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-subscription-expired',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="expired-wrapper">
      <mat-icon class="expired-icon">warning_amber</mat-icon>
      <h1>Subscription Expired</h1>
      <p>Your workspace subscription has expired or been suspended.</p>
      <p>Please contact your administrator or renew your plan to continue.</p>
      <button mat-flat-button color="primary" (click)="signOut()">
        <mat-icon>logout</mat-icon> Sign out
      </button>
    </div>
  `,
  styles: [`
    .expired-wrapper {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 24px;
      text-align: center;
    }
    .expired-icon {
      font-size: 72px;
      width: 72px;
      height: 72px;
      color: #f59e0b;
    }
    h1 { font-size: 2rem; font-weight: 700; margin: 0; }
    p  { color: #6b7280; max-width: 400px; }
  `],
})
export class SubscriptionExpiredComponent {
  private readonly auth = inject(AuthService);
  async signOut(): Promise<void> { await this.auth.signOut(); }
}
