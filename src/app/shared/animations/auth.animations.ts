import {
  trigger,
  state,
  style,
  animate,
  transition,
  query,
  stagger,
  group,
  AnimationTriggerMetadata,
} from '@angular/animations';

// ─────────────────────────────────────────────────────────────────────────────
// Auth page animations
// ─────────────────────────────────────────────────────────────────────────────

/** Left panel slides in from the left */
export const slideInLeft: AnimationTriggerMetadata = trigger('slideInLeft', [
  transition(':enter', [
    style({ transform: 'translateX(-60px)', opacity: 0 }),
    animate('600ms ease-out', style({ transform: 'translateX(0)', opacity: 1 })),
  ]),
]);

/** Right panel slides in from the right with a 150ms delay */
export const slideInRight: AnimationTriggerMetadata = trigger('slideInRight', [
  transition(':enter', [
    style({ transform: 'translateX(60px)', opacity: 0 }),
    animate('600ms 150ms ease-out', style({ transform: 'translateX(0)', opacity: 1 })),
  ]),
]);

/** Form fields stagger in from below */
export const fadeInUp: AnimationTriggerMetadata = trigger('fadeInUp', [
  transition(':enter', [
    query('.form-field, .form-header, .form-footer, .form-divider, .submit-btn', [
      style({ transform: 'translateY(20px)', opacity: 0 }),
      stagger(80, [
        animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 })),
      ]),
    ], { optional: true }),
  ]),
]);

/** Fade in for error messages */
export const fadeIn: AnimationTriggerMetadata = trigger('fadeIn', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('250ms ease-in', style({ opacity: 1 })),
  ]),
  transition(':leave', [
    animate('200ms ease-out', style({ opacity: 0 })),
  ]),
]);

/** Cross-fade for route transitions between login and register */
export const routeFade: AnimationTriggerMetadata = trigger('routeFade', [
  transition('* <=> *', [
    group([
      query(':leave', [
        animate('200ms ease-out', style({ opacity: 0 })),
      ], { optional: true }),
      query(':enter', [
        style({ opacity: 0 }),
        animate('300ms 100ms ease-in', style({ opacity: 1 })),
      ], { optional: true }),
    ]),
  ]),
]);
