// Interfejs fiszek na telefon. Jeden ekran bez przewijania: karta, oceny pod kciukiem, menu w dolnym panelu,
// dodawanie slowek, kopia zapasowa i stan offline. Logika serii jest w talia.js, zapis w magazyn.js i baza.js.

import { nowaKarta, ocen } from './fsrs.mjs'
import * as talia from './talia.js'
import * as magazyn from './magazyn.js'
import * as baza from './baza.js'
import { dopiszTalie, parsujWklejone, scal } from './slowka.js'
import { dodajPrzelacznik, wibruj } from './haptyka.js'
import { powiedz } from './mowa.js'

const PROG_RUCHU = 10
const PROG_SWIPE = 80
const PROG_FLICKA = 0.6
const DNI_DO_PRZYPOMNIENIA_O_KOPII = 7
const MAKS_BLEDOW_W_PODGLADZIE = 30

const CZESCI_MOWY = {
  noun: 'rzeczownik',
  verb: 'czasownik',
  adjective: 'przymiotnik',
  adverb: 'przysłówek',
  preposition: 'przyimek',
  pronoun: 'zaimek',
  conjunction: 'spójnik',
  determiner: 'określnik',
  exclamation: 'wykrzyknik',
  number: 'liczebnik',
  'ordinal number': 'liczebnik porządkowy',
  'modal verb': 'czasownik modalny',
  'auxiliary verb': 'czasownik posiłkowy',
  'linking verb': 'czasownik łączący',
  'phrasal verb': 'czasownik frazowy',
  article: 'przedimek',
  'definite article': 'przedimek',
  'indefinite article': 'przedimek',
  'infinitive marker': 'partykuła',
}

let stan = magazyn.domyslnyStan()
let slowa = []
let talie = []
let poId = new Map()
let taliaWczytana = false
let seria = null
let ekran = 'start'
let odkryta = false
let zajete = false
let ignorujKlik = false
let startKarty = 0
let rejestracja = null
let nowaWersja = false
let czekamNaAktualizacje = false
let offline = null
let trwalaPamiec = null
let zrodloImportu = null
let wynikImportu = null
let czasPodgladu = 0
let zapisujeSlowka = false
let czasToastu = 0
let poprzednieExp = null
const komunikaty = new Map()

const $ = (id) => document.getElementById(id)
const opis = (blad) => (blad && (blad.message || blad.name)) || String(blad)
const dniOd = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86400000)

function el(tag, atrybuty = {}, ...dzieci) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(atrybuty)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'klasa') e.className = v
    else if (k === 'tekst') e.textContent = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else e.setAttribute(k, v === true ? '' : String(v))
  }
  for (const d of dzieci.flat()) {
    if (d !== undefined && d !== null && d !== false && d !== '') e.append(d)
  }
  return e
}

// Polska liczba mnoga: 1 blad, 2 bledy, 5 bledow.
function liczebnik(n, [jeden, kilka, wiele]) {
  if (n === 1) return `${n} ${jeden}`
  const jednosci = n % 10
  const setki = n % 100
  const kilku = jednosci >= 2 && jednosci <= 4 && (setki < 12 || setki > 14)
  return `${n} ${kilku ? kilka : wiele}`
}

const opisPominietych = (n) => `Pominięto ${liczebnik(n, ['uszkodzoną kartę', 'uszkodzone karty', 'uszkodzonych kart'])}`

// Komunikaty i toast

function ustawKomunikat(klucz, tekst, zamykalny = true) {
  if (tekst) komunikaty.set(klucz, { tekst, zamykalny })
  else komunikaty.delete(klucz)
  $('komunikaty').replaceChildren(
    ...[...komunikaty].map(([k, k2]) =>
      el(
        'div',
        { klasa: 'komunikat', role: 'alert' },
        el('span', { tekst: k2.tekst }),
        k2.zamykalny &&
          el('button', { klasa: 'zamknij', type: 'button', 'aria-label': 'Zamknij', tekst: '✕', onclick: () => ustawKomunikat(k, '') }),
      ),
    ),
  )
}

function toast(tekst, rodzaj = '') {
  const t = $('toast')
  t.textContent = tekst
  t.className = `toast ${rodzaj}`
  t.hidden = false
  clearTimeout(czasToastu)
  czasToastu = setTimeout(() => {
    t.hidden = true
  }, rodzaj ? 7000 : 3500)
}

// Zapis po kazdej ocenie jest synchroniczny. Blad zostaje na ekranie, dopoki kolejny zapis sie nie uda.
function zapiszStan() {
  const wynik = magazyn.zapisz(stan)
  const tekst = wynik.ok ? '' : `Nie udało się zapisać postępu (${wynik.blad}). Zrób kopię w menu, zanim zamkniesz aplikację.`
  ustawKomunikat('zapis', tekst, false)
  return wynik.ok
}

function ustawTalie(t) {
  slowa = t.slowa
  talie = t.talie
  poId = new Map(slowa.map((s) => [s.id, s]))
}

// Dopoki zapisana talia sie nie wczyta, nie wolno jej nadpisac (dodanie slow albo kopia zapisalyby niepelna liste).
async function upewnijTalie() {
  if (taliaWczytana) return true
  try {
    ustawTalie(await baza.wczytajTalie())
    taliaWczytana = true
    ustawKomunikat('baza', '')
    return true
  } catch (blad) {
    const tekst =
      blad?.name === 'BazaNieOdpowiada'
        ? blad.message
        : `Nie udało się wczytać słówek z pamięci telefonu (IndexedDB): ${opis(blad)}. Zamknij i otwórz aplikację.`
    ustawKomunikat('baza', tekst)
    return false
  }
}

// Gorny pasek

function odswiezGore() {
  const exp = $('exp')
  exp.textContent = `${stan.exp.toLocaleString('pl-PL')} EXP`
  if (poprzednieExp !== null && stan.exp > poprzednieExp) {
    exp.classList.remove('puls')
    void exp.offsetWidth
    exp.classList.add('puls')
  }
  poprzednieExp = stan.exp
  $('streak').textContent = `🔥 ${talia.aktualnyStreak(stan.streak)}`
  const wyswietlany = seria ? talia.pasekPostepu(talia.postepSerii(seria)) : 0
  $('pasek').style.transform = `scaleX(${wyswietlany})`
  $('procent').textContent = `${Math.round(wyswietlany * 100)}%`
}

const gotoweOffline = () =>
  !!navigator.serviceWorker?.controller && !!offline && !offline.blad && offline.zapisane === offline.pliki

function odswiezZnacznik() {
  const znacznik = $('offline')
  const ok = gotoweOffline()
  znacznik.textContent = ok ? 'offline ✓' : '⚠ nie offline'
  znacznik.classList.toggle('ok', ok)
}

// Ekrany

function pokazEkran(nazwa, ...zawartosc) {
  ekran = nazwa
  $('scena').replaceChildren(...zawartosc)
  if (nazwa !== 'karta') {
    $('akcje').hidden = true
    $('akcje').replaceChildren()
  }
  odswiezGore()
}

function nowaSeriaLubPusto() {
  if (!slowa.length) {
    pokazBezSlow()
    return
  }
  const klucze = talia.zbudujSerie({ slowa, karty: stan.karty, ustawienia: stan.ustawienia, dzis: stan.dzis, teraz: new Date() })
  if (!klucze.length) {
    seria = null
    pokazPusto()
    return
  }
  seria = talia.nowaSeria(klucze)
  pokazKarte()
}

const przyciskGlosnika = (tekst) =>
  el('button', {
    klasa: 'glosnik',
    type: 'button',
    'aria-label': 'Wymowa',
    tekst: '🔊',
    onclick: () => {
      if (!powiedz(tekst)) toast('Brak syntezy mowy na tym urządzeniu.', 'blad')
    },
  })

function chipy(slowo, nowa) {
  const czesci = (slowo.czesci || []).map((c) => CZESCI_MOWY[c.toLowerCase()] || c).join(', ')
  return el(
    'div',
    { klasa: 'chipy' },
    slowo.poziom && el('span', { klasa: 'chip poziom', tekst: slowo.poziom }),
    czesci && el('span', { klasa: 'chip', tekst: czesci }),
    nowa && el('span', { klasa: 'chip nowe', tekst: 'nowe' }),
  )
}

// Karta wypada z serii bez oceny i bez zapisu.
function pominAktualna() {
  seria = { ...seria, kolejka: seria.kolejka.slice(1), wszystkie: Math.max(seria.wszystkie - 1, seria.oczyszczone) }
  if (talia.koniecSerii(seria)) pokazKoniec()
  else pokazKarte()
}

function pokazKarte() {
  const k = talia.aktualnaKarta(seria)
  const { id, kierunek } = talia.rozbierzKlucz(k)
  const slowo = poId.get(id)
  if (!slowo) {
    // Talia tylko rosnie, ale gdyby slowa zabraklo, nie ma czego pokazac.
    pominAktualna()
    return
  }
  odkryta = false
  const nowa = talia.jestNowa(stan.karty[k])
  const karta = el('div', { klasa: `karta wjazd kierunek-${kierunek}`, id: 'karta' })
  karta.addEventListener('animationend', (e) => {
    if (e.target === karta) karta.classList.remove('wjazd')
  })

  if (kierunek === 'en') {
    karta.append(
      el('div', { klasa: 'etykieta', tekst: 'Co to znaczy?' }),
      el('div', { klasa: 'slowo', tekst: slowo.w }),
      slowo.ipa ? el('div', { klasa: 'ipa', tekst: `/${slowo.ipa}/` }) : '',
      chipy(slowo, nowa),
      przyciskGlosnika(slowo.w),
      el(
        'div',
        { klasa: 'odkrycie' },
        el('div', { klasa: 'tlumaczenie', tekst: slowo.pl }),
        slowo.zdanie && el('div', { klasa: 'zdanie', tekst: slowo.zdanie }),
        slowo.zdaniePl && el('div', { klasa: 'zdanie-pl', tekst: slowo.zdaniePl }),
      ),
    )
  } else {
    const podpowiedz = talia.podpowiedz(slowo.w).split('   ').map((wyraz) => el('span', { tekst: wyraz }))
    karta.append(
      el('div', { klasa: 'etykieta mowienie', tekst: 'Powiedz po angielsku' }),
      el('div', { klasa: 'tlumaczenie duze', tekst: slowo.pl }),
      el('div', { klasa: 'podpowiedz', 'aria-label': 'Podpowiedź' }, podpowiedz),
      slowo.zdaniePl ? el('div', { klasa: 'zdanie-pl', tekst: slowo.zdaniePl }) : '',
      el(
        'div',
        { klasa: 'odkrycie' },
        el('div', { klasa: 'slowo', tekst: slowo.w }),
        el('div', { klasa: 'wymowa' }, slowo.ipa && el('span', { klasa: 'ipa', tekst: `/${slowo.ipa}/` }), przyciskGlosnika(slowo.w)),
        slowo.zdanie && el('div', { klasa: 'zdanie', tekst: slowo.zdanie }),
      ),
    )
  }
  karta.append(
    el('div', { klasa: 'wskazowka', tekst: 'Dotknij, aby odsłonić' }),
    el('div', { klasa: 'znacznik-swipe tak', tekst: 'Umiem' }),
    el('div', { klasa: 'znacznik-swipe nie', tekst: 'Nie umiem' }),
  )
  dodajPrzelacznik(karta)
  podepnijGest(karta)
  pokazEkran('karta', karta)
  odswiezAkcje()
  startKarty = performance.now()
}

function przyciskOceny(klasa, tekst, ocena) {
  const przycisk = el('div', { klasa: `ocena ${klasa}`, role: 'button', 'aria-label': tekst, onclick: () => ocenKarte(ocena) }, el('span', { tekst }))
  dodajPrzelacznik(przycisk)
  return przycisk
}

// Przed odslonieciem nie ma przyciskow oceny, zeby najpierw sprobowac sobie przypomniec. Wyjatek: "Znam juz" dla nowych.
function odswiezAkcje() {
  const akcje = $('akcje')
  if (ekran !== 'karta' || !seria) {
    akcje.hidden = true
    return
  }
  const nowa = talia.jestNowa(stan.karty[talia.aktualnaKarta(seria)])
  akcje.hidden = false
  akcje.replaceChildren(
    el('div', { klasa: 'akcje-gora' }, nowa && przyciskOceny('znam', 'Znam już', 4)),
    odkryta
      ? el('div', { klasa: 'akcje-dol' }, przyciskOceny('nie', 'Nie umiem', 1), przyciskOceny('tak', 'Umiem', 3))
      : el('div', { klasa: 'akcje-dol info', tekst: 'Najpierw spróbuj sobie przypomnieć' }),
  )
}

function odslon() {
  if (ekran !== 'karta' || odkryta || zajete) return
  odkryta = true
  $('karta').classList.add('odkryta')
  wibruj('odsloniecie')
  if (stan.ustawienia.autowymowa) powiedz(poId.get(talia.rozbierzKlucz(talia.aktualnaKarta(seria)).id)?.w)
  odswiezAkcje()
}

function ocenKarte(ocena) {
  if (ekran !== 'karta' || zajete || !seria) return
  const k = talia.aktualnaKarta(seria)
  const przed = stan.karty[k]
  if (ocena === 4 ? !talia.jestNowa(przed) : !odkryta) return
  const teraz = new Date()
  const poprzednia = przed || nowaKarta(teraz.toISOString())
  // Nowy obiekt zamiast zmiany w miejscu: magazyn trzyma spakowana postac przy obiekcie karty.
  let nowa
  try {
    nowa = { ...poprzednia, ...ocen(poprzednia, ocena, teraz) }
    if (!Number.isFinite(nowa.stabilnosc) || !Number.isFinite(nowa.trudnosc) || Number.isNaN(Date.parse(nowa.termin))) {
      throw new Error('niepoprawny wynik algorytmu powtórek')
    }
  } catch (blad) {
    // Karta, ktorej nie da sie ocenic, zostaje bez zmian, zeby do zapisu nie trafil NaN.
    toast(`Nie udało się ocenić karty: ${opis(blad)}`, 'blad')
    pominAktualna()
    return
  }
  stan.karty[k] = nowa
  Object.assign(stan, talia.zaliczCzas(stan, (performance.now() - startKarty) / 1000, teraz))
  stan.exp += talia.EXP_ZA_OCENE[ocena]
  seria = talia.poOcenie(seria, ocena)
  zapiszStan()

  const koniec = talia.koniecSerii(seria)
  if (koniec) wibruj('koniec')
  else wibruj(ocena === 1 ? 'nieUmiem' : 'umiem')
  odswiezGore()
  wylot(ocena === 1 ? 1 : -1, koniec ? pokazKoniec : pokazKarte)
}

const malyRuch = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function wylot(kierunek, potem) {
  zajete = true
  $('akcje').replaceChildren()
  const karta = $('karta')
  if (karta) {
    karta.classList.remove('wjazd', 'ciagniecie')
    karta.style.transition = 'transform 240ms cubic-bezier(0.4, 0, 0.7, 0.2), opacity 240ms ease-in'
    karta.style.transform = `translateY(${kierunek * 120}%) rotate(${kierunek * -6}deg)`
    karta.style.opacity = '0'
  }
  setTimeout(() => {
    zajete = false
    potem()
  }, malyRuch() ? 30 : 230)
}

// Karta podaza za palcem dopiero po odslonieciu. Wtedy ruch powyzej PROG_RUCHU to przeciaganie i klikniecie po nim
// jest pomijane. Przed odslonieciem gest nic nie robi, wiec tapniecie z lekkim ruchem palca nadal odslania karte.
// Swipe w gore to "Umiem", w dol "Nie umiem" (prog albo szybki ruch).
function podepnijGest(karta) {
  let dotyk = null
  const przesun = (dy) => {
    karta.style.transform = dy ? `translateY(${dy}px) rotate(${dy * -0.03}deg)` : ''
    karta.style.setProperty('--tak', String(Math.min(Math.max(-dy / PROG_SWIPE, 0), 1)))
    karta.style.setProperty('--nie', String(Math.min(Math.max(dy / PROG_SWIPE, 0), 1)))
  }

  karta.addEventListener('pointerdown', (e) => {
    if (dotyk || zajete || (e.pointerType === 'mouse' && e.button !== 0)) return
    ignorujKlik = false
    dotyk = { id: e.pointerId, x0: e.clientX, y0: e.clientY, y: e.clientY, t: e.timeStamp, dy: 0, v: 0, ruch: false, ciagnie: false }
  })

  karta.addEventListener('pointermove', (e) => {
    if (!dotyk || e.pointerId !== dotyk.id) return
    const dy = e.clientY - dotyk.y0
    if (!dotyk.ruch && Math.hypot(e.clientX - dotyk.x0, dy) > PROG_RUCHU) {
      dotyk.ruch = true
      if (odkryta && !zajete) {
        dotyk.ciagnie = true
        karta.classList.remove('wjazd')
        karta.classList.add('ciagniecie')
        try {
          karta.setPointerCapture(e.pointerId)
        } catch {
          // bez przechwycenia gest dziala, tylko mysz moze zgubic karte poza jej obszarem
        }
      }
    }
    const dt = e.timeStamp - dotyk.t
    if (dt > 0) dotyk.v = 0.8 * ((e.clientY - dotyk.y) / dt) + 0.2 * dotyk.v
    dotyk.y = e.clientY
    dotyk.t = e.timeStamp
    dotyk.dy = dy
    if (dotyk.ciagnie) przesun(dy)
  })

  const puszczenie = (e, anulowane) => {
    if (!dotyk || e.pointerId !== dotyk.id) return
    const { ciagnie, dy, t } = dotyk
    // zatrzymanie palca przed puszczeniem to nie flick
    const v = e.timeStamp - t > 100 ? 0 : dotyk.v
    dotyk = null
    if (!ciagnie) return
    ignorujKlik = true
    const wGore = dy < -PROG_SWIPE || (dy < -30 && v < -PROG_FLICKA)
    const wDol = dy > PROG_SWIPE || (dy > 30 && v > PROG_FLICKA)
    if (!anulowane && wGore) {
      ocenKarte(3)
      return
    }
    if (!anulowane && wDol) {
      ocenKarte(1)
      return
    }
    karta.classList.remove('ciagniecie')
    karta.style.transition = 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'
    przesun(0)
    setTimeout(() => {
      karta.style.transition = ''
    }, 240)
  }
  karta.addEventListener('pointerup', (e) => puszczenie(e, false))
  karta.addEventListener('pointercancel', (e) => puszczenie(e, true))

  // Tapniecie w przelacznik haptyki wyplywa tu jako jedno klikniecie.
  karta.addEventListener('click', (e) => {
    if (ignorujKlik) {
      ignorujKlik = false
      return
    }
    if (e.target.closest('.glosnik')) return
    odslon()
  })
}

function opisStreaka(teraz = new Date()) {
  const dni = talia.aktualnyStreak(stan.streak, teraz)
  if (stan.streak.ostatniDzien === talia.dataLokalna(teraz)) {
    return `🔥 ${liczebnik(dni, ['dzień', 'dni', 'dni'])} z rzędu. Dzisiejszy dzień zaliczony.`
  }
  const brakuje = Math.max(1, Math.ceil(talia.SEKUNDY_DNIA - talia.dzisiejszy(stan.dzis, teraz).sekundy))
  return `🔥 ${dni}. Jeszcze ${brakuje} s nauki, żeby zaliczyć dzisiejszy dzień.`
}

function opisDnia({ zalegle, pozniejDzis, noweDostepne }) {
  const czesci = [`Zaległe teraz: ${zalegle}`]
  if (pozniejDzis) czesci.push(`później dziś: ${pozniejDzis}`)
  czesci.push(`nowe w limicie: ${noweDostepne}`)
  return czesci.join(' · ')
}

const podsumowanie = (teraz = new Date()) =>
  talia.podsumowanieDnia({ slowa, karty: stan.karty, ustawienia: stan.ustawienia, dzis: stan.dzis, teraz })

function animujLicznik(element, cel) {
  const czas = malyRuch() ? 1 : 900
  const start = performance.now()
  const krok = (t) => {
    const p = Math.min((t - start) / czas, 1)
    element.textContent = `+${Math.round(cel * (1 - Math.pow(1 - p, 3)))} EXP`
    if (p < 1) requestAnimationFrame(krok)
  }
  requestAnimationFrame(krok)
}

function pokazKoniec() {
  const teraz = new Date()
  const licznik = el('div', { klasa: 'koniec-exp', tekst: '+0 EXP' })
  pokazEkran(
    'koniec',
    el(
      'section',
      { klasa: 'ekran' },
      el('h2', { tekst: 'Seria ukończona' }),
      licznik,
      el(
        'div',
        { klasa: 'kafelki' },
        el('div', { klasa: 'kafelek tak' }, el('b', { tekst: String(seria.umiem) }), 'Umiem'),
        el('div', { klasa: 'kafelek nie' }, el('b', { tekst: String(seria.nieUmiem) }), 'Nie umiem'),
      ),
      el('p', { tekst: opisStreaka(teraz) }),
      el('p', { klasa: 'przygaszony', tekst: opisDnia(podsumowanie(teraz)) }),
      banery(),
      el(
        'div',
        { klasa: 'przyciski' },
        el('button', { klasa: 'przycisk glowny', type: 'button', tekst: 'Jeszcze seria', onclick: () => nowaSeriaLubPusto() }),
        el('button', { klasa: 'przycisk', type: 'button', tekst: 'Koniec na dziś', onclick: () => pokazOdpoczynek() }),
      ),
    ),
  )
  animujLicznik(licznik, seria.exp)
}

function saNoweDoWprowadzenia() {
  return slowa.some((s) => {
    const en = stan.karty[talia.klucz(s.id, 'en')]
    if (talia.jestNowa(en)) return true
    return stan.ustawienia.mowienie && talia.mowienieOdblokowane(en) && talia.jestNowa(stan.karty[talia.klucz(s.id, 'pl')])
  })
}

function pokazPusto() {
  const teraz = new Date()
  const dzien = podsumowanie(teraz)
  pokazEkran(
    'pusto',
    el(
      'section',
      { klasa: 'ekran' },
      el('div', { klasa: 'logo', tekst: '✓' }),
      el('h2', { tekst: 'Na dziś wszystko' }),
      el('p', {
        klasa: 'przygaszony',
        tekst: dzien.pozniejDzis
          ? `Później dziś: jeszcze ${liczebnik(dzien.pozniejDzis, ['karta', 'karty', 'kart'])}.`
          : 'Kolejne powtórki pojawią się jutro.',
      }),
      el('p', { tekst: opisStreaka(teraz) }),
      el(
        'div',
        { klasa: 'przyciski' },
        saNoweDoWprowadzenia()
          ? el('button', { klasa: 'przycisk glowny', type: 'button', tekst: `+${talia.DODATKOWE_NOWE} nowych na dziś`, onclick: dodajNoweNaDzis })
          : el('p', { klasa: 'przygaszony', tekst: 'Wszystkie słowa z talii są już wprowadzone.' }),
        el('button', { klasa: 'przycisk', type: 'button', tekst: 'Dodaj słówka', onclick: () => pokazDodawanie() }),
      ),
    ),
  )
}

function dodajNoweNaDzis() {
  const dzis = talia.dzisiejszy(stan.dzis)
  stan.dzis = { ...dzis, dodatkoweNowe: dzis.dodatkoweNowe + talia.DODATKOWE_NOWE }
  zapiszStan()
  nowaSeriaLubPusto()
  if (ekran === 'pusto') toast('Brak nowych słów do wprowadzenia.')
}

function pokazBezSlow() {
  seria = null
  pokazEkran(
    'bez-slow',
    el(
      'section',
      { klasa: 'ekran' },
      el('div', { klasa: 'logo', tekst: '🃏' }),
      el('h2', { tekst: 'Dodaj słówka, żeby zacząć' }),
      el('p', {
        klasa: 'przygaszony',
        tekst: 'Wklej listę albo wczytaj plik (np. oxford3000.json z Plików lub iCloud). Słówka zostają w telefonie i działają bez internetu.',
      }),
      el(
        'div',
        { klasa: 'przyciski' },
        el('button', { klasa: 'przycisk glowny', type: 'button', tekst: 'Dodaj słówka', onclick: () => pokazDodawanie() }),
        el('label', { klasa: 'przycisk', for: 'plik-kopii', tekst: 'Wczytaj kopię' }),
      ),
    ),
  )
}

function pokazOdpoczynek() {
  seria = null
  pokazEkran(
    'odpoczynek',
    el(
      'section',
      { klasa: 'ekran' },
      el('div', { klasa: 'logo', tekst: '🌙' }),
      el('h2', { tekst: 'Do jutra!' }),
      el('p', { tekst: opisStreaka() }),
      el('p', { klasa: 'przygaszony', tekst: 'Postęp jest zapisany w telefonie. Możesz zamknąć aplikację.' }),
      el(
        'div',
        { klasa: 'przyciski' },
        el('button', { klasa: 'przycisk', type: 'button', tekst: 'Jednak jeszcze seria', onclick: () => nowaSeriaLubPusto() }),
      ),
    ),
  )
}

// Banery: tylko na ekranie konca serii i w menu, nigdy w trakcie karty.

function potrzebnaKopia() {
  if (!Object.keys(stan.karty).length) return false
  if (!stan.ostatniaKopia) return true
  return dniOd(stan.ostatniaKopia) >= DNI_DO_PRZYPOMNIENIA_O_KOPII
}

function banery() {
  return el(
    'div',
    { klasa: 'banery' },
    nowaWersja &&
      el(
        'div',
        { klasa: 'baner' },
        el('span', { tekst: 'Nowa wersja gotowa - uruchom ponownie' }),
        el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Uruchom ponownie', onclick: aktualizuj }),
      ),
    potrzebnaKopia() &&
      el(
        'div',
        { klasa: 'baner kopia' },
        el('span', {
          tekst: stan.ostatniaKopia
            ? `Ostatnia kopia ${liczebnik(dniOd(stan.ostatniaKopia), ['dzień', 'dni', 'dni'])} temu`
            : 'Nie masz jeszcze kopii postępu',
        }),
        el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Zapisz kopię', onclick: zrobKopie }),
      ),
  )
}

function odswiezBanery() {
  if (ekran === 'koniec') $('scena').querySelector('.banery')?.replaceWith(banery())
  odswiezMenu()
}

// Menu

const wiersz = (nazwa, wartosc) =>
  el('div', { klasa: 'wiersz' }, el('span', { tekst: nazwa }), el('span', { klasa: 'liczba', tekst: String(wartosc) }))

const wierszStat = (nazwa, poznane, wszystkie) =>
  el(
    'div',
    { klasa: 'wiersz-stat' },
    wiersz(nazwa, `${poznane} / ${wszystkie}`),
    el('div', { klasa: 'mini-tor' }, el('i', { style: `transform: scaleX(${wszystkie ? poznane / wszystkie : 0})` })),
  )

function sekcjaStatystyk() {
  const st = talia.statystyki({ slowa, karty: stan.karty })
  const dzien = podsumowanie()
  return el(
    'div',
    { klasa: 'sekcja' },
    el('h3', { tekst: 'Statystyki' }),
    wiersz('Poznane słowa', `${st.poznane} / ${st.wszystkie}`),
    wiersz('W powtórkach', `${st.procentPowtorka.toLocaleString('pl-PL')}% listy`),
    wiersz('Odblokowane karty mówienia', st.mowienieOdblokowane),
    wiersz('Zaległe teraz', dzien.pozniejDzis ? `${dzien.zalegle} (+${dzien.pozniejDzis} później dziś)` : dzien.zalegle),
    wiersz('Nowe w dzisiejszym limicie', dzien.noweDostepne),
    wiersz('Streak', liczebnik(talia.aktualnyStreak(stan.streak), ['dzień', 'dni', 'dni'])),
    st.talie.length > 0 && el('h3', { tekst: 'Talie', style: 'margin-top: 16px' }),
    st.talie.map((t) => wierszStat(t.nazwa, t.poznane, t.wszystkie)),
    st.poziomy.length > 0 && el('h3', { tekst: 'Poziomy', style: 'margin-top: 16px' }),
    st.poziomy.map((p) => wierszStat(p.nazwa, p.poznane, p.wszystkie)),
  )
}

function zmienUstawienie(pole, wartosc) {
  stan.ustawienia = { ...stan.ustawienia, [pole]: wartosc }
  zapiszStan()
  odswiezMenu()
}

function sekcjaUstawien() {
  const u = stan.ustawienia
  const segmenty = (opcje, pole) =>
    el(
      'div',
      { klasa: 'segmenty' },
      opcje.map((o) =>
        el('button', { type: 'button', 'aria-pressed': String(o === u[pole]), tekst: String(o), onclick: () => zmienUstawienie(pole, o) }),
      ),
    )
  const przelacz = (pole, etykieta) =>
    el(
      'div',
      { klasa: 'wiersz' },
      el('span', { tekst: etykieta }),
      el('button', {
        klasa: 'przelacz',
        type: 'button',
        role: 'switch',
        'aria-checked': String(u[pole]),
        'aria-label': etykieta,
        onclick: () => zmienUstawienie(pole, !u[pole]),
      }),
    )
  return el(
    'div',
    { klasa: 'sekcja' },
    el('h3', { tekst: 'Ustawienia' }),
    el('div', { klasa: 'wiersz' }, el('span', { tekst: 'Nowych dziennie' })),
    segmenty(talia.OPCJE_NOWYCH, 'noweDziennie'),
    el('div', { klasa: 'wiersz', style: 'margin-top: 8px' }, el('span', { tekst: 'Długość serii' })),
    segmenty(talia.OPCJE_DLUGOSCI, 'dlugoscSerii'),
    przelacz('autowymowa', 'Wymowa po odsłonięciu'),
    przelacz('mowienie', 'Karty mówienia (PL → EN)'),
  )
}

function sekcjaKopii() {
  return el(
    'div',
    { klasa: 'sekcja' },
    el('h3', { tekst: 'Kopia zapasowa' }),
    el('p', {
      tekst: stan.ostatniaKopia ? `Ostatnia kopia: ${new Date(stan.ostatniaKopia).toLocaleString('pl-PL')}` : 'Nie masz jeszcze kopii.',
    }),
    el('p', { klasa: 'opis', tekst: 'Kopia zawiera słówka i cały postęp. Na nowym telefonie wystarczy ją wczytać.' }),
    el(
      'div',
      { klasa: 'rzad' },
      el('button', { klasa: 'przycisk', type: 'button', tekst: 'Zapisz kopię', onclick: zrobKopie }),
      el('label', { klasa: 'przycisk', for: 'plik-kopii', tekst: 'Wczytaj kopię' }),
    ),
  )
}

function trescOffline() {
  const tresc = [el('h3', { tekst: 'Offline' })]
  const bladTekst = (tekst) => el('p', { klasa: 'blad-tekst', tekst })
  if (!('serviceWorker' in navigator)) {
    tresc.push(bladTekst('Ta przeglądarka nie obsługuje trybu offline. Na iPhonie otwieraj aplikację z ikony na ekranie początkowym (adres HTTPS).'))
  } else if (!navigator.serviceWorker.controller) {
    tresc.push(bladTekst('Tryb offline jeszcze nie działa. Poczekaj chwilę z internetem albo zamknij i otwórz aplikację.'))
  } else if (offline?.blad) {
    tresc.push(bladTekst(`Nie udało się sprawdzić stanu: ${offline.blad}`))
  } else if (offline) {
    tresc.push(
      gotoweOffline()
        ? el('p', { tekst: 'Gotowa do pracy bez internetu ✓' })
        : bladTekst('Nie wszystkie pliki są zapisane. Otwórz aplikację z internetem.'),
      wiersz('Wersja', offline.wersja),
      wiersz('Zapisane pliki', `${offline.zapisane}/${offline.pliki}`),
    )
  } else {
    tresc.push(el('p', { klasa: 'przygaszony', tekst: 'Sprawdzam…' }))
  }
  let pamiec = 'nieznana'
  if (trwalaPamiec !== null) pamiec = trwalaPamiec ? 'tak' : 'nie'
  tresc.push(
    wiersz('Pamięć trwała', pamiec),
    el('div', { klasa: 'rzad' }, el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Sprawdź aktualizację', onclick: sprawdzAktualizacje })),
  )
  return tresc
}

function sekcjaZrodel() {
  return el(
    'div',
    { klasa: 'sekcja' },
    el('h3', { tekst: 'Źródła i licencja' }),
    talie.map((t) => el('p', { tekst: t.zrodlo ? `${t.nazwa}: ${t.zrodlo}` : t.nazwa })),
    !talie.length && el('p', { klasa: 'przygaszony', tekst: 'Brak dodanych talii.' }),
    el('p', {
      klasa: 'przygaszony',
      tekst: 'Algorytm powtórek: FSRS-6 (open-spaced-repetition, licencja MIT). Wymowa: syntezator mowy systemu. Słówka pochodzą z plików dodanych w aplikacji.',
    }),
  )
}

function trescMenu() {
  return [
    el(
      'div',
      { klasa: 'sekcja' },
      banery(),
      el('div', { klasa: 'przyciski', style: 'margin-top: 8px' }, el('button', { klasa: 'przycisk glowny', type: 'button', tekst: 'Dodaj słówka', onclick: () => pokazDodawanie() })),
    ),
    sekcjaStatystyk(),
    sekcjaUstawien(),
    sekcjaKopii(),
    el('div', { klasa: 'sekcja', id: 'sekcja-offline' }, trescOffline()),
    sekcjaZrodel(),
  ]
}

function otworzMenu() {
  const menu = $('menu')
  menu.replaceChildren(
    el('div', { klasa: 'nakladka-tlo', onclick: zamknijMenu }),
    el(
      'section',
      { klasa: 'arkusz', role: 'dialog', 'aria-label': 'Menu' },
      el(
        'header',
        { klasa: 'arkusz-naglowek' },
        el('h2', { tekst: 'Menu' }),
        el('button', { klasa: 'zamknij', type: 'button', 'aria-label': 'Zamknij', tekst: '✕', onclick: zamknijMenu }),
      ),
      el('div', { klasa: 'arkusz-tresc' }, trescMenu()),
    ),
  )
  menu.hidden = false
  sprawdzOffline()
}

function zamknijMenu() {
  $('menu').hidden = true
}

// Odswiezenie tylko tresci, zeby panel nie wjezdzal ponownie i zostala pozycja przewiniecia.
function odswiezMenu() {
  if ($('menu').hidden) return
  $('menu').querySelector('.arkusz-tresc')?.replaceChildren(...trescMenu())
}

function odswiezSekcjeOffline() {
  $('sekcja-offline')?.replaceChildren(...trescOffline())
}

// Offline i aktualizacje

function zapytajPracownika(pracownik, wiadomosc) {
  return new Promise((ok, nie) => {
    const kanal = new MessageChannel()
    const limit = setTimeout(() => nie(new Error('brak odpowiedzi service workera')), 4000)
    kanal.port1.onmessage = (e) => {
      clearTimeout(limit)
      ok(e.data)
    }
    pracownik.postMessage(wiadomosc, [kanal.port2])
  })
}

async function sprawdzOffline() {
  const kontroler = navigator.serviceWorker?.controller
  if (kontroler) {
    try {
      offline = await zapytajPracownika(kontroler, 'status')
    } catch (blad) {
      offline = { blad: opis(blad) }
    }
  } else {
    offline = null
  }
  odswiezZnacznik()
  odswiezSekcjeOffline()
}

function oznaczNowaWersje() {
  nowaWersja = true
  odswiezBanery()
}

function aktualizuj() {
  const czekajacy = rejestracja?.waiting
  if (!czekajacy) {
    location.reload()
    return
  }
  czekamNaAktualizacje = true
  czekajacy.postMessage('aktualizuj')
  // Gdyby controllerchange nie przyszlo, przeladowanie i tak wczyta nowa wersje albo pokaze baner ponownie.
  setTimeout(() => location.reload(), 4000)
}

async function sprawdzAktualizacje() {
  if (!rejestracja) {
    toast('Service worker nie jest zarejestrowany.', 'blad')
    return
  }
  try {
    await rejestracja.update()
    toast(rejestracja.installing || rejestracja.waiting ? 'Pobieram nową wersję…' : 'Masz najnowszą wersję.')
  } catch (blad) {
    toast(`Nie udało się sprawdzić (brak internetu?): ${opis(blad)}`, 'blad')
  }
}

function zarejestruj() {
  if (!('serviceWorker' in navigator)) {
    odswiezZnacznik()
    return
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (czekamNaAktualizacje) location.reload()
    else sprawdzOffline()
  })
  navigator.serviceWorker
    .register('./sw.js')
    .then((rej) => {
      rejestracja = rej
      if (rej.waiting && navigator.serviceWorker.controller) oznaczNowaWersje()
      rej.addEventListener('updatefound', () => {
        const nowy = rej.installing
        nowy?.addEventListener('statechange', () => {
          if (nowy.state === 'installed' && navigator.serviceWorker.controller) oznaczNowaWersje()
          else if (nowy.state === 'activated') sprawdzOffline()
        })
      })
      return sprawdzOffline()
    })
    .catch((blad) => {
      offline = { blad: opis(blad) }
      odswiezZnacznik()
      ustawKomunikat('sw', `Tryb offline niedostępny: ${opis(blad)}`)
    })
}

// Kopia zapasowa

// Bez await przed zapiszKopie: iOS pokaze arkusz udostepniania tylko bezposrednio po tapnieciu.
async function zrobKopie() {
  if (!taliaWczytana) {
    toast('Talia słówek się nie wczytała, więc kopia byłaby niepełna. Zamknij i otwórz aplikację.', 'blad')
    return
  }
  try {
    const wynik = await magazyn.zapiszKopie(stan, { slowa, talie })
    if (wynik === 'anulowano') return
    stan.ostatniaKopia = new Date().toISOString()
    zapiszStan()
    // Arkusz udostepniania nie mowi, czy plik naprawde zostal zapisany, wiec prosimy o sprawdzenie.
    toast(wynik === 'udostepniono' ? 'Sprawdź w Plikach, czy kopia się zapisała.' : 'Pobrano plik kopii. Sprawdź, czy jest w pobranych.', 'wazny')
  } catch (blad) {
    toast(`Nie udało się zapisać kopii: ${opis(blad)}`, 'blad')
  }
  odswiezBanery()
}

async function wczytajKopie(plik) {
  let dane
  try {
    dane = JSON.parse(await plik.text())
  } catch {
    toast('Ten plik nie jest poprawnym plikiem JSON.', 'blad')
    return
  }
  const wynik = magazyn.walidujKopie(dane)
  if (!wynik.ok) {
    toast(`Nie wczytano kopii: ${wynik.blad}`, 'blad')
    return
  }
  if (!(await upewnijTalie())) return
  const opisStanu = (s, liczbaSlow) => `${liczebnik(liczbaSlow, ['słowo', 'słowa', 'słów'])}, ${Object.keys(s.karty).length} kart, ${s.exp} EXP`
  const uszkodzone = wynik.pominiete ? `\n\n${opisPominietych(wynik.pominiete)} z kopii.` : ''
  const pytanie =
    `Wczytać kopię (${opisStanu(wynik.stan, wynik.talia.slowa.length)}) do obecnego stanu (${opisStanu(stan, slowa.length)})?\n\n` +
    'Postęp z kopii zostanie połączony z obecnym; nowsze powtórki zostają. Słowa spoza kopii zostają w talii, ' +
    `a obecny stan zostanie też zachowany awaryjnie w pamięci telefonu.${uszkodzone}`
  if (!confirm(pytanie)) return
  try {
    magazyn.zachowajPrzedWczytaniem()
  } catch (blad) {
    if (!confirm(`Nie udało się zrobić awaryjnej kopii obecnego stanu (${opis(blad)}). Mimo to wczytać kopię?`)) return
  }
  // Talia z kopii w jej kolejnosci, slowa spoza kopii zostaja na koncu. Najpierw talia, potem postep:
  // jesli zapis talii sie nie uda, nic nie zostaje zmienione.
  const ids = new Set(wynik.talia.slowa.map((s) => s.id))
  const nazwy = new Set(wynik.talia.talie.map((t) => t.nazwa))
  const nowaTalia = {
    slowa: [...wynik.talia.slowa, ...slowa.filter((s) => !ids.has(s.id))],
    talie: [...wynik.talia.talie, ...talie.filter((t) => !nazwy.has(t.nazwa))],
  }
  try {
    await baza.zapiszTalie(nowaTalia)
  } catch (blad) {
    toast(`Nie udało się zapisać talii: ${opis(blad)}. Kopia nie została wczytana.`, 'blad')
    return
  }
  ustawTalie(nowaTalia)
  stan = magazyn.scalStany(stan, wynik.stan)
  zapiszStan()
  zamknijMenu()
  zamknijDodawanie()
  seria = null
  nowaSeriaLubPusto()
  if (wynik.pominiete) toast(`Kopia połączona z obecnym postępem. ${opisPominietych(wynik.pominiete)}.`, 'blad')
  else toast('Kopia połączona z obecnym postępem.')
}

// Dodawanie slowek

function pokazDodawanie() {
  zamknijMenu()
  zrodloImportu = null
  wynikImportu = null
  const pole = el('textarea', {
    klasa: 'pole',
    id: 'wklej',
    rows: '7',
    spellcheck: 'false',
    autocapitalize: 'off',
    autocomplete: 'off',
    autocorrect: 'off',
    placeholder: 'apple ; jabłko\nice cream ; lody ; I like ice cream. ; Lubię lody.',
    oninput: () => {
      zrodloImportu = null
      $('plik-info').textContent = ''
      clearTimeout(czasPodgladu)
      czasPodgladu = setTimeout(podgladImportu, 350)
    },
  })
  const dodawanie = $('dodawanie')
  dodawanie.replaceChildren(
    el('div', { klasa: 'nakladka-tlo' }),
    el(
      'section',
      { klasa: 'arkusz pelny', role: 'dialog', 'aria-label': 'Dodaj słówka' },
      el(
        'header',
        { klasa: 'arkusz-naglowek' },
        el('h2', { tekst: 'Dodaj słówka' }),
        el('button', { klasa: 'zamknij', type: 'button', 'aria-label': 'Zamknij', tekst: '✕', onclick: zamknijDodawanie }),
      ),
      el(
        'div',
        { klasa: 'arkusz-tresc' },
        el('p', {
          klasa: 'opis',
          tekst:
            'Wklej listę albo wczytaj plik .json lub .txt. W tekście jedna linia to jedno słowo: english ; polski, a dalej opcjonalnie ; zdanie ; zdanie po polsku (zamiast średnika może być tabulator). Wielkość liter ma znaczenie: May i may to dwa różne słowa. Postęp istniejących słów zostaje.',
        }),
        el('div', { klasa: 'rzad' }, el('label', { klasa: 'przycisk', for: 'plik-slowek', tekst: 'Wczytaj z pliku' }), el('span', { klasa: 'przygaszony', id: 'plik-info' })),
        el('label', { klasa: 'etykieta-pola', for: 'wklej', tekst: 'Wklej' }),
        pole,
        el('div', { klasa: 'podglad', id: 'podglad', 'aria-live': 'polite' }),
        el(
          'div',
          { klasa: 'przyciski', style: 'margin-top: 14px' },
          el('button', { klasa: 'przycisk glowny', id: 'dodaj-slowka', type: 'button', disabled: true, tekst: 'Dodaj', onclick: dodajSlowka }),
        ),
        !slowa.length &&
          el(
            'p',
            { klasa: 'opis', style: 'margin-top: 18px' },
            'Masz kopię z innego telefonu? ',
            el('label', { for: 'plik-kopii', style: 'text-decoration: underline', tekst: 'Wczytaj kopię' }),
          ),
      ),
    ),
  )
  dodawanie.hidden = false
}

function zamknijDodawanie() {
  clearTimeout(czasPodgladu)
  $('dodawanie').hidden = true
  $('dodawanie').replaceChildren()
  zrodloImportu = null
  wynikImportu = null
}

const wielka = (tekst) => tekst.charAt(0).toUpperCase() + tekst.slice(1)

// Podglad przed zapisem: ile nowych, ile zaktualizowanych, ktore wiersze maja bledy.
function podgladImportu() {
  const cel = $('podglad')
  const przycisk = $('dodaj-slowka')
  if (!cel || !przycisk) return
  const tekst = zrodloImportu ? zrodloImportu.tekst : $('wklej').value
  wynikImportu = null
  przycisk.disabled = true
  if (!tekst.trim()) {
    cel.replaceChildren()
    return
  }
  const w = parsujWklejone(tekst)
  if (w.bladOgolny) {
    cel.replaceChildren(el('p', { klasa: 'blad-tekst', tekst: w.bladOgolny }))
    return
  }
  const s = scal(slowa, w.slowa)
  wynikImportu = w
  const liczby = [
    liczebnik(s.nowe, ['nowe', 'nowe', 'nowych']),
    liczebnik(s.zaktualizowane, ['zaktualizowane', 'zaktualizowane', 'zaktualizowanych']),
    liczebnik(w.bledy.length, ['błąd', 'błędy', 'błędów']),
  ]
  const bezZmian = s.bezZmian ? ` · bez zmian: ${s.bezZmian}` : ''
  // replaceChildren zamienia false na tekst "false", wiec puste pozycje odpadaja przed wstawieniem.
  const tresc = [
    el('p', { klasa: 'podsumowanie', tekst: liczby.join(', ') }),
    el('p', { klasa: 'przygaszony', tekst: `Talia: ${w.nazwa}${bezZmian}` }),
    w.bledy.length > 0 &&
      el(
        'ul',
        { klasa: 'bledy' },
        w.bledy.slice(0, MAKS_BLEDOW_W_PODGLADZIE).map((b) => el('li', { tekst: `${wielka(w.jednostka)} ${b.nr}: ${b.blad}` })),
        w.bledy.length > MAKS_BLEDOW_W_PODGLADZIE && el('li', { tekst: `i jeszcze ${w.bledy.length - MAKS_BLEDOW_W_PODGLADZIE}` }),
      ),
    !s.nowe && !s.zaktualizowane && el('p', { klasa: 'przygaszony', tekst: 'Nie ma nic do dodania.' }),
  ]
  cel.replaceChildren(...tresc.filter(Boolean))
  przycisk.disabled = !(s.nowe || s.zaktualizowane)
}

async function wczytajPlikSlowek(plik) {
  if ($('dodawanie').hidden) pokazDodawanie()
  $('plik-info').textContent = `${plik.name} (${Math.max(1, Math.round(plik.size / 1024))} KB)`
  $('podglad').replaceChildren(el('p', { klasa: 'przygaszony', tekst: 'Wczytuję plik…' }))
  $('dodaj-slowka').disabled = true
  try {
    const tekst = await plik.text()
    // Jedna klatka na narysowanie komunikatu, zanim duzy plik zajmie watek parsowaniem.
    await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)))
    if ($('dodawanie').hidden) return
    zrodloImportu = { tekst, nazwa: plik.name }
    $('wklej').value = ''
    podgladImportu()
  } catch (blad) {
    $('podglad')?.replaceChildren(el('p', { klasa: 'blad-tekst', tekst: `Nie udało się odczytać pliku: ${opis(blad)}` }))
  }
}

async function dodajSlowka() {
  if (!wynikImportu || zapisujeSlowka) return
  const w = wynikImportu
  const przycisk = $('dodaj-slowka')
  const pokazBlad = (tekst) => {
    przycisk.disabled = false
    przycisk.textContent = 'Dodaj'
    $('podglad').append(el('p', { klasa: 'blad-tekst', tekst }))
  }
  zapisujeSlowka = true
  przycisk.disabled = true
  przycisk.textContent = 'Zapisuję…'
  try {
    if (!(await upewnijTalie())) {
      pokazBlad('Zapisana talia się nie wczytała, więc dodanie mogłoby ją nadpisać. Zamknij i otwórz aplikację.')
      return
    }
    // Scalenie liczone od nowa na aktualnej talii, gdyby zmienila sie od podgladu.
    const s = scal(slowa, w.slowa)
    const nowaTalia = { slowa: s.slowa, talie: dopiszTalie(talie, w) }
    try {
      await baza.zapiszTalie(nowaTalia)
    } catch (blad) {
      pokazBlad(`Nie udało się zapisać słówek w pamięci telefonu: ${opis(blad)}`)
      return
    }
    ustawTalie(nowaTalia)
    zamknijDodawanie()
    toast(`Dodano: ${liczebnik(s.nowe, ['nowe', 'nowe', 'nowych'])}, ${liczebnik(s.zaktualizowane, ['zaktualizowane', 'zaktualizowane', 'zaktualizowanych'])}.`)
    if (ekran === 'bez-slow' || ekran === 'pusto' || ekran === 'start') nowaSeriaLubPusto()
  } finally {
    zapisujeSlowka = false
  }
}

// Zdarzenia globalne

function klawisze(e) {
  if (e.target.closest?.('textarea, input')) return
  if (e.key === 'Escape') {
    zamknijMenu()
    if (!$('dodawanie').hidden) zamknijDodawanie()
    return
  }
  if (!$('menu').hidden || !$('dodawanie').hidden || ekran !== 'karta') return
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    odslon()
  } else if (e.key === 'ArrowUp') ocenKarte(3)
  else if (e.key === 'ArrowDown') ocenKarte(1)
  else if (e.key === 'z' || e.key === 'Z') ocenKarte(4)
}

function podepnijZdarzenia() {
  $('menu-przycisk').addEventListener('click', otworzMenu)
  $('offline').addEventListener('click', otworzMenu)
  $('plik-slowek').addEventListener('change', (e) => {
    const plik = e.target.files?.[0]
    e.target.value = ''
    if (plik) wczytajPlikSlowek(plik)
  })
  $('plik-kopii').addEventListener('change', (e) => {
    const plik = e.target.files?.[0]
    e.target.value = ''
    if (plik) wczytajKopie(plik)
  })
  document.addEventListener('keydown', klawisze)
  // Bez nasluchu touchstart iOS nie pokazuje stanu :active na przyciskach.
  document.addEventListener('touchstart', () => {}, { passive: true })
  document.addEventListener('gesturestart', (e) => e.preventDefault())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    // Apka z ekranu glownego potrafi wisiec w tle wiele dni: nowy dzien to nowa kopia dnia i nowy streak.
    magazyn.kopiaDzienna()
    odswiezGore()
    rejestracja?.update().catch(() => {})
    sprawdzOffline()
  })
  window.addEventListener('error', (e) => toast(`Błąd: ${e.message}`, 'blad'))
  window.addEventListener('unhandledrejection', (e) => toast(`Błąd: ${opis(e.reason)}`, 'blad'))
}

async function start() {
  const { stan: wczytany, ostrzezenie, pominiete } = magazyn.wczytaj()
  stan = wczytany
  ustawKomunikat('wczytanie', ostrzezenie)
  if (pominiete) toast(`${opisPominietych(pominiete)}.`, 'blad')
  magazyn.kopiaDzienna()
  magazyn.poprosOTrwalosc().then((wynik) => {
    trwalaPamiec = wynik
    odswiezSekcjeOffline()
  })
  podepnijZdarzenia()
  odswiezGore()
  odswiezZnacznik()
  // Talia wczytuje sie przed pierwszym renderem karty.
  await upewnijTalie()
  document.documentElement.dataset.gotowe = '1'
  if (slowa.length) {
    nowaSeriaLubPusto()
    return
  }
  pokazBezSlow()
  if (taliaWczytana) pokazDodawanie()
}

start().catch((blad) => {
  document.documentElement.dataset.gotowe = '1'
  $('scena').replaceChildren(
    el('section', { klasa: 'ekran' }, el('h2', { tekst: 'Nie udało się uruchomić' }), el('p', { klasa: 'przygaszony', tekst: opis(blad) })),
  )
})

if (document.readyState === 'complete') zarejestruj()
else window.addEventListener('load', zarejestruj)
