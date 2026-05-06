import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { TenantService } from '../services/tenant.service';
import { PlanResource } from '../models/tenant.model';

/**
 * plan-limit.guard
 *
 * Blocks navigation to resource-creation routes when the tenant has
 * reached the plan limit for that resource.
 *
 * Usage in route definition:
 *
 *   {
 *     path: 'new',
 *     component: ContactFormComponent,
 *     canActivate: [authGuard, tenantGuard, planLimitGuard],
 *     data: { planResource: 'contacts' }
 *   }
 *
 * On limit reached → redirects to /upgrade?resource=contacts&limit=100
 */
export const planLimitGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
) => {
  const tenantService = inject(TenantService);
  const router        = inject(Router);

  // ── Read the resource key from route data ─────────────────────────────────
  const resource = route.data?.['planResource'] as PlanResource | undefined;

  if (!resource) {
    console.warn('[planLimitGuard] No planResource defined in route data. Allowing navigation.');
    return true;
  }

  // ── Check the limit ───────────────────────────────────────────────────────
  const result = await tenantService.checkPlanLimit(resource);

  if (!result.reached) return true;

  // ── Build a descriptive redirect ──────────────────────────────────────────
  const limitLabel = result.limit === -1 ? 'unlimited' : result.limit.toString();
  const messages: Record<PlanResource, string> = {
    contacts: `You've reached the ${limitLabel}-contact limit on your current plan.`,
    deals:    `You've reached the ${limitLabel}-deal limit on your current plan.`,
    users:    `You've reached the ${limitLabel}-user limit on your current plan.`,
    storage:  `You've reached the ${limitLabel} MB storage limit on your current plan.`,
  };

  return router.createUrlTree(['/upgrade'], {
    queryParams: {
      resource,
      current: result.current,
      limit:   result.limit,
      message: messages[resource],
    },
  });
};
