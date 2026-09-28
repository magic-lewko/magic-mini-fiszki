// A small static server for dist/ to check the app on a computer: http://127.0.0.1:4200
// The app is built for GitHub Pages under /magic-mini-fiszki/ (base in vite.config.js), so the root address
// redirects there. Other paths without the folder prefix are served too, like dist/ itself.
// Run: node build.mjs && node server.mjs

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), 'dist')
const PORT = Number(process.env.PORT) || 4200
const FOLDER = '/magic-mini-fiszki'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
}

function respond(res, code, body, headers = {}) {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', ...headers })
  res.end(body)
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return respond(res, 405, 'Only GET and HEAD')
  let path
  try {
    path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
  } catch {
    return respond(res, 400, 'Invalid address')
  }
  // The page and the service worker live under the folder, as on GitHub Pages: there the offline mode works.
  if (path === '/' || path === '/index.html') return respond(res, 302, '', { location: `${FOLDER}/` })
  // Without the trailing slash relative paths (./sw.js) would point one folder up.
  if (path === FOLDER) return respond(res, 301, '', { location: `${FOLDER}/` })
  if (path.startsWith(`${FOLDER}/`)) path = path.slice(FOLDER.length)
  if (path.endsWith('/')) path += 'index.html'

  const file = normalize(join(DIST, path))
  if (!file.startsWith(DIST + sep)) return respond(res, 403, 'Outside the dist/ folder')
  try {
    const info = await stat(file).catch(() => null)
    if (!info?.isFile()) return respond(res, 404, 'No such file')
    const body = await readFile(file)
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch (error) {
    respond(res, 500, error.message || 'Server error')
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`flashcards: http://127.0.0.1:${PORT}/  (the app: http://127.0.0.1:${PORT}${FOLDER}/)`)
})
