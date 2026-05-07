import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, MatButtonModule, MatIconModule],
  templateUrl: './coming-soon.component.html',
  styleUrl: './coming-soon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComingSoonComponent {
  private readonly route = inject(ActivatedRoute);

  readonly featureLabelKey = computed(() => (this.route.snapshot.data?.['featureLabelKey'] as string) ?? '');
  readonly icon = computed(() => (this.route.snapshot.data?.['icon'] as string) ?? 'auto_awesome');
}

