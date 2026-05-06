import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { SupabaseService } from '../services/supabase.service';

// URLs that should NOT receive the Authorization header
// (e.g. third-party APIs, public CDN assets)
const EXCLUDED_URLS: RegExp[] = [
  /^https:\/\/fonts\.googleapis\.com/,
  /^https:\/\/fonts\.gstatic\.com/,
  /^https:\/\/cdn\./,
];

function isExcluded(url: string): boolean {
  return EXCLUDED_URLS.some(pattern => pattern.test(url));
}

/**
 * auth.interceptor
 *
 * Attaches the Supabase JWT access token to every outgoing HTTP request
 * as an Authorization: Bearer <token> header.
 *
 * Flow:
 *   1. Skip excluded URLs (third-party, public assets)
 *   2. Read the current session from SupabaseService (Signal — synchronous)
 *   3. If a valid token exists, clone the request with the header
 *   4. If the token is expired, Supabase auto-refreshes it via the client
 *
 * Note: Supabase JS SDK calls use the internal client directly and do NOT
 * go through Angular's HttpClient, so this interceptor only affects
 * custom HTTP calls (e.g. to your own backend or Edge Functions).
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  if (isExcluded(req.url)) {
    return next(req);
  }

  const supabase = inject(SupabaseService);

  // Use the Signal for a synchronous fast path when the session is already loaded
  const cachedSession = supabase.sessionSignal();

  if (cachedSession) {
    return next(addAuthHeader(req, cachedSession.access_token));
  }

  // Slow path: session not yet resolved — fetch from storage asynchronously
  return from(supabase.resolveSession()).pipe(
    switchMap(session => {
      if (session?.access_token) {
        return next(addAuthHeader(req, session.access_token));
      }
      return next(req);
    }),
  );
};

function addAuthHeader(
  req: HttpRequest<unknown>,
  token: string,
): HttpRequest<unknown> {
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
      // Supabase also expects the apikey header for Edge Function calls
      apikey: token,
    },
  });
}
