import { Routes } from '@angular/router';
import { noAuthGuard } from '../../core/guards';

export const AUTH_ROUTES: Routes = [
  // Callback — no guard, handles email confirmation redirect
  {
    path: 'callback',
    loadComponent: () =>
      import('./pages/auth-callback/auth-callback.component').then(
        (m) => m.AuthCallbackComponent,
      ),
  },

  // Email sent confirmation page — no guard
  {
    path: 'email-sent',
    loadComponent: () =>
      import('./pages/email-sent/email-sent.component').then(
        (m) => m.EmailSentComponent,
      ),
  },

  // Auth pages — redirect to dashboard if already logged in
  {
    path: '',
    canActivate: [noAuthGuard],
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./pages/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'signup',
        loadComponent: () =>
          import('./pages/signup/signup.component').then((m) => m.SignupComponent),
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./pages/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full',
      },
    ],
  },
];
