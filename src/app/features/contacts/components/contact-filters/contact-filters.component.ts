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
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  ContactFilters,
  DEFAULT_FILTERS,
  ContactStatus,
  STATUS_LABELS,
} from '../../models/contact.model';

interface TeamMember { id: string; fullName: string; }
interface Company    { id: string; name: string; }

@Component({
  selector: 'app-contact-filters',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule,
    MatTooltipModule,
    TranslateModule,
  ],
  templateUrl: './contact-filters.component.html',
  styleUrl: './contact-filters.component.scss',
})
export class ContactFiltersComponent implements OnInit, OnDestroy {

  @Input()  filters: ContactFilters = { ...DEFAULT_FILTERS };
  @Output() filtersChange = new EventEmitter<ContactFilters>();
  @Output() searchChange  = new EventEmitter<string>();

  private readonly fb       = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly destroy$ = new Subject<void>();

  readonly teamMembers = signal<TeamMember[]>([]);
  readonly companies   = signal<Company[]>([]);

  readonly statusOptions: { value: ContactStatus; label: string }[] = [
    { value: 'lead',     label: STATUS_LABELS.lead },
    { value: 'prospect', label: STATUS_LABELS.prospect },
    { value: 'active',   label: STATUS_LABELS.active },
    { value: 'inactive', label: STATUS_LABELS.inactive },
    { value: 'archived', label: STATUS_LABELS.archived },
  ];

  readonly form = this.fb.group({
    search:     [this.filters.search],
    status:     [this.filters.status],
    assignedTo: [this.filters.assignedTo],
    companyId:  [this.filters.companyId],
    dateFrom:   [this.filters.dateFrom],
    dateTo:     [this.filters.dateTo],
  });

  readonly hasActiveFilters = signal<boolean>(false);

  ngOnInit(): void {
    this._loadLookups();

    // Debounce search input
    this.form.get('search')!.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(v => this.searchChange.emit(v ?? ''));

    // Emit other filter changes immediately
    this.form.valueChanges.pipe(
      takeUntil(this.destroy$),
    ).subscribe(() => this._emitFilters());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  reset(): void {
    this.form.reset({
      search: '', status: null, assignedTo: null,
      companyId: null, dateFrom: null, dateTo: null,
    });
    this.hasActiveFilters.set(false);
    this.filtersChange.emit({ ...DEFAULT_FILTERS });
  }

  private _emitFilters(): void {
    const v = this.form.getRawValue();
    const f: ContactFilters = {
      search:     v.search ?? '',
      status:     v.status as ContactStatus | null,
      assignedTo: v.assignedTo,
      companyId:  v.companyId,
      tagIds:     [],
      dateFrom:   v.dateFrom ? new Date(v.dateFrom as string).toISOString() : null,
      dateTo:     v.dateTo   ? new Date(v.dateTo   as string).toISOString() : null,
    };
    const active = !!(f.status || f.assignedTo || f.companyId || f.dateFrom || f.dateTo);
    this.hasActiveFilters.set(active);
    this.filtersChange.emit(f);
  }

  private async _loadLookups(): Promise<void> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;

    const [membersRes, companiesRes] = await Promise.all([
      this.supabase.client
        .from('profiles')
        .select('id, full_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('full_name'),
      this.supabase.client
        .from('companies')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .order('name'),
    ]);

    if (membersRes.data) {
      this.teamMembers.set(
        (membersRes.data as { id: string; full_name: string }[])
          .map(m => ({ id: m.id, fullName: m.full_name })),
      );
    }
    if (companiesRes.data) {
      this.companies.set(companiesRes.data as Company[]);
    }
  }
}
