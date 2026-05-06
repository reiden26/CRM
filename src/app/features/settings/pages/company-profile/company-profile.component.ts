import {
  Component, OnInit, inject, signal, computed, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { AuthService } from '../../../../core/services/auth.service';
import { TenantService } from '../../../../core/services/tenant.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { CURRENCIES } from '../../../pipeline/models/deal.model';
import { PLAN_LIMITS, TenantPlan } from '../../../../core/models/tenant.model';
import { TranslateModule } from '@ngx-translate/core';

const TIMEZONES = [
  'UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'America/Mexico_City','America/Bogota','America/Lima','America/Santiago',
  'America/Sao_Paulo','America/Buenos_Aires','Europe/London','Europe/Paris',
  'Europe/Madrid','Asia/Tokyo','Asia/Shanghai','Australia/Sydney',
];

const INDUSTRIES = [
  'Technology','Finance','Healthcare','Retail','Manufacturing',
  'Real Estate','Education','Consulting','Marketing','Other',
];

@Component({
  selector: 'app-company-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatDividerModule,
    MatProgressBarModule,
    TranslateModule,
  ],
  templateUrl: './company-profile.component.html',
  styleUrl: './company-profile.component.scss',
})
export class CompanyProfileComponent implements OnInit {

  private readonly supabase       = inject(SupabaseService);
  private readonly auth           = inject(AuthService);
  private readonly tenantService  = inject(TenantService);
  private readonly notify         = inject(NotificationService);
  private readonly fb             = inject(FormBuilder);

  readonly loading      = signal(true);
  readonly saving       = signal(false);
  readonly uploadingLogo = signal(false);
  readonly logoUrl      = signal<string | null>(null);
  readonly usageCounts  = signal<Record<string, number>>({});

  // ── Billing computed ──────────────────────────────────────────────────────────
  readonly currentPlan = computed(() =>
    this.tenantService.currentTenant()?.plan?.toUpperCase() ?? 'FREE',
  );

  readonly planIcon = computed(() => {
    const p = this.tenantService.currentTenant()?.plan;
    return p === TenantPlan.ENTERPRISE ? 'diamond' : p === TenantPlan.PRO ? 'star' : 'rocket_launch';
  });

  readonly planFeatures = computed(() =>
    PLAN_LIMITS[this.tenantService.currentTenant()?.plan ?? TenantPlan.FREE].features,
  );

  readonly usageItems = computed(() => {
    const plan   = this.tenantService.currentTenant()?.plan ?? TenantPlan.FREE;
    const limits = PLAN_LIMITS[plan];
    const counts = this.usageCounts();
    return [
      { label: 'Contacts', icon: 'people',    current: counts['contacts'] ?? 0, limit: limits.maxContacts, pct: limits.maxContacts > 0 ? Math.min(100, ((counts['contacts'] ?? 0) / limits.maxContacts) * 100) : 0, atLimit: limits.maxContacts > 0 && (counts['contacts'] ?? 0) >= limits.maxContacts },
      { label: 'Deals',    icon: 'handshake', current: counts['deals']    ?? 0, limit: limits.maxDeals,    pct: limits.maxDeals    > 0 ? Math.min(100, ((counts['deals']    ?? 0) / limits.maxDeals)    * 100) : 0, atLimit: limits.maxDeals    > 0 && (counts['deals']    ?? 0) >= limits.maxDeals    },
      { label: 'Users',    icon: 'group',     current: counts['users']    ?? 0, limit: limits.maxUsers,    pct: limits.maxUsers    > 0 ? Math.min(100, ((counts['users']    ?? 0) / limits.maxUsers)    * 100) : 0, atLimit: limits.maxUsers    > 0 && (counts['users']    ?? 0) >= limits.maxUsers    },
    ];
  });

  readonly TIMEZONES  = TIMEZONES;
  readonly INDUSTRIES = INDUSTRIES;
  readonly CURRENCIES = CURRENCIES;

  readonly form = this.fb.group({
    name:     ['', [Validators.required, Validators.maxLength(100)]],
    industry: [''],
    website:  [''],
    phone:    [''],
    timezone: ['UTC'],
    currency: ['USD'],
    primaryColor: ['#1a237e'],
    accentColor:  ['#0288d1'],
  });

  ngOnInit(): void { this._loadProfile(); this._loadUsage(); }

  private async _loadProfile(): Promise<void> {
    const tenant = this.tenantService.currentTenant();
    if (!tenant) return;
    this.loading.set(true);

    // Load tenant settings
    this.form.patchValue({
      name:         tenant.name,
      timezone:     tenant.settings.timezone,
      currency:     tenant.settings.currency,
      primaryColor: tenant.settings.primaryColor,
      accentColor:  tenant.settings.accentColor,
    });
    this.logoUrl.set(tenant.settings.logo);

    // Load company data
    const companyId = this.auth.profile()?.companyId;
    if (companyId) {
      const { data } = await this.supabase.client
        .from('companies').select('name, industry, website, phone').eq('id', companyId).single();
      if (data) {
        this.form.patchValue({
          name:     (data as any).name ?? tenant.name,
          industry: (data as any).industry ?? '',
          website:  (data as any).website ?? '',
          phone:    (data as any).phone ?? '',
        });
      }
    }
    this.loading.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const tenantId  = this.tenantService.currentTenant()?.id;
    const companyId = this.auth.profile()?.companyId;
    if (!tenantId) return;

    this.saving.set(true);
    const v = this.form.getRawValue();

    // Update tenant settings
    const newSettings = {
      timezone:     v.timezone,
      currency:     v.currency,
      primaryColor: v.primaryColor,
      accentColor:  v.accentColor,
      logo:         this.logoUrl(),
    };

    const [tenantRes, companyRes] = await Promise.all([
      this.supabase.client
        .from('tenants')
        .update({ name: v.name, settings: newSettings })
        .eq('id', tenantId),
      companyId
        ? this.supabase.client
            .from('companies')
            .update({ name: v.name, industry: v.industry, website: v.website, phone: v.phone })
            .eq('id', companyId)
        : Promise.resolve({ error: null }),
    ]);

    this.saving.set(false);

    if (tenantRes.error) { this.notify.error('Failed to save settings.'); return; }

    // Apply theme immediately
    this.tenantService.applyTenantTheme({
      primaryColor: v.primaryColor!,
      accentColor:  v.accentColor!,
      logo:         this.logoUrl(),
      timezone:     v.timezone!,
      currency:     v.currency!,
      language:     'en',
    });

    await this.tenantService.loadTenant(tenantId);
    this.notify.success('Company profile saved.');
  }

  async uploadLogo(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { this.notify.error('Logo must be under 2 MB.'); return; }

    const tenantId = this.tenantService.currentTenant()?.id;
    if (!tenantId) return;

    this.uploadingLogo.set(true);
    const path = `${tenantId}/logo.${file.name.split('.').pop()}`;
    const { error } = await this.supabase.client.storage
      .from('company-assets')
      .upload(path, file, { upsert: true });

    if (error) { this.notify.error('Failed to upload logo.'); this.uploadingLogo.set(false); return; }

    const { data } = this.supabase.client.storage.from('company-assets').getPublicUrl(path);
    this.logoUrl.set(data.publicUrl);
    this.uploadingLogo.set(false);
    this.notify.success('Logo uploaded.');
  }

  removeLogo(): void { this.logoUrl.set(null); }

  private async _loadUsage(): Promise<void> {
    const tenantId = this.tenantService.currentTenant()?.id;
    if (!tenantId) return;
    const [contacts, deals, users] = await Promise.all([
      this.supabase.client.from('contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      this.supabase.client.from('deals').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      this.supabase.client.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    ]);
    this.usageCounts.set({
      contacts: contacts.count ?? 0,
      deals:    deals.count    ?? 0,
      users:    users.count    ?? 0,
    });
  }
}
