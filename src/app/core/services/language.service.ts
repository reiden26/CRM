import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';

export type AppLanguage = 'es' | 'en';

const STORAGE_KEY = 'crm_language';
const DEFAULT_LANG: AppLanguage = 'es';

/**
 * LanguageService
 *
 * Manages the application language (Spanish / English).
 * Persists the user's preference in localStorage.
 * Integrates with ngx-translate.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {

  private readonly translate  = inject(TranslateService);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _current = signal<AppLanguage>(DEFAULT_LANG);

  /** Current language as a read-only Signal. */
  readonly current = this._current.asReadonly();

  /** True when Spanish is active. */
  readonly isSpanish = () => this._current() === 'es';

  constructor() {
    this.translate.addLangs(['es', 'en']);
    this.translate.setDefaultLang('es');

    if (isPlatformBrowser(this.platformId)) {
      const stored = localStorage.getItem(STORAGE_KEY) as AppLanguage | null;
      const initial = stored ?? DEFAULT_LANG;
      this._apply(initial);
    } else {
      this._apply(DEFAULT_LANG);
    }
  }

  /** Switches to the given language and persists the preference. */
  setLanguage(lang: AppLanguage): void {
    this._apply(lang);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, lang);
    }
  }

  /** Toggles between Spanish and English. */
  toggle(): void {
    this.setLanguage(this._current() === 'es' ? 'en' : 'es');
  }

  private _apply(lang: AppLanguage): void {
    this._current.set(lang);
    this.translate.use(lang);
  }
}
