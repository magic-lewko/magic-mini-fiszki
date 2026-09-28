// Made by build.mjs. Do not edit by hand.
const VERSION = 'af7ec03264ae'
const FILES = [
  './',
  './index.html',
  './assets/index-2TY-448D.css',
  './assets/index-DGGoitjS.js',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './manifest.webmanifest'
]

;(function worker() {
  const CACHE = 'mmf-' + VERSION

  // Atomic: first all files are downloaded and only when each has an ok status, they go to the cache. A missing
  // one stops the install, and the old version keeps working. The v parameter skips the CDN cache (GitHub Pages is
  // behind Fastly, which could give an old file under a new version), cache: 'reload' skips the HTTP cache. The key
  // in the cache has no parameter, so matching in fetch and in status is exact.
  // No skipWaiting: the new version waits until the user taps the banner.
  async function install() {
    const responses = await Promise.all(
      FILES.map(async (file) => {
        const address = file + (file.includes('?') ? '&' : '?') + 'v=' + VERSION
        const response = await fetch(new Request(address, { cache: 'reload' }))
        if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`)
        return response
      }),
    )
    const cache = await caches.open(CACHE)
    try {
      await Promise.all(FILES.map((file, i) => cache.put(new Request(file), responses[i])))
    } catch (error) {
      // An incomplete cache of this version must not stay: the name is unique for the version, so we delete only it.
      await caches.delete(CACHE)
      throw error
    }
  }

  self.addEventListener('install', (event) => {
    event.waitUntil(install())
  })

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((names) => Promise.all(names.filter((n) => n.startsWith('mmf-') && n !== CACHE).map((n) => caches.delete(n))))
        .then(() => self.clients.claim()),
    )
  })

  const fromCache = (request) => caches.open(CACHE).then((cache) => cache.match(request, { ignoreSearch: true }))

  // Safari rejects a navigation answered with a response that has the redirect flag (hosting may turn index.html into /).
  async function withoutRedirect(response) {
    if (!response.redirected) return response
    const body = await response.blob()
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  }

  // Always the cache first, the network only when the file is not in it. So a reload without the network works.
  self.addEventListener('fetch', (event) => {
    const request = event.request
    if (request.method !== 'GET') return
    if (new URL(request.url).origin !== self.location.origin) return
    if (request.mode === 'navigate') {
      event.respondWith(fromCache('./index.html').then((response) => (response ? withoutRedirect(response) : fetch(request))))
      return
    }
    event.respondWith(fromCache(request).then((response) => response || fetch(request)))
  })

  // Messages: 'status' and 'update'. The app from before the English version (still open on the phone while the new
  // version installs) sends 'aktualizuj' and reads the status fields wersja, pliki, zapisane, so they stay too.
  self.addEventListener('message', (event) => {
    if (event.data === 'status') {
      const port = event.ports[0]
      event.waitUntil(
        caches
          .open(CACHE)
          .then((cache) => Promise.all(FILES.map((file) => cache.match(file, { ignoreSearch: true }))))
          .then((found) => {
            const saved = found.filter(Boolean).length
            port?.postMessage({ version: VERSION, files: FILES.length, saved, wersja: VERSION, pliki: FILES.length, zapisane: saved })
          }),
      )
    } else if (event.data === 'update' || event.data === 'aktualizuj') {
      self.skipWaiting()
    }
  })
})()
