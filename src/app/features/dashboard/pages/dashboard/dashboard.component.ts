import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  AfterViewInit,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import {
  Chart,
  ChartConfiguration,
  ChartData,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
  DoughnutController,
  ArcElement,
} from 'chart.js';
import { DashboardService, KPIData, ActivityFeedItem, MyTask, DealsByStage, RevenueByMonth } from '../../services/dashboard.service';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { AuthService } from '../../../../core/services/auth.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

// Register Chart.js components (tree-shakeable)
Chart.register(
  BarController, BarElement,
  LineController, LineElement, PointElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale,
  Tooltip, Legend, Filler,
);

type DateRange = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'custom';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCheckboxModule,
    MatDividerModule,
    MatTooltipModule,
    MatChipsModule,
    KpiCardComponent,
    SkeletonComponent,
    TimeAgoPipe,
    TranslateModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly dashboardService = inject(DashboardService);
  readonly auth                     = inject(AuthService);
  private readonly translate        = inject(TranslateService);
  private readonly fb               = inject(FormBuilder);
  private readonly platformId       = inject(PLATFORM_ID);
  private readonly destroy$         = new Subject<void>();

  // ── Chart canvas refs ─────────────────────────────────────────────────────────
  @ViewChild('dealsChart')   dealsChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('revenueChart') revenueChartRef!: ElementRef<HTMLCanvasElement>;

  private _dealsChart:   Chart | null = null;
  private _revenueChart: Chart | null = null;

  // ── State ────────────────────────────────────────────────────────────────────
  readonly kpis           = signal<KPIData | null>(null);
  readonly activities     = signal<ActivityFeedItem[]>([]);
  readonly tasks          = signal<MyTask[]>([]);
  readonly dealsByStage   = signal<DealsByStage[]>([]);
  readonly revenueData    = signal<RevenueByMonth[]>([]);
  readonly completingTask = signal<Set<string>>(new Set());

  readonly loadingKPIs       = signal(true);
  readonly loadingCharts     = signal(true);
  readonly loadingActivities = signal(true);
  readonly loadingTasks      = signal(true);

  // ── Date range filter ─────────────────────────────────────────────────────────
  readonly dateRangeForm = this.fb.group({
    preset:   ['this_month' as DateRange],
    dateFrom: [null as string | null],
    dateTo:   [null as string | null],
  });

  readonly dateRangeOptions: { value: DateRange; label: string }[] = [
    { value: 'this_month',    label: 'DASHBOARD.PERIOD.THIS_MONTH'   },
    { value: 'last_month',    label: 'DASHBOARD.PERIOD.LAST_MONTH'   },
    { value: 'this_quarter',  label: 'DASHBOARD.PERIOD.THIS_QUARTER' },
    { value: 'this_year',     label: 'DASHBOARD.PERIOD.THIS_YEAR'    },
    { value: 'custom',        label: 'DASHBOARD.PERIOD.CUSTOM'       },
  ];

  readonly showCustomRange = computed(
    () => this.dateRangeForm.get('preset')?.value === 'custom',
  );

  // ── Computed KPI display values ───────────────────────────────────────────────

  readonly currentYear = new Date().getFullYear();

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return this.translate.instant('DASHBOARD.GREETING_MORNING');
    if (h < 18) return this.translate.instant('DASHBOARD.GREETING_AFTERNOON');
    return this.translate.instant('DASHBOARD.GREETING_EVENING');
  }

  get firstName(): string {
    return this.auth.profile()?.fullName?.split(' ')[0] ?? 'there';
  }

  readonly kpiCards = computed(() => {
    const k = this.kpis();
    return [
      { label: this.translate.instant('DASHBOARD.KPI.CONTACTS'), value: k?.totalContacts.toLocaleString() ?? '—', icon: 'people',       iconColor: 'var(--crm-primary)', change: k?.contactsChange ?? null },
      { label: this.translate.instant('DASHBOARD.KPI.DEALS'),    value: k?.activeDeals.toLocaleString()   ?? '—', icon: 'handshake',    iconColor: '#0288d1',            change: k?.dealsChange    ?? null },
      { label: this.translate.instant('DASHBOARD.KPI.PIPELINE'), value: k ? this._formatCurrency(k.pipelineValue, k.currency) : '—',    icon: 'attach_money', iconColor: '#22c55e', change: k?.pipelineChange ?? null },
      { label: this.translate.instant('DASHBOARD.KPI.CONVERSION'), value: k ? `${k.conversionRate}%` : '—', icon: 'trending_up', iconColor: '#f59e0b', change: k?.conversionChange ?? null, subtitle: this.translate.instant('DASHBOARD.KPI.VS_PERIOD') },
    ];
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this._loadAll();

    // Reload when date range changes
    this.dateRangeForm.valueChanges.pipe(
      debounceTime(400),
      takeUntil(this.destroy$),
    ).subscribe(() => this._loadAll());
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Charts are rendered after data loads — see _renderCharts()
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this._dealsChart?.destroy();
    this._revenueChart?.destroy();
  }

  // ── Data loading ──────────────────────────────────────────────────────────────

  private _loadAll(): void {
    const { from, to } = this._getDateRange();
    this._loadKPIs(from, to);
    this._loadCharts(from, to);
    this._loadActivities();
    this._loadTasks();
  }

  private async _loadKPIs(from?: string, to?: string): Promise<void> {
    this.loadingKPIs.set(true);
    const data = await this.dashboardService.getKPIs(from, to);
    this.kpis.set(data);
    this.loadingKPIs.set(false);
  }

  private async _loadCharts(from?: string, to?: string): Promise<void> {
    this.loadingCharts.set(true);
    const year = new Date().getFullYear();
    const [deals, revenue] = await Promise.all([
      this.dashboardService.getDealsByStage(from, to),
      this.dashboardService.getRevenueByMonth(year),
    ]);
    this.dealsByStage.set(deals);
    this.revenueData.set(revenue);
    this.loadingCharts.set(false);

    // Render charts after data + DOM are ready
    setTimeout(() => this._renderCharts(), 50);
  }

  private async _loadActivities(): Promise<void> {
    this.loadingActivities.set(true);
    const data = await this.dashboardService.getActivityFeed();
    this.activities.set(data);
    this.loadingActivities.set(false);
  }

  private async _loadTasks(): Promise<void> {
    this.loadingTasks.set(true);
    const data = await this.dashboardService.getMyTasks();
    this.tasks.set(data);
    this.loadingTasks.set(false);
  }

  // ── Task completion ───────────────────────────────────────────────────────────

  async completeTask(taskId: string): Promise<void> {
    this.completingTask.update(s => new Set([...s, taskId]));
    const ok = await this.dashboardService.completeTask(taskId);
    if (ok) {
      this.tasks.update(list => list.filter(t => t.id !== taskId));
    }
    this.completingTask.update(s => { const n = new Set(s); n.delete(taskId); return n; });
  }

  isCompletingTask(id: string): boolean {
    return this.completingTask().has(id);
  }

  // ── Charts ────────────────────────────────────────────────────────────────────

  private _renderCharts(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this._renderDealsChart();
    this._renderRevenueChart();
  }

  private _renderDealsChart(): void {
    const canvas = this.dealsChartRef?.nativeElement;
    if (!canvas) return;

    this._dealsChart?.destroy();

    const data = this.dealsByStage();
    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels:   data.map(d => this._translateStage(d.stage)),
        datasets: [{
          label:           'Deals',
          data:            data.map(d => d.count),
          backgroundColor: data.map(d => d.color + 'cc'),
          borderColor:     data.map(d => d.color),
          borderWidth:     1,
          borderRadius:    6,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: (ctx) => {
                const value = data[ctx.dataIndex]?.value ?? 0;
                return `Value: ${this._formatCurrency(value, 'USD')}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { stepSize: 1, font: { size: 11 } },
          },
        },
      },
    };

    this._dealsChart = new Chart(canvas, config);
  }

  private _renderRevenueChart(): void {
    const canvas = this.revenueChartRef?.nativeElement;
    if (!canvas) return;

    this._revenueChart?.destroy();

    const data = this.revenueData();
    const primary = getComputedStyle(document.documentElement)
      .getPropertyValue('--crm-primary').trim() || '#1a237e';
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--crm-accent').trim() || '#0288d1';

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels:   data.map(d => d.month),
        datasets: [{
          label:           'Revenue',
          data:            data.map(d => d.revenue),
          borderColor:     accent,
          backgroundColor: accent + '22',
          borderWidth:     2,
          pointBackgroundColor: accent,
          pointRadius:     4,
          pointHoverRadius: 6,
          fill:            true,
          tension:         0.4,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${this._formatCurrency(ctx.parsed.y, 'USD')}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: {
              font: { size: 11 },
              callback: (v) => this._formatCurrencyShort(Number(v)),
            },
          },
        },
      },
    };

    this._revenueChart = new Chart(canvas, config);
  }

  // ── Date range helpers ────────────────────────────────────────────────────────

  private _getDateRange(): { from?: string; to?: string } {
    const preset = this.dateRangeForm.get('preset')?.value as DateRange;
    const now    = new Date();

    switch (preset) {
      case 'this_month': {
        const from = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: from.toISOString(), to: now.toISOString() };
      }
      case 'last_month': {
        const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const to   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        return { from: from.toISOString(), to: to.toISOString() };
      }
      case 'this_quarter': {
        const q    = Math.floor(now.getMonth() / 3);
        const from = new Date(now.getFullYear(), q * 3, 1);
        return { from: from.toISOString(), to: now.toISOString() };
      }
      case 'this_year': {
        const from = new Date(now.getFullYear(), 0, 1);
        return { from: from.toISOString(), to: now.toISOString() };
      }
      case 'custom': {
        const f = this.dateRangeForm.get('dateFrom')?.value;
        const t = this.dateRangeForm.get('dateTo')?.value;
        return {
          from: f ? new Date(f).toISOString() : undefined,
          to:   t ? new Date(t).toISOString() : undefined,
        };
      }
      default:
        return {};
    }
  }

  // ── Template helpers ──────────────────────────────────────────────────────────

  getActivityIcon(type: string): string {
    const map: Record<string, string> = {
      call: 'phone', email: 'email', meeting: 'groups',
      task: 'task_alt', note: 'sticky_note_2',
    };
    return map[type] ?? 'event_note';
  }

  getActivityIconColor(type: string): string {
    const map: Record<string, string> = {
      call: '#22c55e', email: '#0288d1', meeting: '#6366f1',
      task: '#f59e0b', note: '#9ca3af',
    };
    return map[type] ?? '#9ca3af';
  }

  getTaskIcon(type: string): string {
    return this.getActivityIcon(type);
  }

  getUserInitials(name: string): string {
    return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('');
  }

  getUserAvatarColor(name: string): string {
    const colors = ['#6366f1','#0288d1','#22c55e','#f59e0b','#ef4444','#8b5cf6'];
    return colors[(name.charCodeAt(0) ?? 0) % colors.length];
  }

  trackById(_: number, item: { id: string }): string { return item.id; }

  private _formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency,
      maximumFractionDigits: 0,
    }).format(value);
  }

  private _formatCurrencyShort(value: number): string {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value}`;
  }

  private _translateStage(stage: string): string {
    const key = `PIPELINE.STAGES.${stage.toUpperCase()}`;
    const translated = this.translate.instant(key);
    return translated === key ? stage : translated;
  }
}
