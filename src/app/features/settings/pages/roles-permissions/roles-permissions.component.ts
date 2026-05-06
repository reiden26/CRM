import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PERMISSIONS_MAP, UserRole, ALL_ACTIONS, Action } from '../../../../core/models/permission.model';
import { TranslateModule } from '@ngx-translate/core';

interface RoleRow {
  role:    UserRole;
  label:   string;
  color:   string;
  perms:   Record<string, Action[]>;
}

const ROLE_META: { role: UserRole; label: string; color: string; desc: string }[] = [
  { role: UserRole.SUPER_ADMIN, label: 'Super Admin', color: '#6366f1', desc: 'Full access across all tenants.' },
  { role: UserRole.ADMIN,       label: 'Admin',       color: '#1a237e', desc: 'Full access within the workspace.' },
  { role: UserRole.MANAGER,     label: 'Manager',     color: '#0288d1', desc: 'Team-scoped access, no user management.' },
  { role: UserRole.AGENT,       label: 'Agent',       color: '#22c55e', desc: 'Own records only.' },
  { role: UserRole.VIEWER,      label: 'Viewer',      color: '#9ca3af', desc: 'Read-only access.' },
];

const RESOURCES = ['contacts','companies','deals','activities','reports','settings','users','audit_logs'];

@Component({
  selector: 'app-roles-permissions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatCardModule, MatTableModule, MatIconModule, MatChipsModule, MatTooltipModule, TranslateModule],
  templateUrl: './roles-permissions.component.html',
  styleUrl: './roles-permissions.component.scss',
})
export class RolesPermissionsComponent {

  readonly roleMeta  = ROLE_META;
  readonly resources = RESOURCES;
  readonly actions: Action[] = ['create','read','update','delete','export'];

  hasPermission(role: UserRole, resource: string, action: Action): boolean {
    if (role === UserRole.SUPER_ADMIN) return true;
    const perms = PERMISSIONS_MAP[role] ?? [];
    return perms.find(p => p.resource === resource as any)?.actions.includes(action) ?? false;
  }
}
