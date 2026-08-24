// Service Worker — بن العجوز ERP
// ═══════════════════════════════════════════════════════════
// الاستراتيجية المُصحّحة (تحل مشكلة تجمّد التنقل):
//  - الـ HTML (التنقلات) → Network-First: يُجلب دائمًا نسخة جديدة من الخادم
//    حتى لا يقدّم index.html قديمًا يشير لأصول محذوفة (كان سبب تجمّد كل المسارات).
//  - الأصول المحددة بالهاش (JS/CSS) → Cache-First بلا إعادة تحقق (غير قابلة للتغيير —
//    إعادة الجلب الخلفي كانت تضاعف طلبات الشبكة بلا فائدة).
//  - الصور والملفات غير المُهاشَمة → Cache-First مع تحديث خلفي (قد تتغير بنفس الاسم).
//  - طلبات /api وPOST وغيرها → تُمرَّر كما هي بلا تدخل.
//  - إصدار الكاش v3: عند الترقية يُمسح القديم تلقائياً في activate.
const CACHE_NAME = 'alagoouz-erp-v3';
const PRECACHE_ASSETS = ['/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // تخطي: طرق غير GET + واجهة الـ API + المصادر الخارجية
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // ── التنقلات (HTML) → Network-First ──
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // خزّن آخر index.html صالح للاستخدام دون اتصال (لا نخدمه إلا عند انقطاع الشبكة)
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .match('/index.html')
            .then((cached) => cached || caches.match('/')),
        ),
    );
    return;
  }

  // ── الأصول المُهاشَمة (JS/CSS) → Cache-First صرف ──
  const isHashedAsset = /\.[0-9a-f]{8,}\.(js|css)$/i.test(url.pathname);
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      });
    }).then((response) => {
      if (!isHashedAsset && response) {
        // للصور وmanifest: تحديث خلفي لأن نفس الاسم قد يحمل محتوى جديدًا
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {});
      }
      return response;
    }),
  );
});
