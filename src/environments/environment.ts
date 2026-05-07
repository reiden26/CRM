const runtimeEnv = (globalThis as { __env?: Record<string, string> }).__env ?? {};
const isUsable = (value: string | undefined): value is string =>
  typeof value === 'string' && value.length > 0 && !value.includes('${') && !value.includes('YOUR_');
const LOCAL_SUPABASE_URL = 'https://mopskxegqotfvhhlovrl.supabase.co';
const LOCAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vcHNreGVncW90ZnZoaGxvdnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMjc2NjgsImV4cCI6MjA5MzYwMzY2OH0.IrFaeLuIV2bWsySgDZOhSozqlfw7duHKLyf1xr9CElE';
const LOCAL_VAPID_PUBLIC_KEY = 'sb_publishable_LbIvpFvycdCVnQjKZntHzA_BL-q5DfF';

export const environment = {
  production: false,
  supabase: {
    url: isUsable(runtimeEnv['SUPABASE_URL']) ? runtimeEnv['SUPABASE_URL'] : LOCAL_SUPABASE_URL,
    anonKey: isUsable(runtimeEnv['SUPABASE_ANON_KEY'])
      ? runtimeEnv['SUPABASE_ANON_KEY']
      : LOCAL_SUPABASE_ANON_KEY,
  },
  vapid: {
    publicKey: isUsable(runtimeEnv['VAPID_PUBLIC_KEY'])
      ? runtimeEnv['VAPID_PUBLIC_KEY']
      : LOCAL_VAPID_PUBLIC_KEY,
  },
};
