import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { Subject, takeUntil } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { ContactsService } from '../../services/contacts.service';
import { ContactFiltersComponent } from '../../components/contact-filters/contact-filters.component';
import { ContactFormComponent } from '../../components/contact-form/contact-form.component';
import { HasPermissionPipe } from '../../../../shared/pipes/has-permission.pipe';
import { PermissionDirective } from '../../../../shared/directives/permission.directive';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import {
  Contact,
  ContactRow,
  ContactFilters,
  ContactFormValue,
  PaginationParams,
  DEFAULT_FILTERS,
  DEFAULT_PAGINATION,
  STATUS_LABELS,
  STATUS_COLORS,
  ContactStatus,
} from '../../models/contact.model';

@Component({
  selector: 'app-contacts-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatDialogModule,
    MatDividerModule,
    ContactFiltersComponent,
    ContactFormComponent,
    HasPermissionPipe,
    PermissionDirective,
    TimeAgoPipe,
    TranslateModule,
  ],
  templateUrl: './contacts-list.component.html',
  styleUrl: './contacts-list.component.scss',
})
export class ContactsListComponent implements OnInit, OnDestroy {

  // ── Dependencies ────────────────────────────────────────────────────────────
  readonly contactsService         = inject(ContactsService);
  readonly router                  = inject(Router);
  private readonly destroy$        = new Subject<void>();

  // ── Table refs ────────────────────────────────────────────────────────────────
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort)      sort!: MatSort;

  // ── State from service ────────────────────────────────────────────────────────
  readonly contacts$     = this.contactsService.contacts$;
  readonly total$        = this.contactsService.total$;
  readonly loading$      = this.contactsService.loading$;
  readonly saving$       = this.contactsService.saving$;
  readonly selectedIds$  = this.contactsService.selectedIds$;
  readonly selectedCount$ = this.contactsService.selectedCount$;

  // ── Local UI state ────────────────────────────────────────────────────────────
  readonly showForm      = signal<boolean>(false);
  readonly editContact   = signal<Contact | null>(null);
  readonly filters       = signal<ContactFilters>({ ...DEFAULT_FILTERS });
  readonly pagination    = signal<PaginationParams>({ ...DEFAULT_PAGINATION });

  // ── Table columns ─────────────────────────────────────────────────────────────
  readonly displayedColumns = [
    'select', 'name', 'company', 'email', 'phone',
    'status', 'assignedTo', 'createdAt', 'actions',
  ];

  // ── Computed ──────────────────────────────────────────────────────────────────
  readonly allSelected = computed(() => {
    const ids = this.selectedIds$();
    const contacts = this.contacts$();
    return contacts.length > 0 && contacts.every(c => ids.has(c.id));
  });

  readonly someSelected = computed(() => {
    const ids = this.selectedIds$();
    const contacts = this.contacts$();
    return contacts.some(c => ids.has(c.id)) && !this.allSelected();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────
  readonly STATUS_LABELS   = STATUS_LABELS;
  readonly STATUS_COLORS   = STATUS_COLORS;
  readonly ContactStatus   = {} as Record<string, ContactStatus>; // type alias for template casts

  statusColor(status: string): string {
    return STATUS_COLORS[status as ContactStatus] ?? '#9ca3af';
  }

  statusLabel(status: string): string {
    return STATUS_LABELS[status as ContactStatus] ?? status;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this._load();
    this.contactsService.subscribeToChanges();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.contactsService.unsubscribeFromChanges();
    this.contactsService.clearSelection();
  }

  // ── Data loading ──────────────────────────────────────────────────────────────

  private _load(): void {
    this.contactsService.getContacts(this.filters(), this.pagination());
  }

  onFiltersChange(f: ContactFilters): void {
    this.filters.set(f);
    this.pagination.update(p => ({ ...p, page: 0 }));
    this._load();
  }

  onSearchChange(search: string): void {
    this.filters.update(f => ({ ...f, search }));
    this.pagination.update(p => ({ ...p, page: 0 }));
    this._load();
  }

  onPageChange(event: PageEvent): void {
    this.pagination.update(p => ({
      ...p,
      page:     event.pageIndex,
      pageSize: event.pageSize,
    }));
    this._load();
  }

  onSortChange(sort: Sort): void {
    this.pagination.update(p => ({
      ...p,
      sortBy:  (sort.active as keyof ContactRow) || 'created_at',
      sortDir: (sort.direction || 'desc') as 'asc' | 'desc',
      page:    0,
    }));
    this._load();
  }

  // ── Selection ─────────────────────────────────────────────────────────────────

  toggleSelectAll(): void {
    if (this.allSelected()) {
      this.contactsService.clearSelection();
    } else {
      this.contactsService.selectAll(this.contacts$().map(c => c.id));
    }
  }

  toggleSelect(id: string): void {
    this.contactsService.toggleSelect(id);
  }

  isSelected(id: string): boolean {
    return this.contactsService.isSelected(id);
  }

  // ── CRUD actions ──────────────────────────────────────────────────────────────

  openCreateForm(): void {
    this.editContact.set(null);
    this.showForm.set(true);
  }

  openEditForm(contact: Contact): void {
    this.editContact.set(contact);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editContact.set(null);
  }

  async onFormSubmit(value: ContactFormValue): Promise<void> {
    const edit = this.editContact();
    if (edit) {
      await this.contactsService.updateContact(edit.id, value);
    } else {
      await this.contactsService.createContact(value);
    }
    this.closeForm();
    this._load();
  }

  viewContact(id: string): void {
    this.router.navigate(['/contacts', id]);
  }

  async deleteContact(id: string): Promise<void> {
    if (!confirm('Archive this contact?')) return;
    await this.contactsService.deleteContact(id);
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────────

  async bulkDelete(): Promise<void> {
    const ids = [...this.selectedIds$()];
    if (!ids.length || !confirm(`Archive ${ids.length} contact(s)?`)) return;
    await this.contactsService.bulkDelete(ids);
    this._load();
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  exportCsv(): void {
    this.contactsService.exportToCsv(this.contacts$());
  }

  // ── Template helpers ──────────────────────────────────────────────────────────

  trackById(_: number, c: Contact): string { return c.id; }

  getInitials(c: Contact): string {
    return ((c.firstName[0] ?? '') + (c.lastName[0] ?? '')).toUpperCase();
  }

  getAvatarColor(c: Contact): string {
    const colors = ['#6366f1','#0288d1','#22c55e','#f59e0b','#ef4444','#8b5cf6'];
    return colors[(c.firstName.charCodeAt(0) ?? 0) % colors.length];
  }
}
