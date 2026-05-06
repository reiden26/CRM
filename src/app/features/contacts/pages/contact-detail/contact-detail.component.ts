import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { ContactsService } from '../../services/contacts.service';
import { ContactFormComponent } from '../../components/contact-form/contact-form.component';
import { HasPermissionPipe } from '../../../../shared/pipes/has-permission.pipe';
import { PermissionDirective } from '../../../../shared/directives/permission.directive';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  Contact,
  ContactFormValue,
  STATUS_LABELS,
  STATUS_COLORS,
  SOURCE_LABELS,
} from '../../models/contact.model';

// ── Activity types ────────────────────────────────────────────────────────────

type ActivityType = 'call' | 'email' | 'meeting' | 'task' | 'note';

interface Activity {
  id:          string;
  type:        ActivityType;
  title:       string;
  description: string | null;
  dueDate:     string | null;
  completedAt: string | null;
  createdBy:   string | null;
  createdByName: string | null;
  createdAt:   string;
}

interface Deal {
  id:    string;
  title: string;
  stage: string;
  value: number;
  currency: string;
}

const ACTIVITY_ICONS: Record<ActivityType, string> = {
  call:    'phone',
  email:   'email',
  meeting: 'groups',
  task:    'task_alt',
  note:    'sticky_note_2',
};

@Component({
  selector: 'app-contact-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatMenuModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    ContactFormComponent,
    HasPermissionPipe,
    PermissionDirective,
    TimeAgoPipe,
    TranslateModule,
  ],
  templateUrl: './contact-detail.component.html',
  styleUrl: './contact-detail.component.scss',
})
export class ContactDetailComponent implements OnInit, OnDestroy {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly route           = inject(ActivatedRoute);
  private readonly router          = inject(Router);
  private readonly contactsService = inject(ContactsService);
  private readonly supabase        = inject(SupabaseService);
  private readonly auth            = inject(AuthService);
  private readonly notify          = inject(NotificationService);
  private readonly fb              = inject(FormBuilder);

  // ── State ────────────────────────────────────────────────────────────────────
  readonly contact    = signal<Contact | null>(null);
  readonly activities = signal<Activity[]>([]);
  readonly deals      = signal<Deal[]>([]);
  readonly loading    = signal<boolean>(true);
  readonly saving     = signal<boolean>(false);
  readonly showEdit   = signal<boolean>(false);
  readonly addingActivity = signal<boolean>(false);

  // ── Quick activity form ───────────────────────────────────────────────────────
  readonly activityForm = this.fb.group({
    type:        ['note' as ActivityType, Validators.required],
    title:       ['', [Validators.required, Validators.maxLength(200)]],
    description: [''],
  });

  readonly activityTypes: { value: ActivityType; label: string; icon: string }[] = [
    { value: 'call',    label: 'Call',    icon: 'phone' },
    { value: 'email',   label: 'Email',   icon: 'email' },
    { value: 'meeting', label: 'Meeting', icon: 'groups' },
    { value: 'task',    label: 'Task',    icon: 'task_alt' },
    { value: 'note',    label: 'Note',    icon: 'sticky_note_2' },
  ];

  // ── Computed ──────────────────────────────────────────────────────────────────
  readonly avatarColor = computed(() => {
    const c = this.contact();
    if (!c) return '#6366f1';
    const colors = ['#6366f1','#0288d1','#22c55e','#f59e0b','#ef4444','#8b5cf6'];
    return colors[(c.firstName.charCodeAt(0) ?? 0) % colors.length];
  });

  readonly initials = computed(() => {
    const c = this.contact();
    if (!c) return '?';
    return ((c.firstName[0] ?? '') + (c.lastName[0] ?? '')).toUpperCase();
  });

  readonly statusColor = computed(() =>
    STATUS_COLORS[this.contact()?.status ?? 'lead'],
  );

  readonly statusLabel = computed(() =>
    STATUS_LABELS[this.contact()?.status ?? 'lead'],
  );

  // ── Helpers ───────────────────────────────────────────────────────────────────
  readonly ACTIVITY_ICONS = ACTIVITY_ICONS;
  readonly SOURCE_LABELS  = SOURCE_LABELS;

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this._loadContact(id);
  }

  ngOnDestroy(): void {}

  // ── Data loading ──────────────────────────────────────────────────────────────

  private async _loadContact(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const [contact] = await Promise.all([
        this.contactsService.getContactById(id),
        this._loadActivities(id),
        this._loadDeals(id),
      ]);
      if (!contact) {
        this.notify.error('Contact not found.');
        this.router.navigate(['/contacts']);
        return;
      }
      this.contact.set(contact);
    } finally {
      this.loading.set(false);
    }
  }

  private async _loadActivities(contactId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from('activities')
      .select(`
        id, type, title, description, due_date, completed_at, created_by, created_at,
        profiles!activities_created_by_fkey ( full_name )
      `)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(50);

    this.activities.set(
      (data ?? []).map((a: any) => ({
        id:            a.id,
        type:          a.type,
        title:         a.title,
        description:   a.description,
        dueDate:       a.due_date,
        completedAt:   a.completed_at,
        createdBy:     a.created_by,
        createdByName: a.profiles?.full_name ?? null,
        createdAt:     a.created_at,
      })),
    );
  }

  private async _loadDeals(contactId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from('deals')
      .select('id, title, stage, value, currency')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    this.deals.set(data ?? []);
  }

  // ── Edit ──────────────────────────────────────────────────────────────────────

  async onEditSubmit(value: ContactFormValue): Promise<void> {
    const id = this.contact()?.id;
    if (!id) return;
    this.saving.set(true);
    const updated = await this.contactsService.updateContact(id, value);
    this.saving.set(false);
    if (updated) {
      this.contact.set(updated);
      this.showEdit.set(false);
    }
  }

  // ── Quick activity ────────────────────────────────────────────────────────────

  async submitActivity(): Promise<void> {
    if (this.activityForm.invalid) return;
    const contactId = this.contact()?.id;
    const tenantId  = this.auth.profile()?.tenantId;
    const userId    = this.auth.session()?.user.id;
    if (!contactId || !tenantId || !userId) return;

    this.saving.set(true);
    const v = this.activityForm.getRawValue();
    const { error } = await this.supabase.client
      .from('activities')
      .insert({
        tenant_id:   tenantId,
        contact_id:  contactId,
        type:        v.type,
        title:       v.title,
        description: v.description || null,
        created_by:  userId,
        assigned_to: userId,
      });

    this.saving.set(false);

    if (error) {
      this.notify.error('Failed to add activity.');
    } else {
      this.notify.success('Activity added.');
      this.activityForm.reset({ type: 'note', title: '', description: '' });
      this.addingActivity.set(false);
      await this._loadActivities(contactId);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async archiveContact(): Promise<void> {
    const id = this.contact()?.id;
    if (!id || !confirm('Archive this contact?')) return;
    const ok = await this.contactsService.deleteContact(id);
    if (ok) this.router.navigate(['/contacts']);
  }

  // ── Template helpers ──────────────────────────────────────────────────────────

  trackById(_: number, item: { id: string }): string { return item.id; }

  getActivityIcon(type: ActivityType): string {
    return ACTIVITY_ICONS[type] ?? 'event_note';
  }

  formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  }
}
