import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * SkeletonComponent
 * Renders a pulsing placeholder block for loading states.
 *
 * Usage:
 *   <app-skeleton width="100%" height="20px" />
 *   <app-skeleton variant="circle" width="40px" height="40px" />
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `<div class="skeleton" [ngStyle]="styles"></div>`,
  styles: [`
    .skeleton {
      background: linear-gradient(90deg,
        var(--crm-border) 25%,
        rgba(0,0,0,0.06) 50%,
        var(--crm-border) 75%
      );
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
      border-radius: var(--radius, 6px);
    }
    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `],
})
export class SkeletonComponent {
  @Input() width   = '100%';
  @Input() height  = '16px';
  @Input() variant: 'rect' | 'circle' = 'rect';

  get styles(): Record<string, string> {
    return {
      width:         this.width,
      height:        this.height,
      borderRadius:  this.variant === 'circle' ? '50%' : '6px',
    };
  }
}
