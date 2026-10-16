// Service worker: keeps the app working offline and plays downloaded videos from Cache Storage
// with HTTP Range support (Safari's video player requires 206 partial responses).
const VERSION = 'bv-app-1';
const SHELL = ['./', 'index.html', 'app.js', 'intro.js', 'style.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const MEDIA = 'bv-media';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('bv-app-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url), scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const rel = url.pathname.slice(scope.pathname.length);
  if (rel.startsWith('media/')) { e.respondWith(serveMedia(req, url)); return; }
  if (rel === 'library.json') { // network first, so a new list is seen when online
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })
      .catch(() => caches.match(req).then(r => r || new Response('null', { status: 404 }))));
    return;
  }
  if (rel.startsWith('videos/')) return; // downloads go straight to the network
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).catch(() => caches.match('index.html'))));
});

async function serveMedia(req, url) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(url.origin + url.pathname);
  if (!hit) return new Response('Not downloaded', { status: 404 });
  const range = req.headers.get('range');
  const type = hit.headers.get('content-type') || 'video/mp4';
  const blob = await hit.blob();
  const size = blob.size;
  if (!range) return new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
  if (start >= size || start > end) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  end = Math.min(end, size - 1);
  return new Response(blob.slice(start, end + 1, type), { status: 206, headers: {
    'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' } });
}
