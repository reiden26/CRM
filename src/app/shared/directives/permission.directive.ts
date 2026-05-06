import {
  Directive,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges,
  inject,
  ElementRef,
  Renderer2,
  effect,
} from '@angular/core';
import { PermissionService } from '../../core/services/permission.service';
import { Resource, Action } from '../../core/models/permission.model';

export type PermissionMode = 'hide' | 'disable';

/**
 * PermissionDirective  [appPermission]
 *
 * Hides or disables a DOM element based on the current user's permissions.
 * Reacts automatically to role changes via Angular Signals.
 *
 * ── Inputs ────────────────────────────────────────────────────────────────────
 *
 * [appPermission]          — "resource:action" shorthand  OR  resource string
 * [appPermissionAction]    — action string (when resource is passed separately)
 * [appPermissionMode]      — 'hide' (default) | 'disable'
 *
 * ── Usage examples ────────────────────────────────────────────────────────────
 *
 * Shorthand (most common):
 *   <button appPermission="contacts:delete">Delete</button>
 *   <button appPermission="deals:create">New Deal</button>
 *
 * Separate inputs:
 *   <button [appPermission]="'contacts'" [appPermissionAction]="'delete'">Delete</button>
 *
 * Disable instead of hide:
 *   <button appPermission="reports:export" appPermissionMode="disable">Export</button>
 *
 * ── Behavior ──────────────────────────────────────────────────────────────────
 *
 * mode='hide'    → sets display:none when permission is denied
 * mode='disable' → sets disabled attribute + aria-disabled + reduced opacity
 */
@Directive({
  selector: '[appPermission]',
  standalone: true,
})
export class PermissionDirective implements OnInit, OnChanges {

  // ── Inputs ──────────────────────────────────────────────────────────────────
  @Input('appPermission')       permissionInput: string = '';
  @Input('appPermissionAction') actionInput: string = '';
  @Input('appPermissionMode')   mode: PermissionMode = 'hide';

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly permissions = inject(PermissionService);
  private readonly el          = inject(ElementRef);
  private readonly renderer    = inject(Renderer2);

  // ── Reactive update via effect ───────────────────────────────────────────────
  // The effect re-runs whenever the user's role Signal changes,
  // keeping the element state in sync without manual subscriptions.
  constructor() {
    effect(() => {
      // Reading currentRole() inside the effect registers it as a dependency
      void this.permissions.currentRole();
      this._applyPermission();
    });
  }

  ngOnInit(): void {
    this._applyPermission();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['permissionInput'] || changes['actionInput'] || changes['mode']) {
      this._applyPermission();
    }
  }

  // ── Core logic ───────────────────────────────────────────────────────────────

  private _applyPermission(): void {
    const allowed = this._checkPermission();

    if (this.mode === 'disable') {
      this._applyDisabled(!allowed);
    } else {
      this._applyVisibility(allowed);
    }
  }

  private _checkPermission(): boolean {
    if (!this.permissionInput) return true;

    // Shorthand: "resource:action"
    if (this.permissionInput.includes(':')) {
      return this.permissions.checkShorthand(this.permissionInput);
    }

    // Separate inputs: resource + action
    if (this.actionInput) {
      return this.permissions.hasPermission(
        this.permissionInput as Resource,
        this.actionInput as Action,
      );
    }

    // Only resource provided — check if user has ANY action on it
    return this.permissions.hasAnyPermission(
      this.permissionInput as Resource,
      ['create', 'read', 'update', 'delete'],
    );
  }

  private _applyVisibility(visible: boolean): void {
    const nativeEl = this.el.nativeElement as HTMLElement;
    if (visible) {
      this.renderer.removeStyle(nativeEl, 'display');
    } else {
      this.renderer.setStyle(nativeEl, 'display', 'none');
    }
  }

  private _applyDisabled(disabled: boolean): void {
    const nativeEl = this.el.nativeElement as HTMLElement;
    if (disabled) {
      this.renderer.setAttribute(nativeEl, 'disabled', 'true');
      this.renderer.setAttribute(nativeEl, 'aria-disabled', 'true');
      this.renderer.setStyle(nativeEl, 'opacity', '0.4');
      this.renderer.setStyle(nativeEl, 'pointer-events', 'none');
      this.renderer.setStyle(nativeEl, 'cursor', 'not-allowed');
    } else {
      this.renderer.removeAttribute(nativeEl, 'disabled');
      this.renderer.removeAttribute(nativeEl, 'aria-disabled');
      this.renderer.removeStyle(nativeEl, 'opacity');
      this.renderer.removeStyle(nativeEl, 'pointer-events');
      this.renderer.removeStyle(nativeEl, 'cursor');
    }
  }
}
