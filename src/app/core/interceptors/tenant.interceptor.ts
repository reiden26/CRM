import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

// URLs that carry the tenant header (Supabase Edge Functions only)
const SUPABASE_FUNCTIONS_PATTERN = /\/functions\/v1\//;

/**
 * tenant.interceptor
 *
 * Automatically adds the X-Tenant-ID header to all requests targeting
 * Supabase Edge Functions. This allows Edge Functions to identify the
 * tenant without requiring it in the request body.
 *
 * Only applied to Edge Function URLs to avoid polluting other requests.
 */
export const tenantInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  // Only add tenant header to Edge Function calls
  if (!SUPABASE_FUNCTIONS_PATTERN.test(req.url)) {
    return next(req);
  }

  const auth     = inject(AuthService);
  const tenantId = auth.profile()?.tenantId;

  if (!tenantId) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: { 'X-Tenant-ID': tenantId },
    }),
  );
};
