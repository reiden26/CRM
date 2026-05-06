import {
  Component,
  inject,
  signal,
  computed,
  effect,
  ViewChild,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { Subscription } from 'rxjs';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { NavbarComponent } from '../navbar/navbar.component';

// ─────────────────────────────────────────────────────────────────────────────
// ShellComponent
//
// Root layout container. Manages:
//   - Responsive sidenav (side on desktop, over on mobile)
//   - Collapsed/expanded sidebar state
//   - Smooth open/close animations via CSS transitions
// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    MatSidenavModule,
    SidebarComponent,
    NavbarComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit, OnDestroy {

  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly platformId  = inject(PLATFORM_ID);

  // ── Sidenav ref ──────────────────────────────────────────────────────────────
  @ViewChild('sidenav') sidenav!: MatSidenav;

  // ── Responsive state ─────────────────────────────────────────────────────────
  /** True when viewport is mobile (< 960px). */
  readonly isMobile = signal<boolean>(false);

  /** True when sidenav is open. */
  readonly sidenavOpen = signal<boolean>(true);

  /** True when sidebar is in collapsed (icon-only) mode. */
  readonly sidebarCollapsed = signal<boolean>(false);

  /** Sidenav mode: 'side' on desktop, 'over' on mobile. */
  readonly sidenavMode = computed(() => this.isMobile() ? 'over' : 'side');

  /** Effective sidenav open state. */
  readonly sidenavOpened = computed(() =>
    this.isMobile() ? false : this.sidenavOpen(),
  );

  private _bpSub: Subscription | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this._bpSub = this.breakpoints
      .observe([Breakpoints.XSmall, Breakpoints.Small])
      .subscribe(result => {
        const mobile = result.matches;
        this.isMobile.set(mobile);
        // Auto-close on mobile, auto-open on desktop
        if (mobile) {
          this.sidenavOpen.set(false);
        } else {
          this.sidenavOpen.set(true);
          this.sidebarCollapsed.set(false);
        }
      });
  }

  ngOnDestroy(): void {
    this._bpSub?.unsubscribe();
  }

  // ── Public actions ────────────────────────────────────────────────────────────

  toggleSidenav(): void {
    if (this.isMobile()) {
      // On mobile: toggle the overlay drawer
      this.sidenav?.toggle();
    } else {
      // On desktop: toggle between collapsed and expanded
      this.sidebarCollapsed.update(v => !v);
    }
  }

  closeSidenavOnMobile(): void {
    if (this.isMobile()) {
      this.sidenav?.close();
    }
  }
}
