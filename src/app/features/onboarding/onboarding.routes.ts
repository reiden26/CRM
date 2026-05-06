import { Routes } from '@angular/router';
import { noAuthGuard } from '../../core/guards/no-auth.guard';

export const ONBOARDING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/onboarding/onboarding.component').then(
        (m) => m.OnboardingComponent,
      ),
  },
];
