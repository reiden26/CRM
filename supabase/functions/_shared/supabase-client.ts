import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Creates a Supabase client with the service-role key so Edge Functions
 * can bypass RLS when needed (e.g. writing audit logs, reading queue).
 */
export function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Creates a Supabase client scoped to the calling user's JWT.
 * RLS policies will apply normally.
 */
export function createUserClient(authHeader: string) {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}
