/**
 * send-push-notification
 * ──────────────────────────────────────────────────────────────
 * Sends a Web Push notification to all active subscriptions
 * of a given user using the VAPID protocol.
 *
 * Request body:
 *   { userId, title, body, data? }
 *
 * Secrets required:
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT   (e.g. "mailto:admin@yourdomain.com")
 */

import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import type { SendPushPayload, PushSubscription } from '../_shared/types.ts';

// ── VAPID / Web Push implementation ─────────────────────────────────────────
// Deno doesn't have a native web-push library, so we implement the
// minimal VAPID signing + encrypted push payload using the WebCrypto API.

async function importVapidPrivateKey(base64url: string): Promise<CryptoKey> {
  const raw = base64urlToUint8Array(base64url);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits'],
  );
}

function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function buildVapidAuthHeader(
  audience: string,
  subject: string,
  publicKeyB64: string,
  privateKeyB64: string,
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  };

  const encode = (obj: object) =>
    uint8ArrayToBase64url(new TextEncoder().encode(JSON.stringify(obj)));

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Import private key as ECDSA key for signing
  const rawPrivate = base64urlToUint8Array(privateKeyB64);
  const signingKey = await crypto.subtle.importKey(
    'raw',
    rawPrivate,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${uint8ArrayToBase64url(new Uint8Array(signature))}`;
  return `vapid t=${jwt},k=${publicKeyB64}`;
}

// ── Send a single push message ───────────────────────────────────────────────

async function sendWebPush(
  subscription: PushSubscription,
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<{ ok: boolean; expired: boolean }> {
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const authHeader = await buildVapidAuthHeader(
    audience,
    vapidSubject,
    vapidPublic,
    vapidPrivate,
  );

  const body = JSON.stringify(payload);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      TTL: '86400',
    },
    body,
  });

  // 404 / 410 = subscription expired or unsubscribed
  const expired = res.status === 404 || res.status === 410;
  return { ok: res.ok, expired };
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createServiceClient();

  let payload: SendPushPayload;
  try {
    payload = await req.json() as SendPushPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { userId, title, body, data } = payload;

  if (!userId || !title || !body) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: userId, title, body' }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── 1. Fetch active push subscriptions for this user ────────────────────
  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, tenant_id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (subError) {
    return new Response(
      JSON.stringify({ error: subError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (!subscriptions || subscriptions.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, message: 'No push subscriptions found' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── 2. Send to each subscription ────────────────────────────────────────
  const expiredIds: string[] = [];
  let sent = 0;

  await Promise.allSettled(
    (subscriptions as PushSubscription[]).map(async (sub) => {
      try {
        const { ok, expired } = await sendWebPush(sub, { title, body, data });

        if (expired) {
          expiredIds.push(sub.id);
        } else if (ok) {
          sent++;
        }
      } catch (err) {
        console.error(`Push failed for subscription ${sub.id}:`, err);
      }
    }),
  );

  // ── 3. Remove expired subscriptions ─────────────────────────────────────
  if (expiredIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', expiredIds);

    if (deleteError) {
      console.error('Failed to delete expired subscriptions:', deleteError.message);
    } else {
      console.log(`Removed ${expiredIds.length} expired push subscription(s)`);
    }
  }

  return new Response(
    JSON.stringify({
      sent,
      total: subscriptions.length,
      expiredRemoved: expiredIds.length,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
