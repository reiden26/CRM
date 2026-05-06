/**
 * CRM Service Worker — sw.js
 *
 * Handles Web Push notifications independently of the Angular ngsw-worker.js.
 * This file is registered manually by PushNotificationService.
 *
 * The Angular ngsw-worker.js handles:
 *   - App shell caching
 *   - Asset caching
 *   - Background sync
 *
 * This file handles:
 *   - Web Push notification display
 *   - Notification click → navigate to resource
 *   - Cross-origin push payloads
 */

'use strict';

const CACHE_NAME = 'crm-push-v1';

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  // Activate immediately — don't wait for existing tabs to close
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  // Take control of all open clients immediately
  self.clients.claim();
});

// ── Push notification handler ─────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.warn('[SW] Push event received with no data');
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Fallback for plain-text payloads
    payload = {
      title: 'CRM',
      body:  event.data.text(),
      data:  {},
    };
  }

  const title   = payload.title   ?? 'CRM Notification';
  const options = {
    body:    payload.body    ?? '',
    icon:    payload.icon    ?? '/assets/icons/icon-192x192.png',
    badge:   payload.badge   ?? '/assets/icons/badge-72x72.png',
    tag:     payload.tag     ?? `crm-${Date.now()}`,
    renotify: payload.renotify ?? false,
    requireInteraction: payload.requireInteraction ?? false,
    silent:  payload.silent  ?? false,
    data: {
      url:          payload.data?.url          ?? '/',
      resourceType: payload.data?.resourceType ?? null,
      resourceId:   payload.data?.resourceId   ?? null,
      tenantId:     payload.data?.tenantId     ?? null,
      notifId:      payload.data?.notifId      ?? null,
    },
    actions: payload.actions ?? [
      { action: 'view',    title: 'View'    },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    vibrate:   [200, 100, 200],
    timestamp: payload.timestamp ?? Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(title, options),
  );
});

// ── Notification click ────────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // User clicked "Dismiss" action — do nothing
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If the app is already open in a tab, focus it and navigate
        for (const client of clientList) {
          if (
            typeof client.url === 'string' &&
            client.url.includes(self.location.origin) &&
            'focus' in client
          ) {
            client.focus();
            // Send message to Angular app to navigate
            client.postMessage({
              type:    'NOTIFICATION_CLICK',
              url:     targetUrl,
              data:    event.notification.data,
            });
            return;
          }
        }
        // App is not open — open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});

// ── Notification close ────────────────────────────────────────────────────────

self.addEventListener('notificationclose', (event) => {
  const data = event.notification.data;
  if (data?.notifId) {
    // Optionally: mark notification as dismissed via a background fetch
    console.log('[SW] Notification dismissed:', data.notifId);
  }
});

// ── Message from Angular app ──────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
