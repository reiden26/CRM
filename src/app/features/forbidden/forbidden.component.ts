import {
  Component,
  inject,
  OnInit,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';
import { PermissionService } from '../../core/services/permission.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './forbidden.component.html',
  styleUrl: './forbidden.component.scss',
})
export class ForbiddenComponent implements OnInit {

  private readonly route       = inject(ActivatedRoute);
  private readonly router      = inject(Router);
  readonly auth                = inject(AuthService);
  readonly permissions         = inject(PermissionService);

  readonly detail = signal<{
    required: string;
    current:  string;
    from:     string;
  } | null>(null);

  readonly userRole = computed(() => this.permissions.currentRole());

  ngOnInit(): void {
    const p = this.route.snapshot.queryParams;

    // Build a human-readable requirement string
    let required = 'specific permission';
    if (p['requiredRoles']) {
      required = `Role: ${p['requiredRoles']}`;
    } else if (p['resource'] && p['action']) {
      required = `Permission: ${p['resource']}:${p['action']}`;
    }

    this.detail.set({
      required,
      current: p['currentRole'] ?? this.userRole() ?? 'unknown',
      from:    p['from'] ?? '',
    });
  }

  goBack(): void      { window.history.back(); }
  goDashboard(): void { this.router.navigate(['/dashboard']); }
}
