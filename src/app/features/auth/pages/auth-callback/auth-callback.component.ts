import {
  Component,
  OnInit,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../../core/services/auth.service';

/**
 * Handles the redirect after email confirmation.
 * Supabase redirects to /auth/callback with the session tokens in the URL hash.
 * This component resolves the session and navigates to the appropriate page.
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatProgressSpinnerModule, MatButtonModule, MatIconModule],
  template: `
    <div class="callback-page">
      @if (status() === 'loading') {
        <mat-spinner diameter="48" />
        <p>Verifying your account…</p>
      }
      @if (status() === 'success') {
        <div class="callback-success">
          <mat-icon class="success-icon">check_circle</mat-icon>
          <h2>Email confirmed!</h2>
          <p>Your account is ready. Redirecting to dashboard…</p>
        </div>
      }
      @if (status() === 'error') {
        <div class="callback-error">
          <mat-icon class="error-icon">error_outline</mat-icon>
          <h2>Verification failed</h2>
          <p>{{ errorMsg() }}</p>
          <button mat-flat-button color="primary" (click)="goToLogin()">
            Back to login
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .callback-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      padding: 24px;
      text-align: center;
      background: var(--crm-bg-surface);
    }
    p { color: var(--crm-text-secondary); margin: 0; }
    .callback-success, .callback-error {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
    }
    .success-icon { font-size: 64px; width: 64px; height: 64px; color: #22c55e; }
    .error-icon   { font-size: 64px; width: 64px; height: 64px; color: #ef4444; }
    h2 { margin: 0; font-size: 1.5rem; font-weight: 700; }
  `],
})
export class AuthCallbackComponent implements OnInit {

  private readonly auth   = inject(AuthService);
  private readonly router = inject(Router);

  readonly status   = signal<'loading' | 'success' | 'error'>('loading');
  readonly errorMsg = signal<string>('');

  async ngOnInit(): Promise<void> {
    try {
      // Supabase puts the tokens in the URL hash — resolveSession reads them
      const session = await this.auth.resolveSession();

      if (session) {
        this.status.set('success');
        // Short delay so the user sees the success message
        setTimeout(() => this.router.navigate(['/dashboard']), 1500);
      } else {
        this.status.set('error');
        this.errorMsg.set('No session found. The link may have expired.');
      }
    } catch (err) {
      this.status.set('error');
      this.errorMsg.set('An error occurred during verification. Please try again.');
    }
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login']);
  }
}
