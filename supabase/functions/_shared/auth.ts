import { createUserClient } from './supabase-client.ts';

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: string;
}

function unauthorizedResponse(message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}

export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

export function isServiceToken(req: Request): boolean {
  const token = getBearerToken(req);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return Boolean(token && serviceKey && token === serviceKey);
}

export async function getAuthContext(req: Request): Promise<AuthContext | Response> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return unauthorizedResponse('Missing Authorization header');
  }

  const userClient = createUserClient(authHeader);
  const { data: userResult, error: userError } = await userClient.auth.getUser();

  if (userError || !userResult?.user) {
    return unauthorizedResponse('Invalid JWT');
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', userResult.user.id)
    .single();

  if (profileError || !profile?.tenant_id) {
    return unauthorizedResponse('Profile is missing tenant context');
  }

  return {
    userId: userResult.user.id,
    tenantId: profile.tenant_id as string,
    role: (profile.role as string) ?? 'agent',
  };
}
