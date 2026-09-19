// Interfejs fiszek na telefon. Jeden ekran bez przewijania: karta, oceny pod kciukiem, menu w dolnym panelu,
// dodawanie slowek, kopia zapasowa i stan offline. Logika serii jest w talia.js, zapis w magazyn.js i baza.js.

import { nowaKarta, ocen, przypomnienie } from './fsrs.mjs'
import * as talia from './talia.js'
import * as magazyn from './magazyn.js'
import * as baza from './baza.js'
import { budujKolizje, kluczIndeksu } from './kolizje.js'
import { dopiszTalie, parsujWklejone, scal } from './slowka.js'
import { dodajPrzelacznik, wibruj } from './haptyka.js'
import { powiedz } from './mowa.js'

const PROG_RUCHU = 10
const PROG_SWIPE = 80
const PROG_FLICKA = 0.6
const DNI_DO_PRZYPOMNIENIA_O_KOPII = 7
const MAKS_BLEDOW_W_PODGLADZIE = 30
const SEKUNDY_NA_COFNIECIE = 6
const PODPOWIEDZ_POMIJANIA = 'Pominięte słowa nie wracają. Przywrócisz je w Menu > Słówka.'
const TEKST_POWROTU = 'Zaczynamy od kart, które najbardziej tego potrzebują.'
const TEKST_ZAMROZENIA = 'Wczoraj było wolne, seria zostaje.'
// Celebracje z C3: koniec serii 1,0-1,5 s, awans rangi do 2,5 s, obie pomijalne tapnieciem.
// Przy wylaczonym ruchu zostaje sama tresc, wiec czas schodzi do tyle, ile trzeba na jej przeczytanie.
const MS_CELEBRACJI_KONCA = 1200
const MS_CELEBRACJI_AWANSU = 2500
// Czas wylotu karty musi zgadzac sie z --czas-wylot w styl.css (220 ms plus klatka zapasu).
const MS_WYLOTU = 240
const MS_WYLOTU_BEZ_RUCHU = 80
// Trzy kanaly statusu: kolor (klasa), znak i kierunek ruchu karty. Kolor sam nie wystarczy (WCAG 1.4.1,
// ok. 8% mezczyzn ma zaburzenie widzenia barw).
const STATUSY = {
  1: { klasa: 'nie', ikona: '✗', etykieta: 'Nie umiem' },
  2: { klasa: 'prawie', ikona: '~', etykieta: 'Prawie' },
  3: { klasa: 'tak', ikona: '✓', etykieta: 'Umiem' },
  // "Znam" na nowej karcie to tez sukces, wiec karta wylatuje w gore jak przy "Umiem".
  4: { klasa: 'tak', ikona: '✓', etykieta: 'Znam' },
}

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
let indeks = []
let kolizje = Object.create(null)
let kluczKolizji = ''
let czasIndeksuKolizji = 0
let taliaWczytana = false
let seria = null
let rangaStartSerii = 0
let utrwaloneStartSerii = 0
let pominCelebracje = null
let czasCelebracji = 0
let czasSwieta = 0
let kotwicaOtwarta = false
let cofniecie = null
let cofniecieDo = 0
let czasCofniecia = 0
let poziomPodpowiedzi = null
let uzytoPodpowiedzi = false
let czasPodpowiedzi = 0
let odkryjOdRazu = false
let szukane = ''
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
let poprzedniePunkty = null
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
function formaSlowa(n, [jeden, kilka, wiele]) {
  if (n === 1) return jeden
  const jednosci = n % 10
  const setki = n % 100
  return jednosci >= 2 && jednosci <= 4 && (setki < 12 || setki > 14) ? kilka : wiele
}

const liczebnik = (n, formy) => `${n} ${formaSlowa(n, formy)}`

const opisPominietych = (n) => `Pominięto ${liczebnik(n, ['uszkodzoną kartę', 'uszkodzone karty', 'uszkodzonych kart'])}`

// Jawny dystans do celu dnia. Polska odmiana czasownika idzie za liczebnikiem: 1 zostala, 3 zostaly, 5 zostalo.
function zostaloKart(n) {
  const czasownik = n === 1 ? 'została' : formaSlowa(n, ['', 'zostały', 'zostało'])
  return `${czasownik} ${liczebnik(n, ['karta', 'karty', 'kart'])}`
}

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

// Indeks wyszukiwania liczony raz przy wczytaniu talii, zeby filtrowanie 3000 slow po kazdym znaku bylo plynne.
function ustawTalie(t) {
  slowa = t.slowa
  talie = t.talie
  poId = new Map(slowa.map((s) => [s.id, s]))
  indeks = talia.budujIndeks(slowa)
  poPierwszymRenderze(przygotujKolizje)
}

// Indeks kolizji (interferencja miedzy slowami) liczy sie raz na talie: ok. 50 ms przy 3000 slow w Node.
// Lezy w IndexedDB pod kluczem z liczby slow i sumy kontrolnej id, wiec zmiana talii wymusza przeliczenie.
// Liczymy go po pierwszym renderze, zeby nawet na wolnym telefonie nie opoznil startu.
async function przygotujKolizje() {
  if (!slowa.length) {
    kolizje = Object.create(null)
    kluczKolizji = ''
    return
  }
  const klucz = kluczIndeksu(slowa)
  if (kluczKolizji === klucz) return
  const zapisane = await baza.wczytajKolizje(klucz)
  if (zapisane) {
    kolizje = zapisane
    kluczKolizji = klucz
    return
  }
  const start = performance.now()
  kolizje = budujKolizje(slowa)
  czasIndeksuKolizji = Math.round(performance.now() - start)
  kluczKolizji = klucz
  baza.zapiszKolizje(klucz, kolizje)
}

// Jedna klatka na narysowanie ekranu, potem zadanie. Bez requestIdleCallback, bo nie ma go w Safari na iOS,
// a osobna sciezka zapasowa byla by jedyna galezia, ktorej smoke w Chrome nigdy nie przechodzi.
function poPierwszymRenderze(dzialanie) {
  requestAnimationFrame(() => setTimeout(() => Promise.resolve(dzialanie()).catch(() => {}), 0))
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

const utrwalonych = () => talia.liczbaUtrwalonych({ slowa, karty: stan.karty })

const rangaTeraz = () => talia.ranga(utrwalonych())

const punktyTygodnia = () => talia.punktyTygodnia(stan.punktyTygodnia).punkty

function odswiezGore() {
  const r = rangaTeraz()
  const chip = $('poziom')
  const punkty = punktyTygodnia()
  $('poziom-tekst').textContent = r.nazwa
  $('poziom-pasek').style.transform = `scaleX(${r.procent / 100})`
  chip.setAttribute('aria-label', `Ranga ${r.nazwa}, ${talia.opisRangi(r)}`)
  chip.title = talia.opisRangi(r)
  $('punkty').textContent = `${punkty} pkt`
  $('punkty').title = `Punkty w tym tygodniu. Łącznie: ${stan.expRazem.toLocaleString('pl-PL')}`
  if (poprzedniePunkty !== null && punkty > poprzedniePunkty) {
    chip.classList.remove('puls')
    void chip.offsetWidth
    chip.classList.add('puls')
  }
  poprzedniePunkty = punkty
  const dni = talia.aktualnyStreak(stan.streak)
  const ostatnie30 = talia.dniZNauka(stan.historia)
  $('streak').textContent = `🔥 ${dni}`
  $('dni30').textContent = `${ostatnie30}/${talia.DNI_OSTATNICH}`
  // Licznik, ktory nigdy sie nie zeruje, stoi obok serii: to on przezywa przerwy.
  $('ciaglosc').setAttribute(
    'aria-label',
    `${liczebnik(dni, ['dzień', 'dni', 'dni'])} z rzędu, ${ostatnie30} z ${talia.DNI_OSTATNICH} dni nauki`,
  )
  const wyswietlany = seria ? talia.pasekPostepu(talia.postepSerii(seria)) : 0
  $('pasek').style.transform = `scaleX(${wyswietlany})`
  $('procent').textContent = `${Math.round(wyswietlany * 100)}%`
}

const gotoweOffline = () =>
  !!navigator.serviceWorker?.controller && !!offline && !offline.blad && offline.zapisane === offline.pliki

// Znacznik offline jest ostrzezeniem, wiec znika, gdy wszystko jest zapisane, i nigdy nie wisi nad karta:
// w trakcie nauki gora ekranu ma nie miec nic do klikania (C1). Stan offline jest w menu.
function odswiezZnacznik() {
  const znacznik = $('offline')
  const ok = gotoweOffline()
  znacznik.textContent = ok ? 'offline ✓' : '⚠ nie offline'
  znacznik.classList.toggle('ok', ok)
  znacznik.hidden = ok || ekran === 'karta'
}

// Ekrany

function pokazEkran(nazwa, ...zawartosc) {
  ekran = nazwa
  zakonczCelebracje()
  $('scena').replaceChildren(...zawartosc)
  if (nazwa !== 'karta') {
    $('akcje').hidden = true
    $('akcje').replaceChildren()
  }
  odswiezGore()
  odswiezZnacznik()
}

// Celebracje sa pomijalne tapnieciem: jedno klikniecie konczy animacje i od razu pokazuje stan koncowy.
// Celebracja ekranu konca serii (1,2 s) i pelnoekranowy awans rangi (2,5 s) sa osobne, bo ta pierwsza konczy
// sie sama w trakcie tej drugiej i nie moze jej zgasic.
function zakonczCelebracjeEkranu() {
  if (!pominCelebracje) return
  const pomin = pominCelebracje
  pominCelebracje = null
  pomin()
}

// Wywolywane przy kazdej zmianie ekranu, zeby nie zostal wiszacy panel ani licznik zatrzymany w polowie.
function zakonczCelebracje() {
  zamknijSwieto()
  zakonczCelebracjeEkranu()
}

// Tryb nadrabiania wynika z zaleglosci przed przycieciem sufitem, wiec liczymy go przed kazdym doborem kart.
function odswiezNadrabianie(teraz = new Date()) {
  const zaleglych = talia.liczbaZaleglych({ slowa, karty: stan.karty, ustawienia: stan.ustawienia, teraz, pominiete: stan.pominiete })
  const poprzednie = talia.nadrabianieZDomyslnymi(stan.nadrabianie)
  const nowe = talia.stanNadrabiania(poprzednie, zaleglych, stan.ustawienia, teraz)
  if (nowe.aktywne !== poprzednie.aktywne || nowe.polowaDo !== poprzednie.polowaDo) {
    stan.nadrabianie = nowe
    zapiszStan()
  }
  return nowe
}

const opcjeDoboru = (teraz = new Date()) => ({
  slowa,
  karty: stan.karty,
  ustawienia: stan.ustawienia,
  dzis: stan.dzis,
  teraz,
  pominiete: stan.pominiete,
  nadrabianie: stan.nadrabianie,
  kolizje,
  przypomnienie,
})

function nowaSeriaLubPusto() {
  zapomnijCofniecie()
  if (!slowa.length) {
    pokazBezSlow()
    return
  }
  const teraz = new Date()
  odswiezNadrabianie(teraz)
  const klucze = talia.zbudujSerie(opcjeDoboru(teraz))
  if (!klucze.length) {
    seria = null
    pokazPusto()
    return
  }
  seria = talia.nowaSeria(klucze)
  rangaStartSerii = rangaTeraz().stopien
  utrwaloneStartSerii = utrwalonych()
  pokazKarte()
}

// Trening na kartach, na ktorych uzytkownik sie juz pomylil. Oceny nie zmieniaja stanu kart ani terminow.
function trudnaSeria() {
  zamknijMenu()
  zapomnijCofniecie()
  if (!slowa.length) {
    pokazBezSlow()
    return
  }
  const klucze = talia.trudneKarty({ slowa, karty: stan.karty, ustawienia: stan.ustawienia, pominiete: stan.pominiete })
  if (!klucze.length) {
    toast('Brak trudnych słów.')
    return
  }
  seria = talia.nowaSeria(klucze, true)
  rangaStartSerii = rangaTeraz().stopien
  utrwaloneStartSerii = utrwalonych()
  pokazKarte()
}

function przyciskTrudnych(klasa = 'przycisk') {
  const ile = talia.liczbaTrudnych({ slowa, karty: stan.karty, pominiete: stan.pominiete })
  return el('button', {
    klasa,
    type: 'button',
    disabled: ile === 0,
    tekst: ile ? `Trudne słowa (${ile})` : 'Brak trudnych słów',
    onclick: trudnaSeria,
  })
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
  poziomPodpowiedzi = null
  uzytoPodpowiedzi = false
  clearTimeout(czasPodpowiedzi)
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
    const pole = el('div', { klasa: 'podpowiedz', id: 'podpowiedz-pole', 'aria-label': 'Podpowiedź' })
    rysujPodpowiedz(pole, slowo)
    karta.append(
      el('div', { klasa: 'etykieta mowienie', tekst: 'Powiedz po angielsku' }),
      el('div', { klasa: 'tlumaczenie duze', tekst: slowo.pl }),
      pole,
      // Trudnosc pozadana: przycisk jest niewidoczny przez pierwsze 7 sekund, a jego uzycie blokuje "Umiem".
      el('button', {
        klasa: 'przycisk maly bez-odsloniecia',
        id: 'przycisk-podpowiedzi',
        type: 'button',
        hidden: true,
        tekst: 'Podpowiedź',
        onclick: () => {
          poziomPodpowiedzi = talia.nastepnaPodpowiedz(poziomPodpowiedzi ?? stan.ustawienia.podpowiedzMowienie)
          uzytoPodpowiedzi = true
          rysujPodpowiedz($('podpowiedz-pole'), slowo)
          odswiezAkcje()
        },
      }),
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
  // append zamienia false na tekst "false", wiec puste pozycje odpadaja przed wstawieniem.
  karta.append(
    ...[
      seria.trening && el('div', { klasa: 'trening-znacznik', tekst: 'Trening: terminy bez zmian' }),
      seria.combo >= talia.PROG_POKAZANIA_COMBO && el('div', { klasa: 'combo', tekst: `combo x${seria.combo}` }),
      el('div', { klasa: 'wskazowka', tekst: 'Dotknij, aby odsłonić' }),
      el('div', { klasa: 'znacznik-swipe tak', tekst: 'Umiem' }),
      el('div', { klasa: 'znacznik-swipe nie', tekst: 'Nie umiem' }),
    ].filter(Boolean),
  )
  dodajPrzelacznik(karta)
  podepnijGest(karta)
  pokazEkran('karta', karta)
  // Po cofnieciu oceny karta wraca od razu odkryta, bez wibracji i bez ponownej wymowy.
  if (odkryjOdRazu) {
    odkryjOdRazu = false
    odkryta = true
    karta.classList.add('odkryta')
  }
  odswiezAkcje()
  startKarty = performance.now()
  if (kierunek === 'pl') {
    czasPodpowiedzi = setTimeout(() => {
      const przycisk = $('przycisk-podpowiedzi')
      if (przycisk) przycisk.hidden = false
    }, talia.SEKUNDY_DO_PODPOWIEDZI * 1000)
  }
}

function rysujPodpowiedz(cel, slowo) {
  if (!cel) return
  const poziom = poziomPodpowiedzi ?? stan.ustawienia.podpowiedzMowienie
  const tekst = talia.podpowiedz(slowo.w, poziom)
  cel.replaceChildren(...(tekst ? tekst.split('   ').map((wyraz) => el('span', { tekst: wyraz })) : []))
}

// Przycisk w rzedzie akcji z ukrytym przelacznikiem haptyki (jedyny sposob na wibracje w iOS).
// `ikona` rysuje drugi kanal informacji nad podpisem; rzad drugoplanowy jej nie ma, bo nie jest statusem.
function przyciskAkcji(klasa, tekst, dzialanie, ikona = '') {
  const przycisk = el(
    'div',
    { klasa: `ocena ${klasa}`, role: 'button', 'aria-label': tekst, onclick: dzialanie },
    ikona && el('span', { klasa: 'ocena-ikona', 'aria-hidden': 'true', tekst: ikona }),
    el('span', { tekst }),
  )
  dodajPrzelacznik(przycisk)
  return przycisk
}

const przyciskOceny = (ocena) => {
  const s = STATUSY[ocena]
  return przyciskAkcji(s.klasa, s.etykieta, () => ocenKarte(ocena), s.ikona)
}

// Karta, na ktorej uzyto podpowiedzi, nie moze dostac "Umiem" w tej odslonie (Bjork i Kroll 2015).
function przyciskUmiem() {
  const reguly = talia.regulyPodpowiedzi({ uzyto: uzytoPodpowiedzi })
  if (!reguly.umiemZablokowane) return przyciskOceny(3)
  return el(
    'div',
    { klasa: 'ocena tak wylaczona', 'aria-disabled': 'true', 'aria-label': `Umiem niedostępne: ${reguly.podpisUmiem}` },
    el('span', { klasa: 'ocena-ikona', 'aria-hidden': 'true', tekst: STATUSY[3].ikona }),
    el('span', { tekst: 'Umiem' }),
    el('small', { tekst: reguly.podpisUmiem }),
  )
}

// Przed odslonieciem nie ma przyciskow oceny, zeby najpierw sprobowac sobie przypomniec. Wyjatki w gornym rzedzie:
// "Znam" tylko dla nowej karty, "Pomijam" dla kazdej (takze w treningu).
function odswiezAkcje() {
  const akcje = $('akcje')
  if (ekran !== 'karta' || !seria) {
    akcje.hidden = true
    return
  }
  const nowa = talia.jestNowa(stan.karty[talia.aktualnaKarta(seria)])
  akcje.hidden = false
  akcje.replaceChildren(
    el(
      'div',
      { klasa: 'akcje-gora' },
      mozliwoscCofniecia() && el('button', { klasa: 'cofnij', type: 'button', tekst: '↩ Cofnij', onclick: cofnijOcene }),
      nowa && przyciskAkcji('znam', 'Znam', () => ocenKarte(4)),
      przyciskAkcji('pomijam', 'Pomijam', pomijajAktualna),
    ),
    odkryta
      ? el('div', { klasa: 'akcje-dol' }, przyciskOceny(1), przyciskOceny(2), przyciskUmiem())
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

// Nowy obiekt karty zamiast zmiany w miejscu: magazyn trzyma spakowana postac przy obiekcie karty.
// Termin z FSRS dostaje jeszcze rozrzut, zeby karty ocenione tego samego dnia nie wrocily jedna fala.
// "Znam" na nowej karcie to osobny przypadek: jedno sprawdzenie za ok. 45 dni zamiast wejscia w cykl nauki.
function ocenionaKarta(poprzednia, ocena, teraz, klucz) {
  const nowa = { ...poprzednia, ...ocen(poprzednia, ocena, teraz), kolejneUmiem: talia.kolejneUmiem(poprzednia, ocena) }
  if (!Number.isFinite(nowa.stabilnosc) || !Number.isFinite(nowa.trudnosc) || Number.isNaN(Date.parse(nowa.termin))) {
    throw new Error('niepoprawny wynik algorytmu powtórek')
  }
  if (ocena === 4 && talia.jestNowa(poprzednia)) return talia.kartaZnam(nowa, klucz, teraz)
  return { ...nowa, termin: talia.rozrzucTermin(klucz, nowa.termin, teraz) }
}

function ocenKarte(ocena) {
  if (ekran !== 'karta' || zajete || !seria) return
  const k = talia.aktualnaKarta(seria)
  const przed = stan.karty[k]
  if (ocena === 4 ? !talia.jestNowa(przed) : !odkryta) return
  if (ocena === 3 && talia.regulyPodpowiedzi({ uzyto: uzytoPodpowiedzi }).umiemZablokowane) return
  const teraz = new Date()
  // W treningu ocena liczy sie do EXP, combo, celu dnia i streaka, ale nie rusza karty ani terminu.
  let nowa = null
  if (!seria.trening) {
    try {
      nowa = ocenionaKarta(przed || nowaKarta(teraz.toISOString()), ocena, teraz, k)
    } catch (blad) {
      // Karta, ktorej nie da sie ocenic, zostaje bez zmian, zeby do zapisu nie trafil NaN.
      toast(`Nie udało się ocenić karty: ${opis(blad)}`, 'blad')
      pominAktualna()
      return
    }
  }
  // Migawka do cofniecia misclicka: wszystko, co ta ocena zmienia. Obiekty stanu sa niemutowalne, wiec starcza
  // zapamietanie referencji.
  const migawka = zrobMigawke(k, przed)

  if (nowa) stan.karty[k] = nowa
  const sekundy = talia.czasKarty((performance.now() - startKarty) / 1000)
  stan.dzis = talia.zaliczCzas(stan.dzis, sekundy, teraz)
  // Sufit dzienny dotyczy tylko kart zaleglych, wiec nowe slowa i trening go nie zjadaja.
  if (!seria.trening && przed?.stan === 'powtorka') {
    stan.dzis = { ...stan.dzis, powtorki: (stan.dzis.powtorki || 0) + 1 }
  }
  // Prog utrzymania serii to jedna oceniona karta; dzien opuszczony pokrywa zamrozenie z banku.
  const dzien = talia.zaliczDzien(stan.streak, teraz)
  stan.streak = dzien.streak
  const poprzedniaSeria = seria
  // Karta bez daty wprowadzenia wchodzi do nauki wlasnie teraz: to jest "co przybylo" na ekranie konca serii.
  const noweSlowo = !seria.trening && !przed?.wprowadzono ? 1 : 0
  seria = talia.poOcenie(seria, ocena, noweSlowo === 1)
  const zdobyte = seria.exp - poprzedniaSeria.exp
  stan.expRazem += zdobyte
  stan.punktyTygodnia = talia.dolozPunkty(stan.punktyTygodnia, zdobyte, teraz)
  stan.historia = talia.dopiszDzien(stan.historia, { oceny: 1, nowe: noweSlowo, exp: zdobyte, sekundy }, teraz)
  zapiszStan()
  cofniecie = migawka

  const koniec = talia.koniecSerii(seria)
  if (koniec) wibruj('koniec')
  else if (seria.bonus) wibruj('combo')
  else wibruj({ 1: 'nieUmiem', 2: 'prawie' }[ocena] || 'umiem')
  if (dzien.zamrozono) toast(TEKST_ZAMROZENIA)
  else if (seria.bonus) toast(`Combo ${seria.combo}, +${seria.bonus} pkt`)
  odswiezGore()
  const leech = nowa && talia.czyPanelLeecha(nowa) ? k : null
  wylot(ocena, () => {
    if (leech) pokazPanelLeecha(leech)
    else if (koniec) pokazKoniec()
    else pokazKarte()
    pokazCofnij()
  })
}

// Slowo oporne (A7): po kazdych 6 pomylkach karta dostaje panel z trzema wyjsciami. Historia karty zostaje,
// bo FSRS uczy sie na niej; zmienia sie tylko termin albo obecnosc slowa w nauce.
function pokazPanelLeecha(k) {
  const { id } = talia.rozbierzKlucz(k)
  const slowo = poId.get(id)
  const dalej = () => {
    zapiszStan()
    odswiezGore()
    if (talia.koniecSerii(seria)) pokazKoniec()
    else pokazKarte()
  }
  const zdejmijZSerii = () => {
    const kolejka = seria.kolejka.filter((x) => x !== k)
    seria = { ...seria, kolejka, wszystkie: Math.max(seria.wszystkie - (seria.kolejka.length - kolejka.length), seria.oczyszczone) }
  }
  pokazEkran(
    'leech',
    el(
      'section',
      { klasa: 'ekran' },
      el('h2', { tekst: 'To słowo Cię męczy' }),
      el('p', { klasa: 'przygaszony', tekst: `${slowo?.w ?? id} - ${slowo?.pl ?? ''}` }),
      el(
        'div',
        { klasa: 'przyciski' },
        el('button', {
          klasa: 'przycisk glowny',
          type: 'button',
          tekst: 'Odłóż na 3 tygodnie',
          onclick: () => {
            stan.karty[k] = talia.kartaOdlozona(stan.karty[k], k, new Date())
            zdejmijZSerii()
            dalej()
          },
        }),
        el('button', {
          klasa: 'przycisk',
          type: 'button',
          tekst: 'Pomijam',
          onclick: () => {
            stan.karty[k] = talia.kartaPoLeechu(stan.karty[k])
            stan.pominiete = { ...stan.pominiete, [id]: talia.dataLokalna() }
            const kolejka = seria.kolejka.filter((x) => talia.rozbierzKlucz(x).id !== id)
            seria = { ...seria, kolejka, wszystkie: Math.max(seria.wszystkie - (seria.kolejka.length - kolejka.length), seria.oczyszczone) }
            dalej()
          },
        }),
        el('button', {
          klasa: 'przycisk',
          type: 'button',
          tekst: 'Uczę się dalej',
          onclick: () => {
            stan.karty[k] = talia.kartaPoLeechu(stan.karty[k])
            dalej()
          },
        }),
      ),
    ),
  )
}

// "Pomijam": slowo wypada z nauki na dobre. Karty zostaja w pamieci nietkniete, wiec "Przywroc" z przegladu talii
// oddaje je w to samo miejsce harmonogramu. Nie ma oceny, EXP ani wpisu w celu dnia - to nie jest nauka.
function pomijajAktualna() {
  if (ekran !== 'karta' || zajete || !seria) return
  const k = talia.aktualnaKarta(seria)
  const { id } = talia.rozbierzKlucz(k)
  const migawka = zrobMigawke(k, stan.karty[k])
  const pierwsze = !Object.keys(stan.pominiete).length
  stan.pominiete = { ...stan.pominiete, [id]: talia.dataLokalna() }
  // Oba kierunki tego slowa schodza z serii naraz, zeby karta mowienia nie wrocila za chwile.
  const kolejka = seria.kolejka.filter((klucz) => talia.rozbierzKlucz(klucz).id !== id)
  seria = { ...seria, kolejka, wszystkie: Math.max(seria.wszystkie - (seria.kolejka.length - kolejka.length), seria.oczyszczone) }
  zapiszStan()
  cofniecie = migawka
  wibruj('prawie')
  const koniec = talia.koniecSerii(seria)
  odswiezGore()
  // Pominiecie nie jest ocena, wiec karta odchodzi bez koloru i bez kierunku: sam zanik.
  wylot(0, () => {
    if (koniec) pokazKoniec()
    else pokazKarte()
    pokazCofnij()
  })
  if (pierwsze) toast(PODPOWIEDZ_POMIJANIA, 'wazny')
}

// Cofniecie ostatniej oceny (misclick). Przycisk siedzi w rzedzie akcji pod karta, a nie nad nia, zeby nigdy
// nie przejal tapniecia odslaniajacego karte. Znika po 6 sekundach, ale sama migawka jest wazna do nastepnej
// oceny, wyjscia z serii albo restartu apki (w menu zostaje pozycja "Cofnij ostatnią ocenę").
const mozliwoscCofniecia = () => !!cofniecie && Date.now() < cofniecieDo

// Migawka do cofniecia: wszystko, co ocena albo pominiecie zmienia. Obiekty stanu sa niemutowalne, wiec starcza
// zapamietanie referencji. `odkryta` wraca razem ze stanem, zeby cofniecie nie odslonilo karty, ktora byla zakryta.
const zrobMigawke = (klucz, karta) => ({
  klucz,
  karta,
  seria,
  odkryta,
  uzytoPodpowiedzi,
  expRazem: stan.expRazem,
  punktyTygodnia: stan.punktyTygodnia,
  streak: stan.streak,
  dzis: stan.dzis,
  historia: stan.historia,
  pominiete: stan.pominiete,
})

function zapomnijCofniecie() {
  cofniecie = null
  cofniecieDo = 0
  clearTimeout(czasCofniecia)
  if (ekran === 'karta') odswiezAkcje()
}

function pokazCofnij() {
  clearTimeout(czasCofniecia)
  cofniecieDo = cofniecie ? Date.now() + SEKUNDY_NA_COFNIECIE * 1000 : 0
  if (cofniecie) {
    czasCofniecia = setTimeout(() => {
      cofniecieDo = 0
      if (ekran === 'karta') odswiezAkcje()
    }, SEKUNDY_NA_COFNIECIE * 1000)
  }
  if (ekran === 'karta') odswiezAkcje()
}

function cofnijOcene() {
  if (!cofniecie) return
  const m = cofniecie
  // Pominiecie tworzy nowa mape, ocena zostawia te sama referencje: stad wiadomo, co wlasciwie cofamy.
  const byloPominiecie = m.pominiete !== stan.pominiete
  zapomnijCofniecie()
  if (m.karta === undefined) delete stan.karty[m.klucz]
  else stan.karty[m.klucz] = m.karta
  stan.expRazem = m.expRazem
  stan.punktyTygodnia = m.punktyTygodnia
  stan.streak = m.streak
  stan.dzis = m.dzis
  stan.historia = m.historia
  stan.pominiete = m.pominiete
  seria = m.seria
  zapiszStan()
  zamknijMenu()
  poprzedniePunkty = punktyTygodnia()
  odkryjOdRazu = m.odkryta
  pokazKarte()
  // pokazKarte zeruje uzycie podpowiedzi, wiec przywracamy je po nim: inaczej cofniecie zdejmowaloby
  // blokade oceny "Umiem" i dalo sie nia obejsc regule z A5.
  uzytoPodpowiedzi = m.uzytoPodpowiedzi
  odswiezAkcje()
  toast(byloPominiecie ? 'Cofnięto pominięcie.' : 'Cofnięto ostatnią ocenę.')
}

const malyRuch = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Wylot karty niesie wynik: w gore "Umiem", w dol "Nie umiem", drgniecie w poziomie "Prawie". Do tego
// dochodzi kolor obrysu i znak na srodku karty, wiec przy wylaczonym ruchu informacja zostaje w calosci
// (C3: zamiast ruchu kolor i przezroczystosc, czasy do 80 ms).
function wylot(ocena, potem) {
  zajete = true
  $('akcje').replaceChildren()
  const karta = $('karta')
  const status = STATUSY[ocena]
  if (karta) {
    karta.classList.remove('wjazd', 'ciagniecie')
    karta.style.transform = ''
    if (status) {
      karta.classList.add(`wynik-${status.klasa}`, `wylot-${status.klasa}`)
      karta.append(el('div', { klasa: 'wynik', 'aria-hidden': 'true', tekst: status.ikona }))
    } else {
      karta.classList.add('wylot-cicho')
    }
  }
  setTimeout(() => {
    zajete = false
    potem()
  }, malyRuch() ? MS_WYLOTU_BEZ_RUCHU : MS_WYLOTU)
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
    if (e.target.closest('.glosnik, .bez-odsloniecia')) return
    odslon()
  })
}

// Jedna oceniona karta zalicza dzien, wiec nie ma tu zadnego odliczania ani informacji o utracie.
function opisStreaka(teraz = new Date()) {
  const dni = talia.aktualnyStreak(stan.streak, teraz)
  const ostatnie30 = talia.dniZNauka(stan.historia, talia.DNI_OSTATNICH, teraz)
  const czesci = [`🔥 ${liczebnik(dni, ['dzień', 'dni', 'dni'])} z rzędu`, `${ostatnie30} / ${talia.DNI_OSTATNICH} dni nauki`]
  const zamrozenia = talia.streakZDomyslnymi(stan.streak).zamrozenia
  if (zamrozenia) czesci.push(`${liczebnik(zamrozenia, ['zamrożenie', 'zamrożenia', 'zamrożeń'])} w zapasie`)
  if (stan.streak.ostatniDzien !== talia.dataLokalna(teraz)) czesci.push('jedna karta zalicza dziś dzień')
  return czesci.join(' · ')
}

function opisDnia({ zalegle, pozniejDzis, noweDostepne }) {
  const czesci = [`Zaległe teraz: ${zalegle}`]
  if (pozniejDzis) czesci.push(`później dziś: ${pozniejDzis}`)
  czesci.push(`nowe w limicie: ${noweDostepne}`)
  return czesci.join(' · ')
}

const podsumowanie = (teraz = new Date()) => talia.podsumowanieDnia(opcjeDoboru(teraz))

// Licznik punktow na ekranie konca serii. Zwraca funkcje, ktora natychmiast pokazuje wynik koncowy:
// tapniecie ma pominac celebracje, a nie zostawic liczbe w polowie drogi.
function animujLicznik(element, cel) {
  const czas = malyRuch() ? 1 : 900
  const start = performance.now()
  let trwa = true
  const krok = (t) => {
    if (!trwa) return
    const p = Math.min((t - start) / czas, 1)
    element.textContent = `+${Math.round(cel * (1 - Math.pow(1 - p, 3)))} pkt`
    if (p < 1) requestAnimationFrame(krok)
    else trwa = false
  }
  requestAnimationFrame(krok)
  return () => {
    trwa = false
    element.textContent = `+${cel} pkt`
  }
}

// Odznaka na ikonie (D2): jedyna pasywna wskazowka, ktora dziala bez serwera (iOS 16.4+ w apce z ekranu
// glownego). Brak wsparcia nie moze rzucic bledem, stad optional call w try/catch.
function odswiezOdznake(liczba) {
  try {
    if (liczba > 0) navigator.setAppBadge?.(liczba)
    else navigator.clearAppBadge?.()
  } catch {
    // przegladarka bez odznaki po prostu jej nie pokaze
  }
}

// Pasek celu dnia: liczony w ocenionych kartach, wiec trening tez sie liczy. Dystans jest podany jawnie
// w kartach ("zostały 3 karty"), nie w procentach: procent kieruje uwage na ocene siebie (C5).
function pasekCelu() {
  const zrobione = talia.ocenioneDzis(stan.historia)
  const cel = stan.ustawienia.celDzienny
  const gotowe = zrobione >= cel
  const zostalo = Math.max(cel - zrobione, 0)
  return el(
    'div',
    { klasa: `cel ${gotowe ? 'zrobiony' : ''}` },
    el(
      'div',
      { klasa: 'wiersz' },
      el('span', { tekst: gotowe ? '✓ Cel dnia zrobiony' : `Cel dnia · ${zostaloKart(zostalo)}` }),
      el('span', { klasa: 'liczba', tekst: `${zrobione} / ${cel}` }),
    ),
    el('div', { klasa: 'mini-tor' }, el('i', { style: `transform: scaleX(${Math.min(zrobione / cel, 1)})` })),
  )
}

function blokRangi(r) {
  return el(
    'div',
    { klasa: 'awans' },
    el('div', { klasa: 'awans-nagl', tekst: 'Nowa ranga' }),
    el('div', { klasa: 'awans-tytul', tekst: r.nazwa }),
    el('div', { klasa: 'przygaszony maly', tekst: `${r.utrwalone} słów utrwalonych` }),
  )
}

// Kafelek statusu z ikona: kolor to za malo, zeby rozroznic wynik (WCAG 1.4.1).
const kafelekStatusu = (ocena, liczba) =>
  el(
    'div',
    { klasa: `kafelek ${STATUSY[ocena].klasa}` },
    el('b', { tekst: String(liczba) }),
    `${STATUSY[ocena].ikona} ${STATUSY[ocena].etykieta}`,
  )

const kafelekPrzyrostu = (liczba, podpis, klasa = '') =>
  el('div', { klasa: `przyrost ${klasa}` }, el('span', { klasa: 'przyrost-liczba', tekst: String(liczba) }), podpis)

// Ekran konca serii (C5): najpierw co przybylo, potem ciaglosc, na koncu co dalej. Zaden procent
// skutecznosci nie jest tu glowna liczba, bo kierowalby uwage na ocene siebie zamiast na zadanie.
function pokazKoniec() {
  const teraz = new Date()
  const licznik = el('div', { klasa: 'koniec-exp', tekst: '+0 pkt' })
  const r = rangaTeraz()
  // Przy przeskoku o dwie rangi w jednej serii pokazujemy tylko koncowa.
  const awans = r.stopien > rangaStartSerii
  const trening = seria.trening
  // Sesja liczy sie do odzyskania serii: dwie sesje w ciagu 48 h od przerwy oddaja dni sprzed niej.
  const sesja = talia.zaliczSesje(stan.streak, teraz)
  stan.streak = sesja.streak
  zapiszStan()
  const dzien = podsumowanie(teraz)
  odswiezOdznake(dzien.doZrobienia)
  const przybylo = Math.max(utrwalonych() - utrwaloneStartSerii, 0)
  const jutro = talia.prognozaNaJutro({ slowa, karty: stan.karty, ustawienia: stan.ustawienia, teraz, pominiete: stan.pominiete })
  const sekcja = el(
    'section',
    { klasa: 'ekran swietuje' },
    el('h2', { tekst: trening ? 'Trening ukończony' : 'Seria ukończona' }),
    trening && el('p', { klasa: 'przygaszony maly', tekst: 'To był trening. Terminy powtórek zostały bez zmian.' }),
    !trening && el('div', { klasa: 'nag-bloku', tekst: 'Co przybyło' }),
    !trening &&
      el(
        'div',
        { klasa: 'przyrosty' },
        // Seria bez nowych slow (sama powtorka) nie ma pokazywac wielkiego zera: wtedy tym, co przybylo,
        // sa powtorzone karty. Zadna liczba na tym ekranie nie moze wygladac jak kara.
        seria.nowe
          ? kafelekPrzyrostu(seria.nowe, formaSlowa(seria.nowe, ['nowe słowo', 'nowe słowa', 'nowych słów']))
          : kafelekPrzyrostu(seria.oczyszczone, formaSlowa(seria.oczyszczone, ['powtórzona karta', 'powtórzone karty', 'powtórzonych kart'])),
        kafelekPrzyrostu(
          r.utrwalone,
          przybylo ? `utrwalonych (+${przybylo})` : 'utrwalonych łącznie',
          'utrwalone',
        ),
      ),
    licznik,
    el('div', { klasa: 'kafelki trzy' }, kafelekStatusu(3, seria.umiem), kafelekStatusu(2, seria.prawie), kafelekStatusu(1, seria.nieUmiem)),
    pasekCelu(),
    el('div', { klasa: 'nag-bloku', tekst: 'Ciągłość' }),
    el('p', { klasa: 'ciaglosc-tekst', tekst: opisStreaka(teraz) }),
    sesja.odzyskano && el('p', { klasa: 'maly', tekst: 'Seria wróciła do wartości sprzed przerwy.' }),
    // "Co dalej" tylko wtedy, gdy liczba jest znosna: ponad sufit powtorek zamienia sie w dlug.
    jutro.znosna &&
      el('p', { klasa: 'przygaszony maly', tekst: `Jutro czeka ${liczebnik(jutro.liczba, ['karta', 'karty', 'kart'])}.` }),
    awans && blokRangi(r),
    el('p', { klasa: 'przygaszony maly', tekst: `${talia.opisRangi(r)} · +${punktyTygodnia()} w tym tygodniu` }),
    banery(),
    el(
      'div',
      { klasa: 'przyciski' },
      el('button', { klasa: 'przycisk glowny', type: 'button', tekst: 'Jeszcze seria', onclick: () => nowaSeriaLubPusto() }),
      el(
        'div',
        { klasa: 'para' },
        przyciskTrudnych('przycisk maly'),
        el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Koniec na dziś', onclick: () => pokazStart() }),
      ),
    ),
  )
  pokazEkran('koniec', sekcja)
  const dokoncz = animujLicznik(licznik, seria.exp)
  // Celebracja konca serii: 1,0-1,5 s razem z licznikiem, w kazdej chwili pomijalna tapnieciem.
  pominCelebracje = () => {
    clearTimeout(czasCelebracji)
    sekcja.classList.remove('swietuje')
    dokoncz()
  }
  czasCelebracji = setTimeout(zakonczCelebracjeEkranu, MS_CELEBRACJI_KONCA)
  sekcja.addEventListener('click', zakonczCelebracjeEkranu)
  if (awans) {
    wibruj('awans')
    pokazSwietoRangi(r)
  }
}

// Pelnoekranowa celebracja awansu rangi (B1): do 2,5 s, pomijalna tapnieciem, kilka razy na kwartal.
// Sam fakt awansu zostaje potem na ekranie konca serii w bloku .awans, wiec pominiecie nic nie zabiera.
function pokazSwietoRangi(r) {
  const swieto = $('swieto')
  swieto.replaceChildren(
    el('div', { klasa: 'swieto-krag', 'aria-hidden': 'true', tekst: '✓' }),
    el('div', { klasa: 'swieto-nagl', tekst: 'Nowa ranga' }),
    el('div', { klasa: 'swieto-tytul', tekst: r.nazwa }),
    el('div', { klasa: 'swieto-opis', tekst: `${r.utrwalone} słów utrwalonych` }),
    el('div', { klasa: 'swieto-pomin', tekst: 'Dotknij, aby przejść dalej' }),
  )
  swieto.hidden = false
  clearTimeout(czasSwieta)
  czasSwieta = setTimeout(zamknijSwieto, MS_CELEBRACJI_AWANSU)
}

function zamknijSwieto() {
  clearTimeout(czasSwieta)
  const swieto = $('swieto')
  if (swieto.hidden) return
  swieto.hidden = true
  swieto.replaceChildren()
}

function saNoweDoWprowadzenia() {
  return slowa.some((s) => {
    if (talia.jestPominiete(stan.pominiete, s.id)) return false
    const en = stan.karty[talia.klucz(s.id, 'en')]
    if (talia.jestNowa(en)) return true
    return stan.ustawienia.mowienie && talia.mowienieOdblokowane(en) && talia.jestNowa(stan.karty[talia.klucz(s.id, 'pl')])
  })
}

function pokazPusto() {
  const teraz = new Date()
  const dzien = podsumowanie(teraz)
  odswiezOdznake(dzien.doZrobienia)
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
        przyciskTrudnych('przycisk maly'),
        el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Ekran startu', onclick: () => pokazStart() }),
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

const kafelekLiczby = (liczba, podpis) => el('div', { klasa: 'kafelek' }, el('b', { tekst: String(liczba) }), podpis)

// Kotwica nawyku (D1): jednorazowe pytanie o wskazowke zdarzeniowa. Nie blokuje ekranu, bo pierwsze
// uruchomienie ma prowadzic do nauki, a nie do ankiety; odpowiedz i "Nie teraz" zamykaja je na stale.
function ustawKotwice(tekst) {
  stan.ustawienia = { ...stan.ustawienia, kotwica: tekst, kotwicaPytano: true }
  kotwicaOtwarta = false
  zapiszStan()
  // Zmiana kotwicy w trakcie nauki nie moze przerwac serii: wtedy odswieza sie samo menu.
  if (ekran === 'start') {
    zamknijMenu()
    pokazStart()
  } else {
    odswiezMenu()
  }
  toast(tekst ? talia.zdanieKotwicy(tekst) : 'Bez kotwicy. Ustawisz ją w Menu > Ustawienia.')
}

// Wlasna kotwica przez prompt: to samo narzedzie, co przy kasowaniu postepu slowa, wiec nie dokladamy
// osobnego pola tekstowego na ekranie, ktory ma prowadzic do nauki.
function wlasnaKotwica() {
  const tekst = prompt('Kiedy się uczysz? Dokończ zdanie "Uczysz się ..."', stan.ustawienia.kotwica || '')
  if (tekst === null) return
  ustawKotwice(tekst.trim().slice(0, talia.MAKS_ZNAKOW_KOTWICY))
}

function opcjeKotwicy(wybrana) {
  return el(
    'div',
    { klasa: 'kotwica-opcje' },
    talia.KOTWICE.map((k) =>
      el('button', { type: 'button', 'aria-pressed': String(k === wybrana), tekst: k, onclick: () => ustawKotwice(k) }),
    ),
    el('button', { type: 'button', tekst: 'Własna…', onclick: wlasnaKotwica }),
    el('button', { klasa: 'cicho', type: 'button', tekst: wybrana ? 'Wyłącz' : 'Nie teraz', onclick: () => ustawKotwice('') }),
  )
}

// Domyslnie jeden waski wiersz: pytanie nie moze zepchnac przycisku Start poza ekran iPhone'a SE.
// Pelna lista wskazowek rozwija sie dopiero po tapnieciu "Wybierz".
function pytanieOKotwice() {
  if (kotwicaOtwarta) {
    return el(
      'div',
      { klasa: 'kotwica-blok' },
      el('p', { tekst: 'Kiedy się uczysz?' }),
      el('p', { klasa: 'opis', tekst: 'Wskazówka przyczepiona do zdarzenia buduje nawyk lepiej niż godzina na zegarze.' }),
      opcjeKotwicy(''),
    )
  }
  return el(
    'div',
    { klasa: 'kotwica-blok waski' },
    el('span', { tekst: 'Kiedy się uczysz?' }),
    el('button', {
      klasa: 'przycisk maly',
      type: 'button',
      tekst: 'Wybierz',
      onclick: () => {
        kotwicaOtwarta = true
        pokazStart()
      },
    }),
    el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Nie teraz', onclick: () => ustawKotwice('') }),
  )
}

// Ekran startu dnia (C4): ranga z paskiem, jedna liczba na dzis, duzy Start, ciaglosc, trudne slowa.
// Wchodzi sie tu po uruchomieniu apki i po zakonczeniu nauki na dzis.
function pokazStart() {
  zapomnijCofniecie()
  seria = null
  if (!slowa.length) {
    pokazBezSlow()
    return
  }
  const teraz = new Date()
  odswiezNadrabianie(teraz)
  const dzien = podsumowanie(teraz)
  const r = rangaTeraz()
  odswiezOdznake(dzien.doZrobienia)
  const kotwica = talia.zdanieKotwicy(stan.ustawienia.kotwica)
  const zrobioneDzis = talia.ocenioneDzis(stan.historia)
  const poCelu = zrobioneDzis >= stan.ustawienia.celDzienny
  pokazEkran(
    'start',
    el(
      'section',
      { klasa: 'ekran' },
      el(
        'div',
        { klasa: 'poziom-duzy' },
        el('b', { tekst: r.nazwa }),
        el('span', { klasa: 'przygaszony', tekst: r.ostatnia ? `${r.utrwalone} słów utrwalonych` : `${r.utrwalone} / ${r.nastepnyProg} słów utrwalonych` }),
      ),
      el(
        'div',
        { klasa: 'mini-tor szeroki', 'aria-label': r.ostatnia ? 'Najwyższa ranga' : `Do rangi ${r.nastepnaNazwa}: ${r.doNastepnej}` },
        el('i', { style: `transform: scaleX(${r.procent / 100})` }),
      ),
      // Po przerwie nie pokazujemy liczby zaleglych: to najczestszy powod porzucenia powtorek.
      dzien.nadrabianie
        ? el('p', { klasa: 'powrot', tekst: TEKST_POWROTU })
        : el('div', { klasa: 'kafelki jeden' }, kafelekLiczby(dzien.doZrobienia, 'Dziś do zrobienia')),
      kotwica && el('p', { klasa: 'kotwica-zdanie', tekst: kotwica }),
      el(
        'div',
        { klasa: 'przyciski' },
        el('button', {
          klasa: 'przycisk glowny duzy',
          type: 'button',
          // Mikro-cel po osiagnieciu celu dnia neutralizuje spadek motywacji po nagrodzie (Kivetz i in. 2006).
          tekst: poCelu ? `Jeszcze ${liczebnik(stan.ustawienia.dlugoscSerii, ['karta', 'karty', 'kart'])}?` : 'Start',
          onclick: () => nowaSeriaLubPusto(),
        }),
      ),
      pasekCelu(),
      el('p', { klasa: 'maly', tekst: opisStreaka(teraz) }),
      el('div', { klasa: 'przyciski' }, przyciskTrudnych('przycisk maly')),
      banery(),
      !stan.ustawienia.kotwicaPytano && pytanieOKotwice(),
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

const dataPoPolsku = (rrrrMmDd) => {
  const [r, m, d] = rrrrMmDd.split('-').map(Number)
  return new Date(r, m - 1, d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Heatmapa ostatnich 30 dni: kolumny to dni tygodnia, pod spodem liczby, zeby siatka cos mowila
// takze wtedy, gdy historia dopiero sie zaczela.
const DNI_TYGODNIA = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd']

function podpisHeatmapy({ dzis, najlepszy, pierwszyDzien, dniZNauka }) {
  if (!dniZNauka) return 'Historia nauki zaczyna się dzisiaj.'
  const czesci = [`dziś ${liczebnik(dzis, ['karta', 'karty', 'kart'])}`]
  if (najlepszy > dzis) czesci.push(`najlepszy dzień: ${najlepszy}`)
  czesci.push(`dni z nauką: ${dniZNauka}`)
  return czesci.join(' · ')
}

function heatmapa() {
  const siatka = talia.siatkaHeatmapy(stan.historia)
  return el(
    'div',
    { klasa: 'heatmapa-blok' },
    el('div', { klasa: 'heatmapa dni-tygodnia', 'aria-hidden': 'true' }, DNI_TYGODNIA.map((d) => el('span', { tekst: d }))),
    el(
      'div',
      { klasa: 'heatmapa' },
      Array.from({ length: siatka.puste }, () => el('i', { klasa: 'dzien przed' })),
      siatka.pola.map((d) => {
        const podpis = `${dataPoPolsku(d.data)}: ${liczebnik(d.oceny, ['karta', 'karty', 'kart'])}`
        return el('i', { klasa: `dzien s${d.stopien}`, title: podpis, 'aria-label': podpis })
      }),
    ),
    el('p', { klasa: 'opis', tekst: podpisHeatmapy(siatka) }),
  )
}

function tekstPrognozy(pozostale) {
  if (!pozostale) return 'Wszystkie słowa z talii są już wprowadzone.'
  const p = talia.prognozaUkonczenia({ pozostale, historia: stan.historia, ustawienia: stan.ustawienia })
  if (p.dni === null) return 'Brak danych o tempie.'
  return `Przy tym tempie: około ${dataPoPolsku(p.data)} (${liczebnik(p.dni, ['dzień', 'dni', 'dni'])}).`
}

function sekcjaStatystyk() {
  const st = talia.statystyki({ slowa, karty: stan.karty, pominiete: stan.pominiete })
  const dzien = podsumowanie()
  const r = talia.ranga(st.utrwalone)
  const wKolizjach = Object.keys(kolizje).length
  return el(
    'div',
    { klasa: 'sekcja' },
    el('h3', { tekst: 'Statystyki' }),
    wiersz('Ranga', r.ostatnia ? r.nazwa : `${r.nazwa} (do "${r.nastepnaNazwa}": ${r.doNastepnej})`),
    wiersz('Utrwalone słowa', `${st.utrwalone} / ${st.wszystkie}`),
    wiersz('Punkty w tym tygodniu', punktyTygodnia().toLocaleString('pl-PL')),
    wiersz('Punkty łącznie', stan.expRazem.toLocaleString('pl-PL')),
    wiersz('Poznane słowa', `${st.poznane} / ${st.wszystkie}`),
    wiersz('Opanowane', `${st.opanowane} / ${st.wszystkie}`),
    wiersz('Pominięte', st.pominiete),
    wiersz('W powtórkach', `${st.procentPowtorka.toLocaleString('pl-PL')}% listy`),
    wiersz('Odblokowane karty mówienia', st.mowienieOdblokowane),
    wiersz('Zaległe teraz', dzien.pozniejDzis ? `${dzien.zalegle} (+${dzien.pozniejDzis} później dziś)` : dzien.zalegle),
    wiersz('Dziś do zrobienia', dzien.doZrobienia),
    wiersz('Tryb nadrabiania', dzien.nadrabianie ? 'tak' : 'nie'),
    wiersz('Seria', liczebnik(talia.aktualnyStreak(stan.streak), ['dzień', 'dni', 'dni'])),
    wiersz('Dni nauki w ostatnich 30', `${talia.dniZNauka(stan.historia)} / ${talia.DNI_OSTATNICH}`),
    wiersz('Indeks kolizji', wKolizjach ? `${wKolizjach} słów${czasIndeksuKolizji ? ` · ${czasIndeksuKolizji} ms` : ' · z pamięci'}` : 'liczony'),
    el('h3', { tekst: 'Ostatnie 30 dni', style: 'margin-top: 16px' }),
    heatmapa(),
    el('p', { klasa: 'opis', style: 'margin-top: 8px', tekst: tekstPrognozy(st.doWprowadzenia) }),
    st.talie.length > 0 && el('h3', { tekst: 'Talie', style: 'margin-top: 16px' }),
    st.talie.map((t) => wierszStat(t.nazwa, t.poznane, t.wszystkie)),
    st.poziomy.length > 0 && el('h3', { tekst: 'Poziomy', style: 'margin-top: 16px' }),
    st.poziomy.map((p2) => wierszStat(p2.nazwa, p2.poznane, p2.wszystkie)),
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
  const segmentyOpisane = (opcje, pole) =>
    el(
      'div',
      { klasa: 'segmenty' },
      opcje.map(([wartosc, etykieta]) =>
        el('button', {
          type: 'button',
          'aria-pressed': String(wartosc === u[pole]),
          tekst: etykieta,
          onclick: () => zmienUstawienie(pole, wartosc),
        }),
      ),
    )
  return el(
    'div',
    { klasa: 'sekcja' },
    el('h3', { tekst: 'Ustawienia' }),
    el('div', { klasa: 'wiersz' }, el('span', { tekst: 'Nowych dziennie' })),
    segmenty(talia.OPCJE_NOWYCH, 'noweDziennie'),
    el('div', { klasa: 'wiersz', style: 'margin-top: 8px' }, el('span', { tekst: 'Sufit powtórek dziennie' })),
    segmentyOpisane(
      talia.OPCJE_SUFITU.map((o) => [o, o === 0 ? 'bez limitu' : String(o)]),
      'maksPowtorekDziennie',
    ),
    el('div', { klasa: 'wiersz', style: 'margin-top: 8px' }, el('span', { tekst: 'Długość serii' })),
    segmenty(talia.OPCJE_DLUGOSCI, 'dlugoscSerii'),
    el('div', { klasa: 'wiersz', style: 'margin-top: 8px' }, el('span', { tekst: 'Cel dzienny (karty)' })),
    segmenty(talia.OPCJE_CELU, 'celDzienny'),
    el('div', { klasa: 'wiersz', style: 'margin-top: 8px' }, el('span', { tekst: 'Podpowiedź na karcie mówienia' })),
    segmentyOpisane(
      [
        ['brak', 'brak'],
        ['dlugosc', 'długość'],
        ['litera', 'litera'],
      ],
      'podpowiedzMowienie',
    ),
    przelacz('autowymowa', 'Wymowa po odsłonięciu'),
    przelacz('mowienie', 'Karty mówienia (PL → EN)'),
    // Kotwica nawyku (D1): zapisane zdanie widac na ekranie startu, tutaj da sie je zmienic i wylaczyc.
    el(
      'div',
      { klasa: 'wiersz', style: 'margin-top: 8px' },
      el('span', { tekst: 'Kotwica nawyku' }),
      el('span', { klasa: 'przygaszony', tekst: u.kotwica ? talia.zdanieKotwicy(u.kotwica) : 'wyłączona' }),
    ),
    opcjeKotwicy(u.kotwica),
  )
}

// Przeglad talii: szukanie po angielskim i po polsku, bez rozroznienia wielkosci liter i polskich znakow.

function znamZListy(slowo) {
  const k = talia.klucz(slowo.id, 'en')
  if (!talia.jestNowa(stan.karty[k])) return
  const teraz = new Date()
  try {
    stan.karty[k] = ocenionaKarta(nowaKarta(teraz.toISOString()), 4, teraz, k)
  } catch (blad) {
    toast(`Nie udało się ocenić karty: ${opis(blad)}`, 'blad')
    return
  }
  // Ocena poza seria: migawka cofniecia dotyczy tylko serii, wiec przestaje byc aktualna.
  zapomnijCofniecie()
  const zdobyte = talia.EXP_ZA_OCENE[4]
  stan.expRazem += zdobyte
  stan.punktyTygodnia = talia.dolozPunkty(stan.punktyTygodnia, zdobyte, teraz)
  stan.streak = talia.zaliczDzien(stan.streak, teraz).streak
  stan.historia = talia.dopiszDzien(stan.historia, { oceny: 1, nowe: 1, exp: zdobyte }, teraz)
  zapiszStan()
  odswiezGore()
  odswiezSlowka()
  odswiezMenu()
  toast(`"${slowo.w}" oznaczone jako znane.`)
}

function zresetujSlowo(slowo) {
  if (!confirm(`Skasować postęp słowa "${slowo.w}" w obu kierunkach?`)) return
  zapomnijCofniecie()
  const klucze = [talia.klucz(slowo.id, 'en'), talia.klucz(slowo.id, 'pl')]
  stan.historia = talia.odejmijNowe(stan.historia, klucze.map((k) => stan.karty[k]?.wprowadzono))
  for (const k of klucze) delete stan.karty[k]
  zapiszStan()
  odswiezGore()
  odswiezSlowka()
  odswiezMenu()
  toast(`Postęp słowa "${slowo.w}" skasowany.`)
}

function zglosBlad(slowo) {
  if (stan.zgloszenia.some((z) => z.id === slowo.id)) {
    toast(`"${slowo.w}" jest już zgłoszone.`)
    return
  }
  stan.zgloszenia = [...stan.zgloszenia, { id: slowo.id, w: slowo.w, pl: slowo.pl, kiedy: new Date().toISOString() }]
  zapiszStan()
  odswiezMenu()
  toast(`Zgłoszono "${slowo.w}".`)
}

// Pominiete slowo wraca do nauki dokladnie tam, gdzie bylo: karty nie byly ruszane, wiec wystarczy zdjac je z listy.
function przywrocSlowo(slowo) {
  if (!talia.jestPominiete(stan.pominiete, slowo.id)) return
  const reszta = { ...stan.pominiete }
  delete reszta[slowo.id]
  stan.pominiete = reszta
  zapiszStan()
  odswiezGore()
  odswiezSlowka()
  odswiezMenu()
  toast(`"${slowo.w}" wraca do nauki.`)
}

function wierszSlowa(slowo) {
  const en = stan.karty[talia.klucz(slowo.id, 'en')]
  const pominiete = talia.jestPominiete(stan.pominiete, slowo.id)
  return el(
    'div',
    { klasa: 'slowo-wiersz' },
    el(
      'div',
      { klasa: 'slowo-tresc' },
      el('div', { klasa: 'slowo-naglowek' }, el('b', { tekst: slowo.w }), slowo.poziom && el('span', { klasa: 'chip poziom', tekst: slowo.poziom })),
      el('div', { klasa: 'przygaszony', tekst: slowo.pl }),
      el('div', { klasa: 'przygaszony maly', tekst: talia.opisStanuKarty(en, new Date(), pominiete) }),
    ),
    el(
      'div',
      { klasa: 'slowo-akcje' },
      pominiete && el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Przywróć', onclick: () => przywrocSlowo(slowo) }),
      !pominiete && talia.jestNowa(en) && el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Znam', onclick: () => znamZListy(slowo) }),
      !pominiete && el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Zresetuj', onclick: () => zresetujSlowo(slowo) }),
      el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Zgłoś błąd', onclick: () => zglosBlad(slowo) }),
    ),
  )
}

function odswiezSlowka() {
  const lista = $('lista-slow')
  if (!lista) return
  const wynik = talia.szukajSlow(indeks, szukane)
  lista.replaceChildren(...wynik.slowa.map(wierszSlowa))
  $('licznik-slow').textContent = wynik.wszystkie
    ? `pokazano ${wynik.slowa.length} z ${wynik.wszystkie}`
    : 'nic nie znaleziono'
}

function sekcjaSlowek() {
  return el(
    'div',
    { klasa: 'sekcja' },
    el('h3', { tekst: 'Słówka' }),
    el('input', {
      klasa: 'pole-szukania',
      id: 'szukaj',
      type: 'search',
      value: szukane,
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
      autocorrect: 'off',
      'aria-label': 'Szukaj słowa',
      placeholder: 'Szukaj po angielsku lub po polsku',
      oninput: (e) => {
        szukane = e.target.value
        odswiezSlowka()
      },
    }),
    el('p', { klasa: 'przygaszony maly', id: 'licznik-slow', style: 'margin-top: 8px' }),
    el('div', { klasa: 'lista-slow', id: 'lista-slow' }),
  )
}

async function kopiujZgloszenia() {
  const tresc = JSON.stringify(stan.zgloszenia, null, 2)
  try {
    await navigator.clipboard.writeText(tresc)
    toast('Lista skopiowana do schowka.')
    return
  } catch (blad) {
    // Schowek bywa niedostepny bez HTTPS albo bez uprawnien: wtedy tekst do recznego skopiowania.
    const pole = el('textarea', { klasa: 'pole', rows: '6', readonly: true, 'aria-label': 'Zgłoszone błędy' })
    pole.value = tresc
    $('zgloszenia-tekst')?.replaceChildren(pole)
    pole.focus()
    pole.select()
    toast(`Schowek niedostępny (${opis(blad)}). Skopiuj zaznaczony tekst.`, 'wazny')
  }
}

function wyczyscZgloszenia() {
  if (!confirm(`Usunąć ${liczebnik(stan.zgloszenia.length, ['zgłoszenie', 'zgłoszenia', 'zgłoszeń'])}?`)) return
  stan.zgloszenia = []
  zapiszStan()
  odswiezMenu()
}

function sekcjaZgloszen() {
  if (!stan.zgloszenia.length) return false
  return el(
    'div',
    { klasa: 'sekcja' },
    el('h3', { tekst: 'Zgłoszone błędy' }),
    stan.zgloszenia.map((z) => el('p', { klasa: 'maly', tekst: `${z.w} - ${z.pl}` })),
    el(
      'div',
      { klasa: 'rzad' },
      el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Kopiuj listę', onclick: kopiujZgloszenia }),
      el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Wyczyść', onclick: wyczyscZgloszenia }),
    ),
    el('div', { id: 'zgloszenia-tekst' }),
  )
}

// Ekran "Jak sie uczyc" (D3): krotki protokol, kazda zasada z badania. Tresc jest stala i lezy tutaj,
// bo apka nie pobiera niczego z sieci.
const ZASADY_NAUKI = [
  [
    'Codziennie po 15 minut, nie dwie godziny w niedzielę.',
    'Nauka rozłożona w czasie daje trzy razy większy efekt niż to samo w jednym posiedzeniu. Sufit to 30 minut, potem robisz sobie krzywdę, nie postęp.',
  ],
  [
    'Nowe słowa wieczorem, zaległe rano.',
    'Sen zaraz po poznaniu nowego słowa podwaja to, ile z niego zostanie po pół roku. Dlatego nowe wprowadzaj 1-3 godziny przed snem, a rano nadrabiaj to, co czeka.',
  ],
  [
    'Na karcie mówienia mów na głos, nie w myślach.',
    'Wypowiedzenie słowa zapamiętuje się mierzalnie lepiej niż przeczytanie go w głowie. Przy okazji ćwiczysz aparat mowy, co jest całym sensem tej apki.',
  ],
  [
    'Najpierw spróbuj sobie przypomnieć, nawet gdy nie wiesz.',
    'Nieudana próba plus poprawna odpowiedź uczy więcej niż samo patrzenie na odpowiedź. Dlatego apka nie pokazuje tłumaczenia od razu i nie da się tego wyłączyć.',
  ],
  [
    '„Prawie” to sukces, nie porażka.',
    'Jeśli słowo wróciło po chwili wahania, to jest „Prawie”. Fałszywe „Umiem” psuje harmonogram bardziej niż szczere „Nie umiem”: apka pokaże Ci to słowo za trzy tygodnie, kiedy go już nie będzie w głowie.',
  ],
  [
    'Słowa, które znasz na sto procent, wyrzucaj przyciskiem „Pomijam”.',
    'To nie jest oszukiwanie. Każde takie słowo zabrałoby Ci kilkanaście powtórek w ciągu roku. Zawsze możesz je przywrócić w Menu > Słówka.',
  ],
  [
    'Po przerwie nie nadrabiaj wszystkiego naraz.',
    'Apka sama wstrzyma nowe słowa i poda zaległe porcjami, od tych najbliższych zapomnienia. Przerwa nic nie psuje, o ile wrócisz.',
  ],
]

function trescJakSieUczyc() {
  return [
    el('p', { klasa: 'nauka-wstep', tekst: 'Siedem zasad, każda z badań. Reszta to szczegóły.' }),
    // Rozwiniete, a nie zagniezdzone: `el` splaszcza dzieci tylko o jeden poziom.
    ...ZASADY_NAUKI.map(([tytul, tresc], i) =>
      el(
        'div',
        { klasa: `nauka-punkt${i === 0 ? ' pierwszy' : ''}` },
        el('div', { klasa: 'nauka-tytul' }, el('span', { klasa: 'nauka-numer', tekst: `${i + 1}.` }), el('span', { tekst: tytul })),
        el('p', { klasa: 'nauka-tresc', tekst: tresc }),
      ),
    ),
    el(
      'div',
      { klasa: 'sekcja' },
      el('h3', { tekst: 'Czego się spodziewać' }),
      el('p', {
        klasa: 'nauka-tresc rowno',
        tekst:
          'Oxford 3000 to około 90-95% słów, które słyszysz w zwykłej rozmowie, w filmie i w serialu. To bardzo dużo, ale to nie jest jeszcze płynność: swobodne rozumienie wszystkiego wymaga dwa razy większego słownictwa. Traktuj tę talię jako fundament, po którym rozmowa przestaje być zgadywanką.',
      }),
      el(
        'p',
        { klasa: 'nauka-tresc rowno', style: 'margin-top: 10px' },
        'Przy 10 nowych słowach dziennie cała talia zajmie około roku, a przy Twoim tempie odsiewania znanych słów sporo mniej. Liczbę, która naprawdę pokazuje postęp, znajdziesz w statystykach: ',
        el('b', { tekst: 'utrwalone' }),
        ' to słowa, które apka zaplanowała na co najmniej miesiąc do przodu, bo tyle wytrzymały w Twojej pamięci.',
      ),
    ),
  ]
}

function pokazJakSieUczyc() {
  zamknijMenu()
  const jak = $('jak')
  jak.replaceChildren(
    el('div', { klasa: 'nakladka-tlo', onclick: zamknijJak }),
    el(
      'section',
      { klasa: 'arkusz', role: 'dialog', 'aria-label': 'Jak się uczyć' },
      el(
        'header',
        { klasa: 'arkusz-naglowek' },
        el('h2', { tekst: 'Jak się uczyć' }),
        el('button', { klasa: 'zamknij', type: 'button', 'aria-label': 'Zamknij', tekst: '✕', onclick: zamknijJak }),
      ),
      el('div', { klasa: 'arkusz-tresc' }, trescJakSieUczyc()),
    ),
  )
  jak.hidden = false
}

function zamknijJak() {
  $('jak').hidden = true
  $('jak').replaceChildren()
}

const sekcjaJakSieUczyc = () =>
  el(
    'div',
    { klasa: 'sekcja' },
    el('h3', { tekst: 'Jak się uczyć' }),
    el('p', { klasa: 'opis', tekst: 'Siedem zasad, każda z badań: ile, kiedy, w jakiej kolejności i czego nie robić.' }),
    el(
      'div',
      { klasa: 'przyciski', style: 'margin-top: 10px' },
      el('button', { klasa: 'przycisk', id: 'otworz-jak', type: 'button', tekst: 'Otwórz protokół', onclick: pokazJakSieUczyc }),
    ),
  )

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
      el(
        'div',
        { klasa: 'przyciski', style: 'margin-top: 8px' },
        seria && cofniecie && el('button', { klasa: 'przycisk', type: 'button', tekst: 'Cofnij ostatnią ocenę', onclick: cofnijOcene }),
        przyciskTrudnych('przycisk'),
        el('button', { klasa: 'przycisk glowny', type: 'button', tekst: 'Dodaj słówka', onclick: () => pokazDodawanie() }),
      ),
    ),
    // Kolejnosc sekcji wedlug tego, jak czesto sie ich szuka: statystyki, slowka, jak sie uczyc,
    // ustawienia, kopia, offline, zrodla. Zgloszone bledy sa warunkowe i stoja przy slowkach, ktorych
    // dotycza, wiec nie rozbijaja tej kolejnosci.
    sekcjaStatystyk(),
    sekcjaSlowek(),
    sekcjaZgloszen(),
    sekcjaJakSieUczyc(),
    sekcjaUstawien(),
    sekcjaKopii(),
    el('div', { klasa: 'sekcja', id: 'sekcja-offline' }, trescOffline()),
    sekcjaZrodel(),
    // replaceChildren zamienia false na tekst "false", wiec puste sekcje odpadaja przed wstawieniem.
  ].filter(Boolean)
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
  odswiezSlowka()
  sprawdzOffline()
}

function zamknijMenu() {
  $('menu').hidden = true
}

// Odswiezenie tylko tresci, zeby panel nie wjezdzal ponownie i zostala pozycja przewiniecia.
function odswiezMenu() {
  if ($('menu').hidden) return
  const tresc = $('menu').querySelector('.arkusz-tresc')
  if (!tresc) return
  const przewiniecie = tresc.scrollTop
  tresc.replaceChildren(...trescMenu())
  odswiezSlowka()
  tresc.scrollTop = przewiniecie
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
  const opisStanu = (s, liczbaSlow) => `${liczebnik(liczbaSlow, ['słowo', 'słowa', 'słów'])}, ${Object.keys(s.karty).length} kart, ${s.expRazem} pkt`
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
  pokazStart()
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
    if (ekran === 'bez-slow' || ekran === 'pusto' || ekran === 'start') pokazStart()
  } finally {
    zapisujeSlowka = false
  }
}

// Zdarzenia globalne

function klawisze(e) {
  if (e.target.closest?.('textarea, input')) return
  if (e.key === 'Escape') {
    zakonczCelebracje()
    zamknijMenu()
    zamknijJak()
    if (!$('dodawanie').hidden) zamknijDodawanie()
    return
  }
  if (!$('menu').hidden || !$('jak').hidden || !$('dodawanie').hidden || ekran !== 'karta') return
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
  // Pelnoekranowa celebracja awansu znika po tapnieciu w dowolne miejsce.
  $('swieto').addEventListener('click', zamknijSwieto)
  document.addEventListener('keydown', klawisze)
  // Bez nasluchu touchstart iOS nie pokazuje stanu :active na przyciskach.
  document.addEventListener('touchstart', () => {}, { passive: true })
  // Szczypanie blokujemy tylko nad karta, zeby gest oceny nie zamienil sie w powiekszenie. Na pozostalych
  // ekranach powiekszanie tekstu zostaje dostepne (WCAG 1.4.4).
  document.addEventListener('gesturestart', (e) => {
    if (e.target?.closest?.('#karta')) e.preventDefault()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      // Odznaka na ikonie ustawiana przy wyjsciu z apki: liczba kart czekajacych na dzis.
      if (slowa.length) odswiezOdznake(podsumowanie().doZrobienia)
      return
    }
    // Apka z ekranu glownego potrafi wisiec w tle wiele dni: nowy dzien to nowa kopia dnia i nowa seria.
    magazyn.kopiaDzienna()
    odswiezGore()
    rejestracja?.update().catch(() => {})
    sprawdzOffline()
  })
  window.addEventListener('error', (e) => toast(`Błąd: ${e.message}`, 'blad'))
  window.addEventListener('unhandledrejection', (e) => toast(`Błąd: ${opis(e.reason)}`, 'blad'))
}

// Jednorazowa migracja: karty ocenione hurtem ("Znam już" po 8 dni) wrocilyby jednego dnia wielka fala,
// wiec przy pierwszym starcie po aktualizacji ich terminy dostaja mocniejszy rozrzut.
function rozprosStareTerminy() {
  if (stan.rozproszono === 1) return
  const { karty, przesuniete } = talia.rozprosTerminy(stan.karty)
  stan.karty = karty
  stan.rozproszono = 1
  zapiszStan()
  if (przesuniete) toast('Terminy powtórek rozłożone na kilka dni, żeby nie wróciły naraz.', 'wazny')
}

async function start() {
  const { stan: wczytany, ostrzezenie, pominiete, migracja } = magazyn.wczytaj()
  stan = wczytany
  ustawKomunikat('wczytanie', ostrzezenie)
  if (pominiete) toast(`${opisPominietych(pominiete)}.`, 'blad')
  magazyn.kopiaDzienna()
  rozprosStareTerminy()
  // Punkty przestaly byc poziomem gracza: dotychczasowe EXP zostaje jako "punkty łącznie", a licznik
  // tygodnia startuje od zera. Nic nie znika, ale uzytkownik ma sie o tym dowiedziec. Toast, a nie komunikat
  // na gorze ekranu, bo ten zaslonilby karte; pokazywany po rozproszeniu terminow, zeby go nie przykryl.
  if (migracja) {
    toast(
      `Poziom zastąpiła ranga z utrwalonych słów: Twoje ${stan.expRazem.toLocaleString('pl-PL')} punktów zostaje w statystykach jako "punkty łącznie", a licznik tygodnia startuje od zera.`,
      'wazny',
    )
  }
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
    pokazStart()
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
