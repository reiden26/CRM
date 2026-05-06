import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.component';

// ─────────────────────────────────────────────────────────────────────────────
// UnsavedChanges interface
//
// Components that want unsaved-changes protection must implement this interface.
// ─────────────────────────────────────────────────────────────────────────────

export interface HasUnsavedChanges {
  /**
   * Return true if the component has unsaved changes that should
   * trigger a confirmation dialog before navigation.
   */
  hasUnsavedChanges(): boolean;
}

/**
 * unsavedChangesGuard
 *
 * CanDeactivate guard that checks if a component has unsaved changes.
 * If it does, shows a confirmation dialog before allowing navigation.
 *
 * Usage in route definition:
 *
 *   {
 *     path: 'edit',
 *     component: ContactFormComponent,
 *     canDeactivate: [unsavedChangesGuard]
 *   }
 *
 * The component must implement HasUnsavedChanges:
 *
 *   export class ContactFormComponent implements HasUnsavedChanges {
 *     hasUnsavedChanges(): boolean {
 *       return this.form.dirty;
 *     }
 *   }
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (
  component: HasUnsavedChanges,
): boolean | Observable<boolean> => {
  // If the component doesn't have unsaved changes, allow navigation immediately
  if (!component.hasUnsavedChanges()) return true;

  const confirmService = inject(ConfirmDialogService);

  return confirmService.confirm({
    title:       'Unsaved changes',
    message:     'You have unsaved changes. If you leave this page, your changes will be lost.',
    confirmText: 'Leave page',
    cancelText:  'Stay',
    type:        'warning',
  });
};
