// Incrementa este número cada vez que hagas cambios
const CACHE = 'kikogastos-v4';
const ASSETS = ['/kiko-gastos/', '/kiko-gastos/index.html', '/kiko-gastos/style.css',
                '/kiko-gastos/app.js', '/kiko-gastos/firebase-config.js', '/kiko-gastos/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
  // Activa inmediatamente sin esperar a que se cierren las pestañas viejas
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  // Toma el control de todas las pestañas abiertas
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // No cachear Firebase — siempre en tiempo real
  if (e.request.url.includes('firestore') ||
      e.request.url.includes('googleapis') ||
      e.request.url.includes('firebase')) return;

  e.respondWith(
    // Network first para JS/CSS (para tener siempre el código más nuevo)
    // Cache fallback si no hay red
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
