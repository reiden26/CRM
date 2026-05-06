import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  OnInit,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import {
  slideInLeft,
  slideInRight,
  fadeInUp,
  fadeIn,
} from '../../../../shared/animations/auth.animations';
import { AuthService } from '../../../../core/services/auth.service';
import { SecurityService } from '../../../../core/services/security.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  animations: [slideInLeft, slideInRight, fadeInUp, fadeIn],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './login.component.html',
  styleUrls: ['../../auth-layout.scss'],
})
export class LoginComponent implements OnInit {

  private readonly auth     = inject(AuthService);
  private readonly security = inject(SecurityService);
  private readonly bp       = inject(BreakpointObserver);
  private readonly fb       = inject(FormBuilder);

  readonly loading   = this.auth.loading;
  readonly hidePass  = signal(true);
  readonly errorMsg  = signal<string | null>(null);
  readonly isMobile  = signal(false);

  readonly isLocked  = computed(() => this.security.isLockedOut());
  readonly countdown = this.security.lockoutSecondsRemaining;
  readonly remaining = computed(() => this.security.remainingAttempts());

  readonly form = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.bp.observe([Breakpoints.XSmall, Breakpoints.Small])
      .subscribe(r => this.isMobile.set(r.matches));
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading() || this.isLocked()) return;
    this.errorMsg.set(null);

    const { email, password } = this.form.getRawValue();
    const result = await this.auth.signIn(email!, password!);

    if (!result.success) {
      this.errorMsg.set(result.error?.message ?? 'Error al iniciar sesión.');
    }
  }

  formatCountdown(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
