import { ErrorHandler, Injectable, inject, NgZone } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

// ─────────────────────────────────────────────────────────────────────────────
// GlobalErrorHandler
//
// Catches all unhandled errors in the Angular app and displays a user-friendly
// snackbar message. Logs the full error to the console for debugging.
//
// Registered in app.config.ts:
//   { provide: ErrorHandler, useClass: GlobalErrorHandler }
// ─────────────────────────────────────────────────────────────────────────────

/** Maps Supabase / HTTP error codes to Spanish user-friendly messages. */
function friendlyMessage(error: unknown): string {
  const msg = String(
    (error as any)?.message ?? (error as any)?.error?.message ?? error ?? '',
  ).toLowerCase();

  // ── Supabase Auth errors ──────────────────────────────────────────────────
  if (msg.includes('invalid login credentials'))
    return 'Credenciales incorrectas. Verifica tu email y contraseña.';
  if (msg.includes('email not confirmed'))
    return 'Debes confirmar tu email antes de iniciar sesión.';
  if (msg.includes('user already registered'))
    return 'Ya existe una cuenta con este email.';
  if (msg.includes('password should be at least'))
    return 'La contraseña debe tener al menos 8 caracteres.';
  if (msg.includes('rate limit') || msg.includes('too many requests'))
    return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
  if (msg.includes('jwt expired') || msg.includes('session_not_found'))
    return 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.';
  if (msg.includes('invalid jwt'))
    return 'Token de sesión inválido. Por favor inicia sesión nuevamente.';

  // ── Supabase DB / RLS errors ──────────────────────────────────────────────
  if (msg.includes('row-level security') || msg.includes('rls'))
    return 'No tienes permiso para realizar esta acción.';
  if (msg.includes('violates foreign key'))
    return 'No se puede eliminar este registro porque tiene datos relacionados.';
  if (msg.includes('violates unique constraint') || msg.includes('duplicate key'))
    return 'Ya existe un registro con estos datos.';
  if (msg.includes('not null violation'))
    return 'Faltan campos obligatorios en el formulario.';
  if (msg.includes('pgrst116') || msg.includes('no rows'))
    return 'El registro solicitado no fue encontrado.';

  // ── Network errors ────────────────────────────────────────────────────────
  if (msg.includes('failed to fetch') || msg.includes('network'))
    return 'Error de conexión. Verifica tu internet e intenta de nuevo.';
  if (msg.includes('timeout'))
    return 'La solicitud tardó demasiado. Intenta de nuevo.';

  // ── HTTP status codes ─────────────────────────────────────────────────────
  const status = (error as any)?.status;
  if (status === 400) return 'Solicitud inválida. Verifica los datos ingresados.';
  if (status === 401) return 'No autorizado. Por favor inicia sesión.';
  if (status === 403) return 'No tienes permiso para realizar esta acción.';
  if (status === 404) return 'El recurso solicitado no fue encontrado.';
  if (status === 409) return 'Conflicto: ya existe un registro con estos datos.';
  if (status === 422) return 'Los datos ingresados no son válidos.';
  if (status === 429) return 'Demasiadas solicitudes. Espera un momento.';
  if (status >= 500)  return 'Error del servidor. Intenta de nuevo más tarde.';

  // ── Generic fallback ──────────────────────────────────────────────────────
  return 'Ocurrió un error inesperado. Por favor intenta de nuevo.';
}

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {

  private readonly snackBar = inject(MatSnackBar);
  private readonly zone     = inject(NgZone);

  handleError(error: unknown): void {
    // Always log the full error for debugging
    console.error('[GlobalErrorHandler]', error);

    const msg = String((error as any)?.message ?? '');

    // ── Suppress non-critical errors ─────────────────────────────────────────

    // NavigatorLockManager timeout — benign in dev, Supabase retries automatically
    if (msg.includes('NavigatorLockAcquireTimeoutError') || msg.includes('LockManager')) {
      console.warn('[GlobalErrorHandler] NavigatorLock timeout (benign in dev) — suppressed');
      return;
    }

    // Skip chunk-load errors (lazy route loading failures) — Angular handles these
    if (msg.includes('ChunkLoadError') || msg.includes('Loading chunk')) {
      this.zone.run(() => {
        this.snackBar.open(
          'Nueva versión disponible. Recargando…',
          undefined,
          { duration: 3000, panelClass: ['snack-info'] },
        );
        setTimeout(() => window.location.reload(), 2500);
      });
      return;
    }

    // Show user-friendly message in snackbar
    const userMessage = friendlyMessage(error);

    this.zone.run(() => {
      this.snackBar.open(userMessage, 'Cerrar', {
        duration:           8000,
        panelClass:         ['snack-error'],
        horizontalPosition: 'right',
        verticalPosition:   'bottom',
      });
    });
  }
}
