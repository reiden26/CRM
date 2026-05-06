import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

interface SettingsNav { labelKey: string; icon: string; route: string; }

const NAV: SettingsNav[] = [
  { labelKey: 'SETTINGS.NAV.COMPANY',    icon: 'business',             route: 'company'                 },
  { labelKey: 'SETTINGS.NAV.USERS',      icon: 'people',               route: 'users'                   },
  { labelKey: 'SETTINGS.NAV.PIPELINE',   icon: 'view_kanban',          route: 'pipeline'                },
  { labelKey: 'SETTINGS.NAV.ROLES',      icon: 'admin_panel_settings', route: 'roles'                   },
  { labelKey: 'SETTINGS.NAV.EMAIL_TPL',  icon: 'email',                route: 'email-templates'         },
  { labelKey: 'SETTINGS.NAV.EMAIL_LOGS', icon: 'mark_email_read',      route: 'email-logs'              },
  { labelKey: 'SETTINGS.NAV.NOTIF_PREFS',icon: 'notifications',        route: 'notification-preferences'},
  { labelKey: 'SETTINGS.NAV.AUDIT',      icon: 'history',              route: 'audit-log'               },
];

@Component({
  selector: 'app-settings-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, MatListModule, MatIconModule, TranslateModule],
  template: `
    <div class="settings-layout">
      <aside class="settings-sidebar">
        <h2 class="settings-heading">{{ 'SETTINGS.TITLE' | translate }}</h2>
        <mat-nav-list>
          @for (item of nav; track item.route) {
            <a mat-list-item [routerLink]="item.route" routerLinkActive="active-nav">
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.labelKey | translate }}</span>
            </a>
          }
        </mat-nav-list>
      </aside>
      <main class="settings-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .settings-layout { display: flex; gap: 24px; align-items: flex-start; }
    .settings-sidebar {
      width: 220px; flex-shrink: 0;
      background: var(--crm-bg-card); border-radius: 12px;
      box-shadow: var(--crm-shadow); padding: 8px 0 16px;
      position: sticky; top: 80px;
    }
    .settings-heading {
      font-size: 0.78rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.8px; color: var(--crm-text-secondary);
      padding: 8px 16px 4px; margin: 0;
    }
    .active-nav {
      background: rgba(26,35,126,0.08) !important;
      color: var(--crm-primary) !important;
      mat-icon { color: var(--crm-primary); }
    }
    .settings-content { flex: 1; min-width: 0; }
    @media (max-width: 767px) {
      .settings-layout { flex-direction: column; }
      .settings-sidebar { width: 100%; position: static; }
    }
  `],
})
export class SettingsShellComponent {
  readonly nav = NAV;
}
