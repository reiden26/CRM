import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  CdkDropListGroup,
  CdkDragPlaceholder,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { PipelineService } from '../../services/pipeline.service';
import { DealCardComponent } from '../../components/deal-card/deal-card.component';
import { DealFormComponent, DealFormDialogData } from '../../components/deal-form/deal-form.component';
import { HasPermissionPipe } from '../../../../shared/pipes/has-permission.pipe';
import { StageColorPipe } from '../../pipes/stage-color.pipe';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  Deal,
  DealStage,
  DealFilters,
  DealFormValue,
  DealStageType,
  DEFAULT_DEAL_FILTERS,
  getProbabilityColor,
  getProbabilityLabel,
} from '../../models/deal.model';

type ViewMode = 'kanban' | 'list';

@Component({
  selector: 'app-pipeline-board',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    CdkDragPlaceholder,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTableModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    MatChipsModule,
    DealCardComponent,
    HasPermissionPipe,
    StageColorPipe,
    TranslateModule,
  ],
  templateUrl: './pipeline-board.component.html',
  styleUrl: './pipeline-board.component.scss',
})
export class PipelineBoardComponent implements OnInit, OnDestroy {

  // ── Dependencies ────────────────────────────────────────────────────────────
  readonly pipelineService = inject(PipelineService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog   = inject(MatDialog);
  private readonly fb       = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly destroy$ = new Subject<void>();

  // ── State from service ────────────────────────────────────────────────────────
  readonly deals$   = this.pipelineService.deals$;
  readonly stages$  = this.pipelineService.stages$;
  readonly loading$ = this.pipelineService.loading$;
  readonly saving$  = this.pipelineService.saving$;

  // ── Local UI state ────────────────────────────────────────────────────────────
  readonly viewMode   = signal<ViewMode>('kanban');
  readonly filters    = signal<DealFilters>({ ...DEFAULT_DEAL_FILTERS });
  readonly teamMembers = signal<{ id: string; fullName: string }[]>([]);

  // ── Filter form ───────────────────────────────────────────────────────────────
  readonly filterForm = this.fb.group({
    search:     [''],
    assignedTo: [null as string | null],
    minValue:   [null as number | null],
    maxValue:   [null as number | null],
    dateFrom:   [null as string | null],
    dateTo:     [null as string | null],
  });

  // ── Computed ──────────────────────────────────────────────────────────────────

  /** Deals per stage for the Kanban columns */
  readonly dealsByStage = this.pipelineService.dealsByStage;

  /** Stage stats for column headers */
  readonly stageStats = this.pipelineService.stageStats;

  /** IDs of all drop lists — needed for CDK cross-list drag */
  readonly dropListIds = computed(() =>
    this.stages$().map(s => `stage-${s.id}`),
  );

  /** Total pipeline value */
  readonly totalValue = computed(() =>
    this.deals$().reduce((sum, d) => sum + d.value, 0),
  );

  readonly totalDeals = computed(() => this.deals$().length);

  // ── List view columns ─────────────────────────────────────────────────────────
  readonly listColumns = [
    'title', 'company', 'stage', 'value', 'probability',
    'closeDate', 'assignedTo', 'actions',
  ];

  // ── Helpers ───────────────────────────────────────────────────────────────────
  readonly getProbabilityColor = getProbabilityColor;
  readonly getProbabilityLabel = getProbabilityLabel;

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this._loadData();
    this._loadTeamMembers();
    this.pipelineService.subscribeToDeals();

    // Filter form changes
    this.filterForm.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => this._applyFilters());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.pipelineService.unsubscribeFromDeals();
  }

  // ── Data loading ──────────────────────────────────────────────────────────────

  private async _loadData(): Promise<void> {
    await this.pipelineService.getStages();
    await this.pipelineService.getDeals(this.filters());
  }

  private async _loadTeamMembers(): Promise<void> {
    const tenantId = this.auth.profile()?.tenantId;
    if (!tenantId) return;
    const { data } = await this.supabase.client
      .from('profiles')
      .select('id, full_name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('full_name');
    if (data) {
      this.teamMembers.set(
        (data as { id: string; full_name: string }[])
          .map(m => ({ id: m.id, fullName: m.full_name })),
      );
    }
  }

  private _applyFilters(): void {
    const v = this.filterForm.getRawValue();
    this.filters.set({
      search:     v.search ?? '',
      assignedTo: v.assignedTo,
      minValue:   v.minValue ? Number(v.minValue) : null,
      maxValue:   v.maxValue ? Number(v.maxValue) : null,
      dateFrom:   v.dateFrom ? new Date(v.dateFrom as string).toISOString().slice(0, 10) : null,
      dateTo:     v.dateTo   ? new Date(v.dateTo   as string).toISOString().slice(0, 10) : null,
      stage:      null,
    });
    this.pipelineService.getDeals(this.filters());
  }

  resetFilters(): void {
    this.filterForm.reset({ search: '', assignedTo: null, minValue: null, maxValue: null, dateFrom: null, dateTo: null });
  }

  // ── View toggle ───────────────────────────────────────────────────────────────

  toggleView(): void {
    this.viewMode.update(v => v === 'kanban' ? 'list' : 'kanban');
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────────

  async onDrop(event: CdkDragDrop<Deal[]>, targetStage: DealStage): Promise<void> {
    if (event.previousContainer === event.container) {
      // Reorder within same column — local only
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }

    const deal = event.previousContainer.data[event.previousIndex];
    const newStageType = this._stageNameToType(targetStage.name);

    // Move the item in the UI immediately
    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );

    // Persist and show undo snackbar
    const { previousStage, success } = await this.pipelineService.moveDeal(deal.id, newStageType);

    if (success) {
      const snack = this.snackBar.open(
        `Moved to "${targetStage.name}"`,
        'Undo',
        { duration: 5000, panelClass: ['snack-info'] },
      );
      snack.onAction().subscribe(async () => {
        await this.pipelineService.undoMoveDeal(deal.id, previousStage);
        await this.pipelineService.getDeals(this.filters());
      });
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  openCreateDialog(defaultStage?: DealStage): void {
    const dialogData: DealFormDialogData = {
      stages:       this.stages$(),
      defaultStage: defaultStage
        ? this._stageNameToType(defaultStage.name)
        : 'new',
    };

    const ref = this.dialog.open(DealFormComponent, {
      data:       dialogData,
      width:      '640px',
      maxWidth:   '95vw',
      maxHeight:  '90vh',
      panelClass: 'deal-dialog',
    });

    ref.afterClosed().subscribe(async (result: DealFormValue | null) => {
      if (result) {
        await this.pipelineService.createDeal(result);
      }
    });
  }

  openEditDialog(deal: Deal): void {
    const ref = this.dialog.open(DealFormComponent, {
      data: { deal, stages: this.stages$() } as DealFormDialogData,
      width:      '640px',
      maxWidth:   '95vw',
      maxHeight:  '90vh',
      panelClass: 'deal-dialog',
    });

    ref.afterClosed().subscribe(async (result: DealFormValue | null) => {
      if (result) {
        await this.pipelineService.updateDeal(deal.id, result);
      }
    });
  }

  async deleteDeal(id: string): Promise<void> {
    if (!confirm('Mark this deal as lost?')) return;
    await this.pipelineService.deleteDeal(id);
  }

  // ── Template helpers ──────────────────────────────────────────────────────────

  getDealsForStage(stageId: string): Deal[] {
    return this.dealsByStage().get(stageId) ?? [];
  }

  getStatsForStage(stageId: string) {
    return this.stageStats().get(stageId);
  }

  formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency,
      maximumFractionDigits: 0,
    }).format(value);
  }

  trackByStageId(_: number, s: DealStage): string { return s.id; }
  trackByDealId(_: number, d: Deal): string { return d.id; }

  private _stageNameToType(name: string): DealStageType {
    const map: Record<string, DealStageType> = {
      'New':         'new',
      'Qualified':   'qualified',
      'Proposal':    'proposal',
      'Negotiation': 'negotiation',
      'Closed Won':  'closed_won',
      'Closed Lost': 'closed_lost',
    };
    return map[name] ?? (name.toLowerCase().replace(/\s+/g, '_') as DealStageType);
  }
}
