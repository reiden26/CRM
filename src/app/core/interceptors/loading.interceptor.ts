import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

// Requests matching these patterns are silently skipped from the loading indicator
// (e.g. background polling, realtime pings, analytics)
const SILENT_PATTERNS: RegExp[] = [
  /\/realtime\//,
  /\/storage\/v1\/object\/public\//,
  /fonts\.googleapis\.com/,
];

function isSilent(url: string): boolean {
  return SILENT_PATTERNS.some(p => p.test(url));
}

/**
 * loading.interceptor
 *
 * Manages a global loading state via LoadingService (Signal-based).
 * Increments a counter on request start, decrements on completion.
 * The LoadingService.isLoading Signal is true whenever count > 0.
 *
 * Skips silent requests (realtime, public assets) to avoid false positives.
 */
export const loadingInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  if (isSilent(req.url)) {
    return next(req);
  }

  const loading = inject(LoadingService);
  loading.show();

  return next(req).pipe(
    finalize(() => loading.hide()),
  );
};
