import { Pipe, PipeTransform, inject } from '@angular/core';
import { PermissionService } from '../../core/services/permission.service';
import { Resource, Action } from '../../core/models/permission.model';

/**
 * HasPermissionPipe
 *
 * Checks whether the current user has a specific permission.
 * Designed for use in structural directives and @if blocks.
 *
 * Usage:
 *   @if ('contacts' | hasPermission:'create') { <button>Add Contact</button> }
 *   @if ('deals' | hasPermission:'delete') { <button>Delete</button> }
 *
 * The pipe is pure — it re-evaluates only when its inputs change.
 * Because PermissionService reads from a Signal, role changes will
 * trigger change detection automatically in OnPush components when
 * the signal is read inside the template.
 *
 * For reactive updates in OnPush components, prefer using
 * PermissionService.permissionSignal() directly in the component class.
 */
@Pipe({
  name: 'hasPermission',
  standalone: true,
  pure: true,
})
export class HasPermissionPipe implements PipeTransform {

  private readonly permissions = inject(PermissionService);

  /**
   * @param resource  The resource to check (e.g. 'contacts', 'deals')
   * @param action    The action to check (e.g. 'create', 'delete')
   * @returns         true if the current user has the permission
   */
  transform(resource: Resource | string, action: Action | string): boolean {
    return this.permissions.hasPermission(
      resource as Resource,
      action as Action,
    );
  }
}
