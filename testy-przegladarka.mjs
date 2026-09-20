// Test dymny apki w prawdziwym Chrome (headless) przez CDP. v4: apka sterowana gestem.
// Sprawdza import pliku, start od razu na karcie, samouczek gestow, gesty w cztery strony
// (Input.dispatchTouchEvent), dwukrotne tapniecie jako cofniecie, brak przyciskow i menu na ekranie nauki,
// pasek postepu bez cyfr, ramke zmieniajaca kolor z czasem odpowiedzi, degradacje "Umiem" do "Prawie"
// po 8 s, ekran wyboru z trzema przyciskami, obie gry od startu do wyniku, talie (wlaczanie, wylaczanie,
// dodanie i usuniecie), prefers-reduced-motion, brak przewijania w bok, offline,
// aktualizacje SW i kopie zapasowa, a na koncu silnik: sufit powtorek i kolejnosc po pilnosci, tryb
// nadrabiania, seria z zamrozeniami, podpowiedz po 7 s, interferencje, leech i odznake na ikonie.
// Pracuje na kopii dist/ w katalogu roboczym poza repo.
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const KORZEN = dirname(fileURLToPath(import.meta.url))
// Katalog roboczy trzyma kopie dist/, profil Chrome i zrzuty ekranu. Jest poza repo, bo Chrome na Windows
// nie tworzy CacheStorage przy sciezce profilu dluzszej niz MAX_PATH, a bez CacheStorage nie ma czego testowac.
const ROBOCZY = process.env.MMF_ROBOCZY || join(tmpdir(), 'mmf-testy')
const STRONA = join(ROBOCZY, 'strona')
const PROFIL = process.env.SMOKE_PROFIL || join(ROBOCZY, 'profil-chrome')
const PORT = 4211
const CDP = 9333
const URL_APKI = `http://127.0.0.1:${PORT}/magic-mini-fiszki/`
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PRZYKLAD = join(KORZEN, 'dane', 'przyklad.json')
// Scenariusze silnika (interferencje, sufit powtorek, leeche) potrzebuja duzej talii, a ta zostaje lokalnie.
const OXFORD = process.env.MMF_TALIA || join(KORZEN, 'talie', 'oxford3000.json')
const N = JSON.parse(readFileSync(PRZYKLAD, 'utf8')).slowa.length

for (const [czego, sciezka] of [
  ['Chrome', CHROME],
  ['zbudowanej apki - odpal "npm run build"', join(KORZEN, 'dist')],
  ['talii Oxford 3000 - wypakuj ja z kopii zapasowej albo zbuduj przez talie/zrodla', OXFORD],
]) {
  if (existsSync(sciezka)) continue
  console.error(`Brak ${czego}: ${sciezka}`)
  process.exit(1)
}

const czekaj = (ms) => new Promise((r) => setTimeout(r, ms))
const wyniki = []
function sprawdz(opis, warunek, szczegoly = '') {
  wyniki.push({ opis, ok: !!warunek })
  console.log(`${warunek ? 'OK  ' : 'BLAD'} ${opis}${szczegoly ? ' :: ' + szczegoly : ''}`)
}

rmSync(STRONA, { recursive: true, force: true })
rmSync(PROFIL, { recursive: true, force: true })
mkdirSync(STRONA, { recursive: true })
cpSync(join(KORZEN, 'dist'), join(STRONA, 'dist'), { recursive: true })
cpSync(join(KORZEN, 'serwer.mjs'), join(STRONA, 'serwer.mjs'))

let serwer
async function startSerwera() {
  serwer = spawn(process.execPath, [join(STRONA, 'serwer.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(URL_APKI)
      return
    } catch {
      await czekaj(100)
    }
  }
  throw new Error('serwer nie wstal')
}
async function stopSerwera() {
  serwer.kill()
  await czekaj(400)
}

const chrome = spawn(CHROME, [`--remote-debugging-port=${CDP}`, `--user-data-dir=${PROFIL}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' })
for (let i = 0; i < 100; i++) {
  try {
    await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json()
    break
  } catch {
    await czekaj(100)
  }
}
const cel = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(cel.webSocketDebuggerUrl)
await new Promise((ok, nie) => {
  ws.onopen = ok
  ws.onerror = nie
})
let nr = 0
const oczekujace = new Map()
const bledyKonsoli = []
const dziennik = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && oczekujace.has(m.id)) {
    const { ok, nie } = oczekujace.get(m.id)
    oczekujace.delete(m.id)
    if (m.error) nie(new Error(m.error.message))
    else ok(m.result)
  } else if (m.method === 'Runtime.exceptionThrown') {
    bledyKonsoli.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    bledyKonsoli.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
  } else if (m.method === 'Log.entryAdded') {
    dziennik.push(`${m.params.entry.level} ${m.params.entry.source}: ${m.params.entry.text} ${m.params.entry.url || ''}`)
  } else if (m.method === 'ServiceWorker.workerErrorReported') {
    dziennik.push(`SW error: ${JSON.stringify(m.params.errorMessage)}`)
  } else if (m.method === 'ServiceWorker.workerVersionUpdated') {
    for (const v of m.params.versions) dziennik.push(`SW wersja ${v.versionId}: ${v.runningStatus} / ${v.status} ${v.scriptURL}`)
  }
}
const cdp = (method, params = {}) =>
  new Promise((ok, nie) => {
    const id = ++nr
    oczekujace.set(id, { ok, nie })
    ws.send(JSON.stringify({ id, method, params }))
  })
async function js(wyrazenie) {
  const r = await cdp('Runtime.evaluate', { expression: wyrazenie, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
async function czekajNa(wyrazenie, ms = 10000) {
  const koniec = Date.now() + ms
  while (Date.now() < koniec) {
    try {
      if (await js(wyrazenie)) return true
    } catch {
      // strona w trakcie przeladowania
    }
    await czekaj(100)
  }
  return false
}
async function zrzut(nazwa) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(ROBOCZY, `zrzut-${nazwa}.png`), Buffer.from(data, 'base64'))
}
async function punkt(selektor, gora = false) {
  return js(`(() => { const e = document.querySelector(${JSON.stringify(selektor)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: ${gora ? 'r.top + 40' : 'r.top + r.height / 2'} } })()`)
}
async function tapnij(selektor, gora = false) {
  const { x, y } = await punkt(selektor, gora)
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
// Dwukrotne tapniecie: oba w oknie 280 ms, bez liczenia punktu po raz drugi (to kosztuje kilkadziesiat ms).
async function dwukrotneTapniecie(selektor) {
  const { x, y } = await punkt(selektor, true)
  for (let i = 0; i < 2; i++) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    if (i === 0) await czekaj(60)
  }
}
// Gest w dowolna strone. Zwraca funkcje puszczajaca palec, zeby dalo sie zrobic zrzut w trakcie gestu.
async function ciagnij(selektor, dx, dy, krokow = 8, przerwa = 16) {
  const { x, y } = await punkt(selektor, true)
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= krokow; i++) {
    await czekaj(przerwa)
    await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / krokow, y: y + (dy * i) / krokow }] })
  }
  // Puszczenie palca. Podane przesuniecie najpierw odprowadza palec w to miejsce (liczac od punktu
  // startu, nie od przesunietej karty), wiec da sie wrocic pod prog i sprawdzic, ze karta nie zostala oceniona.
  return async (dxKoncowe, dyKoncowe) => {
    if (dxKoncowe !== undefined) {
      await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dxKoncowe, y: y + dyKoncowe }] })
      await czekaj(40)
    }
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
}
async function przeciagnij(selektor, dx, dy, krokow = 8, przerwa = 16) {
  const pusc = await ciagnij(selektor, dx, dy, krokow, przerwa)
  await pusc()
}
// Gesty jako nazwy kierunkow: progi to 90 px w poziomie i 80 px w pionie, wiec bierzemy z zapasem.
const GESTY = { prawo: [170, 0], lewo: [-170, 0], gora: [0, -150], dol: [0, 150] }
const gest = (kierunek) => przeciagnij('#karta', ...GESTY[kierunek])
async function klawisz(key) {
  const code = { ' ': 'Space', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' }[key] || key
  const kody = { ' ': 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: kody[key], text: key === ' ' ? ' ' : undefined })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kody[key] })
}
async function plikDoInputu(selektor, sciezka) {
  const { root } = await cdp('DOM.getDocument', { depth: 1 })
  const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: selektor })
  await cdp('DOM.setFileInputFiles', { nodeId, files: [sciezka.replaceAll('/', '\\')] })
}
const zapis = async () => JSON.parse((await js(`localStorage.getItem('mmf-v1')`)) || '{}')
// Pole "exp" zostalo w zapisie dla zgodnosci ze starszym telefonem; apka nigdzie go nie pokazuje,
// ale w tescie jest najprostszym sposobem na sprawdzenie, jaka ocena naprawde zostala zapisana.
const exp = async () => (await zapis()).exp ?? 0
const slowoKarty = () => js(`document.querySelector('#karta .slowo')?.textContent`)
const scenaTekst = () => js(`document.getElementById('scena').innerText`)
const menuTekst = () => js(`document.getElementById('menu').innerText`)
const toastTekst = () => js(`document.getElementById('toast').textContent`)
const notkaTekst = () => js(`document.getElementById('notka').hidden ? '' : document.getElementById('notka').textContent`)
const statusSw = () => js(`new Promise((ok) => { const k = new MessageChannel(); k.port1.onmessage = (e) => ok(e.data); navigator.serviceWorker.controller.postMessage('status', [k.port2]) })`)
const talia = () => js(`new Promise((ok, nie) => { const z = indexedDB.open('mmf'); z.onerror = () => nie(z.error); z.onsuccess = () => { const g = z.result.transaction('dane').objectStore('dane').get('talia'); g.onsuccess = () => { ok(g.result); z.result.close() } } })`)
const klikPoTekscie = (gdzie, tekst) =>
  js(`[...document.querySelectorAll(${JSON.stringify(gdzie)} + ' button')].find((b) => b.textContent === ${JSON.stringify(tekst)}).click()`)
// Menu jest schowane na ekranie nauki (B), wiec do odczytu statystyk w trakcie serii otwieramy je
// programowo. Tabela liczb siedzi pod "Szczegóły", wiec rozwijamy je przed czytaniem.
async function otworzMenu() {
  if (!(await js(`document.getElementById('menu').hidden`))) return
  await js(`document.getElementById('menu-przycisk').click(); 1`)
  await czekajNa(`!document.getElementById('menu').hidden`)
  await czekaj(250)
  await js(`(() => { const d = document.getElementById('szczegoly-statystyk'); if (d) d.open = true })(); 1`)
  await czekaj(120)
}
async function menuMa(nazwa, wartosc) {
  const byloOtwarte = !(await js(`document.getElementById('menu').hidden`))
  await otworzMenu()
  const tekst = (await menuTekst()).replaceAll('\u00a0', ' ')
  if (!byloOtwarte) {
    await js(`document.querySelector('#menu .zamknij')?.click(); 1`)
    await czekaj(150)
  }
  return tekst.includes(`${nazwa}\n${wartosc}`)
}
// Czy zawartosc ekranu miesci sie bez przewijania (apka ma byc jednoekranowa).
const miesciSie = (selektor) =>
  js(`(() => { const e = document.querySelector(${JSON.stringify(selektor)}); return !e || e.scrollHeight <= e.clientHeight + 1 })()`)

// Zwraca nazwy elementow, ktore przewijaja sie w bok. Pusty tekst znaczy, ze zaden nie przewija.
const przewijaWBok = () =>
  js(`(() => {
    const kandydaci = [
      document.documentElement,
      document.body,
      document.getElementById('scena'),
      document.getElementById('karta'),
      ...document.querySelectorAll('#scena .ekran, .arkusz-tresc, .przyrosty, .wybor-przyciski, .samouczek-siatka, .nauka-punkt, .kotwica-opcje'),
    ]
    return kandydaci
      .filter(Boolean)
      .filter((e) => e.scrollWidth > e.clientWidth + 1)
      .map((e) => e.className || e.tagName)
      .join(', ')
  })()`)

// Widoczne przyciski gory i dolu ekranu nauki. Ukryte przyciski dla czytnika ekranu maja klase
// "tylko-czytnik" i nie licza sie jako widoczne.
const widocznePrzyciski = () =>
  js(`[...document.querySelectorAll('.gora button, #akcje button')]
    .filter((b) => !b.hidden && !b.classList.contains('tylko-czytnik'))
    .map((b) => b.id || b.textContent)`)

const ukrytePrzyciski = () => js(`[...document.querySelectorAll('#akcje button.tylko-czytnik')].map((b) => b.textContent)`)

const ramkaKarty = () => js(`getComputedStyle(document.getElementById('karta')).borderTopColor`)
const stanKarty = () =>
  js(`(() => { const k = document.getElementById('karta'); return k ? k.className + ' :: ' + (k.querySelector('.slowo')?.textContent || '') : 'brak karty: ' + document.getElementById('scena').innerText.replace(/\\n+/g, ' | ') })()`)

// Podglad animacji wylotu bez czekania na prawdziwa ocene: nazwa animacji mowi, czy niesie ruch.
const probaWylotu = (kierunek = 'prawo') =>
  js(`(() => {
    const d = document.createElement('div')
    d.className = 'karta wylot-${kierunek}'
    document.body.appendChild(d)
    const s = getComputedStyle(d)
    const w = { nazwa: s.animationName, czas: s.animationDuration }
    d.remove()
    return w
  })()`)

// Znak wyniku zyje tylko przez czas wylotu karty (przy wylaczonym ruchu 80 ms), wiec lapiemy go
// w przegladarce: obserwatorem i dodatkowo krotkim interwalem, bo 80 ms latwo przegapic z zewnatrz.
const obserwujWynik = () =>
  js(`(() => {
    window.__wynik = null
    const zapamietaj = () => {
      const w = document.querySelector('#karta .wynik')
      if (!w || window.__wynik) return
      const s = getComputedStyle(w)
      window.__wynik = { znak: w.textContent, kolor: s.color, czas: s.animationDuration, klasy: document.getElementById('karta').className }
    }
    if (window.__obs) window.__obs.disconnect()
    window.__obs = new MutationObserver(zapamietaj)
    window.__obs.observe(document.body, { childList: true, subtree: true })
    clearInterval(window.__petlaWyniku)
    window.__petlaWyniku = setInterval(zapamietaj, 5)
    return 1
  })()`)

// Znak wyniku na probce, bez scigania sie z 80 ms wylotu: liczy sie kolor, znak i brak ruchu.
const probaWyniku = (klasa) =>
  js(`(() => {
    const k = document.createElement('div')
    k.className = 'karta wynik-' + ${JSON.stringify(klasa)}
    const w = document.createElement('div')
    w.className = 'wynik'
    w.textContent = 'x'
    k.appendChild(w)
    document.body.appendChild(k)
    const s = getComputedStyle(w)
    const wynik = { kolor: s.color, nazwa: s.animationName, czas: s.animationDuration, ramka: getComputedStyle(k).borderTopColor }
    k.remove()
    return wynik
  })()`)

const pierwszeH3 = () =>
  js(`[...document.querySelectorAll('#menu .sekcja')].map((s) => s.querySelector('h3')?.textContent || '')`)

// Kontrast wg WCAG 2.1. Tlo bierzemy z pierwszego przodka z nieprzezroczystym wypelnieniem.
const kontrast = (selektor) =>
  js(`(() => {
    const e = document.querySelector(${JSON.stringify(selektor)})
    if (!e) return null
    const liczby = (t) => (String(t).match(/[0-9.]+/g) || []).map(Number)
    const kanal = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
    const lum = (k) => 0.2126 * kanal(k[0]) + 0.7152 * kanal(k[1]) + 0.0722 * kanal(k[2])
    const kolor = liczby(getComputedStyle(e).color)
    let tlo = null
    for (let w = e; w; w = w.parentElement) {
      const k = liczby(getComputedStyle(w).backgroundColor)
      if (k.length >= 3 && (k.length < 4 || k[3] > 0.95)) { tlo = k; break }
    }
    if (!tlo) return null
    const a = lum(kolor)
    const b = lum(tlo)
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100
  })()`)

// Po ocenie karta wylatuje przez 240 ms, wiec najpierw czekamy na swieza (jeszcze nieodkryta) karte.
async function odslonIOcen(kierunek) {
  await czekajNa(`!!document.getElementById('karta') && !document.getElementById('karta').classList.contains('odkryta')`)
  await czekajNa(`!document.getElementById('karta').classList.contains('wjazd')`, 3000)
  await tapnij('#karta', true)
  await czekajNa(`document.getElementById('karta').classList.contains('odkryta')`)
  await czekaj(120)
  await gest(kierunek)
}

// Swieza karta to taka, ktora nie jest ani odkryta, ani w trakcie wjazdu. Bez tego test tapie w karte,
// ktora wlasnie wylatuje, a jej zdarzenia przepadaja razem z usunietym elementem.
const czekajNaSwiezaKarte = (ms = 6000) =>
  czekajNa(
    `!!document.getElementById('karta') && !document.getElementById('karta').classList.contains('odkryta') && !document.getElementById('karta').classList.contains('wjazd')`,
    ms,
  )

async function zamknijSamouczek() {
  if (await js(`document.getElementById('samouczek').hidden`)) return
  await tapnij('#samouczek')
  await czekajNa(`document.getElementById('samouczek').hidden`, 3000)
}

try {
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Log.enable')
  await cdp('ServiceWorker.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await startSerwera()
  await cdp('Page.navigate', { url: URL_APKI })

  sprawdz('apka startuje w podkatalogu', await czekajNa(`document.documentElement.dataset.gotowe === '1'`))
  const przejal = await czekajNa(`!!navigator.serviceWorker.controller`, 15000)
  sprawdz('service worker przejmuje strone', przejal)
  if (!przejal) {
    console.log('rejestracja:', await js(`navigator.serviceWorker.getRegistration().then((r) => r ? JSON.stringify({ scope: r.scope, active: r.active?.state, waiting: r.waiting?.state, installing: r.installing?.state }) : 'brak')`))
    console.log('komunikaty:', await js(`document.getElementById('komunikaty').innerText`))
    console.log('konsola:', bledyKonsoli.join(' | '))
    console.log('dziennik:\n' + dziennik.join('\n'))
    throw new Error('service worker nie przejal strony')
  }
  sprawdz('znacznik "offline ✓"', await czekajNa(`document.getElementById('offline').textContent === 'offline ✓'`), await js(`document.getElementById('offline').textContent`))
  const status = await statusSw()
  sprawdz('SW: wszystkie pliki w cache', status.zapisane === status.pliki, JSON.stringify(status))
  const kluczeCache = await js(`caches.open('mmf-${status.wersja}').then((c) => c.keys()).then((k) => k.map((r) => r.url))`)
  sprawdz('SW: klucze w cache bez parametru ?v=', kluczeCache.length === status.pliki && kluczeCache.every((u) => !u.includes('?')), kluczeCache.slice(0, 3).join(', '))
  sprawdz('pusta talia otwiera dodawanie', await czekajNa(`!document.getElementById('dodawanie').hidden`))

  await plikDoInputu('#plik-slowek', PRZYKLAD)
  sprawdz('podglad pliku przed dodaniem', await czekajNa(`document.querySelector('#podglad .podsumowanie')?.textContent.startsWith('${N} now')`), await js(`document.getElementById('podglad').innerText`))
  sprawdz('podglad bez tekstu "false"', !(await js(`document.getElementById('podglad').textContent`)).includes('false'))
  sprawdz('dodawanie: pole nazwy talii z nazwa z pliku', (await js(`document.getElementById('nazwa-talii').value`)) === 'Przykład', await js(`document.getElementById('nazwa-talii').value`))
  // Arkusz wjezdza 220 ms (animacja "wysun"), wiec tapniecie w trakcie trafiloby obok przycisku.
  await czekaj(400)
  await tapnij('#dodaj-slowka')

  // ---------------------------------------------------------------------------------------------
  // E: ekran wyboru zamiast ekranu startu
  // ---------------------------------------------------------------------------------------------
  sprawdz('po dodaniu slow ekran wyboru', await czekajNa(`!document.getElementById('karta') && !!document.getElementById('gra-powtorki')`, 8000), (await scenaTekst()).replace(/\n+/g, ' | '))
  sprawdz('talia w IndexedDB', (await talia()).slowa.length === N)
  const wybor = await scenaTekst()
  sprawdz(
    'wybor: pasek talii z jedna liczba i trzy duze przyciski',
    /^\d+ \/ \d+$/.test(await js(`document.querySelector('.talia-liczba').textContent`)) &&
      (await js(`[...document.querySelectorAll('.wybor-przyciski button')].map((b) => b.textContent).join(',')`)) === 'Powtórki,Krzyżówka,Literki',
    `${await js(`document.querySelector('.talia-liczba').textContent`)} :: ${await js(`[...document.querySelectorAll('.wybor-przyciski button')].map((b) => b.textContent).join(',')`)}`,
  )
  sprawdz('wybor: menu w rogu jest widoczne', await js(`!document.getElementById('menu-przycisk').hidden`))
  sprawdz('wybor: bez rangi, punktow i celu dnia', !/ranga|pkt|Cel dnia|utrwalonych/i.test(wybor), wybor.replace(/\n+/g, ' | '))
  sprawdz('wybor: miesci sie bez przewijania i nie przewija w bok', (await miesciSie('#scena .ekran')) && (await przewijaWBok()) === '', await przewijaWBok())
  await zrzut('v4-wybor')
  sprawdz('wybor: dwa paski postepu talii (gorny i duzy) maja te same dwa segmenty', (await js(`document.querySelectorAll('.talia-tor i').length`)) === 2 && (await js(`document.querySelectorAll('.postep-talii i').length`)) === 2)

  // Gry biora slowa do powtorki na dzis, a gdy ich brak, ostatnio uczone. Swiezo dodana talia nie ma
  // jeszcze zadnego uczonego slowa, wiec obie gry maja powiedziec, czego brakuje.
  await klikPoTekscie('#scena', 'Krzyżówka')
  sprawdz('wybor: krzyzowka bez uczonych slow mowi jednym zdaniem, czego brakuje', await czekajNa(`document.getElementById('toast').textContent.startsWith('Za mało słów na krzyżówkę')`), await toastTekst())
  await klikPoTekscie('#scena', 'Literki')
  sprawdz('wybor: literki bez uczonych slow mowia jednym zdaniem, czego brakuje', await czekajNa(`document.getElementById('toast').textContent.startsWith('Za mało słów na literki')`), await toastTekst())

  await klikPoTekscie('#scena', 'Powtórki')
  sprawdz('karta po wejsciu w powtorki', await czekajNa(`!!document.getElementById('karta')`, 8000))

  // ---------------------------------------------------------------------------------------------
  // A: samouczek gestow raz po aktualizacji
  // ---------------------------------------------------------------------------------------------
  sprawdz('samouczek gestow pokazuje sie przy pierwszej karcie', await czekajNa(`!document.getElementById('samouczek').hidden`, 5000))
  const samouczek = await js(`document.getElementById('samouczek').innerText`)
  sprawdz(
    'samouczek: cztery strzalki z podpisami i zdanie o tapnieciu',
    (await js(`document.querySelectorAll('#samouczek .samouczek-gest').length`)) === 4 &&
      (await js(`[...document.querySelectorAll('#samouczek .samouczek-strzalka')].map((e) => e.textContent).join('')`)) === '→←↑↓' &&
      samouczek.includes('Umiem') && samouczek.includes('Nie umiem') && samouczek.includes('Prawie') && samouczek.includes('Koniec nauki') &&
      samouczek.includes('dwukrotne cofa'),
    samouczek.replace(/\n+/g, ' | '),
  )
  sprawdz('samouczek: nie przewija sie w bok', (await przewijaWBok()) === '', await przewijaWBok())
  // Toast z poprzedniego kroku znika sam po 3,5 s; zrzut ma pokazywac sam samouczek.
  await czekajNa(`document.getElementById('toast').hidden`, 4000)
  await zrzut('v4-samouczek')
  await tapnij('#samouczek')
  sprawdz('samouczek znika po tapnieciu i zapisuje sie w ustawieniach', await czekajNa(`document.getElementById('samouczek').hidden`, 3000) && (await zapis()).ustawienia.samouczekGestow === true, JSON.stringify((await zapis()).ustawienia))
  await czekaj(500)
  sprawdz(
    'tapniecie zamykajace samouczek nie odslania karty pod spodem',
    await js(`!document.getElementById('karta').classList.contains('odkryta')`),
    await stanKarty(),
  )

  // ---------------------------------------------------------------------------------------------
  // B: ekran nauki bez rozpraszaczy
  // ---------------------------------------------------------------------------------------------
  await czekajNa(`!!document.getElementById('karta')`)
  sprawdz('pierwsza karta = pierwsze slowo listy', (await slowoKarty()) === 'apple', await slowoKarty())
  const przyciski = await widocznePrzyciski()
  sprawdz('ekran nauki: zaden przycisk gory ani dolu nie jest widoczny', przyciski.length === 0, JSON.stringify(przyciski))
  sprawdz('ekran nauki: przycisk menu jest schowany', await js(`document.getElementById('menu-przycisk').hidden`))
  const ukryte = await ukrytePrzyciski()
  sprawdz(
    'ekran nauki: ukryte przyciski dla czytnika ekranu zostaja',
    ukryte.includes('Odsłoń kartę') && ukryte.includes('Pomijam to słowo') && ukryte.includes('Zakończ naukę'),
    JSON.stringify(ukryte),
  )
  const gora = await js(`(() => {
    const g = document.querySelector('.gora')
    return {
      tekst: g.innerText.trim(),
      paski: g.querySelectorAll('.postep-talii i').length,
      wysokoscAkcji: Math.round(document.getElementById('akcje').getBoundingClientRect().height),
    }
  })()`)
  sprawdz('ekran nauki: gora to sam pasek postepu, bez cyfr i bez tekstu', gora.tekst === '' && gora.paski === 2, JSON.stringify(gora))
  sprawdz('ekran nauki: dol ekranu nie zajmuje miejsca', gora.wysokoscAkcji <= 1, `${gora.wysokoscAkcji} px`)
  // Karta konczy sie razem z ekranem: wczesniej odcinal ja dolny margines siatki i odstep nad pustym footerem.
  const pionKarty = await js(`(() => {
    const r = document.getElementById('karta').getBoundingClientRect()
    const s = getComputedStyle(document.getElementById('karta'))
    return {
      odDolu: Math.round(innerHeight - r.bottom),
      odBoku: Math.round(r.left),
      odGory: Math.round(r.top),
      zaokraglenie: s.borderBottomLeftRadius,
      wewnatrz: s.paddingBottom,
    }
  })()`)
  sprawdz(
    'karta schodzi nisko, z tym samym odstepem co po bokach i z zaokragleniem',
    pionKarty.odDolu === pionKarty.odBoku && pionKarty.odDolu <= 16 && pionKarty.odGory > 0 && parseFloat(pionKarty.zaokraglenie) > 0,
    JSON.stringify(pionKarty),
  )
  const kartaPrzed = await js(`document.getElementById('karta').innerText`)
  sprawdz('karta: bez etykiety "CO TO ZNACZY?"', !/co to znaczy/i.test(kartaPrzed), kartaPrzed.replace(/\n+/g, ' | '))
  sprawdz('karta: podpis "Dotknij, aby odsłonić" na pierwszych kartach po samouczku', kartaPrzed.includes('Dotknij, aby odsłonić'), kartaPrzed.replace(/\n+/g, ' | '))
  sprawdz('karta: chipy poziomu i czesci mowy siedza na odwrocie', await js(`!!document.querySelector('#karta .odkrycie .chipy.male')`))
  sprawdz('karta: glosnik zostaje', await js(`!!document.querySelector('#karta .glosnik')`))
  sprawdz('karta: bez przewijania w bok i w pionie', (await przewijaWBok()) === '' && (await miesciSie('#karta')))
  // Toast z poprzedniego kroku ("Wkrótce.") znika sam po 3,5 s; zrzuty maja pokazywac sam ekran nauki.
  await czekajNa(`document.getElementById('toast').hidden`, 4000)
  await zrzut('v4-karta')

  // ---------------------------------------------------------------------------------------------
  // A: gesty w cztery strony
  // ---------------------------------------------------------------------------------------------
  // Ocena dziala od razu, bez tapniecia na odsloniecie. Cofniecie oddaje ten sam punkt startu
  // kolejnym krokom (karta "apple", zero punktow), a przy okazji sprawdza cofniecie karty zakrytej.
  await przeciagnij('#karta', 170, 0)
  await czekaj(400)
  sprawdz('gest w prawo ocenia karte zakryta, bez tapniecia', (await slowoKarty()) !== 'apple' && (await exp()) === 50, `${await slowoKarty()}, ${await exp()} pkt`)
  await dwukrotneTapniecie('#karta')
  await czekaj(400)
  sprawdz('dwukrotne tapniecie cofa ocene z karty zakrytej', (await slowoKarty()) === 'apple' && (await exp()) === 0, `${await slowoKarty()}, ${await exp()} pkt`)
  sprawdz('karta po cofnieciu wraca zakryta', await js(`!document.getElementById('karta').classList.contains('odkryta')`))

  await tapnij('#karta', true)
  sprawdz('pojedyncze tapniecie odslania kartę od razu, bez czekania na drugie', await czekajNa(`document.getElementById('karta').classList.contains('odkryta')`, 200))
  sprawdz('po odslonieciu dalej nie ma zadnego widocznego przycisku', (await widocznePrzyciski()).length === 0)
  const ukryteOdkryte = await ukrytePrzyciski()
  sprawdz(
    'po odslonieciu ukryte przyciski ocen sa dostepne dla czytnika ekranu',
    ukryteOdkryte.includes('Nie umiem') && ukryteOdkryte.includes('Prawie') && ukryteOdkryte.includes('Umiem'),
    JSON.stringify(ukryteOdkryte),
  )
  await zrzut('v4-karta-odkryta')

  // Podswietlenie kierunku jeszcze przed puszczeniem palca.
  const pusc = await ciagnij('#karta', 170, 0)
  // Podswietlenie wjezdza przez 120 ms, wiec dajemy mu dojechac, zanim je mierzymy i fotografujemy.
  await czekaj(250)
  const wTrakcie = await js(`(() => {
    const z = document.getElementById('gest-znacznik')
    const k = document.getElementById('karta')
    const pole = z.getBoundingClientRect()
    return {
      widoczny: z.classList.contains('widoczny'),
      klasa: z.className,
      ikona: z.querySelector('.gest-ikona').textContent,
      podpis: z.querySelector('.gest-podpis').textContent,
      kolor: getComputedStyle(z).color,
      klasyKarty: k.className,
      ramka: getComputedStyle(k).borderTopColor,
      transform: k.style.transform,
      przezroczystosc: getComputedStyle(z).opacity,
      szerokosc: Math.round(z.getBoundingClientRect().width),
      wysokosc: Math.round(z.getBoundingClientRect().height),
      ikonaPx: getComputedStyle(z.querySelector('.gest-ikona')).fontSize,
      naEkranie: pole.left >= 0 && pole.right <= window.innerWidth && pole.top >= 0 && pole.bottom <= window.innerHeight,
    }
  })()`)
  sprawdz(
    'gest w prawo: kolor, ikona i podpis "Umiem" zanim palec puszcza karte',
    wTrakcie.widoczny && wTrakcie.ikona === '✓' && wTrakcie.podpis === 'Umiem' && wTrakcie.kolor === 'rgb(0, 179, 131)' && wTrakcie.ramka === 'rgb(0, 179, 131)',
    JSON.stringify(wTrakcie),
  )
  sprawdz(
    'gest: podswietlenie kierunku jest duze, w pelni widoczne i zostaje na ekranie, gdy karta odjezdza',
    wTrakcie.przezroczystosc === '1' && wTrakcie.szerokosc >= 90 && wTrakcie.wysokosc >= 80 && wTrakcie.naEkranie,
    JSON.stringify({ przezroczystosc: wTrakcie.przezroczystosc, szerokosc: wTrakcie.szerokosc, wysokosc: wTrakcie.wysokosc, ikonaPx: wTrakcie.ikonaPx, naEkranie: wTrakcie.naEkranie }),
  )
  sprawdz(
    'gest: karta podaza za palcem w obu osiach, obraca sie i zaskakuje na progu',
    /translate\(/.test(wTrakcie.transform) && /rotate\(/.test(wTrakcie.transform) && /scale\(1\.02\)/.test(wTrakcie.transform) && wTrakcie.klasyKarty.includes('prog'),
    wTrakcie.transform,
  )
  await zrzut('v4-gest')
  // Zrzut trwa, wiec palec wraca do punktu startu: ta karta ma jeszcze posluzyc do sprawdzenia progow,
  // a czas odpowiedzi nie ma tu nic degradowac.
  await pusc(0, 0)
  await czekaj(400)
  sprawdz('powrot palca pod prog nie ocenia karty', (await slowoKarty()) === 'apple' && (await exp()) === 0, `${await slowoKarty()}, ${await exp()} pkt`)
  sprawdz('po powrocie pod prog znika podswietlenie kierunku', await js(`!document.getElementById('gest-znacznik').classList.contains('widoczny') && !document.getElementById('karta').classList.contains('prog')`))
  sprawdz('znacznik kierunku stoi nad karta, a nie w niej', await js(`document.getElementById('gest-znacznik').parentElement.id === 'aplikacja'`), await js(`document.getElementById('gest-znacznik').parentElement.id`))

  // Ponizej progu karta wraca na srodek.
  await przeciagnij('#karta', 80, 0, 4, 60)
  await czekaj(400)
  sprawdz('ruch ponizej progu 90 px nie ocenia', (await slowoKarty()) === 'apple' && (await exp()) === 0, `${await slowoKarty()}, ${await exp()} pkt`)
  await przeciagnij('#karta', 0, -70, 4, 60)
  await czekaj(400)
  sprawdz('ruch ponizej progu 80 px w pionie nie ocenia', (await slowoKarty()) === 'apple' && (await exp()) === 0, `${await slowoKarty()}, ${await exp()} pkt`)

  let expPrzed = await exp()
  await gest('prawo')
  sprawdz('swipe w prawo = Umiem (+50)', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${expPrzed + 50}`), `${expPrzed} -> ${await exp()}`)
  sprawdz('wjezdza nastepna karta', await czekajNa(`document.querySelector('#karta .slowo')?.textContent === 'book'`))
  sprawdz('zapis po ocenie w localStorage (apple: nauka)', (await zapis()).karty.apple?.[0]?.[0] === 1, JSON.stringify((await zapis()).karty))

  // Flick: krotki, ale szybki ruch liczy sie jak przekroczenie progu.
  await czekajNaSwiezaKarte()
  await tapnij('#karta', true)
  await czekajNa(`document.getElementById('karta').classList.contains('odkryta')`)
  await czekaj(120)
  expPrzed = await exp()
  await przeciagnij('#karta', -60, 0, 3, 8)
  sprawdz('szybki flick w lewo = Nie umiem (+10)', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${expPrzed + 10}`), `${expPrzed} -> ${await exp()}`)

  await czekajNa(`document.querySelector('#karta .slowo')?.textContent === 'family'`)
  expPrzed = await exp()
  const slowoPrzedCofnieciem = await slowoKarty()
  await odslonIOcen('gora')
  sprawdz('swipe w gore = Prawie (+30)', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${expPrzed + 30}`), `${expPrzed} -> ${await exp()}`)

  // ---------------------------------------------------------------------------------------------
  // A: dwukrotne tapniecie cofa ocene
  // ---------------------------------------------------------------------------------------------
  await czekajNaSwiezaKarte()
  const przedCofnieciem = await slowoKarty()
  const expPrzedCofnieciem = await exp()
  await js(`window.__kliki = []; document.addEventListener('click', () => window.__kliki.push(Math.round(performance.now())), true); 1`)
  await dwukrotneTapniecie('#karta')
  const kliki = await js(`window.__kliki`)
  sprawdz(
    `dwukrotne tapniecie cofa ostatnia ocene i wraca do karty "${slowoPrzedCofnieciem}"`,
    await czekajNa(`document.querySelector('#karta .slowo')?.textContent === ${JSON.stringify(slowoPrzedCofnieciem)} && JSON.parse(localStorage.getItem('mmf-v1')).exp === ${expPrzedCofnieciem - 30}`, 4000),
    `${przedCofnieciem} -> ${await slowoKarty()}, ${expPrzedCofnieciem} -> ${await exp()} pkt, kliki ${JSON.stringify(kliki)}, odstep ${kliki.length > 1 ? kliki[1] - kliki[0] : '-'} ms`,
  )
  sprawdz('po cofnieciu karta wraca od razu odkryta', await js(`document.getElementById('karta').classList.contains('odkryta')`))
  sprawdz('cofniecie mowi o sobie jednym zdaniem', (await toastTekst()) === 'Cofnięto ostatnią ocenę.', await toastTekst())
  const expPoCofnieciu = await exp()
  await gest('prawo')
  await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).exp !== ${expPoCofnieciu}`, 5000)

  // Dwa tapniecia w odstepie ponad 280 ms to dwa osobne tapniecia, a nie cofniecie.
  await czekajNaSwiezaKarte()
  await js(`window.__slowo = document.querySelector('#karta .slowo').textContent; 1`)
  const expPrzedOsobnymi = await exp()
  await tapnij('#karta', true)
  await czekaj(600)
  await tapnij('#karta', true)
  await czekaj(400)
  sprawdz(
    'dwa osobne tapniecia (ponad 280 ms) nie cofaja oceny',
    (await slowoKarty()) === (await js(`window.__slowo`)) && (await exp()) === expPrzedOsobnymi,
    `${await slowoKarty()}, ${expPrzedOsobnymi} -> ${await exp()} pkt`,
  )

  // ---------------------------------------------------------------------------------------------
  // A: gest w dol wychodzi z sesji, takze przed odslonieciem
  // ---------------------------------------------------------------------------------------------
  await gest('dol')
  sprawdz('gest w dol konczy nauke i pokazuje ekran wyboru', await czekajNa(`!document.getElementById('karta') && !!document.getElementById('gra-powtorki')`, 4000), (await scenaTekst()).replace(/\n+/g, ' | '))
  await klikPoTekscie('#scena', 'Powtórki')
  await czekajNa(`!!document.getElementById('karta')`)
  await czekajNa(`!document.getElementById('karta').classList.contains('wjazd')`, 3000)
  await gest('dol')
  sprawdz('gest w dol dziala takze przed odslonieciem karty', await czekajNa(`!document.getElementById('karta') && !!document.getElementById('gra-powtorki')`, 4000))

  // ---------------------------------------------------------------------------------------------
  // Klawiatura odwzorowuje cztery gesty (skroty do testow i dla klawiatury zewnetrznej)
  // ---------------------------------------------------------------------------------------------
  await klikPoTekscie('#scena', 'Powtórki')
  await czekajNa(`!!document.getElementById('karta')`)
  const expPrzedKlawiszami = await exp()
  await klawisz(' ')
  await czekaj(120)
  await klawisz('ArrowRight')
  sprawdz('klawiatura: spacja odslania, strzalka w prawo to Umiem', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${expPrzedKlawiszami + 50}`), String(await exp()))
  await czekaj(350)
  await klawisz(' ')
  await czekaj(120)
  await klawisz('ArrowUp')
  sprawdz('klawiatura: strzalka w gore to Prawie', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${expPrzedKlawiszami + 80}`), String(await exp()))
  await czekaj(350)
  await klawisz('ArrowDown')
  sprawdz('klawiatura: strzalka w dol konczy nauke', await czekajNa(`!document.getElementById('karta') && !!document.getElementById('gra-powtorki')`, 4000))

  // ---------------------------------------------------------------------------------------------
  // D: ekran konca serii z trzema liczbami
  // ---------------------------------------------------------------------------------------------
  await klikPoTekscie('#scena', 'Powtórki')
  await czekajNa(`!!document.getElementById('karta')`)
  for (let i = 0; i < 40 && (await js(`!!document.getElementById('karta')`)); i++) {
    await klawisz(' ')
    await czekaj(70)
    await klawisz('ArrowRight')
    await czekaj(340)
  }
  sprawdz('ekran konca serii', await czekajNa(`!!document.querySelector('#scena .koniec')`), (await scenaTekst()).replace(/\n+/g, ' | '))
  await czekaj(1600)
  const koniec = await scenaTekst()
  const liczbyKonca = await js(`[...document.querySelectorAll('#scena .przyrost-liczba')].map((e) => e.textContent)`)
  sprawdz('koniec: najwyzej trzy liczby', liczbyKonca.length > 0 && liczbyKonca.length <= 3, JSON.stringify(liczbyKonca))
  sprawdz('koniec: bez punktow, procentow, rangi i celu dnia', !/pkt|%|ranga|Cel dnia/i.test(koniec), koniec.replace(/\n+/g, ' | '))
  sprawdz('koniec: te same trzy przyciski, co na ekranie wyboru', (await js(`[...document.querySelectorAll('.wybor-przyciski button')].map((b) => b.textContent).join(',')`)) === 'Powtórki,Krzyżówka,Literki')
  sprawdz('koniec: celebracja sama sie konczy', await js(`!document.querySelector('#scena .ekran.swietuje')`))
  sprawdz('koniec: miesci sie bez przewijania i nie przewija w bok', (await miesciSie('#scena .ekran')) && (await przewijaWBok()) === '', await przewijaWBok())
  await zrzut('v4-koniec')

  // ---------------------------------------------------------------------------------------------
  // Menu: statystyki w zdaniach, samouczek do wywolania ponownie, "Pomijam" w przegladzie talii
  // ---------------------------------------------------------------------------------------------
  await otworzMenu()
  const menu = await menuTekst()
  sprawdz('menu: statystyki jako krotkie zdania', /Znasz \d+ z \d+ słów/.test(menu), menu.split('\n').slice(0, 8).join(' | '))
  sprawdz('menu: tabela liczb dopiero pod "Szczegóły"', await js(`!!document.getElementById('szczegoly-statystyk')`) && menu.includes('Szczegóły'))
  sprawdz('menu: bez rangi i punktow', !/Ranga|Punkty/i.test(menu), menu.split('\n').filter((l) => /ranga|punkty/i.test(l)).join(' | ') || 'brak')
  sprawdz('menu: heatmapa zostaje', (await js(`document.querySelectorAll('#menu .heatmapa .dzien:not(.przed)').length`)) === 30)
  sprawdz('menu: sekcje w kolejnosci waznosci', (await pierwszeH3()).join(' | ') === ' | Statystyki | Talie | Słówka | Jak się uczyć | Ustawienia | Kopia zapasowa | Offline | Źródła i licencja', (await pierwszeH3()).join(' | '))
  sprawdz('menu: arkusz nie przewija sie w bok', (await przewijaWBok()) === '', await przewijaWBok())
  const kOpis = await kontrast('#menu .zdania p')
  sprawdz('menu: zdania statystyk maja kontrast min. 4,5:1', kOpis >= 4.5, `${kOpis}:1`)

  await klikPoTekscie('#menu', 'Gesty')
  sprawdz('menu: "Gesty" wywoluje samouczek ponownie', await czekajNa(`!document.getElementById('samouczek').hidden`, 3000))
  await zamknijSamouczek()

  await otworzMenu()
  await js(`(() => { const p = document.getElementById('szukaj'); p.value = 'apple'; p.dispatchEvent(new Event('input')) })()`)
  await czekajNa(`!!document.querySelector('#lista-slow .slowo-wiersz')`)
  const przyciskiSlowa = await js(`(() => { const w = [...document.querySelectorAll('#lista-slow .slowo-wiersz')].find((e) => e.querySelector('b').textContent === 'apple'); return [...w.querySelectorAll('button')].map((b) => b.textContent).join(',') })()`)
  sprawdz('slowka: "Pomijam" zostaje dostepne w przegladzie talii', przyciskiSlowa.includes('Pomijam'), przyciskiSlowa)
  await js(`[...document.querySelectorAll('#lista-slow button')].find((b) => b.textContent === 'Pomijam').click(); 1`)
  sprawdz('slowka: "Pomijam" wyrzuca slowo z nauki i tlumaczy, gdzie je przywrocic', await czekajNa(`!!JSON.parse(localStorage.getItem('mmf-v1')).pominiete.apple && document.getElementById('toast').textContent.includes('Przywrócisz je w Menu')`), await toastTekst())
  await js(`[...document.querySelectorAll('#lista-slow button')].find((b) => b.textContent === 'Przywróć').click(); 1`)
  sprawdz('slowka: "Przywróć" oddaje slowo do nauki', await czekajNa(`!JSON.parse(localStorage.getItem('mmf-v1')).pominiete.apple`))
  await js(`document.querySelector('#menu .zamknij').click(); 1`)
  await czekaj(200)

  // ---------------------------------------------------------------------------------------------
  // Offline: serwer wylaczony, zwykle odswiezenie i adres z parametrem
  // ---------------------------------------------------------------------------------------------
  const expPrzedOffline = await exp()
  await stopSerwera()
  sprawdz('serwer naprawde wylaczony', await fetch(URL_APKI).then(() => false, () => true))
  await js(`window.__stary = 1`)
  await cdp('Page.reload', {})
  sprawdz('offline: odswiezenie bez serwera dziala', await czekajNa(`!window.__stary && document.documentElement.dataset.gotowe === '1'`, 15000))
  sprawdz('offline: postep zachowany', (await exp()) === expPrzedOffline, String(await exp()))
  sprawdz('offline: apka otwiera sie od razu na karcie albo na ekranie wyboru', await czekajNa(`!!document.getElementById('karta') || !!document.getElementById('gra-powtorki')`))
  await cdp('Page.navigate', { url: URL_APKI + '?x=1' })
  sprawdz('offline: adres ?x=1', await czekajNa(`location.search === '?x=1' && document.documentElement.dataset.gotowe === '1' && !!document.getElementById('scena').innerText`, 15000))

  // Aktualizacja: nowa wersja plikow na serwerze
  appendFileSync(join(STRONA, 'dist', 'styl.css'), '\n/* zmiana testowa */\n')
  const sw = readFileSync(join(STRONA, 'dist', 'sw.js'), 'utf8')
  const staraWersja = sw.match(/const WERSJA = ['"]([^'"]+)['"]/)[1]
  writeFileSync(join(STRONA, 'dist', 'sw.js'), sw.replace(/const WERSJA = ['"][^'"]+['"]/, "const WERSJA = 'testowa00001'"))
  await startSerwera()
  await js(`navigator.serviceWorker.getRegistration().then((r) => r.update())`)
  sprawdz('nowa wersja zainstalowana i czeka', await czekajNa(`navigator.serviceWorker.getRegistration().then((r) => !!r.waiting)`, 15000))
  await czekaj(300)
  sprawdz('stara wersja dalej aktywna (bez skipWaiting)', (await statusSw()).wersja === staraWersja)
  sprawdz('baner nie pojawia sie na scenie z karta', await js(`!document.getElementById('karta') || !document.querySelector('#scena .baner')`))
  await otworzMenu()
  sprawdz('baner nowej wersji w menu', await czekajNa(`document.getElementById('menu').innerText.includes('Nowa wersja gotowa')`))
  await js(`window.__stary = 1`)
  await klikPoTekscie('#menu', 'Uruchom ponownie')
  sprawdz('przeladowanie po aktualizacji', await czekajNa(`!window.__stary && document.documentElement.dataset.gotowe === '1' && !!navigator.serviceWorker.controller`, 15000))
  await czekaj(500)
  const status2 = await statusSw()
  sprawdz('nowa wersja aktywna, pliki w cache', status2.wersja === 'testowa00001' && status2.zapisane === status2.pliki, JSON.stringify(status2))
  const klucze = await js(`caches.keys()`)
  sprawdz('stary cache usuniety', klucze.length === 1 && klucze[0] === 'mmf-testowa00001', JSON.stringify(klucze))
  sprawdz('postep po aktualizacji', (await exp()) === expPrzedOffline, String(await exp()))

  // ---------------------------------------------------------------------------------------------
  // Wklejanie tekstu, kopia zapasowa i prawdziwa talia Oxford 3000
  // ---------------------------------------------------------------------------------------------
  await otworzMenu()
  await klikPoTekscie('#menu', 'Dodaj słówka')
  await czekajNa(`!!document.getElementById('wklej')`)
  await js(`const p = document.getElementById('wklej'); p.value = 'May ; maj\\nmay ; móc\\napple ; jabłko (owoc)\\nbez separatora'; p.dispatchEvent(new Event('input'))`)
  sprawdz('podglad wklejenia', await czekajNa(`document.querySelector('#podglad .podsumowanie')?.textContent === '2 nowe, 1 zaktualizowane, 1 błąd'`), await js(`document.getElementById('podglad')?.innerText`))
  await js(`document.getElementById('dodaj-slowka').click()`)
  sprawdz('dodanie zamyka ekran', await czekajNa(`document.getElementById('dodawanie').hidden`))
  const t2 = await talia()
  const apple = t2.slowa.find((s) => s.id === 'apple')
  sprawdz('IndexedDB: May i may osobno, apple zaktualizowane z IPA', t2.slowa.length === N + 2 && t2.slowa.at(-2).id === 'May' && t2.slowa.at(-1).id === 'may' && apple.pl === 'jabłko (owoc)' && !!apple.ipa)
  sprawdz('postep apple nietkniety', !!(await zapis()).karty.apple)

  const surowy = await zapis()
  const kopia = { format: 'mmf-kopia', wersja: 2, utworzono: new Date().toISOString(), talia: { slowa: t2.slowa, talie: t2.talie }, postep: { ...surowy, exp: 777 } }
  writeFileSync(join(ROBOCZY, 'kopia-dobra.json'), JSON.stringify(kopia))
  writeFileSync(join(ROBOCZY, 'kopia-zla.json'), JSON.stringify({ ...kopia, postep: { ...surowy, exp: -1 } }))
  sprawdz('kopia zawiera nowe pola (historia, zgloszenia)', !!kopia.postep.historia && Array.isArray(kopia.postep.zgloszenia), JSON.stringify(Object.keys(kopia.postep)))
  await js(`window.confirm = (tekst) => { window.__pytanie = tekst; return true }`)
  await plikDoInputu('#plik-kopii', join(ROBOCZY, 'kopia-zla.json'))
  sprawdz('zla kopia odrzucona z komunikatem', await czekajNa(`document.getElementById('toast').textContent.includes('Nie wczytano kopii')`), await toastTekst())
  await plikDoInputu('#plik-kopii', join(ROBOCZY, 'kopia-dobra.json'))
  sprawdz('dobra kopia wczytana', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).exp === 777`), String(await exp()))
  sprawdz('stan sprzed wczytania zachowany', await js(`!!localStorage.getItem('mmf-v1-przed-wczytaniem') && JSON.parse(localStorage.getItem('mmf-v1-przed-wczytaniem')).exp !== 777`))
  sprawdz('dialog kopii opisuje scalanie', String(await js(`window.__pytanie`)).includes('połączony z obecnym'), String(await js(`window.__pytanie`)).replace(/\n+/g, ' | '))

  const kartPrzedOxford = Object.keys((await zapis()).karty).length
  await otworzMenu()
  await klikPoTekscie('#menu', 'Dodaj słówka')
  await czekajNa(`!!document.getElementById('wklej')`)
  const startOxford = Date.now()
  await plikDoInputu('#plik-slowek', OXFORD)
  const podgladOxford = await czekajNa(`/^\\d+ now/.test(document.querySelector('#podglad .podsumowanie')?.textContent || '')`, 20000)
  sprawdz(`Oxford 3000: podglad pliku (${Date.now() - startOxford} ms)`, podgladOxford, (await js(`document.getElementById('podglad')?.innerText`)).replace(/\n+/g, ' | '))
  const startZapisu = Date.now()
  await js(`document.getElementById('dodaj-slowka').click()`)
  sprawdz(`Oxford 3000: zapis i zamkniecie ekranu (${Date.now() - startZapisu} ms)`, await czekajNa(`document.getElementById('dodawanie').hidden`, 20000))
  const t3 = await talia()
  sprawdz('Oxford 3000: slowa w IndexedDB', t3.slowa.length >= 2981 && t3.talie.some((x) => x.nazwa === 'Oxford 3000'), `${t3.slowa.length} slow`)
  sprawdz('Oxford 3000: postep nietkniety', Object.keys((await zapis()).karty).length === kartPrzedOxford)

  // ---------------------------------------------------------------------------------------------
  // Przygotowane stany: silnik i reszta zachowan
  // ---------------------------------------------------------------------------------------------
  const BAZA_MINUT = Date.UTC(2026, 0, 1) / 60000
  const BAZA_DNI = Date.UTC(2026, 0, 1) / 86400000
  const naMinuty = (d) => Math.round(d.getTime() / 60000) - BAZA_MINUT
  const naDzien = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 - BAZA_DNI
  const zaMinut = (m) => new Date(Date.now() + m * 60000)
  const wczoraj = zaMinut(-1440)
  const dwie = (n) => String(n).padStart(2, '0')
  const dzisiaj = new Date()
  const naDate = (d) => `${d.getFullYear()}-${dwie(d.getMonth() + 1)}-${dwie(d.getDate())}`
  const dataDzis = naDate(dzisiaj)
  const wczorajData = naDate(new Date(dzisiaj.getFullYear(), dzisiaj.getMonth(), dzisiaj.getDate() - 1))
  const przedwczorajData = naDate(new Date(dzisiaj.getFullYear(), dzisiaj.getMonth(), dzisiaj.getDate() - 2))
  const { budujKolizje } = await import(pathToFileURL(join(KORZEN, 'zrodlo', 'kolizje.js')).href)
  const KOLIZJE = budujKolizje(t3.slowa)
  const IDY = t3.slowa.map((s) => s.id)
  const pominPozaPierwszymi = (ile) => Object.fromEntries(IDY.slice(ile).map((id) => [id, dataDzis]))

  // [stan, termin, stabilnosc, trudnosc, powtorki, pomylki, krok, ostatnio, wprowadzono]; stan 2 = powtorka
  const kartaV4 = ({ termin, stabilnosc = 10, ostatnio = zaMinut(-1440), pomylki = 0, wprowadzono = zaMinut(-30 * 1440) }) => [
    2,
    naMinuty(termin),
    stabilnosc,
    5,
    3,
    pomylki,
    0,
    naDzien(ostatnio),
    naDzien(wprowadzono),
  ]
  const domyslneV4 = {
    wersja: 1,
    karty: {},
    pominiete: {},
    exp: 0,
    streak: { dni: 0, ostatniDzien: '', zamrozenia: 0, doZamrozenia: 0, zerwane: { dni: 0, do: '' }, sesje: 0, ostatnieOdzyskanie: '' },
    nadrabianie: { aktywne: 0, polowaDo: '' },
    dzis: { data: dataDzis, sekundy: 0, dodatkoweNowe: 0, powtorki: 0 },
    historia: {},
    zgloszenia: [],
    // samouczekGestow: true, zeby nakladka nie zaslaniala kart w kolejnych scenariuszach
    ustawienia: { noweDziennie: 10, maksPowtorekDziennie: 60, dlugoscSerii: 15, autowymowa: false, mowienie: false, celDzienny: 30, podpowiedzMowienie: 'brak', samouczekGestow: true },
    ostatniaKopia: new Date().toISOString(),
    rozproszono: 1,
  }
  async function ustawStan(zmiany) {
    const stan = { ...domyslneV4, ...zmiany, ustawienia: { ...domyslneV4.ustawienia, ...(zmiany.ustawienia || {}) } }
    await js(`localStorage.setItem('mmf-v1', ${JSON.stringify(JSON.stringify(stan))}); 1`)
    await js(`window.__stary = 1`)
    await cdp('Page.reload', {})
    const gotowe = await czekajNa(`!window.__stary && document.documentElement.dataset.gotowe === '1' && !!document.getElementById('scena').innerText`, 15000)
    if (!gotowe) throw new Error('apka nie wstala po podstawieniu zapisu')
    return stan
  }
  async function dokonczSerie(maks = 25) {
    for (let i = 0; i < maks && (await js(`!!document.getElementById('karta')`)); i++) {
      await klawisz(' ')
      await czekaj(70)
      await klawisz('ArrowRight')
      await czekaj(340)
    }
  }

  const jednaKarta = { [IDY[0]]: [kartaV4({ termin: zaMinut(-60) })] }
  const tylkoPierwsze = pominPozaPierwszymi(1)

  // --- E: apka otwiera sie od razu na karcie ---
  await ustawStan({ karty: jednaKarta, pominiete: tylkoPierwsze })
  sprawdz('apka otwiera sie od razu na karcie, bez ekranu posredniego', await czekajNa(`!!document.getElementById('karta')`, 6000), (await scenaTekst()).replace(/\n+/g, ' | '))
  sprawdz('start na karcie: samouczek juz sie nie pokazuje', await js(`document.getElementById('samouczek').hidden`))

  // --- E: ekran "nie ma co powtarzac" proponuje gry ---
  await ustawStan({ karty: {}, pominiete: pominPozaPierwszymi(0) })
  sprawdz('brak kart: od razu ekran wyboru, a nie pusty komunikat', await czekajNa(`!!document.getElementById('gra-powtorki')`, 6000))
  const pusto = await scenaTekst()
  sprawdz(
    'brak kart: "Powtórki" nieaktywne, gry zapraszaja jednym zdaniem',
    (await js(`document.getElementById('gra-powtorki').disabled`)) &&
      !(await js(`document.getElementById('gra-krzyzowka').disabled`)) &&
      pusto.includes('Na dziś wszystko. Zagraj albo wróć jutro.'),
    pusto.replace(/\n+/g, ' | '),
  )

  // --- C: czas odpowiedzi jako sygnal ---
  await ustawStan({ karty: { [IDY[0]]: [kartaV4({ termin: zaMinut(-60) })], [IDY[1]]: [kartaV4({ termin: zaMinut(-50) })] }, pominiete: pominPozaPierwszymi(2) })
  await czekajNa(`!!document.getElementById('karta')`)
  await czekajNaSwiezaKarte()
  const ramkaPrzed = await ramkaKarty()
  await tapnij('#karta', true)
  await czekajNa(`document.getElementById('karta').classList.contains('odkryta')`)
  sprawdz('czas: ramka zaraz po odslonieciu jest neutralna', (await ramkaKarty()) === ramkaPrzed, `${ramkaPrzed} -> ${await ramkaKarty()}`)
  await czekaj(4200)
  const ramka4 = await ramkaKarty()
  sprawdz('czas: po 4 s ramka jest bursztynowa', ramka4 === 'rgb(230, 159, 0)', ramka4)
  await czekaj(5200)
  const ramka9 = await ramkaKarty()
  sprawdz('czas: po 9 s ramka jest cynobrowa', ramka9 === 'rgb(255, 111, 60)', ramka9)
  const expPrzedWolnym = await exp()
  await gest('prawo')
  sprawdz(
    'czas: po 8 s swipe "Umiem" zapisuje sie jako "Prawie" (+30, nie +50)',
    await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${expPrzedWolnym + 30}`, 4000),
    `${expPrzedWolnym} -> ${await exp()} pkt`,
  )
  sprawdz('czas: mikro-notka tlumaczy degradacje', (await notkaTekst()) === 'wolno, liczę jako Prawie', await notkaTekst())
  sprawdz('czas: mediana czasu odpowiedzi trafia do historii dnia', ((await zapis()).historia?.[dataDzis]?.tempo ?? 0) >= 8, JSON.stringify((await zapis()).historia?.[dataDzis]))

  // Szybka odpowiedz nie jest degradowana.
  await czekajNaSwiezaKarte()
  const expPrzedSzybkim = await exp()
  await tapnij('#karta', true)
  await czekajNa(`document.getElementById('karta').classList.contains('odkryta')`)
  await czekaj(120)
  await gest('prawo')
  sprawdz('czas: szybkie "Umiem" zostaje "Umiem" (+50)', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${expPrzedSzybkim + 50}`, 4000), `${expPrzedSzybkim} -> ${await exp()} pkt, ${await stanKarty()}`)

  // Nowa karta (pierwsza ekspozycja) nie podlega degradacji.
  await ustawStan({ karty: {}, pominiete: pominPozaPierwszymi(3), ustawienia: { dlugoscSerii: 3 } })
  await czekajNaSwiezaKarte()
  await tapnij('#karta', true)
  await czekajNa(`document.getElementById('karta').classList.contains('odkryta')`)
  await czekaj(9000)
  await gest('prawo')
  sprawdz('czas: nowa karta po 9 s dalej dostaje "Umiem" (+50)', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).exp === 50`, 4000), String(await exp()))

  // --- A1: sufit powtorek i kolejnosc po pilnosci ---
  const SUFIT = 40
  const ZALEGLYCH = 70
  const kartyPilnosci = {}
  for (let i = 0; i < ZALEGLYCH; i++) {
    kartyPilnosci[IDY[i]] = [kartaV4({ termin: zaMinut(-(300 - i)), stabilnosc: 200 - i, ostatnio: zaMinut(-5 * 1440) })]
  }
  const ustawieniaSufitu = { maksPowtorekDziennie: SUFIT, noweDziennie: 5, dlugoscSerii: 20 }
  await ustawStan({ karty: kartyPilnosci, pominiete: pominPozaPierwszymi(ZALEGLYCH + 5), ustawienia: ustawieniaSufitu })
  await czekajNa(`!!document.getElementById('karta')`)
  sprawdz(
    'sufit: pierwsza karta to najpilniejsza (najnizsza szansa przypomnienia), nie najstarszy termin',
    (await slowoKarty()) === IDY[ZALEGLYCH - 1],
    `${await slowoKarty()}, a najstarszy termin ma ${IDY[0]}`,
  )
  sprawdz(`sufit: statystyki podaja ${SUFIT} zaleglych + 5 nowych, a nie cala zaleglosc`, await menuMa('Dziś do zrobienia', '45'))
  sprawdz('sufit: prawdziwa zaleglosc jest tylko w statystykach', await menuMa('Zaległe teraz', String(ZALEGLYCH)))

  // --- A2: tryb nadrabiania ---
  const kartyDlugu = {}
  for (let i = 0; i < 200; i++) kartyDlugu[IDY[i]] = [kartaV4({ termin: zaMinut(-(2000 - i)), stabilnosc: 20 })]
  await ustawStan({ karty: kartyDlugu, pominiete: pominPozaPierwszymi(200), ustawienia: { maksPowtorekDziennie: 60, dlugoscSerii: 20 } })
  await czekajNa(`!!document.getElementById('karta')`)
  sprawdz('nadrabianie: ekran nauki nie pokazuje liczby dlugu', !/200|Zaległe/.test(await scenaTekst()), (await scenaTekst()).replace(/\n+/g, ' | '))
  sprawdz('nadrabianie: flaga zapisana w postepie', (await zapis()).nadrabianie?.aktywne === 1, JSON.stringify((await zapis()).nadrabianie))
  sprawdz('nadrabianie: menu mowi wprost, ze tryb jest wlaczony', await menuMa('Tryb nadrabiania', 'tak'))
  sprawdz('nadrabianie: limit powtorek 1,5x sufitu i zero nowych slow', await menuMa('Dziś do zrobienia', '90'))

  // --- A3: seria (prog jednej karty, zamrozenie) ---
  await ustawStan({ karty: jednaKarta, pominiete: tylkoPierwsze, streak: { ...domyslneV4.streak, dni: 3, ostatniDzien: wczorajData } })
  await czekajNa(`!!document.getElementById('karta')`)
  await odslonIOcen('prawo')
  sprawdz('seria: jedna oceniona karta zalicza dzien', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).streak.dni === 4`), JSON.stringify((await zapis()).streak))

  await ustawStan({
    karty: jednaKarta,
    pominiete: tylkoPierwsze,
    streak: { ...domyslneV4.streak, dni: 9, ostatniDzien: przedwczorajData, zamrozenia: 2, doZamrozenia: 2 },
  })
  await czekajNa(`!!document.getElementById('karta')`)
  await odslonIOcen('prawo')
  sprawdz('zamrozenie: seria idzie dalej mimo dnia wolnego', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).streak.dni === 10`), JSON.stringify((await zapis()).streak))
  sprawdz('zamrozenie: zuzyte jedno z dwoch', (await zapis()).streak.zamrozenia === 1, JSON.stringify((await zapis()).streak))
  sprawdz('zamrozenie: komunikat bez slowa o stracie', (await toastTekst()) === 'Wczoraj było wolne, seria zostaje.', await toastTekst())

  // --- A5: podpowiedz po 7 s i blokada "Umiem" na karcie mowienia ---
  await ustawStan({
    karty: { [IDY[0]]: [kartaV4({ termin: zaMinut(5 * 1440), stabilnosc: 30 })] },
    pominiete: tylkoPierwsze,
    ustawienia: { mowienie: true, dlugoscSerii: 5 },
  })
  sprawdz('podpowiedz: apka wchodzi na karte mowienia', await czekajNa(`!!document.querySelector('#karta.kierunek-pl')`), (await scenaTekst()).replace(/\n+/g, ' | '))
  sprawdz('podpowiedz: przycisk jest niewidoczny, a nie tylko nieaktywny', await js(`document.getElementById('przycisk-podpowiedzi').hidden === true`))
  sprawdz('podpowiedz: pojawia sie po 7 s', await czekajNa(`!document.getElementById('przycisk-podpowiedzi').hidden`, 12000))
  await tapnij('#przycisk-podpowiedzi')
  sprawdz('podpowiedz: pokazuje podkreslenia', await czekajNa(`document.getElementById('podpowiedz-pole').textContent.includes('_')`), await js(`document.getElementById('podpowiedz-pole').textContent`))
  sprawdz('podpowiedz: przycisk nie odslania karty', await js(`!document.getElementById('karta').classList.contains('odkryta')`))
  await tapnij('#karta', true)
  await czekajNa(`document.getElementById('karta').classList.contains('odkryta')`)
  sprawdz('podpowiedz: ukryty przycisk "Umiem" znika dla czytnika ekranu', !(await ukrytePrzyciski()).includes('Umiem'), JSON.stringify(await ukrytePrzyciski()))
  const expPrzedProba = await exp()
  await gest('prawo')
  await czekaj(500)
  sprawdz('podpowiedz: gest w prawo nie ocenia na "Umiem"', (await exp()) === expPrzedProba, `${expPrzedProba} -> ${await exp()}`)
  await gest('gora')
  sprawdz('podpowiedz: "Prawie" dalej dziala (+30)', await czekajNa(`JSON.parse(localStorage.getItem('mmf-v1')).exp === ${expPrzedProba + 30}`), String(await exp()))

  // --- A6: blokada interferencji przy doborze nowych slow ---
  let paraKolizji = null
  for (let i = 0; i < IDY.length && !paraKolizji; i++) {
    for (const inny of KOLIZJE[IDY[i]] || []) {
      if (IDY.indexOf(inny) < i) {
        paraKolizji = { a: inny, b: IDY[i], indeks: i }
        break
      }
    }
  }
  sprawdz('interferencja: w talii jest para kolidujaca', !!paraKolizji, JSON.stringify(paraKolizji))
  const pominietePrzedB = Object.fromEntries(IDY.slice(0, paraKolizji.indeks).filter((id) => id !== paraKolizji.a).map((id) => [id, dataDzis]))
  await ustawStan({
    karty: { [paraKolizji.a]: [kartaV4({ termin: zaMinut(10 * 1440), stabilnosc: 12, wprowadzono: zaMinut(-1440) })] },
    pominiete: pominietePrzedB,
    ustawienia: { dlugoscSerii: 5 },
  })
  await czekajNa(`!!document.getElementById('karta')`)
  sprawdz(
    `interferencja: "${paraKolizji.b}" pomijane, bo kolidujace "${paraKolizji.a}" weszlo wczoraj`,
    (await slowoKarty()) !== paraKolizji.b,
    `pierwsza karta: ${await slowoKarty()}`,
  )
  await ustawStan({ karty: {}, pominiete: { ...pominietePrzedB, [paraKolizji.a]: dataDzis }, ustawienia: { dlugoscSerii: 5 } })
  await czekajNa(`!!document.getElementById('karta')`)
  sprawdz(
    `interferencja: bez swiezej kolizji "${paraKolizji.b}" wchodzi jako pierwsze`,
    (await slowoKarty()) === paraKolizji.b,
    `pierwsza karta: ${await slowoKarty()}`,
  )

  // --- A7: panel leecha po 6 pomylkach ---
  const oporna = { karty: { [IDY[0]]: [kartaV4({ termin: zaMinut(-60), stabilnosc: 2, pomylki: 5 })] }, pominiete: tylkoPierwsze, ustawienia: { dlugoscSerii: 3 } }
  await ustawStan(oporna)
  await czekajNa(`!!document.getElementById('karta')`)
  await odslonIOcen('lewo')
  sprawdz('leech: po szostej pomylce pokazuje sie panel "To słowo Cię męczy"', await czekajNa(`document.getElementById('scena').innerText.includes('To słowo Cię męczy')`), (await scenaTekst()).replace(/\n+/g, ' | '))
  const panel = await scenaTekst()
  sprawdz(
    'leech: panel ma trzy wyjscia',
    panel.includes('Odłóż na 3 tygodnie') && panel.includes('Pomijam') && panel.includes('Uczę się dalej'),
    panel.replace(/\n+/g, ' | '),
  )
  await klikPoTekscie('#scena', 'Odłóż na 3 tygodnie')
  await czekaj(400)
  const poOdlozeniu = await zapis()
  const dniOdlozenia = ((poOdlozeniu.karty[IDY[0]][0][1] + BAZA_MINUT) * 60000 - Date.now()) / 86400000
  sprawdz(`leech: "Odłóż" daje termin za ${dniOdlozenia.toFixed(1)} dnia (21 +/- rozrzut)`, Math.abs(dniOdlozenia - 21) <= 2.2, String(dniOdlozenia))
  sprawdz('leech: historia karty nietknieta (pomylki zostaja)', poOdlozeniu.karty[IDY[0]][0][5] === 6, JSON.stringify(poOdlozeniu.karty[IDY[0]]))

  // --- I: blysk przy co piatej poprawnej karcie pod rzad ---
  const kartyComba = {}
  for (let i = 0; i < 6; i++) kartyComba[IDY[i]] = [kartaV4({ termin: zaMinut(-(60 + i)) })]
  await ustawStan({ karty: kartyComba, pominiete: pominPozaPierwszymi(6), ustawienia: { dlugoscSerii: 10, noweDziennie: 5 } })
  await czekajNa(`!!document.getElementById('karta')`)
  await js(`window.__blysk = 0; new MutationObserver(() => { if (!document.getElementById('blysk').hidden) window.__blysk++ }).observe(document.getElementById('blysk'), { attributes: true }); 1`)
  for (let i = 0; i < 5; i++) {
    await klawisz(' ')
    await czekaj(70)
    await klawisz('ArrowRight')
    await czekaj(340)
  }
  sprawdz('combo: piata poprawna karta pod rzad daje blysk na krawedzi', (await js(`window.__blysk`)) > 0, String(await js(`window.__blysk`)))
  sprawdz('combo: zamiast liczby punktow nie ma zadnego toastu o punktach', !/pkt/.test(await toastTekst()), await toastTekst())

  // --- D2: odznaka na ikonie ---
  const mockOdznaki = `(() => {
    window.__odznaka = []
    Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: (n) => { window.__odznaka.push(n); return Promise.resolve() } })
    Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: () => { window.__odznaka.push('clear'); return Promise.resolve() } })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    return window.__odznaka
  })()`
  await ustawStan({ karty: kartyDlugu, pominiete: pominPozaPierwszymi(200), ustawienia: { maksPowtorekDziennie: 60, dlugoscSerii: 20 } })
  const odznaka = await js(mockOdznaki)
  sprawdz('odznaka: wyjscie z apki ustawia liczbe kart na dzis', odznaka.length === 1 && odznaka[0] === 90, JSON.stringify(odznaka))
  const bledyPrzed = bledyKonsoli.length
  await js(`(() => {
    delete navigator.setAppBadge
    delete navigator.clearAppBadge
    document.dispatchEvent(new Event('visibilitychange'))
    return 1
  })()`)
  await czekaj(300)
  sprawdz('odznaka: brak wsparcia nie rzuca bledem', bledyKonsoli.length === bledyPrzed, bledyKonsoli.slice(bledyPrzed).join(' | '))
  await js(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); 1`)

  // ---------------------------------------------------------------------------------------------
  // Stan pokazowy: pasek talii, animacje, paleta i maly ekran
  // ---------------------------------------------------------------------------------------------
  const kartyPokazowe = {}
  for (let i = 0; i < 380; i++) {
    const utrwalone = i < 62
    kartyPokazowe[IDY[i]] = [
      kartaV4({
        termin: zaMinut(i < 26 ? -(90 + i * 7) : 2000 + i * 47),
        stabilnosc: utrwalone ? 34 + (i % 40) : 2 + (i % 11),
        ostatnio: zaMinut(-(2 + (i % 9)) * 1440),
        pomylki: i % 17 === 0 ? 2 : 0,
      }),
    ]
  }
  const historiaPokazowa = {}
  for (let i = 1; i <= 30; i++) {
    if (i % 5 === 0) continue
    const d = new Date(dzisiaj.getFullYear(), dzisiaj.getMonth(), dzisiaj.getDate() - i)
    historiaPokazowa[naDate(d)] = { oceny: 18 + ((i * 7) % 44), nowe: (i * 3) % 11, exp: 600 + i * 17, sekundy: 500 + i * 9, tempo: 2 + (i % 5) }
  }
  const stanPokazowy = {
    karty: kartyPokazowe,
    pominiete: {},
    exp: 25140,
    streak: { dni: 12, ostatniDzien: wczorajData, zamrozenia: 1, doZamrozenia: 4, zerwane: { dni: 0, do: '' }, sesje: 0, ostatnieOdzyskanie: '' },
    historia: historiaPokazowa,
    dzis: { data: dataDzis, sekundy: 0, dodatkoweNowe: 0, powtorki: 0 },
    ustawienia: { noweDziennie: 10, maksPowtorekDziennie: 60, dlugoscSerii: 10, celDzienny: 60, mowienie: true, autowymowa: false, kotwica: 'po kawie', samouczekGestow: true },
  }
  await ustawStan(stanPokazowy)
  await czekajNa(`!!document.getElementById('karta')`)
  const pasek = await js(`(() => {
    const p = document.getElementById('postep-talii')
    const skala = (id) => Number((document.getElementById(id).style.transform.match(/scaleX\\(([^)]+)\\)/) || [0, 0])[1])
    return { etykieta: p.getAttribute('aria-label'), poznane: skala('pasek-poznane'), utrwalone: skala('pasek-utrwalone'), tekst: p.innerText }
  })()`)
  sprawdz(
    'F: pasek talii ma wypelnienie poznanych i jasniejszy segment utrwalonych, bez cyfr na ekranie',
    pasek.tekst === '' && pasek.poznane > pasek.utrwalone && pasek.utrwalone > 0 && /Poznane 380 z \d+ słów, utrwalone 62/.test(pasek.etykieta),
    JSON.stringify(pasek),
  )

  // --- Trzy kanaly statusu przy wylocie karty ---
  await czekajNaSwiezaKarte()
  const ruchNormalny = await probaWylotu('prawo')
  sprawdz('I: wylot karty przy wlaczonym ruchu leci w bok przez 220 ms', ruchNormalny.nazwa === 'wylot-prawo' && ruchNormalny.czas === '0.22s', JSON.stringify(ruchNormalny))
  await obserwujWynik()
  await tapnij('#karta', true)
  await czekajNa(`document.getElementById('karta').classList.contains('odkryta')`)
  await gest('prawo')
  await czekaj(600)
  const wynikPrawo = await js(`window.__wynik`)
  sprawdz(
    'I: swipe w prawo daje trzy kanaly naraz (zielony, znak ✓, wylot w prawo)',
    !!wynikPrawo && wynikPrawo.znak === '✓' && wynikPrawo.kolor === 'rgb(0, 179, 131)' && wynikPrawo.klasy.includes('wynik-tak') && wynikPrawo.klasy.includes('wylot-prawo'),
    JSON.stringify(wynikPrawo),
  )
  await czekajNaSwiezaKarte()
  await obserwujWynik()
  await tapnij('#karta', true)
  await czekajNa(`document.getElementById('karta').classList.contains('odkryta')`)
  await gest('lewo')
  await czekaj(600)
  const wynikLewo = await js(`window.__wynik`)
  sprawdz(
    'I: swipe w lewo daje cynober, znak ✗ i wylot w lewo',
    !!wynikLewo && wynikLewo.znak === '✗' && wynikLewo.kolor === 'rgb(255, 111, 60)' && wynikLewo.klasy.includes('wylot-lewo'),
    JSON.stringify(wynikLewo),
  )
  await czekajNaSwiezaKarte()
  await obserwujWynik()
  await tapnij('#karta', true)
  await czekajNa(`document.getElementById('karta').classList.contains('odkryta')`)
  await gest('gora')
  await czekaj(600)
  const wynikGora = await js(`window.__wynik`)
  sprawdz(
    'I: swipe w gore daje bursztyn, znak ~ i wylot w gore',
    !!wynikGora && wynikGora.znak === '~' && wynikGora.kolor === 'rgb(230, 159, 0)' && wynikGora.klasy.includes('wylot-gora'),
    JSON.stringify(wynikGora),
  )

  // --- Paleta i kontrasty ---
  const tokeny = await js(`(() => {
    const s = getComputedStyle(document.documentElement)
    const we = (n) => s.getPropertyValue(n).trim()
    return { tlo: we('--tlo'), tekst: we('--tekst'), przygaszony: we('--przygaszony'), umiem: we('--umiem'), prawie: we('--prawie'), nieUmiem: we('--nie-umiem'), info: we('--info'), naAkcencie: we('--na-akcencie') }
  })()`)
  sprawdz(
    'paleta: tokeny zgodne z paleta-v3',
    tokeny.tlo === '#121212' && tokeny.tekst === '#f2f2f5' && tokeny.przygaszony === '#a1a1ad' && tokeny.umiem === '#00b383' && tokeny.prawie === '#e69f00' && tokeny.nieUmiem === '#ff6f3c' && tokeny.info === '#56b4e9' && tokeny.naAkcencie === '#0b0b0d',
    JSON.stringify(tokeny),
  )
  await czekajNa(`!!document.getElementById('karta')`, 4000)
  const kSlowo = await kontrast('#karta .slowo')
  const kIpa = await kontrast('#karta .ipa')
  sprawdz('paleta: slowo na karcie ma kontrast min. 4,5:1', kSlowo >= 4.5, `${kSlowo}:1`)
  sprawdz('paleta: tekst przygaszony na karcie ma kontrast min. 4,5:1', kIpa === null || kIpa >= 4.5, `${kIpa}:1`)

  // --- I: prefers-reduced-motion ---
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await czekaj(300)
  const czasy = await js(`(() => {
    const s = getComputedStyle(document.documentElement)
    return ['--czas-odsloniecie', '--czas-wylot', '--czas-wjazd', '--czas-mikro'].map((n) => s.getPropertyValue(n).trim())
  })()`)
  sprawdz('reduced-motion: wszystkie czasy schodza do 80 ms', czasy.every((c) => parseInt(c, 10) <= 80), czasy.join(', '))
  for (const kierunek of ['prawo', 'lewo', 'gora', 'dol']) {
    const proba = await probaWylotu(kierunek)
    sprawdz(`reduced-motion: wylot "${kierunek}" zamienia sie na zmiane przezroczystosci`, proba.nazwa === 'zanik-karty' && proba.czas === '0.08s', JSON.stringify(proba))
  }
  await ustawStan(stanPokazowy)
  await czekajNaSwiezaKarte()
  await obserwujWynik()
  await tapnij('#karta', true)
  sprawdz('reduced-motion: pierwsze tapniecie po starcie odslania karte, a nie probuje cofac', await czekajNa(`document.getElementById('karta').classList.contains('odkryta')`, 3000), await stanKarty())
  await czekaj(120)
  await gest('prawo')
  await czekaj(600)
  const wynikBezRuchu = await js(`window.__wynik`)
  sprawdz(
    'reduced-motion: informacja zwrotna zostaje (kolor i znak), tylko krotsza',
    !!wynikBezRuchu && wynikBezRuchu.znak === '✓' && wynikBezRuchu.kolor === 'rgb(0, 179, 131)' && wynikBezRuchu.czas === '0.08s' && wynikBezRuchu.klasy.includes('wynik-tak'),
    `${JSON.stringify(wynikBezRuchu)} :: ${await stanKarty()}`,
  )
  // Ten sam warunek bez scigania sie z czasem: przy wylaczonym ruchu znak wyniku ma sam kolor statusu,
  // a animacja tylko doprowadza go do widocznosci.
  for (const [klasa, kolor] of [
    ['tak', 'rgb(0, 179, 131)'],
    ['prawie', 'rgb(230, 159, 0)'],
    ['nie', 'rgb(255, 111, 60)'],
  ]) {
    const proba = await probaWyniku(klasa)
    sprawdz(
      `reduced-motion: status "${klasa}" zachowuje kolor znaku i obrysu, a ruch zamienia na przezroczystosc`,
      proba.kolor === kolor && proba.ramka === kolor && proba.nazwa === 'bez-ruchu' && proba.czas === '0.08s',
      JSON.stringify(proba),
    )
  }
  await cdp('Emulation.setEmulatedMedia', { features: [] })
  await czekaj(300)

  // --- Maly ekran (iPhone SE 375x667) ---
  await ustawStan(stanPokazowy)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true })
  await czekaj(500)
  await czekajNa(`!!document.getElementById('karta')`)
  sprawdz('iPhone SE: karta bez przewijania w pionie i w bok', (await miesciSie('#karta')) && (await przewijaWBok()) === '', await przewijaWBok())
  sprawdz('iPhone SE: ekran nauki dalej bez widocznych przyciskow', (await widocznePrzyciski()).length === 0)
  await gest('dol')
  await czekajNa(`!!document.getElementById('gra-powtorki')`, 4000)
  sprawdz('iPhone SE: ekran wyboru miesci sie bez przewijania', await miesciSie('#scena .ekran'), await js(`(() => { const e = document.querySelector('#scena .ekran'); return e.scrollHeight + ' / ' + e.clientHeight })()`))
  sprawdz(
    'iPhone SE: trzy przyciski wyboru to cele dotyku min. 44 px',
    await js(`[...document.querySelectorAll('.wybor-przyciski button')].every((b) => b.getBoundingClientRect().height >= 44)`),
    await js(`[...document.querySelectorAll('.wybor-przyciski button')].map((b) => Math.round(b.getBoundingClientRect().height)).join(', ')`),
  )
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await czekaj(300)

  // ---------------------------------------------------------------------------------------------
  // G1: krzyzowka od startu do wyniku
  // ---------------------------------------------------------------------------------------------
  const wpiszTekst = async (tekst) => {
    for (const znak of tekst) {
      await cdp('Input.insertText', { text: znak })
      await czekaj(30)
    }
  }
  const klawiszSurowy = async (key, kod) => {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: kod })
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: kod })
  }
  const hasloKrzyzowki = () => js(`document.getElementById('krzyzowka-haslo').textContent`)
  const literyKrzyzowki = () => js(`[...document.querySelectorAll('.krzyzowka-pole .krzyzowka-litera')].map((e) => e.textContent).join('')`)
  const startyKrzyzowki = async () =>
    JSON.parse(
      await js(
        `JSON.stringify([...document.querySelectorAll('.krzyzowka-pole')].filter((b) => b.querySelector('.krzyzowka-numer')).map((b) => ({ w: +b.dataset.w, k: +b.dataset.k })))`,
      ),
    )
  const polePo = (c) => `.krzyzowka-pole[data-w="${c.w}"][data-k="${c.k}"]`
  const slowoZHasla = (haslo, poPl) => poPl.get(String(haslo).split(' · ').slice(1).join(' · '))

  // Slowa do gier: same litery, po 3-9 znakow, bez powtorzonych tlumaczen i bez anagramow (generator
  // krzyzowki odrzuca slowa o tych samych literach, a smoke rozpoznaje slowo po hasle).
  const slowaGry = []
  const uzytePl = new Set()
  const uzyteLitery = new Set()
  for (const s of t3.slowa) {
    if (slowaGry.length >= 16) break
    if (!/^[a-zA-Z]{3,9}$/.test(s.w) || uzytePl.has(s.pl)) continue
    const uklad = [...s.w.toLowerCase()].sort().join('')
    if (uzyteLitery.has(uklad)) continue
    uzytePl.add(s.pl)
    uzyteLitery.add(uklad)
    slowaGry.push(s)
  }
  const poPl = new Map(slowaGry.map((s) => [s.pl, s.w]))
  const idyGry = new Set(slowaGry.map((s) => s.id))
  await ustawStan({
    karty: Object.fromEntries(slowaGry.map((s, i) => [s.id, [kartaV4({ termin: zaMinut(-60 - i) })]])),
    pominiete: Object.fromEntries(IDY.filter((id) => !idyGry.has(id)).map((id) => [id, dataDzis])),
  })
  await czekajNa(`!!document.getElementById('karta')`, 8000)
  // Gry nie zmieniaja harmonogramu: ten zapis kart musi byc identyczny po obu grach.
  const kartyPrzedGrami = await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).karty)`)
  await czekajNaSwiezaKarte()
  await gest('dol')
  sprawdz('gry: gest w dol z karty wraca na ekran wyboru', await czekajNa(`!!document.getElementById('gra-krzyzowka')`, 5000))

  await tapnij('#gra-krzyzowka')
  sprawdz('krzyzowka: przycisk "Krzyżówka" otwiera ekran gry', await czekajNa(`!!document.getElementById('krzyzowka-siatka')`, 8000), (await scenaTekst()).replace(/\n+/g, ' | '))
  const bokKomorki = await js(`Math.round(document.querySelector('.krzyzowka-pole').getBoundingClientRect().width * 10) / 10`)
  sprawdz('krzyzowka: komorka ma co najmniej 28 px', bokKomorki >= 28, `${bokKomorki} px, kolumn: ${await js(`getComputedStyle(document.getElementById('krzyzowka-siatka')).gridTemplateColumns.split(' ').length`)}`)
  sprawdz('krzyzowka: siatka nie przewija sie w bok', (await przewijaWBok()) === '' && (await js(`document.getElementById('krzyzowka-siatka').getBoundingClientRect().right <= innerWidth + 0.5`)), await przewijaWBok())
  sprawdz('krzyzowka: menu w rogu jest widoczne, ekran nauki nie', await js(`!document.getElementById('menu-przycisk').hidden && !document.getElementById('karta')`))
  sprawdz('krzyzowka: ukryte pole tekstowe ma fokus (klawiatura systemowa)', (await js(`document.activeElement?.id`)) === 'krzyzowka-wpis', await js(`document.activeElement?.id`))
  sprawdz('krzyzowka: przyciski "Sprawdź" i "Podpowiedz literę" z licznikiem', (await js(`[...document.querySelectorAll('.gra-przyciski button')].map((b) => b.textContent).join(' | ')`)) === 'Sprawdź | Podpowiedz literę (3)', await js(`[...document.querySelectorAll('.gra-przyciski button')].map((b) => b.textContent).join(' | ')`))

  const starty = await startyKrzyzowki()
  sprawdz('krzyzowka: hasla sa ponumerowane jak w papierowej', starty.length >= 3, `${starty.length} pol z numerem`)
  await tapnij(polePo(starty[0]))
  const pierwszeHaslo = await hasloKrzyzowki()
  sprawdz('krzyzowka: tapniecie w pole pokazuje tresc hasla nad klawiatura', /^\d+ (poziomo|pionowo) · .+/.test(pierwszeHaslo), pierwszeHaslo)
  sprawdz('krzyzowka: cale haslo jest podswietlone', (await js(`document.querySelectorAll('.krzyzowka-pole.wybrane').length`)) >= 3, String(await js(`document.querySelectorAll('.krzyzowka-pole.wybrane').length`)))
  const pierwszeSlowo = slowoZHasla(pierwszeHaslo, poPl)
  sprawdz('krzyzowka: haslo to polskie tlumaczenie slowa z talii', !!pierwszeSlowo, pierwszeHaslo)

  // Bledna litera: kolor cynobrowy po "Sprawdź", potem Backspace ja cofa.
  const zlaLitera = pierwszeSlowo[0].toUpperCase() === 'Q' ? 'z' : 'q'
  await wpiszTekst(zlaLitera)
  sprawdz('krzyzowka: litera z klawiatury wchodzi w aktywne pole', (await literyKrzyzowki()) === zlaLitera.toUpperCase(), await literyKrzyzowki())
  await tapnij('#krzyzowka-sprawdz')
  await czekaj(150)
  sprawdz('krzyzowka: "Sprawdź" koloruje bledna litere', (await js(`document.querySelectorAll('.krzyzowka-pole.bledna').length`)) === 1 && (await js(`document.querySelectorAll('.krzyzowka-pole.poprawna').length`)) === 0, `bledne: ${await js(`document.querySelectorAll('.krzyzowka-pole.bledna').length`)}`)
  await klawiszSurowy('Backspace', 8)
  await czekaj(150)
  sprawdz('krzyzowka: Backspace cofa litere', (await literyKrzyzowki()) === '', JSON.stringify(await literyKrzyzowki()))

  await wpiszTekst(pierwszeSlowo)
  await tapnij('#krzyzowka-sprawdz')
  await czekaj(150)
  sprawdz('krzyzowka: poprawne haslo podswietla sie na zielono', (await js(`document.querySelectorAll('.krzyzowka-pole.poprawna').length`)) === pierwszeSlowo.length, `${await js(`document.querySelectorAll('.krzyzowka-pole.poprawna').length`)} z ${pierwszeSlowo.length}`)
  const literyPrzedPodpowiedzia = (await literyKrzyzowki()).length
  await tapnij('#krzyzowka-podpowiedz')
  await czekaj(200)
  sprawdz(
    'krzyzowka: "Podpowiedz literę" odkrywa litere i zmniejsza licznik',
    (await js(`document.getElementById('krzyzowka-podpowiedz').textContent`)) === 'Podpowiedz literę (2)' && (await literyKrzyzowki()).length === literyPrzedPodpowiedzia + 1,
    `${await js(`document.getElementById('krzyzowka-podpowiedz').textContent`)} :: ${(await literyKrzyzowki()).length}`,
  )
  await zrzut('v4-krzyzowka')

  // Wypelnienie calej krzyzowki: kazde pole z numerem daje jedno albo dwa hasla, stad trzy tapniecia
  // (pierwsze ustawia kursor, drugie wraca na to samo pole, trzecie zmienia kierunek).
  const wypelnione = new Set()
  let bezSlowa = 0
  for (const c of starty) {
    for (let proba = 0; proba < 3; proba++) {
      if (!(await js(`!!document.getElementById('krzyzowka-siatka')`))) break
      await tapnij(polePo(c))
      const haslo = await hasloKrzyzowki()
      if (!haslo || wypelnione.has(haslo)) continue
      wypelnione.add(haslo)
      const slowo = slowoZHasla(haslo, poPl)
      if (!slowo) {
        bezSlowa += 1
        continue
      }
      await wpiszTekst(slowo)
    }
  }
  sprawdz('krzyzowka: kazde haslo daje sie rozpoznac po polskim tlumaczeniu', bezSlowa === 0, `bez dopasowania: ${bezSlowa}`)
  sprawdz('krzyzowka: po uzupelnieniu wszystkich pol wynik pokazuje sie sam', await czekajNa(`!!document.getElementById('gra-jeszcze-raz')`, 6000), (await scenaTekst()).replace(/\n+/g, ' | '))
  const wynikKrzyzowki = await scenaTekst()
  sprawdz(
    'krzyzowka: wynik to liczba hasel, podpowiedzi i czas',
    /Krzyżówka ukończona/.test(wynikKrzyzowki) && /hase[lł]/.test(wynikKrzyzowki) && /podpowied/.test(wynikKrzyzowki) && /\d+:\d\d/.test(wynikKrzyzowki),
    wynikKrzyzowki.replace(/\n+/g, ' | '),
  )
  sprawdz('krzyzowka: wynik liczy uzyta podpowiedz', /\n1\npodpowied/.test(wynikKrzyzowki) || wynikKrzyzowki.includes('1\npodpowiedź'), wynikKrzyzowki.replace(/\n+/g, ' | '))
  await zrzut('v4-krzyzowka-wynik')
  const kartyPoKrzyzowce = await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).karty)`)
  sprawdz('krzyzowka: harmonogram i stan kart bez zmian', kartyPoKrzyzowce === kartyPrzedGrami)

  // ---------------------------------------------------------------------------------------------
  // G2: literki od startu do wyniku
  // ---------------------------------------------------------------------------------------------
  await tapnij('#gra-wroc')
  sprawdz('gry: "Wróć" z wyniku wraca na ekran wyboru', await czekajNa(`!!document.getElementById('gra-literki')`, 5000))
  await tapnij('#gra-literki')
  sprawdz('literki: przycisk "Literki" otwiera ekran gry', await czekajNa(`!!document.getElementById('literki-kafelki')`, 8000), (await scenaTekst()).replace(/\n+/g, ' | '))
  sprawdz('literki: seria ma 10 slow', (await js(`document.getElementById('literki-postep').textContent`)) === '1 / 10', await js(`document.getElementById('literki-postep').textContent`))
  sprawdz(
    'literki: kafelki to cele dotyku min. 44 px w jednym albo dwoch rzedach',
    await js(`[...document.querySelectorAll('.literka')].every((b) => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 })`) &&
      (await js(`new Set([...document.querySelectorAll('.literka')].map((b) => Math.round(b.getBoundingClientRect().top))).size`)) <= 2,
    await js(`[...document.querySelectorAll('.literka')].map((b) => Math.round(b.getBoundingClientRect().height)).join(', ')`),
  )
  const znaczenieLiterek = () => js(`document.getElementById('literki-znaczenie').textContent`)
  const kafelkiLiterek = async () => JSON.parse(await js(`JSON.stringify([...document.querySelectorAll('.literka')].map((b) => b.textContent))`))
  const odpowiedzLiterek = () => js(`[...document.querySelectorAll('.literki-slot')].map((e) => e.textContent).join('')`)
  const indeksyDlaSlowa = (litery, slowo) => {
    const uzyte = new Set()
    const wynik = []
    for (const znak of slowo.toUpperCase()) {
      const i = litery.findIndex((z, j) => z === znak && !uzyte.has(j))
      if (i < 0) return null
      uzyte.add(i)
      wynik.push(i)
    }
    return wynik
  }
  const pierwszeLiterki = poPl.get(await znaczenieLiterek())
  sprawdz('literki: u gory stoi polskie znaczenie slowa z talii', !!pierwszeLiterki, await znaczenieLiterek())
  sprawdz('literki: pod znaczeniem jest tyle miejsc, ile liter', (await js(`document.querySelectorAll('.literki-slot').length`)) === pierwszeLiterki.length, `${await js(`document.querySelectorAll('.literki-slot').length`)} z ${pierwszeLiterki.length}`)
  await zrzut('v4-literki')

  // Blad: pelna, ale zla odpowiedz tylko drga i zostawia mozliwosc poprawy. Bez kary i bez przejscia dalej.
  const literyPierwsze = await kafelkiLiterek()
  const dobreIndeksy = indeksyDlaSlowa(literyPierwsze, pierwszeLiterki)
  const zleIndeksy = [...dobreIndeksy.slice(1), dobreIndeksy[0]]
  for (const i of zleIndeksy) {
    await tapnij(`.literka[data-i="${i}"]`)
    await czekaj(60)
  }
  const drgnelo = await js(`!!document.querySelector('.literki-kafelki.drga')`)
  await czekaj(500)
  sprawdz(
    'literki: zla odpowiedz drga i zostaje do poprawy, bez kary',
    (await js(`document.getElementById('literki-postep').textContent`)) === '1 / 10' && (await odpowiedzLiterek()).length === pierwszeLiterki.length,
    `drgniecie: ${drgnelo}, odpowiedz: ${await odpowiedzLiterek()}`,
  )
  for (let i = 0; i < pierwszeLiterki.length; i++) {
    await tapnij('#literki-odpowiedz')
    await czekaj(60)
  }
  sprawdz('literki: tapniecie w odpowiedz cofa ostatnia litere', (await odpowiedzLiterek()) === '', JSON.stringify(await odpowiedzLiterek()))
  await tapnij('#literki-podpowiedz')
  await czekaj(200)
  sprawdz(
    'literki: podpowiedz dostawia litere i podbija licznik',
    (await js(`document.getElementById('literki-podpowiedz').textContent`)) === 'Podpowiedź (1)' && (await odpowiedzLiterek()).length === 1,
    `${await js(`document.getElementById('literki-podpowiedz').textContent`)} :: ${await odpowiedzLiterek()}`,
  )

  // Cala runda: kazde slowo ulozone poprawnie przechodzi dalej samo.
  let ulozonych = 0
  for (let runda = 0; runda < 12; runda++) {
    if (!(await js(`!!document.getElementById('literki-kafelki')`))) break
    const slowo = poPl.get(await znaczenieLiterek())
    if (!slowo) break
    const juz = (await odpowiedzLiterek()).length
    const indeksy = indeksyDlaSlowa(await kafelkiLiterek(), slowo)
    if (!indeksy) break
    for (const i of indeksy.slice(juz)) {
      await tapnij(`.literka[data-i="${i}"]`)
      await czekaj(50)
    }
    ulozonych += 1
    await czekaj(600)
  }
  sprawdz('literki: seria dziesieciu slow przechodzi do konca', ulozonych === 10, `ulozonych: ${ulozonych}`)
  sprawdz('literki: koniec serii pokazuje wynik i dwa wyjscia', await czekajNa(`!!document.getElementById('gra-jeszcze-raz') && !!document.getElementById('gra-wroc')`, 6000), (await scenaTekst()).replace(/\n+/g, ' | '))
  const wynikLiterek = await scenaTekst()
  sprawdz(
    'literki: wynik to liczba slow, podpowiedzi i czas',
    /Seria ukończona/.test(wynikLiterek) && /10\nsłów/.test(wynikLiterek) && /1\npodpowiedź/.test(wynikLiterek) && /\d+:\d\d/.test(wynikLiterek),
    wynikLiterek.replace(/\n+/g, ' | '),
  )
  await zrzut('v4-literki-wynik')

  const kartyPoGrach = await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).karty)`)
  sprawdz('gry: po krzyzowce i literkach localStorage ma dokladnie te same karty', kartyPoGrach === kartyPrzedGrami)
  sprawdz('gry: czas gier liczy sie do dnia nauki, tak jak w treningu', (await js(`JSON.parse(localStorage.getItem('mmf-v1')).dzis.sekundy`)) > 0, String(await js(`JSON.parse(localStorage.getItem('mmf-v1')).dzis.sekundy`)))

  // Krzyzowka na iPhone SE: siatka ma byc czytelna i bez przewijania w bok.
  await tapnij('#gra-wroc')
  await czekajNa(`!!document.getElementById('gra-krzyzowka')`, 5000)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true })
  await czekaj(300)
  await tapnij('#gra-krzyzowka')
  await czekajNa(`!!document.getElementById('krzyzowka-siatka')`, 8000)
  const bokSE = await js(`Math.round(document.querySelector('.krzyzowka-pole').getBoundingClientRect().width * 10) / 10`)
  sprawdz('iPhone SE: komorka krzyzowki ma co najmniej 28 px', bokSE >= 28, `${bokSE} px`)
  sprawdz('iPhone SE: siatka krzyzowki miesci sie bez przewijania w bok', (await przewijaWBok()) === '' && (await js(`document.getElementById('krzyzowka-siatka').getBoundingClientRect().right <= innerWidth + 0.5`)), await przewijaWBok())
  await zrzut('v4-krzyzowka-se')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await czekaj(300)
  await przeciagnij('#krzyzowka-siatka', 0, 170)
  sprawdz('gry: gest w dol wychodzi z gry', await czekajNa(`!!document.getElementById('gra-powtorki')`, 5000), (await scenaTekst()).replace(/\n+/g, ' | '))
  await tapnij('#gra-literki')
  await czekajNa(`!!document.getElementById('literki-kafelki')`, 8000)
  await przeciagnij('#literki-kafelki', 0, 170)
  sprawdz('literki: gest w dol takze wychodzi z gry', await czekajNa(`!!document.getElementById('gra-powtorki')`, 5000))
  await tapnij('#gra-krzyzowka')
  await czekajNa(`!!document.getElementById('krzyzowka-siatka')`, 8000)
  await js(`document.getElementById('krzyzowka-zamknij').click(); 1`)
  sprawdz('krzyzowka: krzyzyk zamyka gre', await czekajNa(`!!document.getElementById('gra-powtorki')`, 5000))

  // ---------------------------------------------------------------------------------------------
  // H: talie (wlaczanie, wylaczanie, dodanie i usuniecie)
  // ---------------------------------------------------------------------------------------------
  const przelacznikTalii = (nazwa) => `#sekcja-talii .przelacz[data-talia="${JSON.stringify(nazwa).slice(1, -1)}"]`
  const sekcjaTaliiTekst = () => js(`document.getElementById('sekcja-talii').innerText`)
  await otworzMenu()
  const talieMenu = await sekcjaTaliiTekst()
  sprawdz('talie: menu ma sekcje z lista talii i przelacznikami', /Oxford 3000/.test(talieMenu) && (await js(`document.querySelectorAll('#sekcja-talii .przelacz').length`)) >= 2, talieMenu.replace(/\n+/g, ' | '))
  sprawdz('talie: domyslnie wszystkie wlaczone', await js(`[...document.querySelectorAll('#sekcja-talii .przelacz')].every((b) => b.getAttribute('aria-checked') === 'true')`))
  await js(`document.getElementById('sekcja-talii').scrollIntoView({ block: 'start' }); 1`)
  await czekaj(200)
  await zrzut('v4-talie')

  const postepPrzedWylaczeniem = await js(`document.getElementById('postep-talii').getAttribute('aria-label')`)
  const kartyPrzedWylaczeniem = await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).karty)`)
  await js(`document.querySelector(${JSON.stringify(przelacznikTalii('Przykład'))}).click(); 1`)
  await czekaj(300)
  sprawdz('talie: przelacznik wylacza talie z nauki', (await js(`document.querySelector(${JSON.stringify(przelacznikTalii('Przykład'))}).getAttribute('aria-checked')`)) === 'false')
  sprawdz('talie: wylaczona talia zostaje na liscie razem z postepem', /poza nauką/.test(await sekcjaTaliiTekst()), (await sekcjaTaliiTekst()).replace(/\n+/g, ' | '))
  sprawdz('talie: postep wylaczonej talii zostaje w zapisie', (await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).karty)`)) === kartyPrzedWylaczeniem)
  sprawdz('talie: zapis dostaje pole wylaczoneTalie, a WERSJA_ZAPISU zostaje 1', await js(`(() => { const z = JSON.parse(localStorage.getItem('mmf-v1')); return z.wersja === 1 && z.ustawienia.wylaczoneTalie.includes('Przykład') })()`), await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).ustawienia.wylaczoneTalie)`))
  await js(`document.getElementById('menu').querySelector('.zamknij').click(); 1`)
  await czekaj(300)
  sprawdz('talie: slowa wylaczonej talii znikaja z nauki', await czekajNa(`!!document.getElementById('gra-powtorki') && document.getElementById('gra-powtorki').disabled`, 5000), (await scenaTekst()).replace(/\n+/g, ' | '))
  await tapnij('#gra-krzyzowka')
  sprawdz('talie: slowa wylaczonej talii znikaja takze z gier', await czekajNa(`document.getElementById('toast').textContent.startsWith('Za mało słów na krzyżówkę')`, 4000), await toastTekst())

  await otworzMenu()
  await js(`document.querySelector(${JSON.stringify(przelacznikTalii('Przykład'))}).click(); 1`)
  await czekaj(300)
  await js(`document.getElementById('menu').querySelector('.zamknij').click(); 1`)
  await czekaj(300)
  sprawdz('talie: wlaczenie talii oddaje slowa nauce razem z postepem', (await js(`document.getElementById('postep-talii').getAttribute('aria-label')`)) === postepPrzedWylaczeniem, `${postepPrzedWylaczeniem} -> ${await js(`document.getElementById('postep-talii').getAttribute('aria-label')`)}`)
  sprawdz('talie: po wlaczeniu jest znowu co powtarzac', await czekajNa(`!document.getElementById('gra-powtorki').disabled`, 5000))

  // Nowa talia z wlasna nazwa, a potem jej usuniecie razem z postepem.
  await otworzMenu()
  await klikPoTekscie('#sekcja-talii', 'Dodaj talię')
  await czekajNa(`!!document.getElementById('wklej')`)
  await czekaj(400)
  await js(`(() => { const pole = document.getElementById('wklej'); pole.value = 'kite ; latawiec\\nsledge ; sanki'; pole.dispatchEvent(new Event('input')) })(); 1`)
  await czekajNa(`document.querySelector('#podglad .podsumowanie')?.textContent === '2 nowe, 0 zaktualizowanych, 0 błędów'`)
  sprawdz('talie: nowa talia dostaje domyslna nazwe "Wklejone RRRR-MM-DD"', /^Wklejone \d{4}-\d{2}-\d{2}$/.test(await js(`document.getElementById('nazwa-talii').value`)), await js(`document.getElementById('nazwa-talii').value`))
  await js(`(() => { const pole = document.getElementById('nazwa-talii'); pole.value = 'Moja lista'; pole.dispatchEvent(new Event('input')) })(); 1`)
  await czekaj(150)
  sprawdz('talie: podglad pokazuje nazwe wpisana recznie', (await js(`document.getElementById('podglad-talia').textContent`)) === 'Talia: Moja lista', await js(`document.getElementById('podglad-talia').textContent`))
  await js(`document.getElementById('dodaj-slowka').click(); 1`)
  sprawdz('talie: dodanie talii zamyka ekran', await czekajNa(`document.getElementById('dodawanie').hidden`, 8000))
  const t4 = await talia()
  sprawdz('talie: nowe slowa maja nazwe talii z pola', t4.slowa.filter((s) => s.talia === 'Moja lista').length === 2 && t4.talie.some((x) => x.nazwa === 'Moja lista'), JSON.stringify(t4.talie.map((x) => x.nazwa)))
  await otworzMenu()
  sprawdz('talie: nowa talia jest na liscie z liczbami', /Moja lista/.test(await sekcjaTaliiTekst()) && /0 \/ 2 poznanych/.test(await sekcjaTaliiTekst()), (await sekcjaTaliiTekst()).replace(/\n+/g, ' | '))

  await js(`window.confirm = (tekst) => { window.__pytanieTalia = tekst; return true }`)
  await js(`[...document.querySelectorAll('#sekcja-talii button')].find((b) => b.getAttribute('aria-label') === 'Usuń talię Moja lista').click(); 1`)
  sprawdz('talie: usuniecie pyta i podaje, ile slow i kart przepadnie', await czekajNa(`/Moja lista/.test(String(window.__pytanieTalia || '')) && /2 słowa/.test(String(window.__pytanieTalia || ''))`, 4000), String(await js(`window.__pytanieTalia`)))
  sprawdz('talie: po potwierdzeniu talia znika z listy', await czekajNa(`!/Moja lista/.test(document.getElementById('sekcja-talii').innerText)`, 6000), (await sekcjaTaliiTekst()).replace(/\n+/g, ' | '))
  const t5 = await talia()
  sprawdz('talie: slowa usunietej talii znikaja z bazy, reszta zostaje', !t5.slowa.some((s) => s.talia === 'Moja lista') && t5.slowa.length === t4.slowa.length - 2 && !t5.talie.some((x) => x.nazwa === 'Moja lista'), `${t5.slowa.length} slow`)
  sprawdz('talie: usuniecie nie rusza postepu pozostalych talii', (await js(`JSON.stringify(JSON.parse(localStorage.getItem('mmf-v1')).karty)`)) === kartyPrzedWylaczeniem)
  await js(`document.getElementById('menu').querySelector('.zamknij').click(); 1`)
  await czekaj(300)

  // ---------------------------------------------------------------------------------------------
  // Zapis uzytkownika z v3 (ok. 400 kart) musi wczytac sie bez straty
  // ---------------------------------------------------------------------------------------------
  const kartyV3 = {}
  for (let i = 0; i < 400; i++) {
    kartyV3[IDY[i]] = [kartaV4({ termin: zaMinut(i < 20 ? -(60 + i) : 1440 * (2 + (i % 40)) ), stabilnosc: 3 + (i % 50) })]
    if (i % 3 === 0) kartyV3[IDY[i]].push(kartaV4({ termin: zaMinut(1440 * (3 + (i % 20))), stabilnosc: 5 }))
  }
  const zapisV3 = {
    wersja: 1,
    karty: kartyV3,
    pominiete: { [IDY[500]]: wczorajData },
    exp: 25140,
    // pola sprzed v4, ktorych apka juz nie zna
    punktyTygodnia: { tydzien: wczorajData, punkty: 640 },
    streak: { dni: 12, ostatniDzien: wczorajData, zamrozenia: 1, doZamrozenia: 4 },
    dzis: { data: dataDzis, sekundy: 120, dodatkoweNowe: 0, powtorki: 3 },
    historia: { [wczorajData]: { oceny: 42, nowe: 8, exp: 1800, sekundy: 210 } },
    zgloszenia: [],
    ustawienia: { noweDziennie: 10, maksPowtorekDziennie: 60, dlugoscSerii: 15, autowymowa: true, mowienie: true, celDzienny: 60, podpowiedzMowienie: 'brak', kotwica: 'po kawie', kotwicaPytano: true },
    ostatniaKopia: new Date().toISOString(),
    rozproszono: 1,
  }
  await js(`localStorage.setItem('mmf-v1', ${JSON.stringify(JSON.stringify(zapisV3))}); 1`)
  await js(`window.__stary = 1`)
  await cdp('Page.reload', {})
  sprawdz('zapis v3: apka wstaje po wczytaniu', await czekajNa(`!window.__stary && document.documentElement.dataset.gotowe === '1'`, 15000))
  const poV3 = await zapis()
  sprawdz('zapis v3: wszystkie karty na miejscu', Object.keys(poV3.karty).length === Object.keys(kartyV3).length, `${Object.keys(poV3.karty).length} / ${Object.keys(kartyV3).length}`)
  sprawdz('zapis v3: expRazem, streak, pominiete i historia bez straty', poV3.exp === 25140 && poV3.streak.dni === 12 && poV3.pominiete[IDY[500]] === wczorajData && poV3.historia[wczorajData].oceny === 42, JSON.stringify({ exp: poV3.exp, streak: poV3.streak.dni, historia: poV3.historia[wczorajData] }))
  sprawdz('zapis v3: WERSJA_ZAPISU dalej 1', poV3.wersja === 1, String(poV3.wersja))
  sprawdz('zapis v3: samouczek gestow pokazuje sie raz po aktualizacji', await czekajNa(`!document.getElementById('samouczek').hidden`, 6000))
  await zamknijSamouczek()
  sprawdz('zapis v3: apka otwiera sie na karcie', await czekajNa(`!!document.getElementById('karta')`, 6000), (await scenaTekst()).replace(/\n+/g, ' | '))

  sprawdz('brak bledow JS w konsoli', bledyKonsoli.length === 0, bledyKonsoli.join(' | '))
} catch (blad) {
  sprawdz('test przerwany wyjatkiem', false, blad.stack)
} finally {
  ws.close()
  spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'])
  serwer?.kill()
}

const zle = wyniki.filter((w) => !w.ok)
console.log(`\n${wyniki.length - zle.length}/${wyniki.length} OK`)
if (zle.length) console.log('Nieudane:\n' + zle.map((w) => '  - ' + w.opis).join('\n'))
process.exit(zle.length ? 1 : 0)
