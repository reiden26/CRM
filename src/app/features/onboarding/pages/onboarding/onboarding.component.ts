import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatStepperModule } from '@angular/material/stepper';
import { TenantService } from '../../../../core/services/tenant.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { TranslateModule } from '@ngx-translate/core';

// ── Slug validator ────────────────────────────────────────────────────────────

function slugValidator(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value ?? '';
  const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  return valid ? null : { invalidSlug: true };
}

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-onboarding',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatStepperModule,
    TranslateModule,
  ],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
})
export class OnboardingComponent {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly fb           = inject(FormBuilder);
  private readonly tenantService = inject(TenantService);
  private readonly authService   = inject(AuthService);
  private readonly router        = inject(Router);
  private readonly notify        = inject(NotificationService);

  // ── State ────────────────────────────────────────────────────────────────────
  readonly loading = this.tenantService.loading;
  readonly error   = signal<string | null>(null);

  // ── Form ─────────────────────────────────────────────────────────────────────
  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    slug: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50), slugValidator]],
  });

  /** Auto-generates a slug from the company name as the user types. */
  onNameInput(event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50);

    this.form.patchValue({ slug }, { emitEvent: false });
    this.form.get('slug')?.markAsTouched();
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) return;

    this.error.set(null);
    const { name, slug } = this.form.getRawValue();

    const { tenant, error } = await this.tenantService.createTenant(
      name!,
      slug!,
    );

    if (error) {
      this.error.set(error);
      return;
    }

    if (tenant) {
      // Refresh profile so it picks up the new tenant_id and admin role
      await this.authService.refreshProfile();
      this.notify.success(`Workspace "${tenant.name}" created successfully!`);
      await this.router.navigate(['/dashboard']);
    }
  }

  // ── Template helpers ──────────────────────────────────────────────────────────

  getFieldError(field: 'name' | 'slug'): string | null {
    const control = this.form.get(field);
    if (!control?.touched || !control.errors) return null;

    if (control.errors['required'])    return 'This field is required.';
    if (control.errors['minlength'])   return `Minimum ${control.errors['minlength'].requiredLength} characters.`;
    if (control.errors['maxlength'])   return `Maximum ${control.errors['maxlength'].requiredLength} characters.`;
    if (control.errors['invalidSlug']) return 'Only lowercase letters, numbers and hyphens. No spaces.';
    return null;
  }
}
