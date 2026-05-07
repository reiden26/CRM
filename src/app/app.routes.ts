import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { tenantGuard } from './core/guards/tenant.guard';
import { planLimitGuard } from './core/guards/plan-limit.guard';

export const routes: Routes = [

  // ── Public auth routes (no shell, no tenant required) ──────────────────────
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // ── Onboarding (auth required, but no tenant yet) ──────────────────────────
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/onboarding/onboarding.routes').then(
        (m) => m.ONBOARDING_ROUTES,
      ),
  },

  // ── Subscription expired (auth required, tenant inactive) ─────────────────
  {
    path: 'subscription-expired',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/subscription-expired/subscription-expired.component').then(
        (m) => m.SubscriptionExpiredComponent,
      ),
  },

  // ── Forbidden (auth required, insufficient role/permission) ───────────────
  {
    path: 'forbidden',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/forbidden/forbidden.component').then(
        (m) => m.ForbiddenComponent,
      ),
  },

  // ── Upgrade page (auth + tenant required, no plan-limit check here) ────────
  {
    path: 'upgrade',
    canActivate: [authGuard, tenantGuard],
    loadComponent: () =>
      import('./features/upgrade/upgrade.component').then(
        (m) => m.UpgradeComponent,
      ),
  },

  // ── Protected app routes (auth + tenant required) ──────────────────────────
  {
    path: '',
    canActivate: [authGuard, tenantGuard],
    loadComponent: () =>
      import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then(
            (m) => m.DASHBOARD_ROUTES,
          ),
      },
      {
        path: 'contacts',
        children: [
          {
            path: '',
            loadChildren: () =>
              import('./features/contacts/contacts.routes').then(
                (m) => m.CONTACTS_ROUTES,
              ),
          },
          // Plan-limit guard on the creation route
          {
            path: 'new',
            canActivate: [planLimitGuard],
            data: { planResource: 'contacts' },
            loadComponent: () =>
              import('./features/contacts/pages/contacts-list/contacts-list.component').then(
                (m) => m.ContactsListComponent,
              ),
          },
        ],
      },
      {
        path: 'pipeline',
        children: [
          {
            path: '',
            loadChildren: () =>
              import('./features/pipeline/pipeline.routes').then(
                (m) => m.PIPELINE_ROUTES,
              ),
          },
          {
            path: 'new',
            canActivate: [planLimitGuard],
            data: { planResource: 'deals' },
            loadComponent: () =>
              import('./features/pipeline/pages/pipeline-board/pipeline-board.component').then(
                (m) => m.PipelineBoardComponent,
              ),
          },
        ],
      },
      {
        path: 'tasks',
        loadComponent: () =>
          import('./shared/pages/coming-soon/coming-soon.component').then(
            (m) => m.ComingSoonComponent,
          ),
        data: { featureLabelKey: 'NAV.TASKS', icon: 'task_alt' },
      },
      {
        path: 'notifications',
        loadChildren: () =>
          import('./features/notifications/notifications.routes').then(
            (m) => m.NOTIFICATIONS_ROUTES,
          ),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./shared/pages/coming-soon/coming-soon.component').then(
            (m) => m.ComingSoonComponent,
          ),
        data: { featureLabelKey: 'NAV.REPORTS', icon: 'bar_chart' },
      },
      {
        path: 'companies',
        loadComponent: () =>
          import('./shared/pages/coming-soon/coming-soon.component').then(
            (m) => m.ComingSoonComponent,
          ),
        data: { featureLabelKey: 'NAV.COMPANIES', icon: 'business' },
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('./features/settings/settings.routes').then(
            (m) => m.SETTINGS_ROUTES,
          ),
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },

  // ── 404 Not Found ──────────────────────────────────────────────────────────
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then(
        (m) => m.NotFoundComponent,
      ),
  },
];
