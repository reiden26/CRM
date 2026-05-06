/**
 * Environment configuration template.
 *
 * Copy this file to environment.ts (development) or environment.prod.ts (production)
 * and fill in your actual values. NEVER commit real credentials to version control.
 *
 * How to get these values:
 *   SUPABASE_URL      → Supabase Dashboard → Settings → API → Project URL
 *   SUPABASE_ANON_KEY → Supabase Dashboard → Settings → API → anon public key
 *   VAPID_PUBLIC_KEY  → Run: npx web-push generate-vapid-keys
 */
export const environment = {
  production: false,   // set to true in environment.prod.ts
  supabase: {
    url:     'https://YOUR_PROJECT_REF.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  },
  vapid: {
    publicKey: 'Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
};
