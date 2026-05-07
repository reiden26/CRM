import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, ActivatedRoute, RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { TenantService } from '../../core/services/tenant.service';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageService } from '../../core/services/language.service';
import { NotificationBellComponent } from '../../shared/components/notification-bell/notification-bell.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

// ─────────────────────────────────────────────────────────────────────────────
// Breadcrumb item
// ─────────────────────────────────────────────────────────────────────────────

export interface BreadcrumbItem {
  label: string;
  url:   string | null; // null = current page (not a link)
  isKey?: boolean;
}

// Route segment → human-readable label map
const ROUTE_LABELS: Record<string, string> = {
  dashboard:     'NAV.DASHBOARD',
  contacts:      'NAV.CONTACTS',
  companies:     'NAV.COMPANIES',
  pipeline:      'NAV.PIPELINE',
  tasks:         'NAV.TASKS',
  reports:       'NAV.REPORTS',
  settings:      'NAV.SETTINGS',
  notifications: 'NAV.NOTIFICATIONS',

  // Settings sub-nav
  company:                  'SETTINGS.NAV.COMPANY',
  users:                    'SETTINGS.NAV.USERS',
  pipeline_config:          'SETTINGS.NAV.PIPELINE',
  roles:                    'SETTINGS.NAV.ROLES',
  email_templates:          'SETTINGS.NAV.EMAIL_TPL',
  email_logs:               'SETTINGS.NAV.EMAIL_LOGS',
  notification_preferences: 'SETTINGS.NAV.NOTIF_PREFS',
  audit_log:                'SETTINGS.NAV.AUDIT',

  // Generic segments
  new:           'COMMON.CREATE',
  edit:          'COMMON.EDIT',
  profile:       'COMMON.MY_PROFILE',
};

// ─────────────────────────────────────────────────────────────────────────────
// NavbarComponent
// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-navbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    NotificationBellComponent,
    TranslateModule,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit, OnDestroy {

  // ── Inputs / Outputs ─────────────────────────────────────────────────────────
  @Input() sidebarCollapsed = false;
  @Output() menuToggle = new EventEmitter<void>();

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly translate      = inject(TranslateService);
  readonly auth                   = inject(AuthService);
  readonly tenantService          = inject(TenantService);
  readonly pushService            = inject(PushNotificationService);
  readonly themeService           = inject(ThemeService);
  readonly langService            = inject(LanguageService);

  // ── Push state ────────────────────────────────────────────────────────────────
  readonly isPushSubscribed  = this.pushService.isSubscribed$;
  readonly pushPermission    = this.pushService.permission$;
  readonly pushToggling      = signal<boolean>(false);

  readonly pushMenuLabel = computed(() => {
    if (this.pushPermission() === 'unsupported') return null;
    if (this.pushPermission() === 'denied')      return this.translate.instant('COMMON.PUSH_BLOCKED');
    return this.isPushSubscribed()
      ? this.translate.instant('COMMON.PUSH_DISABLE')
      : this.translate.instant('COMMON.PUSH_ENABLE');
  });

  readonly pushMenuIcon = computed(() =>
    this.isPushSubscribed() ? 'notifications_off' : 'add_alert',
  );

  // ── Breadcrumb state ─────────────────────────────────────────────────────────
  readonly breadcrumbs = signal<BreadcrumbItem[]>([]);

  // ── User info ────────────────────────────────────────────────────────────────
  readonly profile = this.auth.profile;

  readonly userInitials = computed(() => {
    const name = this.auth.profile()?.fullName ?? '';
    return name
      .split(' ')
      .slice(0, 2)
      .map(n => n[0]?.toUpperCase() ?? '')
      .join('') || '?';
  });

  readonly userEmail = computed(() =>
    this.auth.session()?.user.email ?? '',
  );

  readonly tenantName = computed(() =>
    this.tenantService.currentTenant()?.name ?? '',
  );

  // ── Subscriptions ────────────────────────────────────────────────────────────
  private _routerSub: Subscription | null = null;
  private _langSub: Subscription | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Build breadcrumb on initial load
    this._buildBreadcrumbs();

    // Rebuild on every navigation end
    this._routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this._buildBreadcrumbs());

    // Rebuild when language changes (so labels update)
    this._langSub = this.translate.onLangChange.subscribe(() => this._buildBreadcrumbs());
  }

  ngOnDestroy(): void {
    this._routerSub?.unsubscribe();
    this._langSub?.unsubscribe();
  }

  // ── Actions ───────────────────────────────────────────────────────────────────

  onMenuToggle(): void {
    this.menuToggle.emit();
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  goToProfile(): void {
    this.router.navigate(['/settings/profile']);
  }

  goToSettings(): void {
    this.router.navigate(['/settings']);
  }

  async togglePushNotifications(): Promise<void> {
    if (this.pushToggling() || this.pushPermission() === 'unsupported') return;
    this.pushToggling.set(true);
    try {
      if (this.isPushSubscribed()) {
        await this.pushService.unsubscribeFromPush();
      } else {
        await this.pushService.subscribeToPush();
      }
    } finally {
      this.pushToggling.set(false);
    }
  }

  // ── Breadcrumb builder ────────────────────────────────────────────────────────

  private _buildBreadcrumbs(): void {
    const url = this.router.url.split('?')[0]; // strip query params
    const segments = url.split('/').filter(Boolean);

    const crumbs: BreadcrumbItem[] = [];
    let cumulativePath = '';

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      cumulativePath += `/${segment}`;

      // Skip UUIDs — they'll be replaced by a resolved title in a real app
      const isUuid = /^[0-9a-f-]{36}$/i.test(segment);
      if (isUuid) {
        crumbs.push({ label: 'Detail', url: null });
        continue;
      }

      const normalized = segment.replace(/-/g, '_');
      const labelKey = ROUTE_LABELS[normalized] ?? ROUTE_LABELS[segment];
      const isKey = !!labelKey && labelKey.includes('.');
      const label = labelKey ?? this._capitalize(segment);
      const isLast = i === segments.length - 1;

      crumbs.push({
        label,
        isKey,
        url: isLast ? null : cumulativePath,
      });
    }

    this.breadcrumbs.set(crumbs);
  }

  private _capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
  }
}
