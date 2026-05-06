import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';

export const CONTACTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/contacts-list/contacts-list.component').then(
        (m) => m.ContactsListComponent,
      ),
    canActivate: [permissionGuard],
    data: { permission: 'contacts:read' },
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/contact-detail/contact-detail.component').then(
        (m) => m.ContactDetailComponent,
      ),
    canActivate: [permissionGuard],
    data: { permission: 'contacts:read' },
  },
];
