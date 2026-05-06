import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { Deal, getProbabilityColor, getProbabilityLabel } from '../../models/deal.model';

@Component({
  selector: 'app-deal-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatMenuModule,
  ],
  templateUrl: './deal-card.component.html',
  styleUrl: './deal-card.component.scss',
})
export class DealCardComponent {

  @Input({ required: true }) deal!: Deal;
  @Input() isDragging = false;

  @Output() edit   = new EventEmitter<Deal>();
  @Output() delete = new EventEmitter<string>();
  @Output() view   = new EventEmitter<string>();

  get probabilityColor(): string {
    return getProbabilityColor(this.deal.probability);
  }

  get probabilityLabel(): string {
    return getProbabilityLabel(this.deal.probability);
  }

  get formattedValue(): string {
    return new Intl.NumberFormat('en-US', {
      style:    'currency',
      currency: this.deal.currency,
      maximumFractionDigits: 0,
    }).format(this.deal.value);
  }

  get closeDateLabel(): string {
    if (!this.deal.expectedCloseDate) return '';
    const d = this.deal.daysUntilClose;
    if (d === null) return '';
    if (d < 0)  return `${Math.abs(d)}d overdue`;
    if (d === 0) return 'Due today';
    if (d === 1) return 'Due tomorrow';
    return `${d}d left`;
  }

  get avatarInitials(): string {
    const name = this.deal.assignedToName ?? '';
    return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('');
  }

  get avatarColor(): string {
    const colors = ['#6366f1','#0288d1','#22c55e','#f59e0b','#ef4444','#8b5cf6'];
    const name = this.deal.assignedToName ?? '';
    return colors[(name.charCodeAt(0) ?? 0) % colors.length];
  }
}
