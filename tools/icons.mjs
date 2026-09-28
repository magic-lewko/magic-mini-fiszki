// App PNG icons without libraries: our own PNG encoder (deflate from node:zlib + crc32).
// A dark background, two overlapping rounded cards: grey at the back, green at the front, shifted.
// Run: node tools/icons.mjs  (the result goes to src/public/)

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'public')
const SIZES = [180, 192, 512]

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, sum])
}

// RGBA 8 bit, no row filters (filter byte 0), everything in one IDAT.
export function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const row = width * 4
  const raw = Buffer.alloc((row + 1) * height)
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (row + 1) + 1, y * row, (y + 1) * row)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// The signed distance from a turned rectangle with rounded corners (negative inside), in pixels.
function distance(x, y, p) {
  const dx = x - p.x
  const dy = y - p.y
  const cos = Math.cos(-p.angle)
  const sin = Math.sin(-p.angle)
  const px = dx * cos - dy * sin
  const py = dx * sin + dy * cos
  const qx = Math.abs(px) - p.w / 2 + p.r
  const qy = Math.abs(py) - p.h / 2 + p.r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - p.r
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

function icon(s) {
  const background = hex('#0b0b10')
  const degrees = (d) => (d * Math.PI) / 180
  const back = { x: 0.57 * s, y: 0.43 * s, w: 0.44 * s, h: 0.58 * s, r: 0.07 * s, angle: degrees(9), color: hex('#3b3b4a') }
  const front = { x: 0.44 * s, y: 0.56 * s, w: 0.44 * s, h: 0.58 * s, r: 0.07 * s, angle: degrees(-5), color: hex('#22c55e') }
  // An outline in the background color separates the cards where they overlap.
  const outline = { ...front, w: front.w + 0.05 * s, h: front.h + 0.05 * s, r: front.r + 0.025 * s, color: background }
  const bar = (dy, width, height, color) => {
    const cos = Math.cos(front.angle)
    const sin = Math.sin(front.angle)
    const ox = -0.06 * s + (width * s - 0.3 * s) / 2
    return { x: front.x + ox * cos - dy * s * sin, y: front.y + ox * sin + dy * s * cos, w: width * s, h: height * s, r: (height * s) / 2, angle: front.angle, color }
  }
  const layers = [back, outline, front, bar(-0.08, 0.26, 0.07, hex('#f2fff6')), bar(0.06, 0.18, 0.045, hex('#15803d'))]

  const rgba = Buffer.alloc(s * s * 4)
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let [r, g, b] = background
      for (const layer of layers) {
        const cover = Math.min(Math.max(0.5 - distance(x + 0.5, y + 0.5, layer), 0), 1)
        if (cover === 0) continue
        r += (layer.color[0] - r) * cover
        g += (layer.color[1] - g) * cover
        b += (layer.color[2] - b) * cover
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

for (const s of SIZES) {
  const file = join(PUBLIC, `icon-${s}.png`)
  const data = icon(s)
  writeFileSync(file, data)
  console.log(`${file} (${data.length} B)`)
}
