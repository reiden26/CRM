import {
  Injectable,
  inject,
  signal,
  effect,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT } from '@angular/common';

export type ColorTheme = 'light' | 'dark';

const STORAGE_KEY = 'crm_theme';

/**
 * ThemeService
 *
 * Manages the application color theme (light / dark).
 * Persists the user's preference in localStorage.
 * Applies the theme by toggling the `dark-theme` CSS class on <html>.
 *
 * Usage:
 *   themeService.toggle()
 *   themeService.setTheme('dark')
 *   themeService.isDark()   // Signal<boolean>
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {

  private readonly platformId = inject(PLATFORM_ID);
  private readonly document   = inject(DOCUMENT) as Document;

  private readonly _theme = signal<ColorTheme>('light');

  /** Current theme as a read-only Signal. */
  readonly theme  = this._theme.asReadonly();

  /** True when dark mode is active. */
  readonly isDark = () => this._theme() === 'dark';

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    // Load persisted preference, fall back to OS preference
    const stored = localStorage.getItem(STORAGE_KEY) as ColorTheme | null;
    const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial: ColorTheme = stored ?? (osDark ? 'dark' : 'light');

    this._theme.set(initial);
    this._applyTheme(initial);

    // React to OS theme changes when no explicit preference is stored
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        this.setTheme(e.matches ? 'dark' : 'light', false);
      }
    });
  }

  /** Toggles between light and dark. */
  toggle(): void {
    this.setTheme(this._theme() === 'light' ? 'dark' : 'light');
  }

  /** Sets a specific theme and optionally persists it. */
  setTheme(theme: ColorTheme, persist = true): void {
    this._theme.set(theme);
    this._applyTheme(theme);
    if (persist && isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  }

  private _applyTheme(theme: ColorTheme): void {
    const html = this.document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark-theme');
    } else {
      html.classList.remove('dark-theme');
    }
  }
}
