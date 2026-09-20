// Test na zywym GitHub Pages w Chrome headless: instalacja offline, import pelnej talii Oxford 3000,
// ocena, odciecie sieci w stronie i w service workerze, odswiezenie.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KORZEN = dirname(fileURLToPath(import.meta.url))
const ROBOCZY = process.env.MMF_ROBOCZY || join(tmpdir(), 'mmf-testy')
const PROFIL = join(tmpdir(), 'mmf-live')
const CDP = 9344
const URL_APKI = process.env.MMF_URL || 'https://magic-lewko.github.io/magic-mini-fiszki/'
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const TALIA = process.env.MMF_TALIA || join(KORZEN, 'talie', 'oxford3000.json')

for (const [czego, sciezka] of [['Chrome', CHROME], ['talii Oxford 3000', TALIA]]) {
  if (existsSync(sciezka)) continue
  console.error(`Brak ${czego}: ${sciezka}`)
  process.exit(1)
}
mkdirSync(ROBOCZY, { recursive: true })

const czekaj = (ms) => new Promise((r) => setTimeout(r, ms))
const wyniki = []
function sprawdz(opis, warunek, szczegoly = '') {
  wyniki.push(!!warunek)
  console.log(`${warunek ? 'OK  ' : 'BLAD'} ${opis}${szczegoly ? ' :: ' + szczegoly : ''}`)
}

rmSync(PROFIL, { recursive: true, force: true })
const chrome = spawn(CHROME, [`--remote-debugging-port=${CDP}`, `--user-data-dir=${PROFIL}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' })
for (let i = 0; i < 100; i++) {
  try {
    await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json()
    break
  } catch {
    await czekaj(100)
  }
}
const przegladarka = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json()
const ws = new WebSocket(przegladarka.webSocketDebuggerUrl)
await new Promise((ok, nie) => {
  ws.onopen = ok
  ws.onerror = nie
})

let nr = 0
const oczekujace = new Map()
const bledyKonsoli = []
const zSw = { tak: 0, nie: [] }
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && oczekujace.has(m.id)) {
    const { ok, nie } = oczekujace.get(m.id)
    oczekujace.delete(m.id)
    if (m.error) nie(new Error(m.error.message))
    else ok(m.result)
  } else if (m.method === 'Runtime.exceptionThrown') {
    bledyKonsoli.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
  } else if (m.method === 'Network.responseReceived' && zSw.liczymy) {
    if (m.params.response.fromServiceWorker) zSw.tak += 1
    else zSw.nie.push(m.params.response.url)
  }
}
// sesja: strona albo service worker (flatten), bez sesji: cala przegladarka
const cdp = (method, params = {}, sessionId) =>
  new Promise((ok, nie) => {
    const id = ++nr
    oczekujace.set(id, { ok, nie })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: strona } = await cdp('Target.attachToTarget', { targetId, flatten: true })
const s = (method, params) => cdp(method, params, strona)
async function js(wyrazenie) {
  const r = await s('Runtime.evaluate', { expression: wyrazenie, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
async function czekajNa(wyrazenie, ms = 15000) {
  const koniec = Date.now() + ms
  while (Date.now() < koniec) {
    try {
      if (await js(wyrazenie)) return true
    } catch {
      // strona w trakcie przeladowania
    }
    await czekaj(150)
  }
  return false
}
// Swipe w zadana strone: te same zdarzenia dotyku, co na telefonie.
async function przeciagnij(selektor, dx, dy, krokow = 10) {
  const { x, y } = await js(`(() => { const r = document.querySelector(${JSON.stringify(selektor)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 40 } })()`)
  await s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= krokow; i++) {
    await czekaj(16)
    await s('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / krokow, y: y + (dy * i) / krokow }] })
  }
  await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

// Samouczek gestow pokazuje sie raz po instalacji i zaslania cala karte. Zamyka go tapniecie
// w nakladke (nie ma przycisku), wiec bez tego kroku kazdy dalszy dotyk trafia w samouczek, a nie w karte.
async function zamknijSamouczek() {
  if (await js(`!document.getElementById('samouczek') || document.getElementById('samouczek').hidden`)) return false
  await tapnij('#samouczek')
  await czekajNa(`document.getElementById('samouczek').hidden`, 3000)
  return true
}

async function tapnij(selektor, gora = false) {
  const { x, y } = await js(`(() => { const r = document.querySelector(${JSON.stringify(selektor)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: ${gora ? 'r.top + 30' : 'r.top + r.height / 2'} } })()`)
  await s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
const exp = async () => JSON.parse((await js(`localStorage.getItem('mmf-v1')`)) || '{}').exp ?? 0
const statusSw = () => js(`new Promise((ok) => { const k = new MessageChannel(); k.port1.onmessage = (e) => ok(e.data); navigator.serviceWorker.controller.postMessage('status', [k.port2]) })`)
const dlugoscTalii = () => js(`new Promise((ok, nie) => { const z = indexedDB.open('mmf'); z.onerror = () => nie(z.error); z.onsuccess = () => { const g = z.result.transaction('dane').objectStore('dane').get('talia'); g.onsuccess = () => { ok(g.result?.slowa?.length ?? 0); z.result.close() } } })`)
const OFFLINE = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }

try {
  await s('Page.enable')
  await s('Runtime.enable')
  await s('Network.enable')
  await s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
  await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await s('Page.navigate', { url: URL_APKI })

  sprawdz('apka startuje z GitHub Pages', await czekajNa(`document.documentElement.dataset.gotowe === '1'`, 20000))
  await zamknijSamouczek()
  sprawdz('service worker przejmuje strone', await czekajNa(`!!navigator.serviceWorker.controller`, 30000))
  sprawdz('znacznik "offline ✓"', await czekajNa(`document.getElementById('offline').textContent === 'offline ✓'`, 20000), await js(`document.getElementById('offline').textContent`))
  const status = await statusSw()
  sprawdz('wszystkie pliki w cache', status.zapisane === status.pliki, JSON.stringify(status))

  // import pelnej talii
  const { root } = await s('DOM.getDocument', { depth: 1 })
  const { nodeId } = await s('DOM.querySelector', { nodeId: root.nodeId, selector: '#plik-slowek' })
  let t0 = Date.now()
  await s('DOM.setFileInputFiles', { nodeId, files: [TALIA.replaceAll('/', '\\')] })
  sprawdz('podglad talii: 2981 nowych, 0 bledow', await czekajNa(`document.querySelector('#podglad .podsumowanie')?.textContent.startsWith('2981 now')`), await js(`document.getElementById('podglad').innerText.slice(0, 200)`))
  const czasPodgladu = Date.now() - t0
  t0 = Date.now()
  await tapnij('#dodaj-slowka')
  sprawdz(
    'po dodaniu talii apka pokazuje karte albo ekran wyboru',
    await czekajNa(`!!document.getElementById('karta') || /Powt\u00f3rki/.test(document.getElementById('scena').innerText)`, 20000),
  )
  await zamknijSamouczek()
  // v4: apka wchodzi prosto na karte, a gdy pokaze ekran wyboru, startujemy przyciskiem "Powtorki".
  await js(`[...document.querySelectorAll('#scena button')].find((b) => /Powt\u00f3rki|Start/.test(b.textContent))?.click()`)
  sprawdz('karta po dodaniu talii', await czekajNa(`!!document.getElementById('karta')`, 20000))
  console.log(`     czas: podglad ${czasPodgladu} ms, dodanie ${Date.now() - t0} ms`)
  sprawdz('IndexedDB: 2981 slow', (await dlugoscTalii()) === 2981)
  const pierwsze = await js(`document.querySelector('#karta .slowo')?.textContent`)
  sprawdz('pierwsza karta = pierwsze slowo talii (test)', pierwsze === 'test', pierwsze)
  writeFileSync(join(ROBOCZY, 'live-karta.png'), Buffer.from((await s('Page.captureScreenshot', { format: 'png' })).data, 'base64'))

  // Samouczek wyskakuje dopiero razem z pierwsza karta, wiec zamykamy go tutaj, nie wczesniej.
  await zamknijSamouczek()
  // Karta w trakcie wjazdu jeszcze sie przesuwa, wiec tapniecie w nia potrafi trafic obok.
  await czekajNa(`!document.getElementById('karta').classList.contains('wjazd')`, 3000)
  await tapnij('#karta', true)
  sprawdz('tapniecie odslania karte', await czekajNa(`document.getElementById('karta').classList.contains('odkryta')`, 3000), await js(`document.getElementById('karta').className`))
  const odwrot = await js(`document.getElementById('karta').innerText`)
  sprawdz('odwrot karty: tlumaczenie i zdania', odwrot.includes('sprawdzian') && odwrot.includes('angielskiego'), odwrot.replace(/\n+/g, ' | '))
  // v4: ocena to gest w prawo, przyciskow nie ma.
  // Ocena musi pasc w ciagu 8 s od odsloniecia, inaczej apka slusznie liczy ja jako "Prawie".
  await przeciagnij('#karta', 170, 0)
  writeFileSync(join(ROBOCZY, 'live-odwrot.png'), Buffer.from((await s('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  sprawdz('gest w prawo = Umiem, +50 EXP', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1') || '{}').exp === 50`), await exp())

  // odciecie sieci: strona i service worker
  await s('Network.emulateNetworkConditions', OFFLINE)
  // Uspiony service worker nie jest listowany jako cel: wiadomosc go budzi.
  await statusSw()
  const { targetInfos } = await cdp('Target.getTargets')
  const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(URL_APKI))
  sprawdz('znaleziony target service workera', !!sw, sw?.url)
  const { sessionId: sesjaSw } = await cdp('Target.attachToTarget', { targetId: sw.targetId, flatten: true })
  await cdp('Network.enable', {}, sesjaSw)
  await cdp('Network.emulateNetworkConditions', OFFLINE, sesjaSw)
  await cdp('Runtime.runIfWaitingForDebugger', {}, sesjaSw).catch(() => {})
  const siecOdcieta = await js(`fetch('${URL_APKI}nie-ma-takiego-pliku-${Date.now()}.txt').then(() => false, () => true)`)
  sprawdz('siec naprawde odcieta (fetch spoza cache pada)', siecOdcieta)

  zSw.liczymy = true
  await js(`window.__stary = 1`)
  await s('Page.reload', {})
  sprawdz('offline: odswiezenie dziala', await czekajNa(`!window.__stary && document.documentElement.dataset.gotowe === '1'`, 20000))
  sprawdz('offline: EXP zachowane', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1') || '{}').exp === 50`), await exp())
  sprawdz('offline: talia 2981 slow w IndexedDB', (await dlugoscTalii()) === 2981)
  sprawdz('offline: ekran startu dnia albo karta', await czekajNa(`!!document.getElementById('karta') || document.getElementById('scena').innerText.includes('Cel dnia')`))
  sprawdz('offline: wszystkie pliki z service workera', zSw.nie.length === 0, `z SW: ${zSw.tak}, z sieci: ${zSw.nie.join(', ') || 'brak'}`)
  sprawdz('brak bledow JS', bledyKonsoli.length === 0, bledyKonsoli.join(' | '))
} catch (blad) {
  sprawdz('test przerwany', false, blad.message)
} finally {
  const ok = wyniki.filter(Boolean).length
  console.log(`\nWYNIK: ${ok}/${wyniki.length} OK`)
  ws.close()
  chrome.kill()
  await czekaj(800)
  rmSync(PROFIL, { recursive: true, force: true })
  process.exit(ok === wyniki.length ? 0 : 1)
}
