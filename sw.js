// 네트워크 우선, 실패하면 캐시. 한 번 열어 본 자료는 오프라인에서도 열린다.
const CACHE = 'study-v3';
const SHELL = ['./', 'index.html', 'assets/app.js', 'assets/schema.js', 'assets/dict.js', 'assets/synccore.js', 'assets/sync.js', 'assets/firebase-config.js', 'assets/style.css', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin && u.hostname !== 'cdn.jsdelivr.net') return;
  e.respondWith(
    fetch(r)
      .then(res => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
        return res;
      })
      .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || Response.error()))
  );
});
