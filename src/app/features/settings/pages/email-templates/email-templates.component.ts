import {
  Component, OnInit, inject, signal, computed, ChangeDetectionStrategy, SecurityContext,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { TranslateModule } from '@ngx-translate/core';
import { environment } from '../../../../../environments/environment';

// ── Template types & variables ────────────────────────────────────────────────

type TemplateType = 'welcome' | 'deal_won' | 'task_reminder' | 'password_reset' | 'custom';

const TEMPLATE_VARIABLES: Record<TemplateType, string[]> = {
  welcome:        ['user_name', 'company_name', 'login_url'],
  deal_won:       ['user_name', 'deal_title', 'deal_value', 'company_name'],
  task_reminder:  ['user_name', 'task_title', 'due_date', 'contact_name'],
  password_reset: ['user_name', 'reset_url', 'expires_in'],
  custom:         ['user_name', 'company_name'],
};

const SYSTEM_TYPES: TemplateType[] = ['welcome', 'deal_won', 'task_reminder', 'password_reset'];

const DEFAULT_TEMPLATES: Record<TemplateType, { subject: string; html: string }> = {
  welcome: {
    subject: 'Welcome to {{company_name}}, {{user_name}}!',
    html: `<h1>Welcome, {{user_name}}!</h1><p>You've been invited to join <strong>{{company_name}}</strong> on CRM.</p><p><a href="{{login_url}}">Click here to get started</a></p>`,
  },
  deal_won: {
    subject: '🎉 Deal won: {{deal_title}}',
    html: `<h1>Congratulations, {{user_name}}!</h1><p>You've won the deal <strong>{{deal_title}}</strong> worth <strong>{{deal_value}}</strong>.</p>`,
  },
  task_reminder: {
    subject: 'Reminder: {{task_title}} is due {{due_date}}',
    html: `<h1>Task Reminder</h1><p>Hi {{user_name}}, your task <strong>{{task_title}}</strong> is due on <strong>{{due_date}}</strong>.</p>`,
  },
  password_reset: {
    subject: 'Reset your CRM password',
    html: `<h1>Password Reset</h1><p>Hi {{user_name}}, click the link below to reset your password. It expires in {{expires_in}}.</p><p><a href="{{reset_url}}">Reset password</a></p>`,
  },
  custom: { subject: '', html: '' },
};

interface EmailTemplate {
  id:        string;
  name:      string;
  subject:   string;
  htmlBody:  string;
  type:      TemplateType;
  isActive:  boolean;
  createdAt: string;
  updatedAt: string;
  isSystem:  boolean;
}

@Component({
  selector: 'app-email-templates',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatChipsModule,
    MatTooltipModule, MatProgressSpinnerModule, MatDividerModule, MatSnackBarModule,
    SkeletonComponent, TimeAgoPipe,
    TranslateModule,
  ],
  templateUrl: './email-templates.component.html',
  styleUrl: './email-templates.component.scss',
})
export class EmailTemplatesComponent implements OnInit {

  private readonly supabase  = inject(SupabaseService);
  private readonly auth      = inject(AuthService);
  private readonly notify    = inject(NotificationService);
  private readonly sanitizer = inject(DomSanitizer) as DomSanitizer;
  private readonly snackBar  = inject(MatSnackBar);
  private readonly fb        = inject(FormBuilder);
  private readonly destroy$  = new Subject<void>();

  readonly templates  = signal<EmailTemplate[]>([]);
  readonly loading    = signal(true);
  readonly saving     = signal(false);
  readonly sending    = signal(false);
  readonly editingId  = signal<string | null>(null);
  readonly isCreating = signal(false);

  readonly columns = ['type', 'name', 'subject', 'updated', 'actions'];
  readonly SYSTEM_TYPES = SYSTEM_TYPES;
  readonly TEMPLATE_VARIABLES = TEMPLATE_VARIABLES;
  readonly htmlPlaceholder = '<h1>Hello ' + '{{' + 'user_name' + '}}' + '</h1>';

  readonly typeOptions: { value: TemplateType; label: string }[] = [
    { value: 'welcome',        label: 'Welcome' },
    { value: 'deal_won',       label: 'Deal Won' },
    { value: 'task_reminder',  label: 'Task Reminder' },
    { value: 'password_reset', label: 'Password Reset' },
    { value: 'custom',         label: 'Custom' },
  ];

  readonly form = this.fb.group({
    name:     ['', [Validators.required, Validators.maxLength(80)]],
    type:     ['custom' as TemplateType, Validators.required],
    subject:  ['', Validators.required],
    htmlBody: ['', Validators.required],
    testEmail:[''],
  });

  // Live preview
  readonly previewHtml = signal<string>('');
  readonly currentVariables = computed<string[]>(() => {
    const type = this.form.get('type')?.value as TemplateType ?? 'custom';
    return TEMPLATE_VARIABLES[type] ?? [];
  });

  ngOnInit(): void {
    this._loadTemplates();

    // Live preview with debounce
    this.form.get('htmlBody')!.valueChanges.pipe(
      debounceTime(300), takeUntil(this.destroy$),
    ).subscribe(html => {
      this.previewHtml.set(this._sanitizePreviewHtml(html ?? ''));
    });

    // Auto-fill defaults when type changes
    this.form.get('type')!.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(type => {
      if (this.isCreating()) {
        const defaults = DEFAULT_TEMPLATES[type as TemplateType];
        if (defaults?.subject) this.form.patchValue({ subject: defaults.subject, htmlBody: defaults.html });
      }
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private async _loadTemplates(): Promise<void> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;
    this.loading.set(true);
    const { data } = await this.supabase.client
      .from('email_templates')
      .select('id, name, subject, html_body, type, is_active, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('type');

    this.templates.set(
      (data ?? []).map((t: any) => ({
        id:        t.id,
        name:      t.name,
        subject:   t.subject,
        htmlBody:  t.html_body,
        type:      t.type,
        isActive:  t.is_active,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        isSystem:  SYSTEM_TYPES.includes(t.type),
      })),
    );
    this.loading.set(false);
  }

  openCreate(): void {
    this.isCreating.set(true);
    this.editingId.set(null);
    this.form.reset({ type: 'custom', name: '', subject: '', htmlBody: '', testEmail: '' });
    this.previewHtml.set('');
  }

  openEdit(t: EmailTemplate): void {
    this.editingId.set(t.id);
    this.isCreating.set(false);
    this.form.patchValue({ name: t.name, type: t.type, subject: t.subject, htmlBody: t.htmlBody });
    this.previewHtml.set(this._sanitizePreviewHtml(t.htmlBody));
  }

  closeEditor(): void {
    this.editingId.set(null);
    this.isCreating.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const tenantId = this.auth.profile()?.tenantId;
    const userId   = this.auth.session()?.user.id;
    if (!tenantId) return;
    const v = this.form.getRawValue();
    this.saving.set(true);

    if (this.isCreating()) {
      const { data, error } = await this.supabase.client
        .from('email_templates')
        .insert({ tenant_id: tenantId, created_by: userId, name: v.name, type: v.type, subject: v.subject, html_body: v.htmlBody })
        .select('id, name, subject, html_body, type, is_active, created_at, updated_at').single();
      this.saving.set(false);
      if (error) { this.notify.error('Failed to create template.'); return; }
      const t = data as any;
      this.templates.update(list => [...list, { id: t.id, name: t.name, subject: t.subject, htmlBody: t.html_body, type: t.type, isActive: t.is_active, createdAt: t.created_at, updatedAt: t.updated_at, isSystem: SYSTEM_TYPES.includes(t.type) }]);
      this.notify.success('Template created.');
    } else {
      const id = this.editingId()!;
      const { error } = await this.supabase.client
        .from('email_templates')
        .update({ name: v.name, subject: v.subject, html_body: v.htmlBody })
        .eq('id', id);
      this.saving.set(false);
      if (error) { this.notify.error('Failed to update template.'); return; }
      this.templates.update(list => list.map(t => t.id === id ? { ...t, name: v.name!, subject: v.subject!, htmlBody: v.htmlBody!, updatedAt: new Date().toISOString() } : t));
      this.notify.success('Template saved.');
    }
    this.closeEditor();
  }

  async deleteTemplate(id: string): Promise<void> {
    if (!confirm('Delete this template?')) return;
    const { error } = await this.supabase.client.from('email_templates').delete().eq('id', id);
    if (error) { this.notify.error('Failed to delete template.'); return; }
    this.templates.update(list => list.filter(t => t.id !== id));
    this.notify.success('Template deleted.');
  }

  async sendTestEmail(): Promise<void> {
    const email = this.form.get('testEmail')?.value;
    if (!email) { this.notify.warning('Enter a test email address.'); return; }
    this.sending.set(true);
    // Call the send-email Edge Function
    const supabaseUrl = environment.supabase.url;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await this.supabase.client.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ to: email, templateName: this.form.get('name')?.value, variables: {} }),
      });
      if (res.ok) { this.notify.success(`Test email sent to ${email}`); }
      else { this.notify.error('Failed to send test email.'); }
    } catch { this.notify.error('Failed to send test email.'); }
    this.sending.set(false);
  }

  insertVariable(variable: string): void {
    const ctrl = this.form.get('htmlBody')!;
    ctrl.setValue((ctrl.value ?? '') + `{{${variable}}}`);
  }

  getTypeColor(type: string): string {
    const map: Record<string, string> = { welcome: '#22c55e', deal_won: '#f59e0b', task_reminder: '#0288d1', password_reset: '#6366f1', custom: '#9ca3af' };
    return map[type] ?? '#9ca3af';
  }

  trackById(_: number, t: EmailTemplate): string { return t.id; }

  private _sanitizePreviewHtml(html: string): string {
    return this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
  }
}
