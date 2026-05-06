import {
  Component, OnInit, inject, signal, computed, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { UserRole } from '../../../../core/models/permission.model';
import { TranslateModule } from '@ngx-translate/core';

interface TeamUser {
  id:         string;
  fullName:   string;
  email:      string;
  role:       UserRole;
  isActive:   boolean;
  avatarUrl:  string | null;
  createdAt:  string;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: UserRole.ADMIN,   label: 'Admin' },
  { value: UserRole.MANAGER, label: 'Manager' },
  { value: UserRole.AGENT,   label: 'Agent' },
  { value: UserRole.VIEWER,  label: 'Viewer' },
];

const ROLE_COLORS: Record<string, string> = {
  super_admin: '#6366f1', admin: '#1a237e',
  manager: '#0288d1', agent: '#22c55e', viewer: '#9ca3af',
};

@Component({
  selector: 'app-user-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule,
    MatMenuModule, MatChipsModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatDialogModule, MatTooltipModule,
    MatProgressSpinnerModule, MatSlideToggleModule, MatDividerModule,
    SkeletonComponent, TimeAgoPipe,
    TranslateModule,
  ],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss',
})
export class UserManagementComponent implements OnInit {

  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly notify   = inject(NotificationService);
  private readonly fb       = inject(FormBuilder);

  readonly users    = signal<TeamUser[]>([]);
  readonly loading  = signal(true);
  readonly saving   = signal(false);
  readonly showInvite = signal(false);

  readonly currentUserId = computed(() => this.auth.session()?.user.id ?? '');

  readonly columns = ['avatar', 'name', 'email', 'role', 'status', 'joined', 'actions'];
  readonly roleOptions = ROLE_OPTIONS;
  readonly ROLE_COLORS = ROLE_COLORS;

  readonly inviteForm = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    fullName: ['', Validators.required],
    role:     [UserRole.AGENT, Validators.required],
  });

  ngOnInit(): void { this._loadUsers(); }

  private async _loadUsers(): Promise<void> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;
    this.loading.set(true);
    const { data } = await this.supabase.client
      .from('profiles')
      .select('id, full_name, role, is_active, avatar_url, created_at')
      .eq('tenant_id', tenantId)
      .order('full_name');

    // Get emails from auth admin (not available client-side — use profile data only)
    this.users.set(
      (data ?? []).map((u: any) => ({
        id:        u.id,
        fullName:  u.full_name ?? 'Unknown',
        email:     '—',   // email not in profiles table; shown as placeholder
        role:      u.role,
        isActive:  u.is_active,
        avatarUrl: u.avatar_url,
        createdAt: u.created_at,
      })),
    );
    this.loading.set(false);
  }

  async inviteUser(): Promise<void> {
    if (this.inviteForm.invalid) return;
    const { email, fullName, role } = this.inviteForm.getRawValue();
    this.saving.set(true);
    try {
      // Supabase inviteUserByEmail — requires service role in production
      // Here we use signUp with a magic link approach
      const { error } = await this.supabase.client.auth.signInWithOtp({
        email: email!,
        options: {
          data: { full_name: fullName, role },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) { this.notify.error(error.message); return; }
      this.notify.success(`Invitation sent to ${email}`);
      this.inviteForm.reset({ role: UserRole.AGENT });
      this.showInvite.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  async changeRole(userId: string, role: UserRole): Promise<void> {
    if (userId === this.currentUserId()) {
      this.notify.warning('You cannot change your own role.');
      return;
    }
    const { error } = await this.supabase.client
      .from('profiles').update({ role }).eq('id', userId);
    if (error) { this.notify.error('Failed to update role.'); return; }
    this.users.update(list => list.map(u => u.id === userId ? { ...u, role } : u));
    this.notify.success('Role updated.');
  }

  async toggleActive(user: TeamUser): Promise<void> {
    if (user.id === this.currentUserId()) {
      this.notify.warning('You cannot deactivate yourself.');
      return;
    }
    const isActive = !user.isActive;
    const { error } = await this.supabase.client
      .from('profiles').update({ is_active: isActive }).eq('id', user.id);
    if (error) { this.notify.error('Failed to update user status.'); return; }
    this.users.update(list => list.map(u => u.id === user.id ? { ...u, isActive } : u));
    this.notify.success(isActive ? 'User activated.' : 'User deactivated.');
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.supabase.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) { this.notify.error('Failed to send reset email.'); return; }
    this.notify.success('Password reset email sent.');
  }

  getInitials(name: string): string {
    return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('');
  }

  getAvatarColor(name: string): string {
    const colors = ['#6366f1','#0288d1','#22c55e','#f59e0b','#ef4444','#8b5cf6'];
    return colors[(name.charCodeAt(0) ?? 0) % colors.length];
  }

  trackById(_: number, u: TeamUser): string { return u.id; }
}
