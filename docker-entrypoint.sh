#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# docker-entrypoint.sh
#
# Injects runtime environment variables into env-config.js before nginx starts.
# This allows the Angular app to read Supabase credentials without a rebuild.
# ─────────────────────────────────────────────────────────────────────────────

set -e

ENV_CONFIG="/usr/share/nginx/html/assets/env-config.js"

# Replace placeholder values with actual environment variables
sed -i \
  -e "s|\${SUPABASE_URL}|${SUPABASE_URL:-}|g" \
  -e "s|\${SUPABASE_ANON_KEY}|${SUPABASE_ANON_KEY:-}|g" \
  -e "s|\${VAPID_PUBLIC_KEY}|${VAPID_PUBLIC_KEY:-}|g" \
  -e "s|\${APP_VERSION}|${APP_VERSION:-1.0.0}|g" \
  -e "s|\${ENVIRONMENT}|${ENVIRONMENT:-production}|g" \
  "$ENV_CONFIG"

echo "✓ Environment variables injected into env-config.js"

# Validate required variables
if [ -z "$SUPABASE_URL" ]; then
  echo "⚠ WARNING: SUPABASE_URL is not set"
fi
if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "⚠ WARNING: SUPABASE_ANON_KEY is not set"
fi

# Start nginx
exec "$@"
