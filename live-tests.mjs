// A test on the live GitHub Pages in headless Chrome: offline install, import of the full Oxford 3000 deck,
// a grade, cutting the network in the page and in the service worker, a reload.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const WORK = process.env.MMF_WORK_DIR || join(tmpdir(), 'mmf-tests')
const PROFILE = join(tmpdir(), 'mmf-live')
const CDP = 9344
const APP_URL = process.env.MMF_URL || 'https://magic-lewko.github.io/magic-mini-fiszki/'
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const DECK = process.env.MMF_DECK || join(ROOT, 'talie', 'oxford3000.json')

for (const [what, path] of [
  ['Chrome', CHROME],
  ['the Oxford 3000 deck', DECK],
]) {
  if (existsSync(path)) continue
  console.error(`Missing ${what}: ${path}`)
  process.exit(1)
}
mkdirSync(WORK, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(label, condition, details = '') {
  results.push(!!condition)
  console.log(`${condition ? 'OK  ' : 'FAIL'} ${label}${details ? ' :: ' + details : ''}`)
}

rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(CHROME, [`--remote-debugging-port=${CDP}`, `--user-data-dir=${PROFILE}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' })
for (let i = 0; i < 100; i++) {
  try {
    await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json()
    break
  } catch {
    await wait(100)
  }
}
const browser = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json()
const ws = new WebSocket(browser.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

let nr = 0
const pending = new Map()
const consoleErrors = []
const fromSw = { yes: 0, no: [] }
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    if (m.error) reject(new Error(m.error.message))
    else resolve(m.result)
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
  } else if (m.method === 'Network.responseReceived' && fromSw.counting) {
    if (m.params.response.fromServiceWorker) fromSw.yes += 1
    else fromSw.no.push(m.params.response.url)
  }
}
// session: the page or the service worker (flatten), without a session: the whole browser
const cdp = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nr
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: page } = await cdp('Target.attachToTarget', { targetId, flatten: true })
const p = (method, params) => cdp(method, params, page)
async function js(expression) {
  const r = await p('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
async function waitFor(expression, ms = 15000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if (await js(expression)) return true
    } catch {
      // the page is reloading
    }
    await wait(150)
  }
  return false
}
// A swipe in the given direction: the same touch events as on the phone.
async function drag(selector, dx, dy, steps = 10) {
  const { x, y } = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 40 } })()`)
  await p('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= steps; i++) {
    await wait(16)
    await p('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }] })
  }
  await p('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

// The gesture tutorial shows once after install and covers the whole card. A tap on the overlay closes it
// (there is no button for it), so without this step every next touch hits the tutorial, not the card.
async function closeTutorial() {
  if (await js(`!document.getElementById('tutorial') || document.getElementById('tutorial').hidden`)) return false
  await tap('#tutorial')
  await waitFor(`document.getElementById('tutorial').hidden`, 3000)
  // The app swallows the click for 400 ms after closing the tutorial (so the tap does not reveal the card).
  await wait(450)
  return true
}

async function tap(selector, top = false) {
  const { x, y } = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: ${top ? 'r.top + 30' : 'r.top + r.height / 2'} } })()`)
  await p('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await p('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
const xp = async () => JSON.parse((await js(`localStorage.getItem('mmf-v1')`)) || '{}').exp ?? 0
const swStatus = () => js(`new Promise((ok) => { const k = new MessageChannel(); k.port1.onmessage = (e) => ok(e.data); navigator.serviceWorker.controller.postMessage('status', [k.port2]) })`)
const deckLength = () =>
  js(`new Promise((ok, no) => { const r = indexedDB.open('mmf'); r.onerror = () => no(r.error); r.onsuccess = () => { const g = r.result.transaction('dane').objectStore('dane').get('talia'); g.onsuccess = () => { ok(g.result?.slowa?.length ?? 0); r.result.close() } } })`)
const OFFLINE = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }

try {
  await p('Page.enable')
  await p('Runtime.enable')
  await p('Network.enable')
  await p('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
  await p('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await p('Page.navigate', { url: APP_URL })

  check('the app starts from GitHub Pages', await waitFor(`document.documentElement.dataset.ready === '1'`, 20000))
  await closeTutorial()
  check('the service worker takes over the page', await waitFor(`!!navigator.serviceWorker.controller`, 30000))
  check('badge "offline ✓"', await waitFor(`document.getElementById('offline').textContent === 'offline ✓'`, 20000), await js(`document.getElementById('offline').textContent`))
  const status = await swStatus()
  check('all files in the cache', status.saved === status.files, JSON.stringify(status))

  // import of the full deck
  const { root } = await p('DOM.getDocument', { depth: 1 })
  const { nodeId } = await p('DOM.querySelector', { nodeId: root.nodeId, selector: '#words-file' })
  let t0 = Date.now()
  await p('DOM.setFileInputFiles', { nodeId, files: [DECK.replaceAll('/', '\\')] })
  check('deck preview: 2981 new, 0 errors', await waitFor(`document.querySelector('#preview .summary')?.textContent.startsWith('2981 new')`), await js(`document.getElementById('preview').innerText.slice(0, 200)`))
  const previewTime = Date.now() - t0
  t0 = Date.now()
  await tap('#add-words-button')
  check('after adding the deck the app shows a card or the home screen', await waitFor(`!!document.getElementById('card') || /Reviews/.test(document.getElementById('stage').innerText)`, 20000))
  await closeTutorial()
  // The app goes straight to a card, and when it shows the home screen, we start with the "Reviews" button.
  await js(`[...document.querySelectorAll('#stage button')].find((b) => /Reviews/.test(b.textContent))?.click()`)
  check('a card after adding the deck', await waitFor(`!!document.getElementById('card')`, 20000))
  console.log(`     time: preview ${previewTime} ms, adding ${Date.now() - t0} ms`)
  check('IndexedDB: 2981 words', (await deckLength()) === 2981)
  const first = await js(`document.querySelector('#card .word')?.textContent`)
  check('first card = first word of the deck (test)', first === 'test', first)
  writeFileSync(join(WORK, 'live-card.png'), Buffer.from((await p('Page.captureScreenshot', { format: 'png' })).data, 'base64'))

  // The tutorial comes only with the first card, so we close it here, not earlier.
  await closeTutorial()
  // A card that is still entering moves, so a tap on it can miss.
  await waitFor(`!document.getElementById('card').classList.contains('entering')`, 3000)
  await tap('#card', true)
  check('a tap reveals the card', await waitFor(`document.getElementById('card').classList.contains('revealed')`, 3000), await js(`document.getElementById('card').className`))
  const back = await js(`document.getElementById('card').innerText`)
  check('the back of the card: the translation with the example sentence', back.includes('sprawdzian') && back.includes('angielskiego'), back.replace(/\n+/g, ' | '))
  check('four grade buttons under the card', (await js(`[...document.querySelectorAll('.grade-buttons button')].map((b) => b.id).join(',')`)) === 'grade-discard,grade-no,grade-almost,grade-yes')
  // A grade by a swipe to the right (the buttons do the same).
  // The grade must come within 8 s from revealing, otherwise the app rightly counts it as "Almost".
  await drag('#card', 170, 0)
  writeFileSync(join(WORK, 'live-back.png'), Buffer.from((await p('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  check('a swipe right = Know, +50 XP', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1') || '{}').exp === 50`), await xp())

  // cutting the network: the page and the service worker
  await p('Network.emulateNetworkConditions', OFFLINE)
  // A sleeping service worker is not listed as a target: a message wakes it up.
  await swStatus()
  const { targetInfos } = await cdp('Target.getTargets')
  const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(APP_URL))
  check('service worker target found', !!sw, sw?.url)
  const { sessionId: swSession } = await cdp('Target.attachToTarget', { targetId: sw.targetId, flatten: true })
  await cdp('Network.enable', {}, swSession)
  await cdp('Network.emulateNetworkConditions', OFFLINE, swSession)
  await cdp('Runtime.runIfWaitingForDebugger', {}, swSession).catch(() => {})
  const networkCut = await js(`fetch('${APP_URL}no-such-file-${Date.now()}.txt').then(() => false, () => true)`)
  check('the network is really cut (a fetch outside the cache fails)', networkCut)

  fromSw.counting = true
  await js(`window.__old = 1`)
  await p('Page.reload', {})
  check('offline: reload works', await waitFor(`!window.__old && document.documentElement.dataset.ready === '1'`, 20000))
  check('offline: XP kept', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1') || '{}').exp === 50`), await xp())
  check('offline: deck of 2981 words in IndexedDB', (await deckLength()) === 2981)
  check('offline: a card or the home screen', await waitFor(`!!document.getElementById('card') || !!document.getElementById('play-reviews')`))
  check('offline: all files from the service worker', fromSw.no.length === 0, `from SW: ${fromSw.yes}, from network: ${fromSw.no.join(', ') || 'none'}`)
  check('no JS errors', consoleErrors.length === 0, consoleErrors.join(' | '))
} catch (error) {
  check('test stopped', false, error.message)
} finally {
  const ok = results.filter(Boolean).length
  console.log(`\nRESULT: ${ok}/${results.length} OK`)
  ws.close()
  chrome.kill()
  await wait(800)
  rmSync(PROFILE, { recursive: true, force: true })
  process.exit(ok === results.length ? 0 : 1)
}
