/* ============================================================
   service-worker.js — Offline-first caching strategy
   Strategy: Cache-first for static assets, Network-first for
   navigation, with aggressive pre-caching of vendor bundles.
   ============================================================ */

const CACHE_NAME = 'code-editer-pi-v1.0.0';
const RUNTIME_CACHE = 'code-editer-pi-runtime-v1';

// All critical assets to pre-cache for 100% offline
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './fileSystem.js',
  './terminal.js',
  './manifest.json',
  './assets/icon.svg',

  // localforage
  './vendor/localforage.min.js',

  // XTerm
  './vendor/xterm/css/xterm.css',
  './vendor/xterm/lib/xterm.js',
  './vendor/xterm-addon-fit/lib/xterm-addon-fit.js',

  // Monaco core
  './vendor/monaco/min/vs/loader.js',
  './vendor/monaco/min/vs/editor/editor.main.css',
  './vendor/monaco/min/vs/editor/editor.main.js',
  './vendor/monaco/min/vs/editor/editor.main.nls.js',
  './vendor/monaco/min/vs/base/worker/workerMain.js',
  './vendor/monaco/min/vs/language/typescript/tsWorker.js',
  './vendor/monaco/min/vs/language/css/cssWorker.js',
  './vendor/monaco/min/vs/language/html/htmlWorker.js',
  './vendor/monaco/min/vs/language/json/jsonWorker.js',

  // Monaco language contributions
  './vendor/monaco/min/vs/basic-languages/python/python.contribution.js',
  './vendor/monaco/min/vs/basic-languages/c/c.contribution.js',
  './vendor/monaco/min/vs/basic-languages/cpp/cpp.contribution.js',
  './vendor/monaco/min/vs/basic-languages/java/java.contribution.js',
  './vendor/monaco/min/vs/basic-languages/markdown/markdown.contribution.js',
  './vendor/monaco/min/vs/basic-languages/shell/shell.contribution.js',
  './vendor/monaco/min/vs/basic-languages/yaml/yaml.contribution.js',
  './vendor/monaco/min/vs/basic-languages/xml/xml.contribution.js',
  './vendor/monaco/min/vs/basic-languages/sql/sql.contribution.js'
];

// ---------- Install ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache what we can; don't fail on missing optional files
      await Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Precache skip:', url))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ---------- Activate ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ---------- Fetch ----------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin (except CDN fallbacks)
  if (request.method !== 'GET') return;

  // Navigation requests: Network-first, fall back to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Monaco workers & language servers: Cache-first
  if (url.pathname.includes('/vs/') || url.pathname.includes('workerMain')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Pyodide WASM (large, cache aggressively)
  if (url.pathname.includes('pyodide')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Everything else: Cache-first, then network, then cache the result
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok && (url.origin === location.origin || url.hostname.includes('cdn'))) {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
        }
        return res;
      }).catch(() => {
        // Offline fallback for images/icons
        if (request.destination === 'image') {
          return caches.match('./assets/icon.svg');
        }
      });
    })
  );
});

// ---------- Background sync placeholder ----------
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
