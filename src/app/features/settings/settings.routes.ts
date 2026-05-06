import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { UserRole } from '../../core/models/permission.model';

const ADMIN_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/settings-shell/settings-shell.component').then(
        (m) => m.SettingsShellComponent,
      ),
    canActivate: [roleGuard],
    data: { roles: ADMIN_ROLES },
    children: [
      { path: '', redirectTo: 'company', pathMatch: 'full' },
      {
        path: 'company',
        loadComponent: () =>
          import('./pages/company-profile/company-profile.component').then(
            (m) => m.CompanyProfileComponent,
          ),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./pages/user-management/user-management.component').then(
            (m) => m.UserManagementComponent,
          ),
      },
      {
        path: 'pipeline',
        loadComponent: () =>
          import('./pages/pipeline-config/pipeline-config.component').then(
            (m) => m.PipelineConfigComponent,
          ),
      },
      {
        path: 'roles',
        loadComponent: () =>
          import('./pages/roles-permissions/roles-permissions.component').then(
            (m) => m.RolesPermissionsComponent,
          ),
      },
      {
        path: 'audit-log',
        loadComponent: () =>
          import('./pages/audit-log/audit-log.component').then(
            (m) => m.AuditLogComponent,
          ),
      },
      {
        path: 'email-templates',
        loadComponent: () =>
          import('./pages/email-templates/email-templates.component').then(
            (m) => m.EmailTemplatesComponent,
          ),
      },
      {
        path: 'email-logs',
        loadComponent: () =>
          import('./pages/email-logs/email-logs.component').then(
            (m) => m.EmailLogsComponent,
          ),
      },
      {
        path: 'notification-preferences',
        loadComponent: () =>
          import('./pages/notification-preferences/notification-preferences.component').then(
            (m) => m.NotificationPreferencesComponent,
          ),
      },
    ],
  },
];
