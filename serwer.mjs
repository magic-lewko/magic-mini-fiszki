// Maly serwer statyczny dist/ do sprawdzenia apki na komputerze: http://127.0.0.1:4200
// Pod /magic-mini-fiszki/ podaje to samo, zeby przetestowac podkatalog jak na GitHub Pages.
// Uruchomienie: node zbuduj.mjs && node serwer.mjs

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), 'dist')
const PORT = Number(process.env.PORT) || 4200
const PODKATALOG = '/magic-mini-fiszki'

const TYPY = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
}

function odpowiedz(res, kod, tresc, naglowki = {}) {
  res.writeHead(kod, { 'content-type': 'text/plain; charset=utf-8', ...naglowki })
  res.end(tresc)
}

const serwer = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return odpowiedz(res, 405, 'Tylko GET i HEAD')
  let sciezka
  try {
    sciezka = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
  } catch {
    return odpowiedz(res, 400, 'Niepoprawny adres')
  }
  // Bez koncowego ukosnika sciezki wzgledne (./app.js) wskazywalyby katalog wyzej.
  if (sciezka === PODKATALOG) return odpowiedz(res, 301, '', { location: `${PODKATALOG}/` })
  if (sciezka.startsWith(`${PODKATALOG}/`)) sciezka = sciezka.slice(PODKATALOG.length)
  if (sciezka.endsWith('/')) sciezka += 'index.html'

  const plik = normalize(join(DIST, sciezka))
  if (!plik.startsWith(DIST + sep)) return odpowiedz(res, 403, 'Poza katalogiem dist/')
  try {
    const info = await stat(plik).catch(() => null)
    if (!info?.isFile()) return odpowiedz(res, 404, 'Nie ma takiego pliku')
    const tresc = await readFile(plik)
    res.writeHead(200, {
      'content-type': TYPY[extname(plik)] || 'application/octet-stream',
      'content-length': tresc.length,
      'cache-control': 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : tresc)
  } catch (blad) {
    odpowiedz(res, 500, blad.message || 'Blad serwera')
  }
})

serwer.listen(PORT, '127.0.0.1', () => {
  console.log(`fiszki: http://127.0.0.1:${PORT}/  (podkatalog: http://127.0.0.1:${PORT}${PODKATALOG}/)`)
})
