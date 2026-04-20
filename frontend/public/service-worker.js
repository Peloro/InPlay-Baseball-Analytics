const CACHE_VERSION = 'v2'
const CACHE_NAME = `baseball-app-${CACHE_VERSION}`

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/Ativo 1Cporcotransparente.png',
  '/favicon.svg',
  '/offline.html',
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key)
          return null
        }),
      ),
    ).then(() => self.clients.claim())
  )
})

// Allow clients to trigger immediate activation
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Only handle same-origin requests to avoid caching third-party resources
  const isSameOrigin = url.origin === self.location.origin

  // Navigation requests: try network first, fallback to cached index/offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // update cache with fresh index.html
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/offline.html'))),
    )
    return
  }

  // For same-origin static assets (styles, scripts, images, fonts): cache-first
  if (isSameOrigin && (req.destination === 'style' || req.destination === 'script' || req.destination === 'image' || req.destination === 'font')) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached
          ? cached
          : fetch(req)
              .then((res) => {
                // only cache successful responses
                if (!res || res.status !== 200 || res.type === 'opaque') return res
                const copy = res.clone()
                caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
                return res
              })
              .catch(() => {
                // fallback for images
                if (req.destination === 'image') return caches.match('/Ativo 1Cporcotransparente.png')
                // fallback to offline page for others
                return caches.match('/offline.html')
              }),
      ),
    )
    return
  }

  // Default: try network, fallback to cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Optionally cache GET responses for later (only same-origin and GET)
        if (isSameOrigin && req.method === 'GET' && res && res.status === 200 && res.type !== 'opaque') {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/offline.html'))),
  )
})
