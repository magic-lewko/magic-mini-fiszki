// Wygenerowane przez zbuduj.mjs. Nie edytuj recznie.
const WERSJA = '5e3c089c604f'
const PLIKI = [
  './',
  './index.html',
  './app.js',
  './baza.js',
  './fsrs.mjs',
  './haptyka.js',
  './ikona-180.png',
  './ikona-192.png',
  './ikona-512.png',
  './kolizje.js',
  './krzyzowka.js',
  './literki.js',
  './magazyn.js',
  './manifest.webmanifest',
  './mowa.js',
  './slowka.js',
  './styl.css',
  './talia.js'
]

;(function pracownik() {
  const CACHE = 'mmf-' + WERSJA

  // Atomowo: najpierw pobierane sa wszystkie pliki i dopiero gdy kazdy ma status ok, trafiaja do cache. Brak
  // ktoregokolwiek przerywa instalacje, a stara wersja dziala dalej. Parametr v omija cache CDN (GitHub Pages stoi
  // za Fastly, ktory mogl oddac stary plik pod nowa wersja), cache: 'reload' omija cache HTTP. Klucz w cache jest
  // bez parametru, wiec dopasowanie w fetch i w statusie jest dokladne.
  // Bez skipWaiting: nowa wersja czeka, az uzytkownik sam kliknie baner.
  async function zainstaluj() {
    const odpowiedzi = await Promise.all(
      PLIKI.map(async (plik) => {
        const adres = plik + (plik.includes('?') ? '&' : '?') + 'v=' + WERSJA
        const odpowiedz = await fetch(new Request(adres, { cache: 'reload' }))
        if (!odpowiedz.ok) throw new Error(`${plik}: HTTP ${odpowiedz.status}`)
        return odpowiedz
      }),
    )
    const cache = await caches.open(CACHE)
    try {
      await Promise.all(PLIKI.map((plik, i) => cache.put(new Request(plik), odpowiedzi[i])))
    } catch (blad) {
      // Niepelny cache tej wersji nie moze zostac: nazwa jest unikalna dla wersji, wiec usuwamy tylko jego.
      await caches.delete(CACHE)
      throw blad
    }
  }

  self.addEventListener('install', (zdarzenie) => {
    zdarzenie.waitUntil(zainstaluj())
  })

  self.addEventListener('activate', (zdarzenie) => {
    zdarzenie.waitUntil(
      caches
        .keys()
        .then((nazwy) => Promise.all(nazwy.filter((n) => n.startsWith('mmf-') && n !== CACHE).map((n) => caches.delete(n))))
        .then(() => self.clients.claim()),
    )
  })

  const zCache = (zadanie) => caches.open(CACHE).then((cache) => cache.match(zadanie, { ignoreSearch: true }))

  // Safari odrzuca nawigacje obsluzona odpowiedzia z flaga przekierowania (hosting moze zamienic index.html na /).
  async function bezPrzekierowania(odpowiedz) {
    if (!odpowiedz.redirected) return odpowiedz
    const tresc = await odpowiedz.blob()
    return new Response(tresc, { status: odpowiedz.status, statusText: odpowiedz.statusText, headers: odpowiedz.headers })
  }

  // Zawsze najpierw cache, siec tylko gdy pliku w nim nie ma. Dzieki temu odswiezenie bez sieci dziala.
  self.addEventListener('fetch', (zdarzenie) => {
    const zadanie = zdarzenie.request
    if (zadanie.method !== 'GET') return
    if (new URL(zadanie.url).origin !== self.location.origin) return
    if (zadanie.mode === 'navigate') {
      zdarzenie.respondWith(zCache('./index.html').then((odp) => (odp ? bezPrzekierowania(odp) : fetch(zadanie))))
      return
    }
    zdarzenie.respondWith(zCache(zadanie).then((odp) => odp || fetch(zadanie)))
  })

  self.addEventListener('message', (zdarzenie) => {
    if (zdarzenie.data === 'status') {
      const port = zdarzenie.ports[0]
      zdarzenie.waitUntil(
        caches
          .open(CACHE)
          .then((cache) => Promise.all(PLIKI.map((plik) => cache.match(plik, { ignoreSearch: true }))))
          .then((wyniki) => port?.postMessage({ wersja: WERSJA, pliki: PLIKI.length, zapisane: wyniki.filter(Boolean).length })),
      )
    } else if (zdarzenie.data === 'aktualizuj') {
      self.skipWaiting()
    }
  })
})()
