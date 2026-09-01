// Minimal service worker for TURAGITGUU.
// Its only job is to let the app show notifications via
// ServiceWorkerRegistration.showNotification(), which works reliably on
// mobile browsers (unlike the plain `new Notification()` constructor, which
// many mobile browsers, e.g. Android Chrome, refuse to run at all).
// It does no caching / offline work, so it stays out of the way of updates.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Tapping a notification focuses an existing tab if one is open,
// otherwise opens a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});

// Real background push: fires even when the app/tab is closed, as long as
// the browser process can wake this service worker (this is what makes
// notifications work "for real" on a phone, per api/send-reminders.js).
self.addEventListener('push', (event) => {
  let data = { title: 'TURAGITGUU', body: '' };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'TURAGITGUU', {
      body: data.body || '',
      icon: data.icon || undefined,
      badge: data.badge || undefined,
      tag: data.tag || undefined,
    })
  );
});
