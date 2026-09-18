// Ikony PNG aplikacji bez bibliotek: wlasny koder PNG (deflate z node:zlib + crc32).
// Ciemne tlo, dwie nalozone zaokraglone karty: szara z tylu, zielona z przodu, przesuniete.
// Uruchomienie: node narzedzia/ikony.mjs  (wynik w zrodlo/)

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ZRODLO = join(dirname(fileURLToPath(import.meta.url)), '..', 'zrodlo')
const ROZMIARY = [180, 192, 512]

const TABLICA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32(bufor) {
  let c = 0xffffffff
  for (const bajt of bufor) c = TABLICA_CRC[(c ^ bajt) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function kawalek(typ, dane) {
  const dlugosc = Buffer.alloc(4)
  dlugosc.writeUInt32BE(dane.length)
  const tresc = Buffer.concat([Buffer.from(typ, 'ascii'), dane])
  const suma = Buffer.alloc(4)
  suma.writeUInt32BE(crc32(tresc))
  return Buffer.concat([dlugosc, tresc, suma])
}

// RGBA 8 bitow, bez filtrow wierszy (bajt filtra 0), wszystko w jednym IDAT.
export function png(szerokosc, wysokosc, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(szerokosc, 0)
  ihdr.writeUInt32BE(wysokosc, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const wiersz = szerokosc * 4
  const surowe = Buffer.alloc((wiersz + 1) * wysokosc)
  for (let y = 0; y < wysokosc; y++) rgba.copy(surowe, y * (wiersz + 1) + 1, y * wiersz, (y + 1) * wiersz)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    kawalek('IHDR', ihdr),
    kawalek('IDAT', deflateSync(surowe, { level: 9 })),
    kawalek('IEND', Buffer.alloc(0)),
  ])
}

// Odleglosc ze znakiem od obroconego prostokata z zaokraglonymi rogami (ujemna w srodku), w pikselach.
function odleglosc(x, y, p) {
  const dx = x - p.x
  const dy = y - p.y
  const cos = Math.cos(-p.kat)
  const sin = Math.sin(-p.kat)
  const px = dx * cos - dy * sin
  const py = dx * sin + dy * cos
  const qx = Math.abs(px) - p.w / 2 + p.r
  const qy = Math.abs(py) - p.h / 2 + p.r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - p.r
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

function ikona(s) {
  const tlo = hex('#0b0b10')
  const stopnie = (st) => (st * Math.PI) / 180
  const tyl = { x: 0.57 * s, y: 0.43 * s, w: 0.44 * s, h: 0.58 * s, r: 0.07 * s, kat: stopnie(9), kolor: hex('#3b3b4a') }
  const przod = { x: 0.44 * s, y: 0.56 * s, w: 0.44 * s, h: 0.58 * s, r: 0.07 * s, kat: stopnie(-5), kolor: hex('#22c55e') }
  // Obwodka w kolorze tla oddziela karty, gdy na siebie nachodza.
  const obwodka = { ...przod, w: przod.w + 0.05 * s, h: przod.h + 0.05 * s, r: przod.r + 0.025 * s, kolor: tlo }
  const pasek = (dy, szer, wys, kolor) => {
    const cos = Math.cos(przod.kat)
    const sin = Math.sin(przod.kat)
    const ox = -0.06 * s + (szer * s - 0.3 * s) / 2
    return { x: przod.x + ox * cos - dy * s * sin, y: przod.y + ox * sin + dy * s * cos, w: szer * s, h: wys * s, r: (wys * s) / 2, kat: przod.kat, kolor }
  }
  const warstwy = [tyl, obwodka, przod, pasek(-0.08, 0.26, 0.07, hex('#f2fff6')), pasek(0.06, 0.18, 0.045, hex('#15803d'))]

  const rgba = Buffer.alloc(s * s * 4)
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let [r, g, b] = tlo
      for (const w of warstwy) {
        const pokrycie = Math.min(Math.max(0.5 - odleglosc(x + 0.5, y + 0.5, w), 0), 1)
        if (pokrycie === 0) continue
        r += (w.kolor[0] - r) * pokrycie
        g += (w.kolor[1] - g) * pokrycie
        b += (w.kolor[2] - b) * pokrycie
      }
      const i = (y * s + x) * 4
      rgba[i] = Math.round(r)
      rgba[i + 1] = Math.round(g)
      rgba[i + 2] = Math.round(b)
      rgba[i + 3] = 255
    }
  }
  return png(s, s, rgba)
}

for (const s of ROZMIARY) {
  const plik = join(ZRODLO, `ikona-${s}.png`)
  const dane = ikona(s)
  writeFileSync(plik, dane)
  console.log(`${plik} (${dane.length} B)`)
}
