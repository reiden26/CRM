import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { TenantService } from '../../core/services/tenant.service';
import { TenantPlan, PLAN_LIMITS } from '../../core/models/tenant.model';

@Component({
  selector: 'app-upgrade',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatCardModule],
  templateUrl: './upgrade.component.html',
  styleUrl: './upgrade.component.scss',
})
export class UpgradeComponent implements OnInit {

  private readonly route         = inject(ActivatedRoute);
  private readonly router        = inject(Router);
  readonly tenantService         = inject(TenantService);

  readonly message  = signal<string>('');
  readonly resource = signal<string>('');
  readonly current  = signal<number>(0);
  readonly limit    = signal<number>(0);

  readonly plans = [
    {
      plan: TenantPlan.PRO,
      label: 'Pro',
      price: '$29/mo',
      limits: PLAN_LIMITS[TenantPlan.PRO],
      highlight: true,
    },
    {
      plan: TenantPlan.ENTERPRISE,
      label: 'Enterprise',
      price: 'Custom',
      limits: PLAN_LIMITS[TenantPlan.ENTERPRISE],
      highlight: false,
    },
  ];

  ngOnInit(): void {
    const params = this.route.snapshot.queryParams;
    this.message.set(params['message'] ?? 'You have reached your plan limit.');
    this.resource.set(params['resource'] ?? '');
    this.current.set(Number(params['current'] ?? 0));
    this.limit.set(Number(params['limit'] ?? 0));
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}
