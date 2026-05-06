import {
  Component,
  Input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatCardModule, SkeletonComponent],
  templateUrl: './kpi-card.component.html',
  styleUrl: './kpi-card.component.scss',
})
export class KpiCardComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string | number;
  @Input({ required: true }) icon!: string;
  @Input() iconColor  = 'var(--crm-primary)';
  @Input() change: number | null = null;   // % change vs previous period
  @Input() loading    = false;
  @Input() subtitle   = '';

  get changePositive(): boolean { return (this.change ?? 0) >= 0; }
  get changeIcon(): string      { return this.changePositive ? 'trending_up' : 'trending_down'; }
  get changeColor(): string     { return this.changePositive ? '#22c55e' : '#ef4444'; }
  get changeLabel(): string {
    if (this.change === null) return '';
    const sign = this.change >= 0 ? '+' : '';
    return `${sign}${this.change}% vs last period`;
  }
}
