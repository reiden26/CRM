import { Pipe, PipeTransform, NgZone, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { inject } from '@angular/core';

/**
 * TimeAgoPipe
 *
 * Converts an ISO date string to a human-readable relative time string.
 * Auto-refreshes every 60 seconds so displayed times stay current.
 *
 * Usage:
 *   {{ notification.createdAt | timeAgo }}
 *   → "just now", "5 min ago", "2 hours ago", "yesterday", "3 days ago"
 */
@Pipe({
  name: 'timeAgo',
  standalone: true,
  pure: false, // impure so it can auto-update
})
export class TimeAgoPipe implements PipeTransform, OnDestroy {

  private readonly zone = inject(NgZone);
  private readonly cdr  = inject(ChangeDetectorRef);

  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _lastValue = '';
  private _lastInput = '';

  transform(value: string | null | undefined): string {
    if (!value) return '';

    // Cache: only recompute when input changes or timer fires
    if (value === this._lastInput && this._lastValue) {
      return this._lastValue;
    }

    this._lastInput = value;
    this._lastValue = this._format(value);
    this._scheduleRefresh(value);
    return this._lastValue;
  }

  ngOnDestroy(): void {
    this._clearTimer();
  }

  private _format(isoString: string): string {
    const date  = new Date(isoString);
    const now   = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr  = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr  / 24);

    if (diffSec < 30)  return 'just now';
    if (diffSec < 90)  return '1 min ago';
    if (diffMin < 60)  return `${diffMin} min ago`;
    if (diffHr  === 1) return '1 hour ago';
    if (diffHr  < 24)  return `${diffHr} hours ago`;
    if (diffDay === 1) return 'yesterday';
    if (diffDay < 7)   return `${diffDay} days ago`;
    if (diffDay < 30)  return `${Math.floor(diffDay / 7)} weeks ago`;
    if (diffDay < 365) return `${Math.floor(diffDay / 30)} months ago`;
    return `${Math.floor(diffDay / 365)} years ago`;
  }

  private _scheduleRefresh(isoString: string): void {
    this._clearTimer();

    const date   = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffMin = diffMs / 60_000;

    // Refresh interval: more frequent for recent items
    let intervalMs: number;
    if (diffMin < 1)   intervalMs = 10_000;   // every 10s for < 1 min
    else if (diffMin < 60) intervalMs = 60_000; // every 1 min for < 1 hr
    else               intervalMs = 300_000;  // every 5 min otherwise

    this.zone.runOutsideAngular(() => {
      this._timer = setTimeout(() => {
        this._lastValue = '';  // force recompute
        this.zone.run(() => this.cdr.markForCheck());
      }, intervalMs);
    });
  }

  private _clearTimer(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}
