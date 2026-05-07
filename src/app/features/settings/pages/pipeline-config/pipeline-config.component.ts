import {
  Component, OnInit, inject, signal, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CdkDragDrop, CdkDrag, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

interface Stage {
  id:            string;
  name:          string;
  color:         string;
  orderPosition: number;
  isDefault:     boolean;
  isWon:         boolean;
  isLost:        boolean;
  isNew?:        boolean;
}

const PRESET_COLORS = [
  '#6366f1','#0288d1','#22c55e','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b',
];

@Component({
  selector: 'app-pipeline-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule,
    CdkDrag, CdkDropList,
    MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatCheckboxModule,
    MatTooltipModule, MatProgressSpinnerModule, SkeletonComponent,
    TranslateModule,
  ],
  templateUrl: './pipeline-config.component.html',
  styleUrl: './pipeline-config.component.scss',
})
export class PipelineConfigComponent implements OnInit {

  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly notify   = inject(NotificationService);
  private readonly fb       = inject(FormBuilder);
  private readonly translate = inject(TranslateService);

  readonly stages   = signal<Stage[]>([]);
  readonly loading  = signal(true);
  readonly saving   = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly PRESET_COLORS = PRESET_COLORS;

  readonly addForm = this.fb.group({
    name:  ['', [Validators.required, Validators.maxLength(50)]],
    color: ['#6366f1'],
    isWon: [false],
    isLost:[false],
  });

  ngOnInit(): void { this._loadStages(); }

  private async _loadStages(): Promise<void> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;
    this.loading.set(true);
    const { data } = await this.supabase.client
      .from('deal_stages')
      .select('id, tenant_id, name, color, order_position, is_default')
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order('order_position');

    const byKey = new Map<string, any>();
    for (const row of data ?? []) {
      const key = this._normalizeStageName(row.name);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, row);
        continue;
      }
      const currentIsTenant = Boolean(row.tenant_id);
      const existingIsTenant = Boolean(existing.tenant_id);
      if (currentIsTenant && !existingIsTenant) {
        byKey.set(key, row);
      }
    }

    this.stages.set(
      Array.from(byKey.values())
        .sort((a, b) => a.order_position - b.order_position)
        .map((s: any) => ({
          id:            s.id,
          name:          s.name,
          color:         s.color,
          orderPosition: s.order_position,
          isDefault:     s.is_default,
          isWon:         this._normalizeStageName(s.name) === 'closed_won',
          isLost:        this._normalizeStageName(s.name) === 'closed_lost',
        })),
    );
    this.loading.set(false);
  }

  async onDrop(event: CdkDragDrop<Stage[]>): Promise<void> {
    const list = [...this.stages()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    const reordered = list.map((s, i) => ({ ...s, orderPosition: i + 1 }));
    this.stages.set(reordered);
    await this._persistOrder(reordered);
  }

  private async _persistOrder(stages: Stage[]): Promise<void> {
    const updates = stages.map(s =>
      this.supabase.client
        .from('deal_stages')
        .update({ order_position: s.orderPosition })
        .eq('id', s.id),
    );
    await Promise.all(updates);
  }

  async addStage(): Promise<void> {
    if (this.addForm.invalid) return;
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;
    const { name, color, isWon, isLost } = this.addForm.getRawValue();
    const nextOrder = this.stages().length + 1;
    this.saving.set(true);
    const { data, error } = await this.supabase.client
      .from('deal_stages')
      .insert({ tenant_id: tenantId, name: name!.trim(), color: color!, order_position: nextOrder, is_default: false })
      .select('id, name, color, order_position, is_default')
      .single();
    this.saving.set(false);
    if (error) { this.notify.error('Failed to add stage.'); return; }
    this.stages.update(list => [...list, {
      id: (data as any).id, name: name!.trim(), color: color!,
      orderPosition: nextOrder, isDefault: false, isWon: !!isWon, isLost: !!isLost,
    }]);
    this.addForm.reset({ color: '#6366f1', isWon: false, isLost: false });
    this.notify.success('Stage added.');
  }

  async updateStage(stage: Stage, field: Partial<Stage>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (field.name  !== undefined) patch['name']  = field.name;
    if (field.color !== undefined) patch['color'] = field.color;
    const { error } = await this.supabase.client
      .from('deal_stages').update(patch).eq('id', stage.id);
    if (error) { this.notify.error('Failed to update stage.'); return; }
    this.stages.update(list => list.map(s => s.id === stage.id ? { ...s, ...field } : s));
  }

  async deleteStage(id: string): Promise<void> {
    if (!confirm('Delete this stage? Deals in this stage will not be deleted.')) return;
    const { error } = await this.supabase.client.from('deal_stages').delete().eq('id', id);
    if (error) { this.notify.error('Failed to delete stage.'); return; }
    this.stages.update(list => list.filter(s => s.id !== id));
    this.notify.success('Stage deleted.');
  }

  setEditColor(stageId: string, color: string): void {
    this.updateStage(this.stages().find(s => s.id === stageId)!, { color });
  }

  getStageLabel(name: string): string {
    const stageType = this._normalizeStageName(name);
    const key = `PIPELINE.STAGES.${stageType.toUpperCase()}`;
    const translated = this.translate.instant(key);
    return translated === key ? name : translated;
  }

  onStageNameBlur(stage: Stage, value: string): void {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed === this.getStageLabel(stage.name) || trimmed === stage.name) return;
    this.updateStage(stage, { name: trimmed });
  }

  private _normalizeStageName(name: string): string {
    const normalized = name.toLowerCase().trim().replace(/[\s-]+/g, '_');
    const map: Record<string, string> = {
      new: 'new',
      nuevo: 'new',
      qualified: 'qualified',
      calificado: 'qualified',
      proposal: 'proposal',
      propuesta: 'proposal',
      negotiation: 'negotiation',
      negociacion: 'negotiation',
      'negociación': 'negotiation',
      closed_won: 'closed_won',
      ganado: 'closed_won',
      cerrada_ganada: 'closed_won',
      closed_lost: 'closed_lost',
      perdido: 'closed_lost',
      cerrada_perdida: 'closed_lost',
    };
    return map[normalized] ?? normalized;
  }

  trackById(_: number, s: Stage): string { return s.id; }
}
