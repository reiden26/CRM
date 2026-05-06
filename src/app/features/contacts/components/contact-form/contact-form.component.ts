import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  inject,
  signal,
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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  Contact,
  ContactFormValue,
  ContactStatus,
  ContactSource,
  STATUS_LABELS,
  SOURCE_LABELS,
} from '../../models/contact.model';

const DRAFT_KEY = 'crm_contact_form_draft';

function emailValidator(ctrl: AbstractControl): ValidationErrors | null {
  if (!ctrl.value) return null;
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ctrl.value);
  return valid ? null : { email: true };
}

@Component({
  selector: 'app-contact-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslateModule,
  ],
  templateUrl: './contact-form.component.html',
  styleUrl: './contact-form.component.scss',
})
export class ContactFormComponent implements OnInit, OnDestroy {

  @Input() contact: Contact | null = null;   // null = create mode
  @Input() saving = false;
  @Output() submitted = new EventEmitter<ContactFormValue>();
  @Output() cancelled = new EventEmitter<void>();

  private readonly fb       = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly destroy$ = new Subject<void>();

  readonly isEditMode = signal<boolean>(false);
  readonly draftSaved = signal<boolean>(false);

  // Lookup data
  readonly companies   = signal<{ id: string; name: string }[]>([]);
  readonly teamMembers = signal<{ id: string; fullName: string }[]>([]);
  readonly filteredCompanies = signal<{ id: string; name: string }[]>([]);

  readonly statusOptions: { value: ContactStatus; label: string }[] = [
    { value: 'lead',     label: STATUS_LABELS.lead },
    { value: 'prospect', label: STATUS_LABELS.prospect },
    { value: 'active',   label: STATUS_LABELS.active },
    { value: 'inactive', label: STATUS_LABELS.inactive },
  ];

  readonly sourceOptions: { value: ContactSource; label: string }[] = [
    { value: 'website',       label: SOURCE_LABELS.website },
    { value: 'referral',      label: SOURCE_LABELS.referral },
    { value: 'social_media',  label: SOURCE_LABELS.social_media },
    { value: 'cold_outreach', label: SOURCE_LABELS.cold_outreach },
    { value: 'event',         label: SOURCE_LABELS.event },
    { value: 'other',         label: SOURCE_LABELS.other },
  ];

  readonly form = this.fb.group({
    firstName:  ['', [Validators.required, Validators.minLength(1), Validators.maxLength(80)]],
    lastName:   ['', [Validators.required, Validators.minLength(1), Validators.maxLength(80)]],
    email:      ['', [emailValidator]],
    phone:      [''],
    companySearch: [''],
    companyId:  [null as string | null],
    position:   [''],
    source:     [null as ContactSource | null],
    status:     ['lead' as ContactStatus, Validators.required],
    assignedTo: [null as string | null],
    notes:      [''],
  });

  private _draftTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.isEditMode.set(!!this.contact);
    this._loadLookups();

    if (this.contact) {
      this._patchForm(this.contact);
    } else {
      this._loadDraft();
    }

    // Company autocomplete
    this.form.get('companySearch')!.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(v => this._filterCompanies(v ?? ''));

    // Auto-save draft every 30s (create mode only)
    if (!this.contact) {
      this._draftTimer = setInterval(() => this._saveDraft(), 30_000);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this._draftTimer) clearInterval(this._draftTimer);
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  submit(): void {
    if (this.form.invalid || this.saving) return;
    const v = this.form.getRawValue();
    this.submitted.emit({
      firstName:  v.firstName!,
      lastName:   v.lastName!,
      email:      v.email || null,
      phone:      v.phone || null,
      companyId:  v.companyId,
      position:   v.position || null,
      source:     v.source,
      status:     v.status as ContactStatus,
      assignedTo: v.assignedTo,
      notes:      v.notes || null,
    });
    this._clearDraft();
  }

  cancel(): void {
    this.cancelled.emit();
  }

  // ── Company autocomplete ──────────────────────────────────────────────────────

  onCompanySelected(companyId: string, companyName: string): void {
    this.form.patchValue({ companyId, companySearch: companyName });
  }

  /** Used by [displayWith] on mat-autocomplete */
  displayCompanyName = (value: string): string => value ?? '';

  clearCompany(): void {
    this.form.patchValue({ companyId: null, companySearch: '' });
    this.filteredCompanies.set(this.companies());
  }

  // ── Field error helpers ───────────────────────────────────────────────────────

  getError(field: string): string | null {
    const ctrl = this.form.get(field);
    if (!ctrl?.touched || !ctrl.errors) return null;
    if (ctrl.errors['required'])   return 'This field is required.';
    if (ctrl.errors['minlength'])  return `Minimum ${ctrl.errors['minlength'].requiredLength} characters.`;
    if (ctrl.errors['maxlength'])  return `Maximum ${ctrl.errors['maxlength'].requiredLength} characters.`;
    if (ctrl.errors['email'])      return 'Enter a valid email address.';
    return null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private _patchForm(c: Contact): void {
    this.form.patchValue({
      firstName:     c.firstName,
      lastName:      c.lastName,
      email:         c.email ?? '',
      phone:         c.phone ?? '',
      companySearch: c.companyName ?? '',
      companyId:     c.companyId,
      position:      c.position ?? '',
      source:        c.source,
      status:        c.status,
      assignedTo:    c.assignedTo,
    });
  }

  private _filterCompanies(query: string): void {
    const q = query.toLowerCase();
    this.filteredCompanies.set(
      this.companies().filter(c => c.name.toLowerCase().includes(q)),
    );
  }

  private _saveDraft(): void {
    if (this.form.pristine) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(this.form.getRawValue()));
      this.draftSaved.set(true);
      setTimeout(() => this.draftSaved.set(false), 2000);
    } catch { /* storage full */ }
  }

  private _loadDraft(): void {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        this.form.patchValue(draft);
      }
    } catch { /* ignore */ }
  }

  private _clearDraft(): void {
    localStorage.removeItem(DRAFT_KEY);
  }

  private async _loadLookups(): Promise<void> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;

    const [companiesRes, membersRes] = await Promise.all([
      this.supabase.client
        .from('companies')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .order('name'),
      this.supabase.client
        .from('profiles')
        .select('id, full_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('full_name'),
    ]);

    if (companiesRes.data) {
      const list = companiesRes.data as { id: string; name: string }[];
      this.companies.set(list);
      this.filteredCompanies.set(list);
    }
    if (membersRes.data) {
      this.teamMembers.set(
        (membersRes.data as { id: string; full_name: string }[])
          .map(m => ({ id: m.id, fullName: m.full_name })),
      );
    }
  }
}
