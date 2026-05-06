import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  HostListener,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AnimationPlayer, AnimationBuilder, AnimationFactory, animate, style } from '@angular/animations';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRippleModule } from '@angular/material/core';
import { NotificationService } from '../../../core/services/notification.service';
import { InAppNotification, InAppNotificationType } from '../../../core/models/notification.model';
import { TimeAgoPipe } from '../../pipes/time-ago.pipe';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatBadgeModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatRippleModule,
    TimeAgoPipe,
    TranslateModule,
  ],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly notifService    = inject(NotificationService);
  readonly router                  = inject(Router);
  private readonly animBuilder     = inject(AnimationBuilder);
  private readonly hostEl          = inject(ElementRef);

  // ── Panel ref ────────────────────────────────────────────────────────────────
  @ViewChild('panel') panelRef!: ElementRef<HTMLElement>;

  // ── Signals from service ──────────────────────────────────────────────────
  readonly notifications = this.notifService.notifications$;
  readonly unreadCount   = this.notifService.unreadCount$;
  readonly loading       = this.notifService.loading$;

  // ── Local UI state ────────────────────────────────────────────────────────
  readonly panelOpen = signal<boolean>(false);

  /** Latest 20 notifications shown in the dropdown. */
  readonly visibleNotifications = computed(() =>
    this.notifications().slice(0, 20),
  );

  readonly hasUnread  = computed(() => this.unreadCount() > 0);
  readonly hasItems   = computed(() => this.visibleNotifications().length > 0);
  readonly totalCount = computed(() => this.notifications().length);

  /** Badge label — capped at 99+, hidden when zero. */
  readonly badgeLabel = computed(() => {
    const c = this.unreadCount();
    if (c === 0) return null;
    return c > 99 ? '99+' : String(c);
  });

  // ── Animation factories ───────────────────────────────────────────────────
  private readonly _openAnim: AnimationFactory = this.animBuilder.build([
    style({ opacity: 0, transform: 'translateY(-8px) scale(0.97)' }),
    animate('180ms cubic-bezier(0.4,0,0.2,1)',
      style({ opacity: 1, transform: 'translateY(0) scale(1)' })),
  ]);

  private readonly _closeAnim: AnimationFactory = this.animBuilder.build([
    style({ opacity: 1, transform: 'translateY(0) scale(1)' }),
    animate('140ms cubic-bezier(0.4,0,0.2,1)',
      style({ opacity: 0, transform: 'translateY(-6px) scale(0.97)' })),
  ]);

  private _animPlayer: AnimationPlayer | null = null;

  // ── Close on outside click ────────────────────────────────────────────────
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.panelOpen() && !this.hostEl.nativeElement.contains(event.target)) {
      this.closePanel();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.panelOpen()) this.closePanel();
  }

  // ── Panel toggle ──────────────────────────────────────────────────────────

  togglePanel(): void {
    this.panelOpen() ? this.closePanel() : this.openPanel();
  }

  openPanel(): void {
    this.panelOpen.set(true);
    // Run open animation after the panel is rendered
    requestAnimationFrame(() => {
      if (this.panelRef?.nativeElement) {
        this._animPlayer?.destroy();
        this._animPlayer = this._openAnim.create(this.panelRef.nativeElement);
        this._animPlayer.play();
      }
    });
  }

  closePanel(): void {
    if (!this.panelRef?.nativeElement) {
      this.panelOpen.set(false);
      return;
    }
    this._animPlayer?.destroy();
    this._animPlayer = this._closeAnim.create(this.panelRef.nativeElement);
    this._animPlayer.onDone(() => this.panelOpen.set(false));
    this._animPlayer.play();
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async markAsRead(notification: InAppNotification, event: Event): Promise<void> {
    event.stopPropagation();
    if (!notification.isRead) {
      await this.notifService.markAsRead(notification.id);
    }
  }

  async markAllAsRead(event: Event): Promise<void> {
    event.stopPropagation();
    await this.notifService.markAllAsRead();
  }

  async deleteNotification(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.notifService.deleteNotification(id);
  }

  navigateToResource(notification: InAppNotification): void {
    if (!notification.isRead) {
      this.notifService.markAsRead(notification.id);
    }
    const url = this._buildUrl(notification);
    if (url) {
      this.closePanel();
      this.router.navigateByUrl(url);
    }
  }

  viewAll(): void {
    this.closePanel();
    this.router.navigate(['/notifications']);
  }

  // ── Template helpers ──────────────────────────────────────────────────────

  getTypeIcon(type: InAppNotificationType): string {
    const map: Record<InAppNotificationType, string> = {
      info:    'info_outline',
      success: 'check_circle_outline',
      warning: 'warning_amber',
      danger:  'error_outline',
    };
    return map[type] ?? 'notifications_none';
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
