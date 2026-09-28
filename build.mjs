// Builds dist/: Vite puts the app together (Svelte, src/ and lib/fsrs.mjs) into files with a hash in the name, and then
// this script adds the service worker with the full list of files. VERSION is the start of a sha256 of the content of
// all files, so every change gives a new cache and the update banner.
// Words are not in dist/: the user adds them in the app (paste or file), they go to IndexedDB.
// Run: node build.mjs (needs npm install first)

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const SRC = join(ROOT, 'src')
const PUBLIC = join(SRC, 'public')
const DIST = join(ROOT, 'dist')
const REQUIRED = [join(SRC, 'index.html'), join(SRC, 'main.js'), join(PUBLIC, 'manifest.webmanifest'), ...[180, 192, 512].map((n) => join(PUBLIC, `icon-${n}.png`))]
// Files in dist/ that the service worker does not cache: itself and the marker for GitHub Pages.
const NOT_CACHED = new Set(['sw.js', '.nojekyll'])
// Vite gives addresses from the base (see vite.config.js).
const BASE_RE = /^\/magic-mini-fiszki\//

// The service worker. In Node this function is never called: its text goes to dist/sw.js after the constants
// VERSION and FILES.
function worker() {
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
}

async function build() {
  for (const file of REQUIRED) {
    if (!existsSync(file)) {
      const tip = file.endsWith('.png') ? ' Run: node tools/icons.mjs' : ''
      throw new Error(`Missing ${relative(ROOT, file).split(sep).join('/')}.${tip}`)
    }
  }
  if (existsSync(join(PUBLIC, 'sw.js'))) throw new Error('src/public/sw.js collides with the file made by the build')

  let vite
  try {
    vite = await import('vite')
  } catch {
    throw new Error('Vite is missing. Run first: npm install')
  }
  await vite.build({ configFile: join(ROOT, 'vite.config.js'), logLevel: 'warn' })
  // Without this file GitHub Pages runs the page through Jekyll.
  writeFileSync(join(DIST, '.nojekyll'), '')

  const all = listFiles(DIST).filter((n) => !NOT_CACHED.has(n))
  checkReferences(all)

  const hash = createHash('sha256')
  // The service worker text also goes into the version: a change of the template alone with the same cache name
  // would install into the cache of the active version.
  hash.update(worker.toString())
  for (const n of all) {
    hash.update(n + '\0')
    hash.update(readFileSync(join(DIST, n)))
  }
  const version = hash.digest('hex').slice(0, 12)
  const files = ['./', './index.html', ...all.filter((n) => n !== 'index.html').map((n) => './' + n)]

  const sw = [
    '// Made by build.mjs. Do not edit by hand.',
    `const VERSION = '${version}'`,
    `const FILES = ${JSON.stringify(files, null, 2).replaceAll('"', "'")}`,
    '',
    `;(${worker.toString()})()`,
    '',
  ].join('\n')
  writeFileSync(join(DIST, 'sw.js'), sw)

  const bytes = all.reduce((sum, n) => sum + statSync(join(DIST, n)).size, 0)
  console.log(`dist/ ready: version ${version}, ${files.length} entries in FILES, ${(bytes / 1024).toFixed(1)} KB`)
  for (const f of files) console.log(`  ${f}`)
}

// All files in a folder (with subfolders), as paths with a slash, sorted.
function listFiles(folder, prefix = '') {
  const result = []
  for (const name of readdirSync(folder)) {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) result.push(...listFiles(path, `${prefix}${name}/`))
    else result.push(prefix + name)
  }
  return result.sort()
}

// A file the app refers to, which is not in dist/, would break offline mode only on the phone.
// Vite gives addresses from the base (/magic-mini-fiszki/...), the manifest has relative addresses (./...).
function checkReferences(names) {
  const missing = []
  const check = (from, target) => {
    const clean = target.replace(BASE_RE, '').replace(/^\.\//, '').split(/[?#]/)[0]
    if (clean && !names.includes(clean)) missing.push(`${from} -> ${target}`)
  }
  const html = readFileSync(join(DIST, 'index.html'), 'utf8')
  for (const [, target] of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
    if (/^(https?:)?\/\//.test(target)) {
      missing.push(`index.html -> ${target} (a file from outside the app does not work offline)`)
      continue
    }
    check('index.html', target)
  }
  if (!/<script type="module"[^>]*src="[^"]+\.js"/.test(html)) missing.push('index.html -> no app module')
  for (const icon of JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8')).icons || []) {
    check('manifest.webmanifest', icon.src)
  }
  // Assets and dynamic imports in JS and CSS bundles given from the base.
  for (const n of names.filter((x) => /\.(js|css)$/.test(x))) {
    const content = readFileSync(join(DIST, n), 'utf8')
    for (const [, target] of content.matchAll(/["'(](\/magic-mini-fiszki\/[^"')]+)["')]/g)) check(n, target)
  }
  if (missing.length) throw new Error(`References to files that are not in dist/:\n${missing.join('\n')}`)
}

try {
  await build()
} catch (error) {
  console.error(`Build failed: ${error.message}`)
  process.exit(1)
}
