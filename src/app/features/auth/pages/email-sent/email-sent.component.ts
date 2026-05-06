import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Shown after signup when email confirmation is required.
 * Receives the email via router state.
 */
@Component({
  selector: 'app-email-sent',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="email-sent-page">
      <div class="email-sent-card">
        <div class="email-icon-wrap">
          <mat-icon class="email-icon">mark_email_unread</mat-icon>
        </div>
        <h1>Check your email</h1>
        <p class="subtitle">
          We sent a confirmation link to<br>
          <strong>{{ email }}</strong>
        </p>
        <p class="hint">
          Click the link in the email to activate your account.
          The link expires in 24 hours.
        </p>
        <div class="actions">
          <a mat-flat-button color="primary" routerLink="/auth/login">
            <mat-icon>login</mat-icon> Go to login
          </a>
        </div>
        <p class="spam-note">
          Didn't receive it? Check your spam folder or
          <a routerLink="/auth/signup">try again</a>.
        </p>
      </div>
    </div>
  `,
  styles: [`
    .email-sent-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--crm-primary) 0%, #283593 60%, #0288d1 100%);
      padding: 24px;
    }
    .email-sent-card {
      background: white;
      border-radius: 16px;
      padding: 40px 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 24px 64px rgba(0,0,0,0.25);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .email-icon-wrap {
      width: 80px; height: 80px; border-radius: 50%;
      background: rgba(2,136,209,0.1);
      display: flex; align-items: center; justify-content: center;
    }
    .email-icon { font-size: 40px; width: 40px; height: 40px; color: #0288d1; }
    h1 { font-size: 1.6rem; font-weight: 800; margin: 0; color: #1a1a2e; }
    .subtitle { color: #6b7280; margin: 0; line-height: 1.6;
      strong { color: #1a1a2e; }
    }
    .hint { font-size: 0.875rem; color: #9ca3af; margin: 0; }
    .actions { margin-top: 8px; }
    .spam-note { font-size: 0.8rem; color: #9ca3af; margin: 0;
      a { color: #0288d1; text-decoration: none;
        &:hover { text-decoration: underline; }
      }
    }
  `],
})
export class EmailSentComponent {
  private readonly router = inject(Router);

  // Read email from router navigation state
  readonly email: string =
    (this.router.getCurrentNavigation()?.extras?.state?.['email'] as string) ??
    (history.state?.['email'] as string) ??
    'your email address';
}
