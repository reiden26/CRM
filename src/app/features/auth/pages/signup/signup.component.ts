import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import {
  slideInLeft,
  slideInRight,
  fadeInUp,
  fadeIn,
} from '../../../../shared/animations/auth.animations';
import { AuthService } from '../../../../core/services/auth.service';

// ── Validators ────────────────────────────────────────────────────────────────

function passwordMatchValidator(ctrl: AbstractControl): ValidationErrors | null {
  const pw  = ctrl.get('password')?.value;
  const cpw = ctrl.get('confirmPassword')?.value;
  return pw && cpw && pw !== cpw ? { passwordMismatch: true } : null;
}

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-signup',
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
  templateUrl: './signup.component.html',
  styleUrls: ['../../auth-layout.scss'],
})
export class SignupComponent implements OnInit, OnDestroy {

  private readonly auth   = inject(AuthService);
  private readonly router = inject(Router);
  private readonly bp     = inject(BreakpointObserver);
  private readonly fb     = inject(FormBuilder);

  readonly loading   = this.auth.loading;
  readonly hidePass  = signal(true);
  readonly hideConf  = signal(true);
  readonly errorMsg  = signal<string | null>(null);
  readonly isMobile  = signal(false);

  // Password requirement signals
  readonly pwValue   = signal('');
  readonly hasLength = computed(() => this.pwValue().length >= 8);
  readonly hasUpper  = computed(() => /[A-Z]/.test(this.pwValue()));
  readonly hasNumber = computed(() => /[0-9]/.test(this.pwValue()));

  readonly form = this.fb.group({
    fullName:        ['', [Validators.required, Validators.minLength(2)]],
    email:           ['', [Validators.required, Validators.email]],
    password:        ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, { validators: passwordMatchValidator });

  private _bpSub: Subscription | null = null;
  private _pwSub: Subscription | null = null;

  ngOnInit(): void {
    this._bpSub = this.bp.observe([Breakpoints.XSmall, Breakpoints.Small])
      .subscribe(r => this.isMobile.set(r.matches));

    this._pwSub = this.form.get('password')!.valueChanges
      .subscribe(v => this.pwValue.set(v ?? ''));
  }

  ngOnDestroy(): void {
    this._bpSub?.unsubscribe();
    this._pwSub?.unsubscribe();
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) return;
    this.errorMsg.set(null);

    const { email, password, fullName } = this.form.getRawValue();
    const result = await this.auth.signUp(email!, password!, fullName!);

    if (!result.success) {
      this.errorMsg.set(result.error?.message ?? 'Error al crear la cuenta.');
    } else {
      this.router.navigate(['/auth/email-sent'], {
        state: { email: email! },
      });
    }
  }

  getFieldError(field: string): string | null {
    const ctrl = this.form.get(field);
    if (!ctrl?.touched || !ctrl.errors) return null;
    if (ctrl.errors['required'])   return 'Este campo es obligatorio.';
    if (ctrl.errors['minlength'])  return `Mínimo ${ctrl.errors['minlength'].requiredLength} caracteres.`;
    if (ctrl.errors['email'])      return 'Email no válido.';
    return null;
  }

  get passwordMismatch(): boolean {
    return !!(
      this.form.hasError('passwordMismatch') &&
      this.form.get('confirmPassword')?.touched
    );
  }
}
