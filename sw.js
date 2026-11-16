const CACHE_NAME = 'chunglun-wongwang-v22.3';
const URLS_TO_CACHE = [
  './',
  './index.html',
  "./vendor/chi_tra.traineddata.gz",
  "./vendor/eng.traineddata.gz",
  "./vendor/pdf.min.js",
  "./vendor/pdf.worker.min.js",
  "./vendor/tesseract-core-lstm.wasm",
  "./vendor/tesseract-core-lstm.wasm.js",
  "./vendor/tesseract-core-simd-lstm.wasm",
  "./vendor/tesseract-core-simd-lstm.wasm.js",
  "./vendor/tesseract.min.js",
  "./vendor/worker.min.js",
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k.startsWith('chunglun-wongwang-') && k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      }).catch(() => caches.match(request).then(r => r || caches.match('./index.html')))
    );
  } else {
    event.respondWith(
      caches.match(request).then(response => response || fetch(request))
    );
  }
});