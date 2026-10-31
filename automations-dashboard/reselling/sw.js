// Offline-Fähigkeit: App-Hülle zwischenspeichern, Daten immer zuerst frisch aus dem Netz holen.
const CACHE = 'radar-v16';
const HUELLE = ['./', 'index.html', 'app.js', 'pro.js', 'zelle.js', 'business.js', 'katalog.json', 'saison.json', 'hype.json', 'evergreen.json', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(HUELLE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const kopie = r.clone(); caches.open(CACHE).then((c) => c.put(e.request.url.split('?')[0], kopie)); return r; })
    .catch(() => caches.match(e.request.url.split('?')[0])));
});
