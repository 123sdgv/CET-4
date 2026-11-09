// 离线缓存：页面和词库优先联网，断网用缓存；其余资源优先用缓存。
const CACHE = 'vocab-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest'])).catch(() => {}))
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'cache') {
    e.waitUntil(caches.open(CACHE).then((c) => Promise.all(e.data.urls.map((u) => c.add(u).catch(() => {})))))
  }
})

const put = (req, res) => {
  if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
  return res
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  const isData = url.pathname.includes('/data/')
  if (req.mode === 'navigate' || isData) {
    e.respondWith(
      fetch(req).then((res) => put(req, res)).catch(async () =>
        (await caches.match(req, { ignoreSearch: isData })) || (req.mode === 'navigate' ? await caches.match('./') : Response.error()),
      ),
    )
    return
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))))
})
