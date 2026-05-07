import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatRippleModule } from '@angular/material/core';
import { NotificationService } from '../../../../core/services/notification.service';
import { InAppNotification, InAppNotificationType } from '../../../../core/models/notification.model';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { TranslateModule } from '@ngx-translate/core';

// ── Filter types ──────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'unread' | InAppNotificationType;

interface FilterOption {
  value: FilterTab;
  labelKey: string;
  icon:  string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { value: 'all',     labelKey: 'NOTIFICATIONS.FILTERS.ALL',     icon: 'inbox' },
  { value: 'unread',  labelKey: 'NOTIFICATIONS.FILTERS.UNREAD',  icon: 'mark_email_unread' },
  { value: 'info',    labelKey: 'NOTIFICATIONS.FILTERS.INFO',    icon: 'info_outline' },
  { value: 'success', labelKey: 'NOTIFICATIONS.FILTERS.SUCCESS', icon: 'check_circle_outline' },
  { value: 'warning', labelKey: 'NOTIFICATIONS.FILTERS.WARNING', icon: 'warning_amber' },
  { value: 'danger',  labelKey: 'NOTIFICATIONS.FILTERS.ALERTS',  icon: 'error_outline' },
];

const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatChipsModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDividerModule,
    MatPaginatorModule,
    MatRippleModule,
    TimeAgoPipe,
    TranslateModule,
  ],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.scss',
})
export class NotificationsPageComponent implements OnInit {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly notifService = inject(NotificationService);
  private readonly router       = inject(Router);

  // ── Source data ───────────────────────────────────────────────────────────────
  readonly allNotifications = this.notifService.notifications$;
  readonly loading          = this.notifService.loading$;
  readonly unreadCount      = this.notifService.unreadCount$;

  // ── Filter state ──────────────────────────────────────────────────────────────
  readonly activeFilter = signal<FilterTab>('all');
  readonly filterOptions = FILTER_OPTIONS;

  // ── Pagination state ──────────────────────────────────────────────────────────
  readonly pageIndex = signal<number>(0);
  readonly pageSize  = signal<number>(PAGE_SIZE);

  // ── Selection state ───────────────────────────────────────────────────────────
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly bulkLoading = signal<boolean>(false);

  // ── Filtered + paginated data ─────────────────────────────────────────────────

  readonly filteredNotifications = computed<InAppNotification[]>(() => {
    const filter = this.activeFilter();
    const all    = this.allNotifications();

    switch (filter) {
      case 'all':    return all;
      case 'unread': return all.filter(n => !n.isRead);
      default:       return all.filter(n => n.type === filter);
    }
  });

  readonly totalFiltered = computed(() => this.filteredNotifications().length);

  readonly pagedNotifications = computed<InAppNotification[]>(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.filteredNotifications().slice(start, start + this.pageSize());
  });

  // ── Selection computed ────────────────────────────────────────────────────────

  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly allPageSelected = computed(() => {
    const paged = this.pagedNotifications();
    if (paged.length === 0) return false;
    return paged.every(n => this.selectedIds().has(n.id));
  });

  readonly somePageSelected = computed(() => {
    const paged = this.pagedNotifications();
    return paged.some(n => this.selectedIds().has(n.id)) && !this.allPageSelected();
  });

  readonly hasSelectedUnread = computed(() => {
    const ids = this.selectedIds();
    return this.allNotifications().some(n => ids.has(n.id) && !n.isRead);
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Reload to ensure we have the latest data
    this.notifService.loadNotifications();
  }

  // ── Filter actions ────────────────────────────────────────────────────────────

  setFilter(filter: FilterTab): void {
    this.activeFilter.set(filter);
    this.pageIndex.set(0);
    this.selectedIds.set(new Set());
  }

  getFilterCount(filter: FilterTab): number {
    const all = this.allNotifications();
    switch (filter) {
      case 'all':    return all.length;
      case 'unread': return all.filter(n => !n.isRead).length;
      default:       return all.filter(n => n.type === filter).length;
    }
  }

  // ── Pagination ────────────────────────────────────────────────────────────────

  onPageChange(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.selectedIds.set(new Set());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Selection ─────────────────────────────────────────────────────────────────

  toggleSelectAll(): void {
    const paged = this.pagedNotifications();
    if (this.allPageSelected()) {
      // Deselect all on current page
      this.selectedIds.update(ids => {
        const next = new Set(ids);
        paged.forEach(n => next.delete(n.id));
        return next;
      });
    } else {
      // Select all on current page
      this.selectedIds.update(ids => {
        const next = new Set(ids);
        paged.forEach(n => next.add(n.id));
        return next;
      });
    }
  }

  toggleSelect(id: string): void {
    this.selectedIds.update(ids => {
      const next = new Set(ids);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────────

  async bulkMarkAsRead(): Promise<void> {
    const ids = [...this.selectedIds()].filter(id => {
      const n = this.allNotifications().find(x => x.id === id);
      return n && !n.isRead;
    });
    if (ids.length === 0) return;

    this.bulkLoading.set(true);
    try {
      await Promise.all(ids.map(id => this.notifService.markAsRead(id)));
      this.clearSelection();
    } finally {
      this.bulkLoading.set(false);
    }
  }

  async bulkDelete(): Promise<void> {
    const ids = [...this.selectedIds()];
    if (ids.length === 0) return;

    this.bulkLoading.set(true);
    try {
      await Promise.all(ids.map(id => this.notifService.deleteNotification(id)));
      this.clearSelection();
    } finally {
      this.bulkLoading.set(false);
    }
  }

  async markAllAsRead(): Promise<void> {
    await this.notifService.markAllAsRead();
  }

  // ── Single item actions ───────────────────────────────────────────────────────

  async markAsRead(n: InAppNotification, event: Event): Promise<void> {
    event.stopPropagation();
    if (!n.isRead) await this.notifService.markAsRead(n.id);
  }

  async deleteOne(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.notifService.deleteNotification(id);
  }

  navigateToResource(n: InAppNotification): void {
    if (!n.isRead) this.notifService.markAsRead(n.id);
    const url = this._buildUrl(n);
    if (url) this.router.navigateByUrl(url);
  }

  // ── Template helpers ──────────────────────────────────────────────────────────

  getTypeIcon(type: InAppNotificationType): string {
    const map: Record<InAppNotificationType, string> = {
      info:    'info_outline',
      success: 'check_circle_outline',
      warning: 'warning_amber',
      danger:  'error_outline',
    };
    return map[type];
  }

  trackById(_: number, n: InAppNotification): string { return n.id; }

  private _buildUrl(n: InAppNotification): string | null {
    if (!n.resourceType || !n.resourceId) return null;
    const map: Record<string, string> = {
      deal:    '/pipeline',
      contact: `/contacts/${n.resourceId}`,
      task:    '/tasks',
    };
    return map[n.resourceType] ?? null;
  }
}
