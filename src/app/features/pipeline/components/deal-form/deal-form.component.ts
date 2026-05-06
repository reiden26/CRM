import {
  Component,
  Inject,
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
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSliderModule } from '@angular/material/slider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  Deal,
  DealStage,
  DealFormValue,
  DealStageType,
  CURRENCIES,
  getProbabilityColor,
} from '../../models/deal.model';

export interface DealFormDialogData {
  deal?:         Deal;          // null = create mode
  stages:        DealStage[];
  defaultStage?: DealStageType;
}

function positiveNumberValidator(ctrl: AbstractControl): ValidationErrors | null {
  const v = Number(ctrl.value);
  return isNaN(v) || v < 0 ? { positiveNumber: true } : null;
}

@Component({
  selector: 'app-deal-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSliderModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './deal-form.component.html',
  styleUrl: './deal-form.component.scss',
})
export class DealFormComponent implements OnInit, OnDestroy {

  // ── Dialog data ───────────────────────────────────────────────────────────────
  readonly data: DealFormDialogData = inject(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<DealFormComponent>);

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly fb       = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly destroy$ = new Subject<void>();

  // ── Lookup data ───────────────────────────────────────────────────────────────
  readonly contacts     = signal<{ id: string; name: string }[]>([]);
  readonly companies    = signal<{ id: string; name: string }[]>([]);
  readonly teamMembers  = signal<{ id: string; fullName: string }[]>([]);
  readonly filteredContacts = signal<{ id: string; name: string }[]>([]);

  readonly currencies   = CURRENCIES;
  readonly isEditMode   = !!this.data.deal;
  readonly saving       = signal<boolean>(false);

  // ── Probability color ─────────────────────────────────────────────────────────
  readonly probabilityColor = signal<string>('#22c55e');

  // ── Form ──────────────────────────────────────────────────────────────────────
  readonly form = this.fb.group({
    title:             ['', [Validators.required, Validators.maxLength(200)]],
    contactSearch:     [''],
    contactId:         [null as string | null],
    companyId:         [null as string | null],
    stage:             [this.data.defaultStage ?? 'new' as DealStageType, Validators.required],
    value:             [0, [Validators.required, positiveNumberValidator]],
    currency:          ['USD', Validators.required],
    probability:       [50, [Validators.required, Validators.min(0), Validators.max(100)]],
    expectedCloseDate: [null as string | null],
    description:       [''],
    assignedTo:        [null as string | null],
  });

  ngOnInit(): void {
    this._loadLookups();

    if (this.data.deal) {
      this._patchForm(this.data.deal);
    }

    // Contact autocomplete
    this.form.get('contactSearch')!.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(v => this._filterContacts(v ?? ''));

    // Probability color
    this.form.get('probability')!.valueChanges.pipe(
      takeUntil(this.destroy$),
    ).subscribe(v => {
      this.probabilityColor.set(getProbabilityColor(v ?? 0));
    });
    this.probabilityColor.set(getProbabilityColor(this.form.get('probability')!.value ?? 50));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  submit(): void {
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();

    const result: DealFormValue = {
      title:             v.title!,
      contactId:         v.contactId,
      companyId:         v.companyId,
      stage:             v.stage as DealStageType,
      value:             Number(v.value),
      currency:          v.currency!,
      probability:       Number(v.probability),
      expectedCloseDate: v.expectedCloseDate
        ? new Date(v.expectedCloseDate as string).toISOString().slice(0, 10)
        : null,
      description:       v.description || null,
      assignedTo:        v.assignedTo,
    };

    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  // ── Contact autocomplete ──────────────────────────────────────────────────────

  onContactSelected(id: string, name: string): void {
    this.form.patchValue({ contactId: id, contactSearch: name });
  }

  clearContact(): void {
    this.form.patchValue({ contactId: null, contactSearch: '' });
    this.filteredContacts.set(this.contacts());
  }

  displayContactName = (value: string): string => value ?? '';

  // ── Field errors ──────────────────────────────────────────────────────────────

  getError(field: string): string | null {
    const ctrl = this.form.get(field);
    if (!ctrl?.touched || !ctrl.errors) return null;
    if (ctrl.errors['required'])        return 'Required.';
    if (ctrl.errors['maxlength'])       return `Max ${ctrl.errors['maxlength'].requiredLength} chars.`;
    if (ctrl.errors['positiveNumber'])  return 'Must be a positive number.';
    if (ctrl.errors['min'])             return 'Minimum 0.';
    if (ctrl.errors['max'])             return 'Maximum 100.';
    return null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private _patchForm(d: Deal): void {
    this.form.patchValue({
      title:             d.title,
      contactSearch:     d.contactName ?? '',
      contactId:         d.contactId,
      companyId:         d.companyId,
      stage:             d.stage,
      value:             d.value,
      currency:          d.currency,
      probability:       d.probability,
      expectedCloseDate: d.expectedCloseDate,
      assignedTo:        d.assignedTo,
    });
  }

  private _filterContacts(query: string): void {
    const q = query.toLowerCase();
    this.filteredContacts.set(
      this.contacts().filter(c => c.name.toLowerCase().includes(q)),
    );
  }

  private async _loadLookups(): Promise<void> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;

    const [contactsRes, companiesRes, membersRes] = await Promise.all([
      this.supabase.client
        .from('contacts')
        .select('id, first_name, last_name')
        .eq('tenant_id', tenantId)
        .order('first_name'),
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

    if (contactsRes.data) {
      const list = (contactsRes.data as { id: string; first_name: string; last_name: string }[])
        .map(c => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() }));
      this.contacts.set(list);
      this.filteredContacts.set(list);
    }
    if (companiesRes.data) {
      this.companies.set(companiesRes.data as { id: string; name: string }[]);
    }
    if (membersRes.data) {
      this.teamMembers.set(
        (membersRes.data as { id: string; full_name: string }[])
          .map(m => ({ id: m.id, fullName: m.full_name })),
      );
    }
  }
}
