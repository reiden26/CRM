const runtimeEnv = (globalThis as { __env?: Record<string, string> }).__env ?? {};
const isUsable = (value: string | undefined): value is string =>
  typeof value === 'string' && value.length > 0 && !value.includes('${') && !value.includes('YOUR_');

export const environment = {
  production: true,
  supabase: {
    url: isUsable(runtimeEnv['SUPABASE_URL'])
      ? runtimeEnv['SUPABASE_URL']
      : '',
    anonKey: isUsable(runtimeEnv['SUPABASE_ANON_KEY'])
      ? runtimeEnv['SUPABASE_ANON_KEY']
      : '',
  },
  vapid: {
    publicKey: isUsable(runtimeEnv['VAPID_PUBLIC_KEY'])
      ? runtimeEnv['VAPID_PUBLIC_KEY']
      : '',
  },
};
