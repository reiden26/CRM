const DEFAULT_ALLOWED_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-internal-secret';
const DEFAULT_ALLOWED_METHODS = 'POST, GET, OPTIONS';

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS') ?? '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function resolveCorsHeaders(req: Request): Record<string, string> {
  const requestOrigin = req.headers.get('origin');
  const allowedOrigins = getAllowedOrigins();

  const allowOrigin =
    requestOrigin && allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0] ?? 'null';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': DEFAULT_ALLOWED_METHODS,
    Vary: 'Origin',
  };
}

/**
 * Returns a CORS preflight response for OPTIONS requests.
 * Call this at the top of every Edge Function handler.
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: resolveCorsHeaders(req) });
  }
  return null;
}
