// A smoke test of the app in real Chrome (headless) through CDP. The app is driven by swipes.
// It checks file import, the start straight on a card, the gesture tutorial, swipes in four directions
// (Input.dispatchTouchEvent), a double tap as undo, no buttons and no menu on the study screen,
// the progress bar without digits, the border that changes color with the answer time, the quiet lowering of a grade
// after 8 s, the home screen with three buttons, both games from start to result, decks (on, off,
// add and remove), prefers-reduced-motion, no sideways scrolling, offline,
// service worker updates and the backup, and at the end the engine: review cap and order by urgency, catch-up
// mode, streak with freezes, hint after 7 s, interference, leech and the badge on the icon.
// It works on a copy of dist/ in a work folder outside the repo.
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
// The work folder keeps a copy of dist/, the Chrome profile and screenshots. It is outside the repo, because Chrome on
// Windows does not create CacheStorage with a profile path longer than MAX_PATH, and without CacheStorage there is
// nothing to test.
const WORK = process.env.MMF_WORK_DIR || join(tmpdir(), 'mmf-tests')
const SITE = join(WORK, 'site')
const PROFILE = process.env.MMF_PROFILE || join(WORK, 'chrome-profile')
const PORT = 4211
const CDP = 9333
const APP_URL = `http://127.0.0.1:${PORT}/magic-mini-fiszki/`
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EXAMPLE = join(ROOT, 'data', 'example.json')
// Engine scenarios (interference, review cap, leeches) need a big deck, and it stays local.
const OXFORD = process.env.MMF_DECK || join(ROOT, 'talie', 'oxford3000.json')
const N = JSON.parse(readFileSync(EXAMPLE, 'utf8')).slowa.length

for (const [what, path] of [
  ['Chrome', CHROME],
  ['the built app - run "npm run build"', join(ROOT, 'dist')],
  ['the Oxford 3000 deck - take it from a backup or build it with talie/zrodla', OXFORD],
]) {
  if (existsSync(path)) continue
  console.error(`Missing ${what}: ${path}`)
  process.exit(1)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(label, condition, details = '') {
  results.push({ label, ok: !!condition })
  console.log(`${condition ? 'OK  ' : 'FAIL'} ${label}${details ? ' :: ' + details : ''}`)
}

rmSync(SITE, { recursive: true, force: true })
rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(SITE, { recursive: true })
cpSync(join(ROOT, 'dist'), join(SITE, 'dist'), { recursive: true })
cpSync(join(ROOT, 'server.mjs'), join(SITE, 'server.mjs'))

let server
async function startServer() {
  server = spawn(process.execPath, [join(SITE, 'server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(APP_URL)
      return
    } catch {
      await wait(100)
    }
  }
  throw new Error('the server did not start')
}
async function stopServer() {
  server.kill()
  await wait(400)
}

const chrome = spawn(CHROME, [`--remote-debugging-port=${CDP}`, `--user-data-dir=${PROFILE}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' })
for (let i = 0; i < 100; i++) {
  try {
    await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json()
    break
  } catch {
    await wait(100)
  }
}
const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
let nr = 0
const pending = new Map()
const consoleErrors = []
const log = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    if (m.error) reject(new Error(m.error.message))
    else resolve(m.result)
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
  } else if (m.method === 'Log.entryAdded') {
    log.push(`${m.params.entry.level} ${m.params.entry.source}: ${m.params.entry.text} ${m.params.entry.url || ''}`)
  } else if (m.method === 'ServiceWorker.workerErrorReported') {
    log.push(`SW error: ${JSON.stringify(m.params.errorMessage)}`)
  } else if (m.method === 'ServiceWorker.workerVersionUpdated') {
    for (const v of m.params.versions) log.push(`SW version ${v.versionId}: ${v.runningStatus} / ${v.status} ${v.scriptURL}`)
  }
}
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nr
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
async function js(expression) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
async function waitFor(expression, ms = 10000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if (await js(expression)) return true
    } catch {
      // the page is reloading
    }
    await wait(100)
  }
  return false
}
async function screenshot(name) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(WORK, `screenshot-${name}.png`), Buffer.from(data, 'base64'))
}
async function point(selector, top = false) {
  return js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: ${top ? 'r.top + 40' : 'r.top + r.height / 2'} } })()`)
}
async function tap(selector, top = false) {
  const { x, y } = await point(selector, top)
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
// A double tap: both within the 280 ms window, without counting the point a second time (that costs dozens of ms).
async function doubleTap(selector) {
  const { x, y } = await point(selector, true)
  for (let i = 0; i < 2; i++) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    if (i === 0) await wait(60)
  }
}
// A swipe in any direction. It returns a function that lets the finger go, so a screenshot can be taken during the swipe.
async function hold(selector, dx, dy, steps = 8, pause = 16) {
  const { x, y } = await point(selector, true)
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= steps; i++) {
    await wait(pause)
    await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }] })
  }
  // Letting the finger go. A given offset first moves the finger to that place (counted from the start point,
  // not from the moved card), so you can go back under the threshold and check the card was not graded.
  return async (endDx, endDy) => {
    if (endDx !== undefined) {
      await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + endDx, y: y + endDy }] })
      await wait(40)
    }
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
}
async function drag(selector, dx, dy, steps = 8, pause = 16) {
  const letGo = await hold(selector, dx, dy, steps, pause)
  await letGo()
}
// Swipes as direction names: thresholds are 90 px horizontally and 80 px vertically, so we take them with a margin.
const SWIPES = { right: [170, 0], left: [-170, 0], up: [0, -150], down: [0, 150] }
const swipe = (direction) => drag('#card', ...SWIPES[direction])
async function key(k) {
  const code = { ' ': 'Space', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' }[k] || k
  const codes = { ' ': 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: codes[k], text: k === ' ' ? ' ' : undefined })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: codes[k] })
}
async function fileToInput(selector, path) {
  const { root } = await cdp('DOM.getDocument', { depth: 1 })
  const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector })
  await cdp('DOM.setFileInputFiles', { nodeId, files: [path.replaceAll('/', '\\')] })
}
const saved = async () => JSON.parse((await js(`localStorage.getItem('mmf-v1')`)) || '{}')
// The field "exp" stayed in the save for compatibility with an older phone; the app does not show it anywhere,
// but in the test it is the simplest way to check which grade was really saved.
const xp = async () => (await saved()).exp ?? 0
const cardWord = () => js(`document.querySelector('#card .word')?.textContent`)
const stageText = () => js(`document.getElementById('stage').innerText`)
const menuText = () => js(`document.getElementById('menu').innerText`)
const toastText = () => js(`document.getElementById('toast').textContent`)
const noteText = () => js(`document.getElementById('note').hidden ? '' : document.getElementById('note').textContent`)
const swStatus = () => js(`new Promise((ok) => { const k = new MessageChannel(); k.port1.onmessage = (e) => ok(e.data); navigator.serviceWorker.controller.postMessage('status', [k.port2]) })`)
const library = () =>
  js(`new Promise((ok, no) => { const r = indexedDB.open('mmf'); r.onerror = () => no(r.error); r.onsuccess = () => { const g = r.result.transaction('dane').objectStore('dane').get('talia'); g.onsuccess = () => { ok(g.result); r.result.close() } } })`)
const clickByText = (where, text) => js(`[...document.querySelectorAll(${JSON.stringify(where)} + ' button')].find((b) => b.textContent === ${JSON.stringify(text)}).click()`)
// The menu is hidden on the study screen (B), so to read stats during a session we open it
// by script. The table of numbers is under "Details", so we open it before reading.
async function openMenu() {
  if (!(await js(`document.getElementById('menu').hidden`))) return
  await js(`document.getElementById('menu-button').click(); 1`)
  await waitFor(`!document.getElementById('menu').hidden`)
  await wait(250)
  await js(`(() => { const d = document.getElementById('stats-details'); if (d) d.open = true })(); 1`)
  await wait(120)
}
async function menuHas(name, value) {
  const wasOpen = !(await js(`document.getElementById('menu').hidden`))
  await openMenu()
  const text = (await menuText()).replaceAll('\u00a0', ' ')
  if (!wasOpen) {
    await js(`document.querySelector('#menu .close')?.click(); 1`)
    await wait(150)
  }
  return text.includes(`${name}\n${value}`)
}
// Does the screen content fit without scrolling (the app is meant to be one screen).
const fits = (selector) => js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return !e || e.scrollHeight <= e.clientHeight + 1 })()`)

// Returns the names of elements that scroll sideways. An empty text means none does.
const scrollsSideways = () =>
  js(`(() => {
    const candidates = [
      document.documentElement,
      document.body,
      document.getElementById('stage'),
      document.getElementById('card'),
      ...document.querySelectorAll('#stage .screen, .sheet-body, .stats, .home-buttons, .tutorial-grid, .rule, .anchor-options'),
    ]
    return candidates
      .filter(Boolean)
      .filter((e) => e.scrollWidth > e.clientWidth + 1)
      .map((e) => e.className || e.tagName)
      .join(', ')
  })()`)

// Visible buttons at the top and bottom of the study screen. Hidden buttons for the screen reader have the class
// "sr-only" and do not count as visible.
const visibleButtons = () =>
  js(`[...document.querySelectorAll('.top button, #actions button')]
    .filter((b) => !b.hidden && !b.classList.contains('sr-only'))
    .map((b) => b.id || b.textContent)`)

const hiddenButtons = () => js(`[...document.querySelectorAll('#actions button.sr-only')].map((b) => b.textContent)`)

const cardBorder = () => js(`getComputedStyle(document.getElementById('card')).borderTopColor`)
const cardState = () =>
  js(`(() => { const k = document.getElementById('card'); return k ? k.className + ' :: ' + (k.querySelector('.word')?.textContent || '') : 'no card: ' + document.getElementById('stage').innerText.replace(/\\n+/g, ' | ') })()`)

// A preview of the fly-out animation without waiting for a real grade: the animation name says if it carries motion.
const flyOutProbe = (direction = 'right') =>
  js(`(() => {
    const d = document.createElement('div')
    d.className = 'card fly-out-${direction}'
    document.body.appendChild(d)
    const s = getComputedStyle(d)
    const r = { name: s.animationName, time: s.animationDuration }
    d.remove()
    return r
  })()`)

// The result sign lives only for the fly-out time (80 ms with reduced motion), so we catch it
// in the browser: with an observer and also with a short interval, because 80 ms is easy to miss from outside.
const watchResult = () =>
  js(`(() => {
    window.__result = null
    const remember = () => {
      const w = document.querySelector('#card .result')
      if (!w || window.__result) return
      const s = getComputedStyle(w)
      window.__result = { sign: w.textContent, color: s.color, time: s.animationDuration, classes: document.getElementById('card').className }
    }
    if (window.__obs) window.__obs.disconnect()
    window.__obs = new MutationObserver(remember)
    window.__obs.observe(document.body, { childList: true, subtree: true })
    clearInterval(window.__resultLoop)
    window.__resultLoop = setInterval(remember, 5)
    return 1
  })()`)

// The result sign on a sample, without racing the 80 ms fly-out: what counts is the color, the sign and no motion.
const resultProbe = (tone) =>
  js(`(() => {
    const k = document.createElement('div')
    k.className = 'card result-' + ${JSON.stringify(tone)}
    const w = document.createElement('div')
    w.className = 'result'
    w.textContent = 'x'
    k.appendChild(w)
    document.body.appendChild(k)
    const s = getComputedStyle(w)
    const r = { color: s.color, name: s.animationName, time: s.animationDuration, border: getComputedStyle(k).borderTopColor }
    k.remove()
    return r
  })()`)

const firstH3s = () => js(`[...document.querySelectorAll('#menu .section')].map((s) => s.querySelector('h3')?.textContent || '')`)

// Contrast by WCAG 2.1. The background comes from the first ancestor with an opaque fill.
const contrast = (selector) =>
  js(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)})
    if (!e) return null
    const numbers = (t) => (String(t).match(/[0-9.]+/g) || []).map(Number)
    const channel = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
    const lum = (k) => 0.2126 * channel(k[0]) + 0.7152 * channel(k[1]) + 0.0722 * channel(k[2])
    const color = numbers(getComputedStyle(e).color)
    let bg = null
    for (let w = e; w; w = w.parentElement) {
      const k = numbers(getComputedStyle(w).backgroundColor)
      if (k.length >= 3 && (k.length < 4 || k[3] > 0.95)) { bg = k; break }
    }
    if (!bg) return null
    const a = lum(color)
    const b = lum(bg)
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100
  })()`)

// After a grade the card flies out for 240 ms, so first we wait for a fresh (not yet revealed) card.
async function revealAndGrade(direction) {
  await waitFor(`!!document.getElementById('card') && !document.getElementById('card').classList.contains('revealed')`)
  await waitFor(`!document.getElementById('card').classList.contains('entering')`, 3000)
  await tap('#card', true)
  await waitFor(`document.getElementById('card').classList.contains('revealed')`)
  await wait(120)
  await swipe(direction)
}

// A fresh card is one that is neither revealed nor entering. Without this the test taps a card
// that is just flying out, and its events go away with the removed element.
const waitForFreshCard = (ms = 6000) =>
  waitFor(`!!document.getElementById('card') && !document.getElementById('card').classList.contains('revealed') && !document.getElementById('card').classList.contains('entering')`, ms)

async function closeTutorial() {
  if (await js(`document.getElementById('tutorial').hidden`)) return
  await tap('#tutorial')
  await waitFor(`document.getElementById('tutorial').hidden`, 3000)
  // The app swallows the click for 400 ms after closing the tutorial (so the tap does not reveal the card),
  // so the next click of the test must wait.
  await wait(450)
}

try {
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Log.enable')
  await cdp('ServiceWorker.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await startServer()
  await cdp('Page.navigate', { url: APP_URL })

  check('the app starts in the folder', await waitFor(`document.documentElement.dataset.ready === '1'`))
  const tookOver = await waitFor(`!!navigator.serviceWorker.controller`, 15000)
  check('the service worker takes over the page', tookOver)
  if (!tookOver) {
    console.log('registration:', await js(`navigator.serviceWorker.getRegistration().then((r) => r ? JSON.stringify({ scope: r.scope, active: r.active?.state, waiting: r.waiting?.state, installing: r.installing?.state }) : 'none')`))
    console.log('messages:', await js(`document.getElementById('messages').innerText`))
    console.log('console:', consoleErrors.join(' | '))
    console.log('log:\n' + log.join('\n'))
    throw new Error('the service worker did not take over the page')
  }
  check('badge "offline ✓"', await waitFor(`document.getElementById('offline').textContent === 'offline ✓'`), await js(`document.getElementById('offline').textContent`))
  const status = await swStatus()
  check('SW: all files in the cache', status.saved === status.files, JSON.stringify(status))
  check('SW: status also has the fields the Polish version reads', status.zapisane === status.saved && status.pliki === status.files && status.wersja === status.version, JSON.stringify(status))
  const cacheKeys = await js(`caches.open('mmf-${status.version}').then((c) => c.keys()).then((k) => k.map((r) => r.url))`)
  check('SW: cache keys without the ?v= parameter', cacheKeys.length === status.files && cacheKeys.every((u) => !u.includes('?')), cacheKeys.slice(0, 3).join(', '))
  check('an empty deck opens adding words', await waitFor(`!document.getElementById('add-words').hidden`))

  await fileToInput('#words-file', EXAMPLE)
  check('file preview before adding', await waitFor(`document.querySelector('#preview .summary')?.textContent.startsWith('${N} new')`), await js(`document.getElementById('preview').innerText`))
  check('preview without the text "false"', !(await js(`document.getElementById('preview').textContent`)).includes('false'))
  check('adding: deck name field with the name from the file', (await js(`document.getElementById('deck-name-input').value`)) === 'Przykład', await js(`document.getElementById('deck-name-input').value`))
  // The sheet slides in for 220 ms (animation "slide-up"), so a tap during it would miss the button.
  await wait(400)
  await tap('#add-words-button')

  // ---------------------------------------------------------------------------------------------
  // E: the home screen instead of a start screen
  // ---------------------------------------------------------------------------------------------
  check('after adding words the home screen', await waitFor(`!document.getElementById('card') && !!document.getElementById('play-reviews')`, 8000), (await stageText()).replace(/\n+/g, ' | '))
  check('deck in IndexedDB', (await library()).slowa.length === N)
  const home = await stageText()
  check(
    'home: deck bar with one number and three big buttons',
    /^\d+ \/ \d+$/.test(await js(`document.querySelector('.deck-count').textContent`)) &&
      (await js(`[...document.querySelectorAll('.home-buttons button')].map((b) => b.textContent).join(',')`)) === 'Reviews,Crossword,Letters',
    `${await js(`document.querySelector('.deck-count').textContent`)} :: ${await js(`[...document.querySelectorAll('.home-buttons button')].map((b) => b.textContent).join(',')`)}`,
  )
  check('home: the menu in the corner is visible', await js(`!document.getElementById('menu-button').hidden`))
  check('home: no rank, points or daily goal', !/rank|points|daily goal|solid/i.test(home), home.replace(/\n+/g, ' | '))
  check('home: fits without scrolling and does not scroll sideways', (await fits('#stage .screen')) && (await scrollsSideways()) === '', await scrollsSideways())
  await screenshot('home')
  check('home: both deck bars (top and big) have the same two parts', (await js(`document.querySelectorAll('.deck-track i').length`)) === 2 && (await js(`document.querySelectorAll('.deck-progress i').length`)) === 2)

  // Games take words due today, and when there are none, recently studied ones. A freshly added deck has
  // no studied word yet, so both games must say in one sentence what is missing.
  await clickByText('#stage', 'Crossword')
  check('home: crossword without studied words says in one sentence what is missing', await waitFor(`document.getElementById('toast').textContent.startsWith('Not enough words for a crossword')`), await toastText())
  await clickByText('#stage', 'Letters')
  check('home: letters without studied words say in one sentence what is missing', await waitFor(`document.getElementById('toast').textContent.startsWith('Not enough words for Letters')`), await toastText())

  await clickByText('#stage', 'Reviews')
  check('a card after going into reviews', await waitFor(`!!document.getElementById('card')`, 8000))

  // ---------------------------------------------------------------------------------------------
  // A: the gesture tutorial once after an update
  // ---------------------------------------------------------------------------------------------
  check('the gesture tutorial shows at the first card', await waitFor(`!document.getElementById('tutorial').hidden`, 5000))
  const tutorial = await js(`document.getElementById('tutorial').innerText`)
  check(
    'tutorial: four arrows with labels and a sentence about tapping',
    (await js(`document.querySelectorAll('#tutorial .tutorial-swipe').length`)) === 4 &&
      (await js(`[...document.querySelectorAll('#tutorial .tutorial-arrow')].map((e) => e.textContent).join('')`)) === '→←↑↓' &&
      tutorial.includes('Know') &&
      tutorial.includes("Don't know") &&
      tutorial.includes('Almost') &&
      tutorial.includes('Discard') &&
      tutorial.includes('double tap to undo') &&
      tutorial.includes('with the cross'),
    tutorial.replace(/\n+/g, ' | '),
  )
  check('tutorial: does not scroll sideways', (await scrollsSideways()) === '', await scrollsSideways())
  // The toast from the previous step goes away by itself after 3.5 s; the screenshot must show only the tutorial.
  await waitFor(`document.getElementById('toast').hidden`, 4000)
  await screenshot('tutorial')
  await tap('#tutorial')
  check(
    'the tutorial goes away after a tap and is saved in settings',
    (await waitFor(`document.getElementById('tutorial').hidden`, 3000)) && (await saved()).ustawienia.samouczekGestow === true,
    JSON.stringify((await saved()).ustawienia),
  )
  await wait(500)
  check('the tap that closes the tutorial does not reveal the card below', await js(`!document.getElementById('card').classList.contains('revealed')`), await cardState())

  // ---------------------------------------------------------------------------------------------
  // B: the study screen without distractions
  // ---------------------------------------------------------------------------------------------
  await waitFor(`!!document.getElementById('card')`)
  check('first card = first word of the list', (await cardWord()) === 'apple', await cardWord())
  const buttons = await visibleButtons()
  check('study screen: no button at the top or bottom is visible', buttons.length === 0, JSON.stringify(buttons))
  check('study screen: the menu button is hidden', await js(`document.getElementById('menu-button').hidden`))
  const hidden = await hiddenButtons()
  check('study screen: hidden buttons for the screen reader stay', hidden.includes('Reveal card') && hidden.includes('Skip this word') && hidden.includes('End study'), JSON.stringify(hidden))
  const top = await js(`(() => {
    const g = document.querySelector('.top')
    return {
      text: g.innerText.trim(),
      bars: g.querySelectorAll('.deck-progress i').length,
      actionsHeight: Math.round(document.getElementById('actions').getBoundingClientRect().height),
    }
  })()`)
  check('study screen: the top is only the progress bar, no digits and no text', top.text === '' && top.bars === 2, JSON.stringify(top))
  check('study screen: the bottom of the screen takes no space', top.actionsHeight <= 1, `${top.actionsHeight} px`)
  // The card ends together with the screen: before, the bottom grid margin and the gap above the empty footer cut it.
  const cardBox = await js(`(() => {
    const r = document.getElementById('card').getBoundingClientRect()
    const s = getComputedStyle(document.getElementById('card'))
    return {
      fromBottom: Math.round(innerHeight - r.bottom),
      fromSide: Math.round(r.left),
      fromTop: Math.round(r.top),
      rounding: s.borderBottomLeftRadius,
      inside: s.paddingBottom,
    }
  })()`)
  check(
    'the card goes low, with the same gap as on the sides and with rounding',
    cardBox.fromBottom === cardBox.fromSide && cardBox.fromBottom <= 16 && cardBox.fromTop > 0 && parseFloat(cardBox.rounding) > 0,
    JSON.stringify(cardBox),
  )
  const cardBefore = await js(`document.getElementById('card').innerText`)
  check('card: no label "WHAT DOES IT MEAN?"', !/what does it mean/i.test(cardBefore), cardBefore.replace(/\n+/g, ' | '))
  check('card: the caption "Tap to reveal" on the first cards after the tutorial', cardBefore.includes('Tap to reveal'), cardBefore.replace(/\n+/g, ' | '))
  check('card: level and part of speech chips are on the back', await js(`!!document.querySelector('#card .reveal .chips.mini')`))
  check('card: the speaker stays', await js(`!!document.querySelector('#card .speaker')`))
  check('card: no sideways or vertical scrolling', (await scrollsSideways()) === '' && (await fits('#card')))
  // The toast from the previous step goes away by itself after 3.5 s; screenshots must show only the study screen.
  await waitFor(`document.getElementById('toast').hidden`, 4000)
  await screenshot('card')

  // ---------------------------------------------------------------------------------------------
  // A: swipes in four directions
  // ---------------------------------------------------------------------------------------------
  // A grade works at once, without a tap to reveal. Undo gives the same start point back to the next
  // steps (card "apple", zero points), and also checks undoing on a hidden card.
  await drag('#card', 170, 0)
  await wait(400)
  check('a swipe right grades a hidden card, without a tap', (await cardWord()) !== 'apple' && (await xp()) === 50, `${await cardWord()}, ${await xp()} pts`)
  await doubleTap('#card')
  await wait(400)
  check('a double tap undoes the grade of a hidden card', (await cardWord()) === 'apple' && (await xp()) === 0, `${await cardWord()}, ${await xp()} pts`)
  check('after undo the card comes back hidden', await js(`!document.getElementById('card').classList.contains('revealed')`))

  await tap('#card', true)
  check('a single tap reveals the card at once, without waiting for a second one', await waitFor(`document.getElementById('card').classList.contains('revealed')`, 200))
  check('after revealing there is still no visible button', (await visibleButtons()).length === 0)
  const hiddenRevealed = await hiddenButtons()
  check('after revealing hidden grade buttons are available to the screen reader', hiddenRevealed.includes("Don't know") && hiddenRevealed.includes('Almost') && hiddenRevealed.includes('Know'), JSON.stringify(hiddenRevealed))
  await screenshot('card-revealed')

  // The direction highlight before letting go.
  const letGo = await hold('#card', 170, 0)
  // The highlight enters in 120 ms, so we let it finish before we measure it and take a screenshot.
  await wait(250)
  const during = await js(`(() => {
    const z = document.getElementById('swipe-marker')
    const k = document.getElementById('card')
    const box = z.getBoundingClientRect()
    return {
      visible: z.classList.contains('visible'),
      className: z.className,
      icon: z.querySelector('.swipe-icon').textContent,
      label: z.querySelector('.swipe-label').textContent,
      color: getComputedStyle(z).color,
      cardClasses: k.className,
      border: getComputedStyle(k).borderTopColor,
      transform: k.style.transform,
      opacity: getComputedStyle(z).opacity,
      width: Math.round(z.getBoundingClientRect().width),
      height: Math.round(z.getBoundingClientRect().height),
      iconPx: getComputedStyle(z.querySelector('.swipe-icon')).fontSize,
      onScreen: box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight,
    }
  })()`)
  check(
    'swipe right: color, icon and label "Know" before the finger lets go',
    during.visible && during.icon === '✓' && during.label === 'Know' && during.color === 'rgb(0, 179, 131)' && during.border === 'rgb(0, 179, 131)',
    JSON.stringify(during),
  )
  check(
    'swipe: the direction highlight is big, fully visible and stays on screen when the card moves away',
    during.opacity === '1' && during.width >= 90 && during.height >= 80 && during.onScreen,
    JSON.stringify({ opacity: during.opacity, width: during.width, height: during.height, iconPx: during.iconPx, onScreen: during.onScreen }),
  )
  check(
    'swipe: the card follows the finger on both axes, turns and snaps at the threshold',
    /translate\(/.test(during.transform) && /rotate\(/.test(during.transform) && /scale\(1\.02\)/.test(during.transform) && during.cardClasses.includes('threshold'),
    during.transform,
  )
  await screenshot('swipe')
  // The screenshot takes time, so the finger goes back to the start point: this card is still needed to check thresholds,
  // and the answer time must not lower anything here.
  await letGo(0, 0)
  await wait(400)
  check('going back under the threshold does not grade the card', (await cardWord()) === 'apple' && (await xp()) === 0, `${await cardWord()}, ${await xp()} pts`)
  check('after going back under the threshold the direction highlight goes away', await js(`!document.getElementById('swipe-marker').classList.contains('visible') && !document.getElementById('card').classList.contains('threshold')`))
  check('the direction marker stands above the card, not in it', await js(`document.getElementById('swipe-marker').parentElement.id === 'app'`), await js(`document.getElementById('swipe-marker').parentElement.id`))

  // Below the threshold the card goes back to the center.
  await drag('#card', 80, 0, 4, 60)
  await wait(400)
  check('a move below the 90 px threshold does not grade', (await cardWord()) === 'apple' && (await xp()) === 0, `${await cardWord()}, ${await xp()} pts`)
  await drag('#card', 0, -70, 4, 60)
  await wait(400)
  check('a move below the 80 px vertical threshold does not grade', (await cardWord()) === 'apple' && (await xp()) === 0, `${await cardWord()}, ${await xp()} pts`)

  let xpBefore = await xp()
  await swipe('right')
  check('swipe right = Know (+50)', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${xpBefore + 50}`), `${xpBefore} -> ${await xp()}`)
  check('the next card comes in', await waitFor(`document.querySelector('#card .word')?.textContent === 'book'`))
  check('save after the grade in localStorage (apple: learning)', (await saved()).karty.apple?.[0]?.[0] === 1, JSON.stringify((await saved()).karty))

  // Flick: a short but fast move counts as crossing the threshold.
  await waitForFreshCard()
  await tap('#card', true)
  await waitFor(`document.getElementById('card').classList.contains('revealed')`)
  await wait(120)
  xpBefore = await xp()
  await drag('#card', -60, 0, 3, 8)
  check("a fast flick left = Don't know (+10)", await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${xpBefore + 10}`), `${xpBefore} -> ${await xp()}`)

  await waitFor(`document.querySelector('#card .word')?.textContent === 'family'`)
  xpBefore = await xp()
  const wordBeforeUndo = await cardWord()
  await revealAndGrade('up')
  check('swipe up = Almost (+30)', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${xpBefore + 30}`), `${xpBefore} -> ${await xp()}`)

  // ---------------------------------------------------------------------------------------------
  // A: a double tap undoes the grade
  // ---------------------------------------------------------------------------------------------
  await waitForFreshCard()
  const beforeUndo = await cardWord()
  const xpBeforeUndo = await xp()
  await js(`window.__clicks = []; document.addEventListener('click', () => window.__clicks.push(Math.round(performance.now())), true); 1`)
  await doubleTap('#card')
  const clicks = await js(`window.__clicks`)
  check(
    `a double tap undoes the last grade and goes back to the card "${wordBeforeUndo}"`,
    await waitFor(`document.querySelector('#card .word')?.textContent === ${JSON.stringify(wordBeforeUndo)} && JSON.parse(localStorage.getItem('mmf-v1')).exp === ${xpBeforeUndo - 30}`, 4000),
    `${beforeUndo} -> ${await cardWord()}, ${xpBeforeUndo} -> ${await xp()} pts, clicks ${JSON.stringify(clicks)}, gap ${clicks.length > 1 ? clicks[1] - clicks[0] : '-'} ms`,
  )
  check('after undo the card comes back revealed at once', await js(`document.getElementById('card').classList.contains('revealed')`))
  check('undo says so in one sentence', (await toastText()) === 'Last grade undone.', await toastText())
  const xpAfterUndo = await xp()
  await swipe('right')
  await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).exp !== ${xpAfterUndo}`, 5000)

  // Two taps more than 280 ms apart are two separate taps, not an undo.
  await waitForFreshCard()
  await js(`window.__word = document.querySelector('#card .word').textContent; 1`)
  const xpBeforeSeparate = await xp()
  await tap('#card', true)
  await wait(600)
  await tap('#card', true)
  await wait(400)
  check('two separate taps (over 280 ms) do not undo the grade', (await cardWord()) === (await js(`window.__word`)) && (await xp()) === xpBeforeSeparate, `${await cardWord()}, ${xpBeforeSeparate} -> ${await xp()} pts`)

  // ---------------------------------------------------------------------------------------------
  // A: a swipe down throws the word out of study, and the cross on the card ends study
  // ---------------------------------------------------------------------------------------------
  await waitForFreshCard()
  const wordToTrash = await cardWord()
  const skippedBefore = Object.keys((await saved()).pominiete || {}).length
  await swipe('down')
  await wait(600)
  check(
    'a swipe down throws the word out of study (trash)',
    Object.keys((await saved()).pominiete || {}).length === skippedBefore + 1 && (await cardWord()) !== wordToTrash,
    `${wordToTrash} -> ${await cardWord()}, skipped: ${Object.keys((await saved()).pominiete || {}).length}`,
  )
  check('the trash explains at the first use where to restore the word', (await toastText()).includes('You can restore them in Menu'), await toastText())
  await tap('#card .close')
  check('the cross on the card ends study and shows the home screen', await waitFor(`!document.getElementById('card') && !!document.getElementById('play-reviews')`, 4000), (await stageText()).replace(/\n+/g, ' | '))
  await clickByText('#stage', 'Reviews')
  await waitFor(`!!document.getElementById('card')`)
  await waitFor(`!document.getElementById('card').classList.contains('entering')`, 3000)
  const trashHidden = await cardWord()
  const skippedHidden = Object.keys((await saved()).pominiete || {}).length
  await swipe('down')
  await wait(600)
  check(
    'a swipe down throws the word out also before revealing the card',
    Object.keys((await saved()).pominiete || {}).length === skippedHidden + 1 && (await cardWord()) !== trashHidden,
    `${trashHidden} -> ${await cardWord()}`,
  )
  await tap('#card .close')
  await waitFor(`!document.getElementById('card') && !!document.getElementById('play-reviews')`, 4000)

  // ---------------------------------------------------------------------------------------------
  // The keyboard copies the four swipes (shortcuts for tests and for an external keyboard)
  // ---------------------------------------------------------------------------------------------
  await clickByText('#stage', 'Reviews')
  await waitFor(`!!document.getElementById('card')`)
  const xpBeforeKeys = await xp()
  await key(' ')
  await wait(120)
  await key('ArrowRight')
  check('keyboard: space reveals, the right arrow is Know', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${xpBeforeKeys + 50}`), String(await xp()))
  await wait(350)
  await key(' ')
  await wait(120)
  await key('ArrowUp')
  check('keyboard: the up arrow is Almost', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${xpBeforeKeys + 80}`), String(await xp()))
  await wait(350)
  await key('Escape')
  check('keyboard: Escape ends study', await waitFor(`!document.getElementById('card') && !!document.getElementById('play-reviews')`, 4000))

  // ---------------------------------------------------------------------------------------------
  // D: the session end screen with three numbers
  // ---------------------------------------------------------------------------------------------
  await clickByText('#stage', 'Reviews')
  await waitFor(`!!document.getElementById('card')`)
  for (let i = 0; i < 40 && (await js(`!!document.getElementById('card')`)); i++) {
    await key(' ')
    await wait(70)
    await key('ArrowRight')
    await wait(340)
  }
  check('the session end screen', await waitFor(`!!document.querySelector('#stage .session-end')`), (await stageText()).replace(/\n+/g, ' | '))
  await wait(1600)
  const end = await stageText()
  const endNumbers = await js(`[...document.querySelectorAll('#stage .stat-number')].map((e) => e.textContent)`)
  check('end: at most three numbers', endNumbers.length > 0 && endNumbers.length <= 3, JSON.stringify(endNumbers))
  check('end: no points, percent, rank or daily goal', !/points|%|rank|daily goal/i.test(end), end.replace(/\n+/g, ' | '))
  // After a session reviews are usually used up, so "+10" stands next to the disabled button.
  const endButtons = await js(`[...document.querySelectorAll('.home-buttons button')].map((b) => b.textContent).join(',')`)
  check('end: the same buttons as on the home screen (with "+10" when reviews are used up)', endButtons === 'Reviews,Crossword,Letters' || endButtons === 'Reviews,+10,Crossword,Letters', endButtons)
  check('end: the celebration ends by itself', await js(`!document.querySelector('#stage .screen.celebrating')`))
  check('end: fits without scrolling and does not scroll sideways', (await fits('#stage .screen')) && (await scrollsSideways()) === '', await scrollsSideways())
  await screenshot('session-end')

  // ---------------------------------------------------------------------------------------------
  // Menu: stats in sentences, the tutorial can be opened again, "Skip" in the word list
  // ---------------------------------------------------------------------------------------------
  await openMenu()
  const menu = await menuText()
  check('menu: stats as short sentences', /You know \d+ of \d+ words/.test(menu), menu.split('\n').slice(0, 8).join(' | '))
  check('menu: the table of numbers only under "Details"', (await js(`!!document.getElementById('stats-details')`)) && menu.includes('Details'))
  check('menu: no rank and no points', !/Rank|Points/i.test(menu), menu.split('\n').filter((l) => /rank|points/i.test(l)).join(' | ') || 'none')
  check('menu: the heatmap stays', (await js(`document.querySelectorAll('#menu .heatmap .day:not(.before)').length`)) === 30)
  check('menu: sections in order of importance', (await firstH3s()).join(' | ') === ' | Stats | Decks | Words | How to learn | Settings | Backup | Offline | Sources and license', (await firstH3s()).join(' | '))
  check('menu: the sheet does not scroll sideways', (await scrollsSideways()) === '', await scrollsSideways())
  const sentenceContrast = await contrast('#menu .sentences p')
  check('menu: stat sentences have a contrast of at least 4.5:1', sentenceContrast >= 4.5, `${sentenceContrast}:1`)

  await clickByText('#menu', 'Gestures')
  check('menu: "Gestures" opens the tutorial again', await waitFor(`!document.getElementById('tutorial').hidden`, 3000))
  await closeTutorial()

  await openMenu()
  await js(`(() => { const p = document.getElementById('search'); p.value = 'apple'; p.dispatchEvent(new Event('input')) })()`)
  await waitFor(`!!document.querySelector('#word-list .word-row')`)
  const wordButtons = await js(
    `(() => { const w = [...document.querySelectorAll('#word-list .word-row')].find((e) => e.querySelector('b').textContent === 'apple'); return [...w.querySelectorAll('button')].map((b) => b.textContent).join(',') })()`,
  )
  check('words: "Skip" stays available in the word list', wordButtons.includes('Skip'), wordButtons)
  await js(`[...document.querySelectorAll('#word-list button')].find((b) => b.textContent === 'Skip').click(); 1`)
  check(
    'words: "Skip" throws the word out of study',
    await waitFor(`!!JSON.parse(localStorage.getItem('mmf-v1')).pominiete.apple && /leaves study|You can restore them in Menu/.test(document.getElementById('toast').textContent)`),
    await toastText(),
  )
  await js(`[...document.querySelectorAll('#word-list button')].find((b) => b.textContent === 'Restore').click(); 1`)
  check('words: "Restore" gives the word back to study', await waitFor(`!JSON.parse(localStorage.getItem('mmf-v1')).pominiete.apple`))
  await js(`document.querySelector('#menu .close').click(); 1`)
  await wait(200)

  // ---------------------------------------------------------------------------------------------
  // Offline: server off, a normal reload and an address with a parameter
  // ---------------------------------------------------------------------------------------------
  const xpBeforeOffline = await xp()
  await stopServer()
  check('the server is really off', await fetch(APP_URL).then(
    () => false,
    () => true,
  ))
  await js(`window.__old = 1`)
  await cdp('Page.reload', {})
  check('offline: reload without the server works', await waitFor(`!window.__old && document.documentElement.dataset.ready === '1'`, 15000))
  check('offline: progress kept', (await xp()) === xpBeforeOffline, String(await xp()))
  check('offline: the app opens at once on a card or on the home screen', await waitFor(`!!document.getElementById('card') || !!document.getElementById('play-reviews')`))
  await cdp('Page.navigate', { url: APP_URL + '?x=1' })
  check('offline: address ?x=1', await waitFor(`location.search === '?x=1' && document.documentElement.dataset.ready === '1' && !!document.getElementById('stage').innerText`, 15000))

  // Update: a new version of the files on the server
  // Styles after the Vite build are in dist/assets/ under a name with a hash.
  const css = readdirSync(join(SITE, 'dist', 'assets')).find((n) => n.endsWith('.css'))
  appendFileSync(join(SITE, 'dist', 'assets', css), '\n/* test change */\n')
  const sw = readFileSync(join(SITE, 'dist', 'sw.js'), 'utf8')
  const oldVersion = sw.match(/const VERSION = ['"]([^'"]+)['"]/)[1]
  writeFileSync(join(SITE, 'dist', 'sw.js'), sw.replace(/const VERSION = ['"][^'"]+['"]/, "const VERSION = 'test00000001'"))
  await startServer()
  await js(`navigator.serviceWorker.getRegistration().then((r) => r.update())`)
  check('the new version is installed and waits', await waitFor(`navigator.serviceWorker.getRegistration().then((r) => !!r.waiting)`, 15000))
  await wait(300)
  check('the old version is still active (no skipWaiting)', (await swStatus()).version === oldVersion)
  check('the banner does not show on the stage with a card', await js(`!document.getElementById('card') || !document.querySelector('#stage .banner')`))
  await openMenu()
  check('new version banner in the menu', await waitFor(`document.getElementById('menu').innerText.includes('New version ready')`))
  await js(`window.__old = 1`)
  await clickByText('#menu', 'Restart')
  check('reload after the update', await waitFor(`!window.__old && document.documentElement.dataset.ready === '1' && !!navigator.serviceWorker.controller`, 15000))
  await wait(500)
  const status2 = await swStatus()
  check('the new version is active, files in the cache', status2.version === 'test00000001' && status2.saved === status2.files, JSON.stringify(status2))
  const keys = await js(`caches.keys()`)
  check('the old cache is deleted', keys.length === 1 && keys[0] === 'mmf-test00000001', JSON.stringify(keys))
  check('progress after the update', (await xp()) === xpBeforeOffline, String(await xp()))

  // ---------------------------------------------------------------------------------------------
  // Pasting text, the backup and the real Oxford 3000 deck
  // ---------------------------------------------------------------------------------------------
  await openMenu()
  await clickByText('#menu', 'Add words')
  await waitFor(`!!document.getElementById('paste')`)
  await js(`const p = document.getElementById('paste'); p.value = 'May ; maj\\nmay ; móc\\napple ; jabłko (owoc)\\nno separator'; p.dispatchEvent(new Event('input'))`)
  check('paste preview', await waitFor(`document.querySelector('#preview .summary')?.textContent === '2 new, 1 updated, 1 error'`), await js(`document.getElementById('preview')?.innerText`))
  await js(`document.getElementById('add-words-button').click()`)
  check('adding closes the sheet', await waitFor(`document.getElementById('add-words').hidden`))
  const t2 = await library()
  const apple = t2.slowa.find((w) => w.id === 'apple')
  check('IndexedDB: May and may separate, apple updated with IPA', t2.slowa.length === N + 2 && t2.slowa.at(-2).id === 'May' && t2.slowa.at(-1).id === 'may' && apple.pl === 'jabłko (owoc)' && !!apple.ipa)
  check('apple progress untouched', !!(await saved()).karty.apple)

  const raw = await saved()
  const backup = { format: 'mmf-kopia', wersja: 2, utworzono: new Date().toISOString(), talia: { slowa: t2.slowa, talie: t2.talie }, postep: { ...raw, exp: 777 } }
  writeFileSync(join(WORK, 'backup-good.json'), JSON.stringify(backup))
  writeFileSync(join(WORK, 'backup-bad.json'), JSON.stringify({ ...backup, postep: { ...raw, exp: -1 } }))
  check('the backup has the new fields (history, reports)', !!backup.postep.historia && Array.isArray(backup.postep.zgloszenia), JSON.stringify(Object.keys(backup.postep)))
  await js(`window.confirm = (text) => { window.__question = text; return true }`)
  await fileToInput('#backup-file', join(WORK, 'backup-bad.json'))
  check('a bad backup is rejected with a message', await waitFor(`document.getElementById('toast').textContent.includes('Backup not loaded')`), await toastText())
  await fileToInput('#backup-file', join(WORK, 'backup-good.json'))
  check('a good backup is loaded', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).exp === 777`), String(await xp()))
  check('the state from before loading is kept', await js(`!!localStorage.getItem('mmf-v1-przed-wczytaniem') && JSON.parse(localStorage.getItem('mmf-v1-przed-wczytaniem')).exp !== 777`))
  check('the backup dialog describes joining', String(await js(`window.__question`)).includes('joined with the current'), String(await js(`window.__question`)).replace(/\n+/g, ' | '))

  const cardsBeforeOxford = Object.keys((await saved()).karty).length
  await openMenu()
  await clickByText('#menu', 'Add words')
  await waitFor(`!!document.getElementById('paste')`)
  const startOxford = Date.now()
  await fileToInput('#words-file', OXFORD)
  const oxfordPreview = await waitFor(`/^\\d+ new/.test(document.querySelector('#preview .summary')?.textContent || '')`, 20000)
  check(`Oxford 3000: file preview (${Date.now() - startOxford} ms)`, oxfordPreview, (await js(`document.getElementById('preview')?.innerText`)).replace(/\n+/g, ' | '))
  const startSave = Date.now()
  await js(`document.getElementById('add-words-button').click()`)
  check(`Oxford 3000: save and close the sheet (${Date.now() - startSave} ms)`, await waitFor(`document.getElementById('add-words').hidden`, 20000))
  const t3 = await library()
  check('Oxford 3000: words in IndexedDB', t3.slowa.length >= 2981 && t3.talie.some((d) => d.nazwa === 'Oxford 3000'), `${t3.slowa.length} words`)
  check('Oxford 3000: progress untouched', Object.keys((await saved()).karty).length === cardsBeforeOxford)

  // ---------------------------------------------------------------------------------------------
  // Prepared states: the engine and the rest of the behavior
  // ---------------------------------------------------------------------------------------------
  // The saved format of the progress (mmf-v1) stays as the Polish version wrote it: that is what these states imitate.
  const BASE_MINUTES = Date.UTC(2026, 0, 1) / 60000
  const BASE_DAYS = Date.UTC(2026, 0, 1) / 86400000
  const toMinutes = (d) => Math.round(d.getTime() / 60000) - BASE_MINUTES
  const toDay = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 - BASE_DAYS
  const inMinutes = (m) => new Date(Date.now() + m * 60000)
  const twoDigits = (n) => String(n).padStart(2, '0')
  const today = new Date()
  const toDate = (d) => `${d.getFullYear()}-${twoDigits(d.getMonth() + 1)}-${twoDigits(d.getDate())}`
  const todayDate = toDate(today)
  const yesterdayDate = toDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
  const twoDaysAgoDate = toDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2))
  const { buildCollisions } = await import(pathToFileURL(join(ROOT, 'src', 'collisions.js')).href)
  const COLLISIONS = buildCollisions(t3.slowa)
  const IDS = t3.slowa.map((w) => w.id)
  const skipAllBut = (count) => Object.fromEntries(IDS.slice(count).map((id) => [id, todayDate]))

  // [state, due, stability, difficulty, reps, lapses, step, last, introduced]; state 2 = review
  const savedCard = ({ due, stability = 10, last = inMinutes(-1440), lapses = 0, introduced = inMinutes(-30 * 1440) }) => [2, toMinutes(due), stability, 5, 3, lapses, 0, toDay(last), toDay(introduced)]
  const defaultSave = {
    wersja: 1,
    karty: {},
    pominiete: {},
    exp: 0,
    streak: { dni: 0, ostatniDzien: '', zamrozenia: 0, doZamrozenia: 0, zerwane: { dni: 0, do: '' }, sesje: 0, ostatnieOdzyskanie: '' },
    nadrabianie: { aktywne: 0, polowaDo: '' },
    dzis: { data: todayDate, sekundy: 0, dodatkoweNowe: 0, powtorki: 0 },
    historia: {},
    zgloszenia: [],
    // samouczekGestow: true, so the overlay does not cover cards in the next scenarios
    ustawienia: { noweDziennie: 10, maksPowtorekDziennie: 60, dlugoscSerii: 15, autowymowa: false, mowienie: false, celDzienny: 30, podpowiedzMowienie: 'brak', samouczekGestow: true },
    ostatniaKopia: new Date().toISOString(),
    rozproszono: 1,
  }
  async function setSave(changes) {
    const state = { ...defaultSave, ...changes, ustawienia: { ...defaultSave.ustawienia, ...(changes.ustawienia || {}) } }
    await js(`localStorage.setItem('mmf-v1', ${JSON.stringify(JSON.stringify(state))}); 1`)
    await js(`window.__old = 1`)
    await cdp('Page.reload', {})
    const ready = await waitFor(`!window.__old && document.documentElement.dataset.ready === '1' && !!document.getElementById('stage').innerText`, 15000)
    if (!ready) throw new Error('the app did not start after the save was replaced')
    return state
  }

  const oneCard = { [IDS[0]]: [savedCard({ due: inMinutes(-60) })] }
  const onlyFirst = skipAllBut(1)

  // --- E: the app opens at once on a card ---
  await setSave({ karty: oneCard, pominiete: onlyFirst })
  check('the app opens at once on a card, without a screen in between', await waitFor(`!!document.getElementById('card')`, 6000), (await stageText()).replace(/\n+/g, ' | '))
  check('start on a card: the tutorial does not show any more', await js(`document.getElementById('tutorial').hidden`))

  // --- E: the "nothing to review" screen offers games ---
  await setSave({ karty: {}, pominiete: skipAllBut(0) })
  check('no cards: the home screen at once, not an empty message', await waitFor(`!!document.getElementById('play-reviews')`, 6000))
  const empty = await stageText()
  check(
    'no cards: "Reviews" disabled, games invite in one sentence',
    (await js(`document.getElementById('play-reviews').disabled`)) && !(await js(`document.getElementById('play-crossword').disabled`)) && empty.includes('All done for today. Play a game or come back tomorrow.'),
    empty.replace(/\n+/g, ' | '),
  )

  // --- C: answer time as a signal ---
  await setSave({ karty: { [IDS[0]]: [savedCard({ due: inMinutes(-60) })], [IDS[1]]: [savedCard({ due: inMinutes(-50) })] }, pominiete: skipAllBut(2) })
  await waitFor(`!!document.getElementById('card')`)
  await waitForFreshCard()
  const borderBefore = await cardBorder()
  await tap('#card', true)
  await waitFor(`document.getElementById('card').classList.contains('revealed')`)
  check('time: the border right after revealing is neutral', (await cardBorder()) === borderBefore, `${borderBefore} -> ${await cardBorder()}`)
  await wait(4200)
  const border4 = await cardBorder()
  check('time: after 4 s the border is amber', border4 === 'rgb(230, 159, 0)', border4)
  await wait(5200)
  const border9 = await cardBorder()
  check('time: after 9 s the border is vermilion', border9 === 'rgb(255, 111, 60)', border9)
  const xpBeforeSlow = await xp()
  await swipe('right')
  check('time: after 8 s a "Know" swipe is saved as a weaker hit (+30, not +50)', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${xpBeforeSlow + 30}`, 4000), `${xpBeforeSlow} -> ${await xp()} pts`)
  check('time: the lowering is quiet, without a message on the screen', (await noteText()) === '', await noteText())
  check('time: the median answer time goes into the day history', ((await saved()).historia?.[todayDate]?.tempo ?? 0) >= 8, JSON.stringify((await saved()).historia?.[todayDate]))

  // A fast answer is not lowered.
  await waitForFreshCard()
  const xpBeforeFast = await xp()
  await tap('#card', true)
  await waitFor(`document.getElementById('card').classList.contains('revealed')`)
  await wait(120)
  await swipe('right')
  check('time: a fast "Know" stays "Know" (+50)', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${xpBeforeFast + 50}`, 4000), `${xpBeforeFast} -> ${await xp()} pts, ${await cardState()}`)

  // A new card (first exposure) is not lowered.
  await setSave({ karty: {}, pominiete: skipAllBut(3), ustawienia: { dlugoscSerii: 3 } })
  await waitForFreshCard()
  await tap('#card', true)
  await waitFor(`document.getElementById('card').classList.contains('revealed')`)
  await wait(9000)
  await swipe('right')
  check('time: a new card after 9 s still gets "Know" (+50)', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).exp === 50`, 4000), String(await xp()))

  // --- A1: review cap and order by urgency ---
  const CAP = 40
  const DUE = 70
  const urgencyCards = {}
  for (let i = 0; i < DUE; i++) {
    urgencyCards[IDS[i]] = [savedCard({ due: inMinutes(-(300 - i)), stability: 200 - i, last: inMinutes(-5 * 1440) })]
  }
  const capSettings = { maksPowtorekDziennie: CAP, noweDziennie: 5, dlugoscSerii: 20 }
  await setSave({ karty: urgencyCards, pominiete: skipAllBut(DUE + 5), ustawienia: capSettings })
  await waitFor(`!!document.getElementById('card')`)
  check('cap: the first card is the most urgent one (the lowest recall chance), not the oldest due date', (await cardWord()) === IDS[DUE - 1], `${await cardWord()}, and the oldest due date has ${IDS[0]}`)
  check(`cap: stats give ${CAP} due + 5 new, not the whole backlog`, await menuHas('To do today', '45'))
  check('cap: the real backlog is only in the stats', await menuHas('Due now', String(DUE)))

  // --- A2: catch-up mode ---
  const debtCards = {}
  for (let i = 0; i < 200; i++) debtCards[IDS[i]] = [savedCard({ due: inMinutes(-(2000 - i)), stability: 20 })]
  await setSave({ karty: debtCards, pominiete: skipAllBut(200), ustawienia: { maksPowtorekDziennie: 60, dlugoscSerii: 20 } })
  await waitFor(`!!document.getElementById('card')`)
  check('catch-up: the study screen does not show the debt number', !/200|Due/.test(await stageText()), (await stageText()).replace(/\n+/g, ' | '))
  check('catch-up: the flag is saved in progress', (await saved()).nadrabianie?.aktywne === 1, JSON.stringify((await saved()).nadrabianie))
  check('catch-up: the menu says plainly the mode is on', await menuHas('Catch-up mode', 'yes'))
  check('catch-up: review limit 1.5x the cap and zero new words', await menuHas('To do today', '90'))

  // --- A3: streak (one card, freeze) ---
  await setSave({ karty: oneCard, pominiete: onlyFirst, streak: { ...defaultSave.streak, dni: 3, ostatniDzien: yesterdayDate } })
  await waitFor(`!!document.getElementById('card')`)
  await revealAndGrade('right')
  check('streak: one graded card counts the day', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).streak.dni === 4`), JSON.stringify((await saved()).streak))

  await setSave({
    karty: oneCard,
    pominiete: onlyFirst,
    streak: { ...defaultSave.streak, dni: 9, ostatniDzien: twoDaysAgoDate, zamrozenia: 2, doZamrozenia: 2 },
  })
  await waitFor(`!!document.getElementById('card')`)
  await revealAndGrade('right')
  check('freeze: the streak goes on despite a day off', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).streak.dni === 10`), JSON.stringify((await saved()).streak))
  check('freeze: one of two used', (await saved()).streak.zamrozenia === 1, JSON.stringify((await saved()).streak))
  check('freeze: a message without a word about a loss', (await toastText()) === 'Yesterday was a day off, the streak stays.', await toastText())

  // --- A5: hint after 7 s and the lowered "Know" on the speaking card ---
  await setSave({
    karty: { [IDS[0]]: [savedCard({ due: inMinutes(5 * 1440), stability: 30 })] },
    pominiete: onlyFirst,
    ustawienia: { mowienie: true, dlugoscSerii: 5 },
  })
  check('hint: the app goes to a speaking card', await waitFor(`!!document.querySelector('#card.direction-pl')`), (await stageText()).replace(/\n+/g, ' | '))
  check('hint: the button is invisible, not only disabled', await js(`document.getElementById('hint-button').hidden === true`))
  check('hint: it shows after 7 s', await waitFor(`!document.getElementById('hint-button').hidden`, 12000))
  await tap('#hint-button')
  check('hint: shows underscores', await waitFor(`document.getElementById('hint-field').textContent.includes('_')`), await js(`document.getElementById('hint-field').textContent`))
  check('hint: the button does not reveal the card', await js(`!document.getElementById('card').classList.contains('revealed')`))
  await tap('#card', true)
  await waitFor(`document.getElementById('card').classList.contains('revealed')`)
  const xpBeforeTry = await xp()
  await swipe('right')
  check('hint: "Know" works, but is saved as a weaker hit (+30, not +50)', await waitFor(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${xpBeforeTry + 30}`, 4000), `${xpBeforeTry} -> ${await xp()}`)

  // --- A6: interference block when picking new words ---
  let pair = null
  for (let i = 0; i < IDS.length && !pair; i++) {
    for (const other of COLLISIONS[IDS[i]] || []) {
      if (IDS.indexOf(other) < i) {
        pair = { a: other, b: IDS[i], index: i }
        break
      }
    }
  }
  check('interference: the deck has a colliding pair', !!pair, JSON.stringify(pair))
  const skippedBeforeB = Object.fromEntries(
    IDS.slice(0, pair.index)
      .filter((id) => id !== pair.a)
      .map((id) => [id, todayDate]),
  )
  await setSave({
    karty: { [pair.a]: [savedCard({ due: inMinutes(10 * 1440), stability: 12, introduced: inMinutes(-1440) })] },
    pominiete: skippedBeforeB,
    ustawienia: { dlugoscSerii: 5 },
  })
  await waitFor(`!!document.getElementById('card')`)
  check(`interference: "${pair.b}" skipped, because the similar "${pair.a}" came in yesterday`, (await cardWord()) !== pair.b, `first card: ${await cardWord()}`)
  await setSave({ karty: {}, pominiete: { ...skippedBeforeB, [pair.a]: todayDate }, ustawienia: { dlugoscSerii: 5 } })
  await waitFor(`!!document.getElementById('card')`)
  check(`interference: without a fresh collision "${pair.b}" comes in first`, (await cardWord()) === pair.b, `first card: ${await cardWord()}`)

  // --- A7: the leech panel after 6 mistakes ---
  const hardWord = { karty: { [IDS[0]]: [savedCard({ due: inMinutes(-60), stability: 2, lapses: 5 })] }, pominiete: onlyFirst, ustawienia: { dlugoscSerii: 3 } }
  await setSave(hardWord)
  await waitFor(`!!document.getElementById('card')`)
  await revealAndGrade('left')
  check('leech: after the sixth mistake the panel "This word is hard for you" shows', await waitFor(`document.getElementById('stage').innerText.includes('This word is hard for you')`), (await stageText()).replace(/\n+/g, ' | '))
  const panel = await stageText()
  check('leech: the panel has three choices', panel.includes('Put away for 3 weeks') && panel.includes('Skip') && panel.includes('Keep learning'), panel.replace(/\n+/g, ' | '))
  await clickByText('#stage', 'Put away for 3 weeks')
  await wait(400)
  const afterPutAway = await saved()
  const putAwayDays = ((afterPutAway.karty[IDS[0]][0][1] + BASE_MINUTES) * 60000 - Date.now()) / 86400000
  check(`leech: "Put away" gives a due date in ${putAwayDays.toFixed(1)} days (21 +/- fuzz)`, Math.abs(putAwayDays - 21) <= 2.2, String(putAwayDays))
  check('leech: the card history untouched (mistakes stay)', afterPutAway.karty[IDS[0]][0][5] === 6, JSON.stringify(afterPutAway.karty[IDS[0]]))

  // --- I: a flash at every fifth correct card in a row ---
  const comboCards = {}
  for (let i = 0; i < 6; i++) comboCards[IDS[i]] = [savedCard({ due: inMinutes(-(60 + i)) })]
  await setSave({ karty: comboCards, pominiete: skipAllBut(6), ustawienia: { dlugoscSerii: 10, noweDziennie: 5 } })
  await waitFor(`!!document.getElementById('card')`)
  await js(`window.__flash = 0; new MutationObserver(() => { if (!document.getElementById('flash').hidden) window.__flash++ }).observe(document.getElementById('flash'), { attributes: true }); 1`)
  for (let i = 0; i < 5; i++) {
    await key(' ')
    await wait(70)
    await key('ArrowRight')
    await wait(340)
  }
  check('combo: the fifth correct card in a row gives a flash on the edge', (await js(`window.__flash`)) > 0, String(await js(`window.__flash`)))
  check('combo: instead of a number of points there is no toast about points', !/points/.test(await toastText()), await toastText())

  // --- D2: the badge on the icon ---
  const fakeBadge = `(() => {
    window.__badge = []
    Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: (n) => { window.__badge.push(n); return Promise.resolve() } })
    Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: () => { window.__badge.push('clear'); return Promise.resolve() } })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    return window.__badge
  })()`
  await setSave({ karty: debtCards, pominiete: skipAllBut(200), ustawienia: { maksPowtorekDziennie: 60, dlugoscSerii: 20 } })
  const badge = await js(fakeBadge)
  check('badge: leaving the app sets the number of cards for today', badge.length === 1 && badge[0] === 90, JSON.stringify(badge))
  const errorsBefore = consoleErrors.length
  await js(`(() => {
    delete navigator.setAppBadge
    delete navigator.clearAppBadge
    document.dispatchEvent(new Event('visibilitychange'))
    return 1
  })()`)
  await wait(300)
  check('badge: no support does not throw an error', consoleErrors.length === errorsBefore, consoleErrors.slice(errorsBefore).join(' | '))
  await js(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); 1`)

  // ---------------------------------------------------------------------------------------------
  // Show state: the deck bar, animations, the palette and a small screen
  // ---------------------------------------------------------------------------------------------
  const showCards = {}
  for (let i = 0; i < 380; i++) {
    const solid = i < 62
    showCards[IDS[i]] = [
      savedCard({
        due: inMinutes(i < 26 ? -(90 + i * 7) : 2000 + i * 47),
        stability: solid ? 34 + (i % 40) : 2 + (i % 11),
        last: inMinutes(-(2 + (i % 9)) * 1440),
        lapses: i % 17 === 0 ? 2 : 0,
      }),
    ]
  }
  const showHistory = {}
  for (let i = 1; i <= 30; i++) {
    if (i % 5 === 0) continue
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    showHistory[toDate(d)] = { oceny: 18 + ((i * 7) % 44), nowe: (i * 3) % 11, exp: 600 + i * 17, sekundy: 500 + i * 9, tempo: 2 + (i % 5) }
  }
  const showState = {
    karty: showCards,
    pominiete: {},
    exp: 25140,
    streak: { dni: 12, ostatniDzien: yesterdayDate, zamrozenia: 1, doZamrozenia: 4, zerwane: { dni: 0, do: '' }, sesje: 0, ostatnieOdzyskanie: '' },
    historia: showHistory,
    dzis: { data: todayDate, sekundy: 0, dodatkoweNowe: 0, powtorki: 0 },
    ustawienia: { noweDziennie: 10, maksPowtorekDziennie: 60, dlugoscSerii: 10, celDzienny: 60, mowienie: true, autowymowa: false, kotwica: 'after coffee', samouczekGestow: true },
  }
  await setSave(showState)
  await waitFor(`!!document.getElementById('card')`)
  const bar = await js(`(() => {
    const p = document.getElementById('deck-progress')
    const scale = (id) => Number((document.getElementById(id).style.transform.match(/scaleX\\(([^)]+)\\)/) || [0, 0])[1])
    return { label: p.getAttribute('aria-label'), known: scale('bar-known'), solid: scale('bar-solid'), text: p.innerText }
  })()`)
  check(
    'F: the deck bar has a fill of known words and a lighter part of solid words, no digits on the screen',
    bar.text === '' && bar.known > bar.solid && bar.solid > 0 && /Known 380 of \d+ words, solid 62/.test(bar.label),
    JSON.stringify(bar),
  )

  // --- Three status channels at the card fly-out ---
  await waitForFreshCard()
  const normalMotion = await flyOutProbe('right')
  check('I: the card fly-out with motion on goes sideways for 220 ms', normalMotion.name === 'fly-out-right' && normalMotion.time === '0.22s', JSON.stringify(normalMotion))
  await watchResult()
  await tap('#card', true)
  await waitFor(`document.getElementById('card').classList.contains('revealed')`)
  await swipe('right')
  await wait(600)
  const resultRight = await js(`window.__result`)
  check(
    'I: a swipe right gives three channels at once (green, sign ✓, fly-out to the right)',
    !!resultRight && resultRight.sign === '✓' && resultRight.color === 'rgb(0, 179, 131)' && resultRight.classes.includes('result-yes') && resultRight.classes.includes('fly-out-right'),
    JSON.stringify(resultRight),
  )
  await waitForFreshCard()
  await watchResult()
  await tap('#card', true)
  await waitFor(`document.getElementById('card').classList.contains('revealed')`)
  await swipe('left')
  await wait(600)
  const resultLeft = await js(`window.__result`)
  check(
    'I: a swipe left gives vermilion, sign ✗ and a fly-out to the left',
    !!resultLeft && resultLeft.sign === '✗' && resultLeft.color === 'rgb(255, 111, 60)' && resultLeft.classes.includes('fly-out-left'),
    JSON.stringify(resultLeft),
  )

  // --- Palette and contrasts ---
  const tokens = await js(`(() => {
    const s = getComputedStyle(document.documentElement)
    const get = (n) => s.getPropertyValue(n).trim()
    return { bg: get('--bg'), text: get('--text'), muted: get('--muted'), know: get('--know'), almost: get('--almost'), dontKnow: get('--dont-know'), info: get('--info'), onAccent: get('--on-accent') }
  })()`)
  check(
    'palette: tokens match palette v3',
    tokens.bg === '#121212' &&
      tokens.text === '#f2f2f5' &&
      tokens.muted === '#a1a1ad' &&
      tokens.know === '#00b383' &&
      tokens.almost === '#e69f00' &&
      tokens.dontKnow === '#ff6f3c' &&
      tokens.info === '#56b4e9' &&
      tokens.onAccent === '#0b0b0d',
    JSON.stringify(tokens),
  )
  await waitFor(`!!document.getElementById('card')`, 4000)
  const wordContrast = await contrast('#card .word')
  const ipaContrast = await contrast('#card .ipa')
  check('palette: the word on the card has a contrast of at least 4.5:1', wordContrast >= 4.5, `${wordContrast}:1`)
  check('palette: muted text on the card has a contrast of at least 4.5:1', ipaContrast === null || ipaContrast >= 4.5, `${ipaContrast}:1`)

  // --- I: prefers-reduced-motion ---
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await wait(300)
  const times = await js(`(() => {
    const s = getComputedStyle(document.documentElement)
    return ['--time-reveal', '--time-fly-out', '--time-enter', '--time-micro'].map((n) => s.getPropertyValue(n).trim())
  })()`)
  check('reduced-motion: all times go down to 80 ms', times.every((t) => parseInt(t, 10) <= 80), times.join(', '))
  for (const direction of ['right', 'left', 'up', 'down']) {
    const probe = await flyOutProbe(direction)
    check(`reduced-motion: the fly-out "${direction}" turns into an opacity change`, probe.name === 'card-fade' && probe.time === '0.08s', JSON.stringify(probe))
  }
  await setSave(showState)
  await waitForFreshCard()
  await watchResult()
  await tap('#card', true)
  check('reduced-motion: the first tap after the start reveals the card, and does not try to undo', await waitFor(`document.getElementById('card').classList.contains('revealed')`, 3000), await cardState())
  await wait(120)
  await swipe('right')
  await wait(600)
  const resultNoMotion = await js(`window.__result`)
  check(
    'reduced-motion: the feedback stays (color and sign), only shorter',
    !!resultNoMotion && resultNoMotion.sign === '✓' && resultNoMotion.color === 'rgb(0, 179, 131)' && resultNoMotion.time === '0.08s' && resultNoMotion.classes.includes('result-yes'),
    `${JSON.stringify(resultNoMotion)} :: ${await cardState()}`,
  )
  // The same condition without racing the time: with reduced motion the result sign has only the status color,
  // and the animation only brings it to visibility.
  for (const [tone, color] of [
    ['yes', 'rgb(0, 179, 131)'],
    ['almost', 'rgb(230, 159, 0)'],
    ['no', 'rgb(255, 111, 60)'],
  ]) {
    const probe = await resultProbe(tone)
    check(
      `reduced-motion: status "${tone}" keeps the sign and outline color, and turns motion into opacity`,
      probe.color === color && probe.border === color && probe.name === 'no-motion' && probe.time === '0.08s',
      JSON.stringify(probe),
    )
  }
  await cdp('Emulation.setEmulatedMedia', { features: [] })
  await wait(300)

  // --- A small screen (iPhone SE 375x667) ---
  await setSave(showState)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true })
  await wait(500)
  await waitFor(`!!document.getElementById('card')`)
  check('iPhone SE: the card without vertical and sideways scrolling', (await fits('#card')) && (await scrollsSideways()) === '', await scrollsSideways())
  check('iPhone SE: the study screen still without visible buttons', (await visibleButtons()).length === 0)
  await tap('#card .close')
  await waitFor(`!!document.getElementById('play-reviews')`, 4000)
  check('iPhone SE: the home screen fits without scrolling', await fits('#stage .screen'), await js(`(() => { const e = document.querySelector('#stage .screen'); return e.scrollHeight + ' / ' + e.clientHeight })()`))
  check(
    'iPhone SE: three home buttons are touch targets of at least 44 px',
    await js(`[...document.querySelectorAll('.home-buttons button')].every((b) => b.getBoundingClientRect().height >= 44)`),
    await js(`[...document.querySelectorAll('.home-buttons button')].map((b) => Math.round(b.getBoundingClientRect().height)).join(', ')`),
  )
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await wait(300)

  // ---------------------------------------------------------------------------------------------
  // G1: crossword from start to result
  // ---------------------------------------------------------------------------------------------
  const typeText = async (text) => {
    for (const char of text) {
      await cdp('Input.insertText', { text: char })
      await wait(30)
    }
  }
  const rawKey = async (k, code) => {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code })
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code })
  }
  const crosswordClue = () => js(`document.getElementById('crossword-clue').textContent`)
  const crosswordLetters = () => js(`[...document.querySelectorAll('.crossword-cell .crossword-letter')].map((e) => e.textContent).join('')`)
  const crosswordStarts = async () =>
    JSON.parse(await js(`JSON.stringify([...document.querySelectorAll('.crossword-cell')].filter((b) => b.querySelector('.crossword-number')).map((b) => ({ r: +b.dataset.row, c: +b.dataset.col })))`))
  const cellAt = (c) => `.crossword-cell[data-row="${c.r}"][data-col="${c.c}"]`
  const filledCells = () => js(`[...document.querySelectorAll('.crossword-cell .crossword-letter')].filter((e) => e.textContent).length`)
  // The cursor must stand on the first cell of the chosen entry, otherwise typing the whole word goes
  // with a shift. The first ".selected" cell in the DOM is the start of the entry in both directions.
  const atEntryStart = () => js(`(() => { const w = [...document.querySelectorAll('.crossword-cell.selected')]; return !!w.length && w[0].classList.contains('active') })()`)
  const setCursorAtStart = async () => {
    if (await atEntryStart()) return true
    await tap('.crossword-cell.selected')
    return atEntryStart()
  }
  const wordFromClue = (clue, byPl) => byPl.get(String(clue).split(' · ').slice(1).join(' · '))

  // Words for games: only letters, 3-9 chars, without repeated translations and without anagrams (the crossword
  // generator rejects words with the same letters, and the smoke test finds the word by its clue).
  const gameWords = []
  const usedPl = new Set()
  const usedLetters = new Set()
  for (const w of t3.slowa) {
    if (gameWords.length >= 16) break
    if (!/^[a-zA-Z]{3,9}$/.test(w.w) || usedPl.has(w.pl)) continue
    const letters = [...w.w.toLowerCase()].sort().join('')
    if (usedLetters.has(letters)) continue
    usedPl.add(w.pl)
    usedLetters.add(letters)
    gameWords.push(w)
  }
  const byPl = new Map(gameWords.map((w) => [w.pl, w.w]))
  const gameIds = new Set(gameWords.map((w) => w.id))
  await setSave({
    karty: Object.fromEntries(gameWords.map((w, i) => [w.id, [savedCard({ due: inMinutes(-60 - i) })]])),
    pominiete: Object.fromEntries(IDS.filter((id) => !gameIds.has(id)).map((id) => [id, todayDate])),
  })
  await waitFor(`!!document.getElementById('card')`, 8000)
  // Games do not change the schedule: this save of cards must be the same after both games.
  const cardsBeforeGames = await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).karty)`)
  await waitForFreshCard()
  await tap('#card .close')
  check('games: the cross on the card goes back to the home screen', await waitFor(`!!document.getElementById('play-crossword')`, 5000))

  await tap('#play-crossword')
  check('crossword: the "Crossword" button opens the game screen', await waitFor(`!!document.getElementById('crossword-grid')`, 8000), (await stageText()).replace(/\n+/g, ' | '))
  const cellSide = await js(`Math.round(document.querySelector('.crossword-cell').getBoundingClientRect().width * 10) / 10`)
  check('crossword: a cell is at least 28 px', cellSide >= 28, `${cellSide} px, columns: ${await js(`getComputedStyle(document.getElementById('crossword-grid')).gridTemplateColumns.split(' ').length`)}`)
  check('crossword: the grid does not scroll sideways', (await scrollsSideways()) === '' && (await js(`document.getElementById('crossword-grid').getBoundingClientRect().right <= innerWidth + 0.5`)), await scrollsSideways())
  check('crossword: the menu in the corner is visible, the study screen is not', await js(`!document.getElementById('menu-button').hidden && !document.getElementById('card')`))
  check('crossword: the hidden text field has focus (system keyboard)', (await js(`document.activeElement?.id`)) === 'crossword-input', await js(`document.activeElement?.id`))
  check(
    'crossword: buttons "Check" and "Hint a letter" with a counter',
    (await js(`[...document.querySelectorAll('.game-buttons button')].map((b) => b.textContent).join(' | ')`)) === 'Check | Hint a letter (3)',
    await js(`[...document.querySelectorAll('.game-buttons button')].map((b) => b.textContent).join(' | ')`),
  )

  const starts = await crosswordStarts()
  check('crossword: entries are numbered as in a paper one', starts.length >= 3, `${starts.length} cells with a number`)
  check('crossword: the grid starts empty', (await filledCells()) === 0, String(await filledCells()))
  await tap(cellAt(starts[0]))
  const firstClue = await crosswordClue()
  check('crossword: a tap on a cell shows the entry text above the keyboard', /^\d+ (across|down) · .+/.test(firstClue), firstClue)
  check('crossword: the whole entry is highlighted', (await js(`document.querySelectorAll('.crossword-cell.selected').length`)) >= 3, String(await js(`document.querySelectorAll('.crossword-cell.selected').length`)))
  const firstWord = wordFromClue(firstClue, byPl)
  check('crossword: the clue is the Polish translation of a word from the deck', !!firstWord, firstClue)

  // A wrong letter: vermilion after "Check", then Backspace takes it off.
  const wrongLetter = firstWord[0].toUpperCase() === 'Q' ? 'z' : 'q'
  await typeText(wrongLetter)
  check('crossword: a letter from the keyboard goes into the active cell', (await crosswordLetters()) === wrongLetter.toUpperCase(), await crosswordLetters())
  await tap('#crossword-check')
  await wait(150)
  check(
    'crossword: "Check" colors the wrong letter',
    (await js(`document.querySelectorAll('.crossword-cell.wrong').length`)) === 1 && (await js(`document.querySelectorAll('.crossword-cell.correct').length`)) === 0,
    `wrong: ${await js(`document.querySelectorAll('.crossword-cell.wrong').length`)}`,
  )
  await rawKey('Backspace', 8)
  await wait(150)
  check('crossword: Backspace takes the letter off', (await filledCells()) === 0, String(await filledCells()))

  check('crossword: the cursor can be set on the first letter of the entry', await setCursorAtStart())
  await typeText(firstWord)
  await tap('#crossword-check')
  await wait(150)
  const correctInCrossword = await js(`document.querySelectorAll('.crossword-cell.correct').length`)
  check('crossword: a correct entry lights up green', correctInCrossword === firstWord.length, `${correctInCrossword} of ${firstWord.length}`)
  const lettersBeforeHint = (await crosswordLetters()).length
  await tap('#crossword-hint')
  await wait(200)
  check(
    'crossword: "Hint a letter" reveals a letter and lowers the counter',
    (await js(`document.getElementById('crossword-hint').textContent`)) === 'Hint a letter (2)' && (await crosswordLetters()).length === lettersBeforeHint + 1,
    `${await js(`document.getElementById('crossword-hint').textContent`)} :: ${(await crosswordLetters()).length}`,
  )
  await screenshot('crossword')

  // Filling the whole crossword: each numbered cell gives one or two entries, so three taps
  // (the first sets the cursor, the second goes back to the same cell, the third switches the direction).
  const filled = new Set()
  let withoutWord = 0
  for (const c of starts) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!(await js(`!!document.getElementById('crossword-grid')`))) break
      await tap(cellAt(c))
      const clue = await crosswordClue()
      if (!clue || filled.has(clue)) continue
      filled.add(clue)
      const word = wordFromClue(clue, byPl)
      if (!word) {
        withoutWord += 1
        continue
      }
      await setCursorAtStart()
      await typeText(word)
    }
  }
  check('crossword: every entry can be recognized by its Polish translation', withoutWord === 0, `no match: ${withoutWord}`)
  check('crossword: after filling all cells the result shows by itself', await waitFor(`!!document.getElementById('play-again')`, 6000), (await stageText()).replace(/\n+/g, ' | '))
  const crosswordResult = await stageText()
  check(
    'crossword: the result is the number of entries, hints and the time',
    /Crossword done/.test(crosswordResult) && /entr(y|ies)/.test(crosswordResult) && /hint/.test(crosswordResult) && /\d+:\d\d/.test(crosswordResult),
    crosswordResult.replace(/\n+/g, ' | '),
  )
  check('crossword: the result counts the used hint', /\n1\nhint/.test(crosswordResult) || crosswordResult.includes('1\nhint'), crosswordResult.replace(/\n+/g, ' | '))
  await screenshot('crossword-result')
  const cardsAfterCrossword = await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).karty)`)
  check('crossword: schedule and card state unchanged', cardsAfterCrossword === cardsBeforeGames)

  // ---------------------------------------------------------------------------------------------
  // G2: letters from start to result
  // ---------------------------------------------------------------------------------------------
  await tap('#game-back')
  check('games: "Back" from the result goes to the home screen', await waitFor(`!!document.getElementById('play-letters')`, 5000))
  await tap('#play-letters')
  check('letters: the "Letters" button opens the game screen', await waitFor(`!!document.getElementById('letters-tiles')`, 8000), (await stageText()).replace(/\n+/g, ' | '))
  check('letters: the series has 10 words', (await js(`document.getElementById('letters-progress').textContent`)) === '1 / 10', await js(`document.getElementById('letters-progress').textContent`))
  check(
    'letters: tiles are touch targets of at least 44 px in at most three rows',
    (await js(`[...document.querySelectorAll('.tile')].every((b) => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 })`)) &&
      (await js(`new Set([...document.querySelectorAll('.tile')].map((b) => Math.round(b.getBoundingClientRect().top))).size`)) <= 3,
    await js(`[...document.querySelectorAll('.tile')].map((b) => Math.round(b.getBoundingClientRect().height)).join(', ')`),
  )
  const lettersMeaning = () => js(`document.getElementById('letters-meaning').textContent`)
  const lettersTiles = async () => JSON.parse(await js(`JSON.stringify([...document.querySelectorAll('.tile')].map((b) => b.textContent))`))
  const lettersAnswer = () => js(`[...document.querySelectorAll('.letters-slot')].map((e) => e.textContent).join('')`)
  const indexesForWord = (letters, word) => {
    const used = new Set()
    const result = []
    for (const char of word.toUpperCase()) {
      const i = letters.findIndex((z, j) => z === char && !used.has(j))
      if (i < 0) return null
      used.add(i)
      result.push(i)
    }
    return result
  }
  const firstLettersWord = byPl.get(await lettersMeaning())
  check('letters: the Polish meaning of a deck word stands at the top', !!firstLettersWord, await lettersMeaning())
  check(
    'letters: under the meaning there are as many places as letters',
    (await js(`document.querySelectorAll('.letters-slot').length`)) === firstLettersWord.length,
    `${await js(`document.querySelectorAll('.letters-slot').length`)} of ${firstLettersWord.length}`,
  )
  // Extra letters are the whole weight of the game: without them the tiles are exactly the word to copy.
  const tilesAtStart = (await lettersTiles()).length
  check('letters: there are more tiles than letters in the word', tilesAtStart >= firstLettersWord.length + 1 && tilesAtStart <= 14, `${tilesAtStart} tiles for ${firstLettersWord.length} letters`)
  await screenshot('letters')

  // A mistake: a full but wrong answer only shakes and leaves a chance to fix. No penalty and no moving on.
  const firstLetters = await lettersTiles()
  const goodIndexes = indexesForWord(firstLetters, firstLettersWord)
  const badIndexes = [...goodIndexes.slice(1), goodIndexes[0]]
  for (const i of badIndexes) {
    await tap(`.tile[data-index="${i}"]`)
    await wait(60)
  }
  const shook = await js(`!!document.querySelector('.letters-tiles.shake')`)
  await wait(500)
  check(
    'letters: a wrong answer shakes and stays to be fixed, no penalty',
    (await js(`document.getElementById('letters-progress').textContent`)) === '1 / 10' && (await lettersAnswer()).length === firstLettersWord.length,
    `shake: ${shook}, answer: ${await lettersAnswer()}`,
  )
  for (let i = 0; i < firstLettersWord.length; i++) {
    await tap('#letters-answer')
    await wait(60)
  }
  check('letters: a tap on the answer takes off the last letter', (await lettersAnswer()) === '', JSON.stringify(await lettersAnswer()))
  await tap('#letters-hint')
  await wait(200)
  check(
    'letters: a hint adds a letter and raises the counter',
    (await js(`document.getElementById('letters-hint').textContent`)) === 'Hint (1)' && (await lettersAnswer()).length === 1,
    `${await js(`document.getElementById('letters-hint').textContent`)} :: ${await lettersAnswer()}`,
  )

  // The whole round: each word built correctly moves on by itself.
  let built = 0
  for (let round = 0; round < 12; round++) {
    if (!(await js(`!!document.getElementById('letters-tiles')`))) break
    const word = byPl.get(await lettersMeaning())
    if (!word) break
    const already = (await lettersAnswer()).length
    const indexes = indexesForWord(await lettersTiles(), word)
    if (!indexes) break
    for (const i of indexes.slice(already)) {
      await tap(`.tile[data-index="${i}"]`)
      await wait(50)
    }
    built += 1
    await wait(600)
  }
  check('letters: a series of ten words goes to the end', built === 10, `built: ${built}`)
  check('letters: the series end shows the result and two ways out', await waitFor(`!!document.getElementById('play-again') && !!document.getElementById('game-back')`, 6000), (await stageText()).replace(/\n+/g, ' | '))
  const lettersResult = await stageText()
  check(
    'letters: the result is the number of words, hints and the time',
    /Series done/.test(lettersResult) && /10\nwords/.test(lettersResult) && /1\nhint/.test(lettersResult) && /\d+:\d\d/.test(lettersResult),
    lettersResult.replace(/\n+/g, ' | '),
  )
  await screenshot('letters-result')

  const cardsAfterGames = await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).karty)`)
  check('games: after crossword and letters localStorage has exactly the same cards', cardsAfterGames === cardsBeforeGames)
  check('games: game time counts to the study day, as in training', (await js(`JSON.parse(localStorage.getItem('mmf-v1')).dzis.sekundy`)) > 0, String(await js(`JSON.parse(localStorage.getItem('mmf-v1')).dzis.sekundy`)))

  // The crossword on iPhone SE: the grid must be readable and without sideways scrolling.
  await tap('#game-back')
  await waitFor(`!!document.getElementById('play-crossword')`, 5000)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true })
  await wait(300)
  await tap('#play-crossword')
  await waitFor(`!!document.getElementById('crossword-grid')`, 8000)
  const seCell = await js(`Math.round(document.querySelector('.crossword-cell').getBoundingClientRect().width * 10) / 10`)
  check('iPhone SE: a crossword cell is at least 28 px', seCell >= 28, `${seCell} px`)
  check('iPhone SE: the crossword grid fits without sideways scrolling', (await scrollsSideways()) === '' && (await js(`document.getElementById('crossword-grid').getBoundingClientRect().right <= innerWidth + 0.5`)), await scrollsSideways())
  await screenshot('crossword-se')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await wait(300)
  await drag('#crossword-grid', 0, 170)
  await wait(600)
  check('crossword: scrolling down does not end the game (you type letters there)', await js(`!!document.getElementById('crossword-grid')`), (await stageText()).replace(/\n+/g, ' | '))
  await tap('#crossword-close')
  check('crossword: the cross in the corner leaves the game', await waitFor(`!!document.getElementById('play-reviews')`, 5000), (await stageText()).replace(/\n+/g, ' | '))
  await tap('#play-letters')
  await waitFor(`!!document.getElementById('letters-tiles')`, 8000)
  await drag('#letters-tiles', 0, 170)
  await wait(600)
  check('letters: scrolling down does not end the game', await js(`!!document.getElementById('letters-tiles')`))
  await tap('#letters-close')
  check('letters: the cross in the corner leaves the game', await waitFor(`!!document.getElementById('play-reviews')`, 5000))
  await tap('#play-crossword')
  await waitFor(`!!document.getElementById('crossword-grid')`, 8000)
  await js(`document.getElementById('crossword-close').click(); 1`)
  check('crossword: the cross closes the game', await waitFor(`!!document.getElementById('play-reviews')`, 5000))

  // ---------------------------------------------------------------------------------------------
  // H: decks (on, off, add and remove)
  // ---------------------------------------------------------------------------------------------
  const deckToggle = (name) => `#decks-section .toggle[data-deck="${JSON.stringify(name).slice(1, -1)}"]`
  const decksText = () => js(`document.getElementById('decks-section').innerText`)
  await openMenu()
  const menuDecks = await decksText()
  check('decks: the menu has a section with the deck list and toggles', /Oxford 3000/.test(menuDecks) && (await js(`document.querySelectorAll('#decks-section .toggle').length`)) >= 2, menuDecks.replace(/\n+/g, ' | '))
  check('decks: all on by default', await js(`[...document.querySelectorAll('#decks-section .toggle')].every((b) => b.getAttribute('aria-checked') === 'true')`))
  await js(`document.getElementById('decks-section').scrollIntoView({ block: 'start' }); 1`)
  await wait(200)
  await screenshot('decks')

  const progressBeforeOff = await js(`document.getElementById('deck-progress').getAttribute('aria-label')`)
  const cardsBeforeOff = await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).karty)`)
  await js(`document.querySelector(${JSON.stringify(deckToggle('Przykład'))}).click(); 1`)
  await wait(300)
  check('decks: the toggle turns the deck off', (await js(`document.querySelector(${JSON.stringify(deckToggle('Przykład'))}).getAttribute('aria-checked')`)) === 'false')
  check('decks: a turned off deck stays on the list with its progress', /not in study/.test(await decksText()), (await decksText()).replace(/\n+/g, ' | '))
  check('decks: the progress of a turned off deck stays in the save', (await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).karty)`)) === cardsBeforeOff)
  check(
    'decks: the save gets the field wylaczoneTalie, and SAVE_VERSION stays 1',
    await js(`(() => { const z = JSON.parse(localStorage.getItem('mmf-v1')); return z.wersja === 1 && z.ustawienia.wylaczoneTalie.includes('Przykład') })()`),
    await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).ustawienia.wylaczoneTalie)`),
  )
  await js(`document.getElementById('menu').querySelector('.close').click(); 1`)
  await wait(300)
  check('decks: words of a turned off deck leave study', await waitFor(`!!document.getElementById('play-reviews') && document.getElementById('play-reviews').disabled`, 5000), (await stageText()).replace(/\n+/g, ' | '))
  await tap('#play-crossword')
  check('decks: words of a turned off deck also leave games', await waitFor(`document.getElementById('toast').textContent.startsWith('Not enough words for a crossword')`, 4000), await toastText())

  await openMenu()
  await js(`document.querySelector(${JSON.stringify(deckToggle('Przykład'))}).click(); 1`)
  await wait(300)
  await js(`document.getElementById('menu').querySelector('.close').click(); 1`)
  await wait(300)
  check(
    'decks: turning the deck on gives the words back to study with their progress',
    (await js(`document.getElementById('deck-progress').getAttribute('aria-label')`)) === progressBeforeOff,
    `${progressBeforeOff} -> ${await js(`document.getElementById('deck-progress').getAttribute('aria-label')`)}`,
  )
  check('decks: after turning on there is something to review again', await waitFor(`!document.getElementById('play-reviews').disabled`, 5000))

  // A new deck with its own name, and then removing it with its progress.
  await openMenu()
  await clickByText('#decks-section', 'Add deck')
  await waitFor(`!!document.getElementById('paste')`)
  await wait(400)
  await js(`(() => { const f = document.getElementById('paste'); f.value = 'kite ; latawiec\\nsledge ; sanki'; f.dispatchEvent(new Event('input')) })(); 1`)
  await waitFor(`document.querySelector('#preview .summary')?.textContent === '2 new, 0 updated, 0 errors'`)
  check('decks: a new deck gets the default name "Pasted YYYY-MM-DD"', /^Pasted \d{4}-\d{2}-\d{2}$/.test(await js(`document.getElementById('deck-name-input').value`)), await js(`document.getElementById('deck-name-input').value`))
  await js(`(() => { const f = document.getElementById('deck-name-input'); f.value = 'My list'; f.dispatchEvent(new Event('input')) })(); 1`)
  await wait(150)
  check('decks: the preview shows the name typed by hand', (await js(`document.getElementById('preview-deck').textContent`)) === 'Deck: My list', await js(`document.getElementById('preview-deck').textContent`))
  await js(`document.getElementById('add-words-button').click(); 1`)
  check('decks: adding a deck closes the sheet', await waitFor(`document.getElementById('add-words').hidden`, 8000))
  const t4 = await library()
  check('decks: new words have the deck name from the field', t4.slowa.filter((w) => w.talia === 'My list').length === 2 && t4.talie.some((d) => d.nazwa === 'My list'), JSON.stringify(t4.talie.map((d) => d.nazwa)))
  await openMenu()
  check('decks: the new deck is on the list with numbers', /My list/.test(await decksText()) && /0 \/ 2 known/.test(await decksText()), (await decksText()).replace(/\n+/g, ' | '))

  await js(`window.confirm = (text) => { window.__deckQuestion = text; return true }`)
  await js(`[...document.querySelectorAll('#decks-section button')].find((b) => b.getAttribute('aria-label') === 'Remove deck My list').click(); 1`)
  check('decks: removing asks and says how many words and cards will be lost', await waitFor(`/My list/.test(String(window.__deckQuestion || '')) && /2 words/.test(String(window.__deckQuestion || ''))`, 4000), String(await js(`window.__deckQuestion`)))
  check('decks: after confirming the deck goes away from the list', await waitFor(`!/My list/.test(document.getElementById('decks-section').innerText)`, 6000), (await decksText()).replace(/\n+/g, ' | '))
  const t5 = await library()
  check('decks: words of the removed deck go away from the database, the rest stays', !t5.slowa.some((w) => w.talia === 'My list') && t5.slowa.length === t4.slowa.length - 2 && !t5.talie.some((d) => d.nazwa === 'My list'), `${t5.slowa.length} words`)
  check('decks: removing does not touch the progress of other decks', (await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).karty)`)) === cardsBeforeOff)
  await js(`document.getElementById('menu').querySelector('.close').click(); 1`)
  await wait(300)

  // ---------------------------------------------------------------------------------------------
  // A user save from v3 (about 400 cards) must load without a loss
  // ---------------------------------------------------------------------------------------------
  const cardsV3 = {}
  for (let i = 0; i < 400; i++) {
    cardsV3[IDS[i]] = [savedCard({ due: inMinutes(i < 20 ? -(60 + i) : 1440 * (2 + (i % 40))), stability: 3 + (i % 50) })]
    if (i % 3 === 0) cardsV3[IDS[i]].push(savedCard({ due: inMinutes(1440 * (3 + (i % 20))), stability: 5 }))
  }
  const saveV3 = {
    wersja: 1,
    karty: cardsV3,
    pominiete: { [IDS[500]]: yesterdayDate },
    exp: 25140,
    // fields from before v4 that the app does not know any more
    punktyTygodnia: { tydzien: yesterdayDate, punkty: 640 },
    streak: { dni: 12, ostatniDzien: yesterdayDate, zamrozenia: 1, doZamrozenia: 4 },
    dzis: { data: todayDate, sekundy: 120, dodatkoweNowe: 0, powtorki: 3 },
    historia: { [yesterdayDate]: { oceny: 42, nowe: 8, exp: 1800, sekundy: 210 } },
    zgloszenia: [],
    ustawienia: { noweDziennie: 10, maksPowtorekDziennie: 60, dlugoscSerii: 15, autowymowa: true, mowienie: true, celDzienny: 60, podpowiedzMowienie: 'brak', kotwica: 'po kawie', kotwicaPytano: true },
    ostatniaKopia: new Date().toISOString(),
    rozproszono: 1,
  }
  await js(`localStorage.setItem('mmf-v1', ${JSON.stringify(JSON.stringify(saveV3))}); 1`)
  await js(`window.__old = 1`)
  await cdp('Page.reload', {})
  check('save v3: the app starts after loading', await waitFor(`!window.__old && document.documentElement.dataset.ready === '1'`, 15000))
  const afterV3 = await saved()
  check('save v3: all cards in place', Object.keys(afterV3.karty).length === Object.keys(cardsV3).length, `${Object.keys(afterV3.karty).length} / ${Object.keys(cardsV3).length}`)
  check(
    'save v3: XP, streak, skipped words and history with no loss',
    afterV3.exp === 25140 && afterV3.streak.dni === 12 && afterV3.pominiete[IDS[500]] === yesterdayDate && afterV3.historia[yesterdayDate].oceny === 42,
    JSON.stringify({ exp: afterV3.exp, streak: afterV3.streak.dni, history: afterV3.historia[yesterdayDate] }),
  )
  check('save v3: SAVE_VERSION still 1', afterV3.wersja === 1, String(afterV3.wersja))
  check('save v3: the gesture tutorial shows once after the update', await waitFor(`!document.getElementById('tutorial').hidden`, 6000))
  await closeTutorial()
  // Closing the tutorial saves the settings, so the anchor from the Polish version is saved in English now.
  check('save v3: the Polish habit anchor reads as the English one', (await saved()).ustawienia.kotwica === 'after coffee', (await saved()).ustawienia.kotwica)
  check('save v3: the app opens on a card', await waitFor(`!!document.getElementById('card')`, 6000), (await stageText()).replace(/\n+/g, ' | '))

  check('no JS errors in the console', consoleErrors.length === 0, consoleErrors.join(' | '))
} catch (error) {
  check('test stopped by an exception', false, error.stack)
} finally {
  ws.close()
  spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'])
  server?.kill()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} OK`)
if (failed.length) console.log('Failed:\n' + failed.map((r) => '  - ' + r.label).join('\n'))
process.exit(failed.length ? 1 : 0)
