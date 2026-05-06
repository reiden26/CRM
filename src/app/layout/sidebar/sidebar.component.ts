import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { PermissionService } from '../../core/services/permission.service';
import { AuthService } from '../../core/services/auth.service';
import { TenantService } from '../../core/services/tenant.service';
import { Resource } from '../../core/models/permission.model';
import { TranslateModule } from '@ngx-translate/core';

// ─────────────────────────────────────────────────────────────────────────────
// Nav item definition
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  label:    string;
  icon:     string;
  route:    string;
  resource: Resource;       // permission check: must have 'read' on this resource
  exact?:   boolean;        // use exact route matching for routerLinkActive
  dividerBefore?: boolean;  // render a divider above this item
}

const NAV_ITEMS: NavItem[] = [
  { label: 'NAV.DASHBOARD',  icon: 'dashboard',    route: '/dashboard', resource: 'contacts', exact: true },
  { label: 'NAV.CONTACTS',   icon: 'people',       route: '/contacts',  resource: 'contacts' },
  { label: 'NAV.COMPANIES',  icon: 'business',     route: '/companies', resource: 'companies' },
  { label: 'NAV.PIPELINE',   icon: 'trending_up',  route: '/pipeline',  resource: 'deals' },
  { label: 'NAV.TASKS',      icon: 'task_alt',     route: '/tasks',     resource: 'activities' },
  { label: 'NAV.REPORTS',    icon: 'bar_chart',    route: '/reports',   resource: 'reports',   dividerBefore: true },
  { label: 'NAV.SETTINGS',   icon: 'settings',     route: '/settings',  resource: 'settings',  dividerBefore: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// SidebarComponent
// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    MatListModule,
    MatIconModule,
    MatTooltipModule,
    MatDividerModule,
    TranslateModule,
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {

  // ── Inputs / Outputs ─────────────────────────────────────────────────────────
  @Input() collapsed = false;
  @Output() navItemClicked = new EventEmitter<void>();

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly permissions = inject(PermissionService);
  private readonly auth        = inject(AuthService);
  readonly tenantService       = inject(TenantService);

  // ── Visible nav items (filtered by permissions) ───────────────────────────────
  readonly visibleItems = computed<NavItem[]>(() =>
    NAV_ITEMS.filter(item =>
      this.permissions.hasPermission(item.resource, 'read'),
    ),
  );

  // ── User info for sidebar footer ──────────────────────────────────────────────
  readonly profile     = this.auth.profile;
  readonly tenantName  = computed(() => this.tenantService.currentTenant()?.name ?? '');
  readonly userInitials = computed(() => {
    const name = this.auth.profile()?.fullName ?? '';
    return name
      .split(' ')
      .slice(0, 2)
      .map(n => n[0]?.toUpperCase() ?? '')
      .join('');
  });

  // ── Template helpers ──────────────────────────────────────────────────────────

  onNavClick(): void {
    this.navItemClicked.emit();
  }

  trackByRoute(_: number, item: NavItem): string {
    return item.route;
  }
}
