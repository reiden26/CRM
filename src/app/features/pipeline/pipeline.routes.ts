import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';

export const PIPELINE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/pipeline-board/pipeline-board.component').then(
        (m) => m.PipelineBoardComponent,
      ),
    canActivate: [permissionGuard],
    data: { permission: 'deals:read' },
  },
];
