const CACHE_NAME = 'assistive-assessment-modular-v10';
const APP_SHELL = [
  './',
  './index.html',
  './assets/css/app.css',
  './assets/js/core/state.js',
  './assets/js/core/dom.js',
  './assets/js/backup/schema.js',
  './assets/js/core/cases.js',
  './assets/js/views/case-list.js',
  './assets/js/forms/stair.js',
  './assets/js/forms/wheelchair.js',
  './assets/js/forms/shower.js',
  './assets/js/forms/walker.js',
  './assets/js/forms/cushion.js',
  './assets/js/forms/transfer.js',
  './assets/js/forms/airbed.js',
  './assets/js/calculations/stair-eligibility.js',
  './assets/js/calculations/subsidy.js',
  './assets/js/navigation.js',
  './assets/js/forms/home-accessibility.js',
  './assets/js/backup/backup.js',
  './assets/js/cloud/cloud-config.js',
  './assets/js/cloud/auth-state.js',
  './assets/js/cloud/sync-decision.js',
  './assets/js/cloud/drive-client.js',
  './assets/js/cloud/cloud-backup.js',
  './assets/js/cloud/cloud-ui.js',
  './assets/js/ui.js',
  './assets/js/version.js',
  './assets/js/events.js',
  './assets/js/boot.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match('./index.html');
      throw error;
    }
  })());
});
