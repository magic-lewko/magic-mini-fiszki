// Interfejs fiszek na telefon. Nauka to sam gest: karta, swipe w cztery strony, tapniecie odslania,
// dwukrotne cofa. Ekran nauki nie ma zadnego widocznego przycisku, gora to sam pasek postepu calej talii.
// Ekran wyboru, menu, gry, talie, dodawanie slowek, kopia zapasowa i stan offline sa poza nauka.
// Logika serii jest w talia.js, zapis w magazyn.js i baza.js, a logika gier w krzyzowka.js i literki.js.

import { nowaKarta, ocen, przypomnienie } from './fsrs.mjs'
import * as talia from './talia.js'
import * as magazyn from './magazyn.js'
import * as baza from './baza.js'
import { budujKolizje, kluczIndeksu } from './kolizje.js'
import * as krzyzowka from './krzyzowka.js'
import * as literki from './literki.js'
import { dopiszTalie, parsujWklejone, scal } from './slowka.js'
import { dodajPrzelacznik, wibruj } from './haptyka.js'
import { powiedz } from './mowa.js'

const DNI_DO_PRZYPOMNIENIA_O_KOPII = 7
const MAKS_BLEDOW_W_PODGLADZIE = 30
const SEKUNDY_NA_COFNIECIE = 6
const PODPOWIEDZ_POMIJANIA = 'Pominięte słowa nie wracają. Przywrócisz je w Menu > Słówka.'
const TEKST_ZAMROZENIA = 'Wczoraj było wolne, seria zostaje.'
// Podpis "Dotknij, aby odsłonić" stoi tylko na pierwszych kartach po instalacji i po samouczku.
const KART_ZE_WSKAZOWKA = 3
// Celebracja konca serii: 1,0-1,5 s, pomijalna tapnieciem.
const MS_CELEBRACJI_KONCA = 1200
// Czas wylotu karty musi zgadzac sie z --czas-wylot w styl.css (220 ms plus klatka zapasu).
const MS_WYLOTU = 240
const MS_WYLOTU_BEZ_RUCHU = 80
// Mikro-notka po ocenie obnizonej przez czas i blysk na krawedzi przy co piatej poprawnej karcie.
const MS_NOTKI = 900
const MS_BLYSKU = 300
// Literki: sukces to mikrocelebracja z palety v3 (300-400 ms), blad to samo drgniecie kafelkow.
const MS_SUKCESU_LITEREK = 400
const MS_DRGNIECIA = 260
// Wartownik w ukrytym polu krzyzowki: Backspace na pustym polu nie zawsze daje zdarzenie klawisza,
// ale skrocenie wartosci widac zawsze.
const WARTOWNIK_WPISU = ' '
// Trzy kanaly statusu: kolor (klasa), znak i kierunek wylotu karty. Kolor sam nie wystarczy (WCAG 1.4.1,
// ok. 8% mezczyzn ma zaburzenie widzenia barw).
const STATUSY = {
  1: { klasa: 'nie', ikona: '✗', etykieta: 'Nie umiem', kierunek: 'lewo' },
  // Ocena 2 nie ma juz swojego gestu: powstaje po cichu z wolnej odpowiedzi albo po podpowiedzi,
  // wiec na ekranie wyglada jak zwykle "Umiem".
  2: { klasa: 'tak', ikona: '✓', etykieta: 'Umiem', kierunek: 'prawo' },
  3: { klasa: 'tak', ikona: '✓', etykieta: 'Umiem', kierunek: 'prawo' },
  // "Znam" na nowej karcie to tez sukces, wiec karta wylatuje w prawo jak przy "Umiem".
  4: { klasa: 'tak', ikona: '✓', etykieta: 'Znam', kierunek: 'prawo' },
}

// Podswietlenie kierunku w trakcie gestu (A): kolor i ikona statusu pojawiaja sie, zanim uzytkownik
// puisci palec. Gest w dol nie jest ocena, wiec ma wlasny, neutralny kanal.
const KIERUNKI_GESTU = {
  prawo: { klasa: 'tak', ikona: '✓', etykieta: 'Umiem' },
  lewo: { klasa: 'nie', ikona: '✗', etykieta: 'Nie umiem' },
  dol: { klasa: 'wyjscie', ikona: '🗑', etykieta: 'Wyrzucam' },
}

// Cztery strzalki samouczka gestow (A). Tekst interfejsu, wiec z polskimi znakami.
const GESTY_SAMOUCZKA = [
  ['→', 'Umiem'],
  ['←', 'Nie umiem'],
  ['↓', 'Wyrzucam słowo'],
]

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
let pominCelebracje = null
let czasCelebracji = 0
let samouczekOtwarty = false
let kartZeWskazowka = 0
// -Infinity, a nie 0: performance.now() zaraz po starcie apki jest male, wiec zero kazaloby uznac
// pierwsze tapniecie za drugie tapniecie z pary i zamiast odsloniecia probowaloby cofac ocene.
let ostatnieTapniecie = -Infinity
let czasOdsloniecia = 0
let czasyTempa = []
let czasNotki = 0
let czasBlysku = 0
let cofniecie = null
let cofniecieDo = 0
let czasCofniecia = 0
let poziomPodpowiedzi = null
let uzytoPodpowiedzi = false
let czasPodpowiedzi = 0
let odkryjOdRazu = false
let szukane = ''
// Stan otwartej gry (G). Gry nie dotykaja stan.karty ani terminow, wiec cala ich pamiec siedzi tutaj.
let gra = null
let nazwaTaliiRecznie = false
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

// Mikro-notka przy karcie: jedno zdanie na 900 ms, bez przyciskow i bez blokowania gestu (C).
function notka(tekst) {
  const n = $('notka')
  n.textContent = tekst
  n.hidden = false
  clearTimeout(czasNotki)
  czasNotki = setTimeout(() => {
    n.hidden = true
  }, MS_NOTKI)
}

// Blysk na krawedzi ekranu: mocny przy co piatej poprawnej karcie pod rzad (I), slabszy i w kolorze oceny
// przy kazdej zmianie karty. Na iPhonie gest nie moze zawibrowac, wiec zmiane karty potwierdza kolor.
function blysk(klasa = 'tak', mocny = true) {
  const b = $('blysk')
  b.hidden = false
  b.classList.remove('widoczny', 'slaby', 'blysk-tak', 'blysk-nie', 'blysk-wyjscie')
  void b.offsetWidth
  b.classList.add('widoczny', `blysk-${klasa}`)
  if (!mocny) b.classList.add('slaby')
  clearTimeout(czasBlysku)
  czasBlysku = setTimeout(() => {
    b.hidden = true
    b.classList.remove('widoczny')
  }, MS_BLYSKU)
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

// Gorny pasek: jedyny wskaznik postepu w calej apce (F).

const postepTalii = () => talia.postepTalii({ slowa, karty: stan.karty, wylaczoneTalie: stan.ustawienia.wylaczoneTalie })

// Pasek calej talii: wypelnienie to slowa poznane, jasniejszy segment to utrwalone (stabilnosc >= 30 dni).
// Bez cyfr i bez procentow: liczba stoi wylacznie na ekranie wyboru.
function odswiezPasekTalii() {
  const p = postepTalii()
  $('pasek-poznane').style.transform = `scaleX(${p.ulamekPoznanych})`
  $('pasek-utrwalone').style.transform = `scaleX(${p.ulamekUtrwalonych})`
  $('postep-talii').setAttribute(
    'aria-label',
    `Poznane ${p.poznane} z ${p.wszystkie} słów, utrwalone ${p.utrwalone}`,
  )
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
    zatrzymajTempo()
  }
  // W trakcie nauki gora nie ma nic do klikania (B): menu wraca dopiero na ekranie wyboru.
  $('menu-przycisk').hidden = nazwa === 'karta'
  // Na ekranie nauki karta siega do dolnej krawedzi ekranu (patrz "#aplikacja.nauka" w stylach).
  $('aplikacja').classList.toggle('nauka', nazwa === 'karta')
  odswiezPasekTalii()
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

// Wywolywane przy kazdej zmianie ekranu, zeby nie zostala celebracja zatrzymana w polowie.
const zakonczCelebracje = zakonczCelebracjeEkranu

// Tryb nadrabiania wynika z zaleglosci przed przycieciem sufitem, wiec liczymy go przed kazdym doborem kart.
function odswiezNadrabianie(teraz = new Date()) {
  const zaleglych = talia.liczbaZaleglych({
    slowa,
    karty: stan.karty,
    ustawienia: stan.ustawienia,
    teraz,
    pominiete: stan.pominiete,
    wylaczoneTalie: stan.ustawienia.wylaczoneTalie,
  })
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
  // Wylaczona talia znika z nauki i z gier jednym filtrem w silniku (H).
  wylaczoneTalie: stan.ustawienia.wylaczoneTalie,
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
    pokazWybor()
    return
  }
  seria = talia.nowaSeria(klucze)
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
  const klucze = talia.trudneKarty({
    slowa,
    karty: stan.karty,
    ustawienia: stan.ustawienia,
    pominiete: stan.pominiete,
    wylaczoneTalie: stan.ustawienia.wylaczoneTalie,
  })
  if (!klucze.length) {
    toast('Brak trudnych słów.')
    return
  }
  seria = talia.nowaSeria(klucze, true)
  pokazKarte()
}

function przyciskTrudnych(klasa = 'przycisk') {
  const ile = talia.liczbaTrudnych({ slowa, karty: stan.karty, pominiete: stan.pominiete, wylaczoneTalie: stan.ustawienia.wylaczoneTalie })
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

// Chipy poziomu i czesci mowy siedza na odwrocie karty, mniejszym drukiem (B): przed odslonieciem
// niczego nie wnosza, a rozpraszaja.
function chipy(slowo, nowa) {
  const czesci = (slowo.czesci || []).map((c) => CZESCI_MOWY[c.toLowerCase()] || c).join(', ')
  return el(
    'div',
    { klasa: 'chipy male' },
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
  zatrzymajTempo()
  const nowa = talia.jestNowa(stan.karty[k])
  const karta = el('div', { klasa: `karta wjazd kierunek-${kierunek}`, id: 'karta' })
  karta.addEventListener('animationend', (e) => {
    if (e.target === karta) karta.classList.remove('wjazd')
  })

  if (kierunek === 'en') {
    karta.append(
      el('div', { klasa: 'slowo', tekst: slowo.w }),
      slowo.ipa ? el('div', { klasa: 'ipa', tekst: `/${slowo.ipa}/` }) : '',
      przyciskGlosnika(slowo.w),
      el(
        'div',
        { klasa: 'odkrycie' },
        el('div', { klasa: 'tlumaczenie', tekst: slowo.pl }),
        slowo.zdanie && el('div', { klasa: 'zdanie', tekst: slowo.zdanie }),
        slowo.zdaniePl && el('div', { klasa: 'zdanie-pl', tekst: slowo.zdaniePl }),
        chipy(slowo, nowa),
      ),
    )
  } else {
    const pole = el('div', { klasa: 'podpowiedz', id: 'podpowiedz-pole', 'aria-label': 'Podpowiedź' })
    rysujPodpowiedz(pole, slowo)
    karta.append(
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
        chipy(slowo, nowa),
      ),
    )
  }
  // append zamienia false na tekst "false", wiec puste pozycje odpadaja przed wstawieniem.
  karta.append(
    ...[
      seria.trening && el('div', { klasa: 'trening-znacznik', tekst: 'Trening: terminy bez zmian' }),
      kartZeWskazowka < KART_ZE_WSKAZOWKA && el('div', { klasa: 'wskazowka', tekst: 'Dotknij, aby odsłonić' }),
      // Krzyzyk konczy nauke. Stoi na karcie, a nie w pasku u gory: pasek ma zostac czystym postepem,
      // a 44 px celu dotyku nie zmiescilo by sie tam bez spychania karty w dol.
      el('button', {
        klasa: 'wyjdz bez-odsloniecia',
        type: 'button',
        'aria-label': 'Zakończ naukę',
        tekst: '✕',
        onclick: wyjdzDoWyboru,
      }),
      // Kosz: slowo znane na sto procent ("map") wypada z nauki jednym tapnieciem, bez chodzenia
      // do Menu > Slowka. To samo robi gest w dol. Dwukrotne tapniecie w karte cofa.
      el('button', {
        klasa: 'kosz bez-odsloniecia',
        type: 'button',
        'aria-label': 'Znam na pewno, wyrzuć to słowo z nauki',
        tekst: '🗑',
        onclick: pomijajAktualna,
      }),
    ].filter(Boolean),
  )
  podswietlKierunek('')
  kartZeWskazowka += 1
  dodajPrzelacznik(karta)
  podepnijGest(karta)
  pokazEkran('karta', karta)
  // Po cofnieciu oceny karta wraca od razu odkryta, bez wibracji i bez ponownej wymowy.
  if (odkryjOdRazu) {
    odkryjOdRazu = false
    odkryta = true
    karta.classList.add('odkryta')
    zacznijTempo(karta)
  }
  odswiezAkcje()
  startKarty = performance.now()
  if (kierunek === 'pl') {
    czasPodpowiedzi = setTimeout(() => {
      const przycisk = $('przycisk-podpowiedzi')
      if (przycisk) przycisk.hidden = false
    }, talia.SEKUNDY_DO_PODPOWIEDZI * 1000)
  }
  // Samouczek gestow raz po aktualizacji: bez niego ekran bez przyciskow nie tlumaczy sie sam.
  if (!stan.ustawienia.samouczekGestow) pokazSamouczek()
}

function rysujPodpowiedz(cel, slowo) {
  if (!cel) return
  const poziom = poziomPodpowiedzi ?? stan.ustawienia.podpowiedzMowienie
  const tekst = talia.podpowiedz(slowo.w, poziom)
  cel.replaceChildren(...(tekst ? tekst.split('   ').map((wyraz) => el('span', { tekst: wyraz })) : []))
}

// Ekran nauki nie ma zadnego widocznego przycisku (B). Te przyciski sa prawdziwe, maja etykiety i dzialaja
// z klawiatury, ale widzi je tylko czytnik ekranu: bez nich apka sterowana samym gestem bylaby dla
// VoiceOvera nieobslugiwalna.
const ukrytyPrzycisk = (tekst, dzialanie) =>
  el('button', { klasa: 'tylko-czytnik', type: 'button', tekst, onclick: dzialanie })

function odswiezAkcje() {
  const akcje = $('akcje')
  if (ekran !== 'karta' || !seria) {
    akcje.hidden = true
    akcje.replaceChildren()
    return
  }
  const nowa = talia.jestNowa(stan.karty[talia.aktualnaKarta(seria)])
  akcje.hidden = false
  akcje.replaceChildren(
    ...[
      !odkryta && ukrytyPrzycisk('Odsłoń kartę', odslon),
      // Oceny sa dostepne od razu, tak samo jak gest: czytnik ekranu nie musi najpierw odslaniac karty.
      ukrytyPrzycisk('Nie umiem', () => ocenKarte(1)),
      ukrytyPrzycisk('Umiem', () => ocenKarte(3)),
      nowa && ukrytyPrzycisk('Znam', () => ocenKarte(4)),
      ukrytyPrzycisk('Pomijam to słowo', pomijajAktualna),
      // Gest cofa bezterminowo, wiec czytnik ekranu tez: 6 sekund dotyczy tylko podpowiedzi na ekranie.
      !!cofniecie && ukrytyPrzycisk('Cofnij ostatnią ocenę', cofnijOcene),
      ukrytyPrzycisk('Zakończ naukę', wyjdzDoWyboru),
    ].filter(Boolean),
  )
}

// Czas odpowiedzi jako sygnal (C): ramka karty zmienia kolor 0-3 s / 3-8 s / powyzej 8 s. Liczy sie od
// odsloniecia, bo dopiero wtedy uzytkownik naprawde szuka odpowiedzi. Bez cyfr i bez tykania.
function zacznijTempo(karta) {
  zatrzymajTempo()
  czasOdsloniecia = performance.now()
  czasyTempa = [
    setTimeout(() => karta.classList.add('tempo-srednio'), talia.SEKUNDY_TEMPA_SREDNIEGO * 1000),
    setTimeout(() => karta.classList.add('tempo-wolno'), talia.SEKUNDY_TEMPA_WOLNEGO * 1000),
  ]
}

function zatrzymajTempo() {
  for (const t of czasyTempa) clearTimeout(t)
  czasyTempa = []
  czasOdsloniecia = 0
}

// Sekundy od odsloniecia do oceny. Karta oceniona bez odsloniecia ("Znam") nie ma czasu odpowiedzi.
const czasOdpowiedzi = () => (czasOdsloniecia ? (performance.now() - czasOdsloniecia) / 1000 : 0)

function odslon() {
  if (ekran !== 'karta' || odkryta || zajete) return
  odkryta = true
  const karta = $('karta')
  karta.classList.add('odkryta')
  wibruj('odsloniecie')
  if (stan.ustawienia.autowymowa) powiedz(poId.get(talia.rozbierzKlucz(talia.aktualnaKarta(seria)).id)?.w)
  odswiezAkcje()
  zacznijTempo(karta)
}

// Gest w dol konczy nauke i wraca na ekran wyboru. Dziala zawsze, takze przed odslonieciem karty.
function wyjdzDoWyboru() {
  if (ekran !== 'karta' || zajete) return
  wylot(null, 'dol', () => {
    seria = null
    pokazWybor()
  })
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
  const pierwszaEkspozycja = talia.jestNowa(przed)
  // "Znam" ma sens tylko na pierwszej ekspozycji slowa. Pozostale oceny dzialaja takze na karcie
  // zakrytej: gest ma konczyc slowo od razu, bez tapniecia na odsloniecie.
  if (ocena === 4 && !pierwszaEkspozycja) return
  const teraz = new Date()
  // Czas odpowiedzi liczony od odsloniecia: powyzej 8 s "Umiem" zapisuje sie jako slabsze trafienie.
  // Tak samo dziala podpowiedz - zamiast blokowac ocene (nie ma juz "Prawie", w ktore mozna by ja zbic),
  // obniza ja po cichu. Pierwsza ekspozycja i trening sa z tego wylaczone: tam czas nic nie mowi o wiedzy.
  const czas = talia.czasKarty(czasOdpowiedzi())
  const poCzasie = talia.ocenaPoCzasie({ ocena, sekundy: czas, nowa: pierwszaEkspozycja, trening: seria.trening })
  const poPodpowiedzi = uzytoPodpowiedzi && !pierwszaEkspozycja && !seria.trening && poCzasie.ocena === 3
  const ocenaKoncowa = poPodpowiedzi ? 2 : poCzasie.ocena
  zatrzymajTempo()
  // W treningu ocena liczy sie do punktow, combo, celu dnia i streaka, ale nie rusza karty ani terminu.
  let nowa = null
  if (!seria.trening) {
    try {
      nowa = ocenionaKarta(przed || nowaKarta(teraz.toISOString()), ocenaKoncowa, teraz, k)
    } catch (blad) {
      // Karta, ktorej nie da sie ocenic, zostaje bez zmian, zeby do zapisu nie trafil NaN.
      toast(`Nie udało się ocenić karty: ${opis(blad)}`, 'blad')
      pominAktualna()
      return
    }
  }
  // Migawka do cofniecia dwukrotnym tapnieciem: wszystko, co ta ocena zmienia. Obiekty stanu sa
  // niemutowalne, wiec starcza zapamietanie referencji.
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
  seria = talia.poOcenie(seria, ocenaKoncowa, noweSlowo === 1)
  const zdobyte = seria.exp - poprzedniaSeria.exp
  stan.expRazem += zdobyte
  stan.historia = talia.dopiszDzien(stan.historia, { oceny: 1, nowe: noweSlowo, exp: zdobyte, sekundy, czas }, teraz)
  zapiszStan()
  cofniecie = migawka

  const koniec = talia.koniecSerii(seria)
  if (koniec) wibruj('koniec')
  else if (seria.bonus) wibruj('combo')
  else wibruj({ 1: 'nieUmiem', 2: 'prawie' }[ocenaKoncowa] || 'umiem')
  if (dzien.zamrozono) toast(TEKST_ZAMROZENIA)
  // Co piata poprawna karta pod rzad: mocny blysk zamiast liczby punktow (I). Poza tym kazda zmiana karty
  // dostaje slaby blysk w kolorze oceny - to jedyne potwierdzenie, jakie da sie dac przy gescie.
  if (seria.bonus) blysk(status?.klasa || 'tak')
  else blysk(status?.klasa || 'tak', false)
  odswiezPasekTalii()
  const leech = nowa && talia.czyPanelLeecha(nowa) ? k : null
  wylot(STATUSY[ocenaKoncowa], STATUSY[ocenaKoncowa].kierunek, () => {
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
    odswiezPasekTalii()
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
  odswiezPasekTalii()
  // Pominiecie nie jest ocena, wiec karta odchodzi bez koloru i bez kierunku: sam zanik.
  wylot(null, '', () => {
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
  // Ten sam straznik co przy odslonieciu i ocenie: w trakcie wylotu karty jest juz zaplanowane przejscie
  // dalej, wiec cofniecie w tym oknie urwaloby serie i zapisalo stan sprzed oceny jako koniec.
  if (zajete) return
  if (!cofniecie) {
    if (ekran === 'karta') notka('Nie ma czego cofnąć')
    return
  }
  const m = cofniecie
  // Pominiecie tworzy nowa mape, ocena zostawia te sama referencje: stad wiadomo, co wlasciwie cofamy.
  const byloPominiecie = m.pominiete !== stan.pominiete
  zapomnijCofniecie()
  if (m.karta === undefined) delete stan.karty[m.klucz]
  else stan.karty[m.klucz] = m.karta
  stan.expRazem = m.expRazem
  stan.streak = m.streak
  stan.dzis = m.dzis
  stan.historia = m.historia
  stan.pominiete = m.pominiete
  seria = m.seria
  zapiszStan()
  zamknijMenu()
  odkryjOdRazu = m.odkryta
  pokazKarte()
  // pokazKarte zeruje uzycie podpowiedzi, wiec przywracamy je po nim: inaczej cofniecie zdejmowaloby
  // blokade oceny "Umiem" i dalo sie nia obejsc regule z A5.
  uzytoPodpowiedzi = m.uzytoPodpowiedzi
  odswiezAkcje()
  toast(byloPominiecie ? 'Cofnięto pominięcie.' : 'Cofnięto ostatnią ocenę.')
}

const malyRuch = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Wylot karty niesie wynik: leci w strone gestu, z rotacja. Do tego dochodzi kolor obrysu i znak na
// srodku karty, wiec przy wylaczonym ruchu informacja zostaje w calosci (I: zamiast ruchu kolor
// i przezroczystosc, czasy do 80 ms).
function wylot(status, kierunek, potem) {
  zajete = true
  $('akcje').replaceChildren()
  zatrzymajTempo()
  const karta = $('karta')
  if (karta) {
    // Transformacji nie kasujemy: animacja wylotu ma ruszyc z miejsca, w ktorym karta stoi pod palcem.
    podswietlKierunek('')
    karta.classList.remove('wjazd', 'ciagniecie', 'prog')
    for (const nazwa of Object.keys(KIERUNKI_GESTU)) karta.classList.remove(`gest-${nazwa}`)
    karta.classList.add(kierunek ? `wylot-${kierunek}` : 'wylot-cicho')
    if (status) {
      karta.classList.add(`wynik-${status.klasa}`)
      karta.append(el('div', { klasa: 'wynik', 'aria-hidden': 'true', tekst: status.ikona }))
    }
  }
  setTimeout(() => {
    zajete = false
    potem()
  }, malyRuch() ? MS_WYLOTU_BEZ_RUCHU : MS_WYLOTU)
}

// Gesty w cztery strony (A). Karta podaza za palcem w obu osiach i obraca sie lekko przy ruchu poziomym.
// Po przekroczeniu progu (90 px w poziomie, 80 px w pionie albo szybki flick) kierunek podswietla sie
// kolorem i ikona statusu, jeszcze zanim uzytkownik puisci palec: to jedyna informacja o tym, co robi.
// Prawo "Umiem", lewo "Nie umiem", gora "Prawie", dol wyjscie z sesji. Kazdy z nich dziala takze na
// karcie zakrytej. Ponizej PROG_RUCHU puszczenie palca liczy sie jak tapniecie.
// Znacznik kierunku stoi nad karta (w #aplikacja), a nie w niej: karta odjezdza za palcem, a status
// ma zostac na srodku ekranu az do puszczenia palca.
function podswietlKierunek(kierunek) {
  const z = $('gest-znacznik')
  if (!z) return
  const k = KIERUNKI_GESTU[kierunek]
  z.querySelector('.gest-ikona').textContent = k ? k.ikona : ''
  z.querySelector('.gest-podpis').textContent = k ? k.etykieta : ''
  z.className = k ? `gest-znacznik widoczny ${k.klasa}` : 'gest-znacznik'
}

function podepnijGest(karta) {
  let dotyk = null

  const podswietl = (kierunek) => {
    const k = KIERUNKI_GESTU[kierunek]
    karta.classList.toggle('prog', !!k)
    for (const nazwa of Object.keys(KIERUNKI_GESTU)) karta.classList.toggle(`gest-${nazwa}`, nazwa === kierunek)
    podswietlKierunek(kierunek)
  }

  // Mikro-reakcja z I: po przekroczeniu progu karta "zaskakuje" o 1,02. Skala siedzi w tej samej
  // transformacie, co przesuniecie, bo ta podaza za palcem i nadpisalaby klase.
  const przesun = (dx, dy, naProgu = false) => {
    if (!dx && !dy) {
      karta.style.transform = ''
      return
    }
    karta.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.04}deg)${naProgu ? ' scale(1.02)' : ''}`
  }

  const wyczysc = () => {
    podswietl('')
    karta.classList.remove('ciagniecie')
    przesun(0, 0)
  }

  karta.addEventListener('pointerdown', (e) => {
    if (dotyk || zajete || (e.pointerType === 'mouse' && e.button !== 0)) return
    ignorujKlik = false
    dotyk = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      t: e.timeStamp,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      ciagnie: false,
    }
  })

  karta.addEventListener('pointermove', (e) => {
    if (!dotyk || e.pointerId !== dotyk.id) return
    const dx = e.clientX - dotyk.x0
    const dy = e.clientY - dotyk.y0
    if (!dotyk.ciagnie && Math.hypot(dx, dy) > talia.PROG_RUCHU && !zajete) {
      dotyk.ciagnie = true
      karta.classList.remove('wjazd')
      karta.classList.add('ciagniecie')
      try {
        karta.setPointerCapture(e.pointerId)
      } catch {
        // bez przechwycenia gest dziala, tylko mysz moze zgubic karte poza jej obszarem
      }
    }
    const dt = e.timeStamp - dotyk.t
    if (dt > 0) {
      dotyk.vx = 0.8 * ((e.clientX - dotyk.x) / dt) + 0.2 * dotyk.vx
      dotyk.vy = 0.8 * ((e.clientY - dotyk.y) / dt) + 0.2 * dotyk.vy
    }
    dotyk.x = e.clientX
    dotyk.y = e.clientY
    dotyk.t = e.timeStamp
    dotyk.dx = dx
    dotyk.dy = dy
    if (!dotyk.ciagnie) return
    // Podswietlenie liczy sie z samej drogi, bez flicka: ma pokazywac stan "puszczam teraz i to sie stanie".
    const kierunek = talia.kierunekGestu({ dx, dy })
    const aktywny = talia.gestDozwolony(kierunek) ? kierunek : ''
    przesun(dx, dy, !!aktywny)
    podswietl(aktywny)
  })

  const puszczenie = (e, anulowane) => {
    if (!dotyk || e.pointerId !== dotyk.id) return
    const { ciagnie, dx, dy, t } = dotyk
    // zatrzymanie palca przed puszczeniem to nie flick
    const swiezy = e.timeStamp - t <= 100
    const kierunek = talia.kierunekGestu({ dx, dy, vx: swiezy ? dotyk.vx : 0, vy: swiezy ? dotyk.vy : 0 })
    dotyk = null
    if (!ciagnie) return
    ignorujKlik = true
    if (!anulowane && talia.gestDozwolony(kierunek)) {
      podswietl('')
      karta.classList.remove('ciagniecie')
      // Dol to kosz: slowo znane na pewno wypada z nauki. Z sesji wychodzi sie krzyzykiem u gory.
      if (kierunek === 'dol') {
        pomijajAktualna()
        return
      }
      ocenKarte(talia.oceneZGestu(kierunek))
      return
    }
    // Ponizej progu karta wraca na srodek.
    podswietl('')
    karta.classList.remove('ciagniecie')
    karta.style.transition = 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'
    przesun(0, 0)
    setTimeout(() => {
      karta.style.transition = ''
    }, 240)
  }
  karta.addEventListener('pointerup', (e) => puszczenie(e, false))
  karta.addEventListener('pointercancel', (e) => {
    puszczenie(e, true)
    wyczysc()
  })

  // Tapniecie w przelacznik haptyki wyplywa tu jako jedno klikniecie. Pierwsze tapniecie dziala od razu
  // (odsloniecie) i na nic nie czeka; drugie w ciagu 280 ms cofa ostatnia ocene.
  karta.addEventListener('click', (e) => {
    if (ignorujKlik) {
      ignorujKlik = false
      return
    }
    if (e.target.closest('.glosnik, .bez-odsloniecia')) return
    const teraz = performance.now()
    const dwukrotne = teraz - ostatnieTapniecie < talia.MS_DWUKROTNEGO_TAPNIECIA
    ostatnieTapniecie = teraz
    if (dwukrotne) {
      ostatnieTapniecie = -Infinity
      cofnijOcene()
      return
    }
    odslon()
  })
}

const podsumowanie = (teraz = new Date()) => talia.podsumowanieDnia(opcjeDoboru(teraz))

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

const kafelekPrzyrostu = (liczba, podpis, klasa = '') =>
  el('div', { klasa: `przyrost ${klasa}` }, el('span', { klasa: 'przyrost-liczba', tekst: String(liczba) }), podpis)

// Samouczek gestow (A): raz po aktualizacji, ponownie z menu ("Gesty"). Zamyka go tapniecie w dowolne
// miejsce nakladki, wiec pierwszy gest uzytkownika trafia w karte dopiero po jej zamknieciu.
function pokazSamouczek() {
  if (samouczekOtwarty) return
  zamknijMenu()
  const cel = $('samouczek')
  cel.replaceChildren(
    el(
      'div',
      { klasa: 'samouczek-tresc', role: 'dialog', 'aria-label': 'Gesty' },
      el('div', { klasa: 'samouczek-nagl', tekst: 'Przesuń kartę' }),
      el(
        'div',
        { klasa: 'samouczek-siatka' },
        GESTY_SAMOUCZKA.map(([strzalka, podpis]) =>
          el(
            'div',
            { klasa: 'samouczek-gest' },
            el('span', { klasa: 'samouczek-strzalka', 'aria-hidden': 'true', tekst: strzalka }),
            el('span', { klasa: 'samouczek-podpis', tekst: podpis }),
          ),
        ),
      ),
      el('p', { klasa: 'samouczek-opis', tekst: 'Gest działa od razu. Tapnięcie odsłania, dwukrotne cofa. Wyjście krzyżykiem.' }),
      el('button', { klasa: 'przycisk glowny', id: 'samouczek-ok', type: 'button', tekst: 'Zaczynamy' }),
    ),
  )
  cel.hidden = false
  samouczekOtwarty = true
}

// Nakladka znika juz przy dotknieciu, zeby zamykal ja takze pierwszy gest. Klikniecie z tego samego
// tapniecia trafiloby wtedy w karte pod spodem i odslonilo ja, wiec pochlaniamy je na 400 ms.
function zamknijSamouczekTapnieciem(e) {
  if (!samouczekOtwarty) return
  e.preventDefault()
  zamknijSamouczek()
  const pochlon = (klikniecie) => {
    klikniecie.stopPropagation()
    klikniecie.preventDefault()
  }
  document.addEventListener('click', pochlon, { capture: true, once: true })
  setTimeout(() => document.removeEventListener('click', pochlon, { capture: true }), 400)
}

function zamknijSamouczek() {
  if (!samouczekOtwarty) return
  samouczekOtwarty = false
  $('samouczek').hidden = true
  $('samouczek').replaceChildren()
  // Po samouczku podpis "Dotknij, aby odsłonić" wraca na trzy karty.
  kartZeWskazowka = 0
  if (!stan.ustawienia.samouczekGestow) {
    stan.ustawienia = { ...stan.ustawienia, samouczekGestow: true }
    zapiszStan()
  }
}

// Ekran konca serii (D): najwyzej trzy liczby i przyciski. Zadnych akapitow, procentow ani punktow.
// Przyciski to juz ekran wyboru, wiec po serii uzytkownik od razu widzi, co moze robic dalej (E).
function podsumowanieSerii(teraz) {
  const trening = seria.trening
  const przybylo = seria.nowe || seria.oczyszczone
  const podpisPrzybylo = seria.nowe
    ? formaSlowa(seria.nowe, ['nowe słowo', 'nowe słowa', 'nowych słów'])
    : formaSlowa(seria.oczyszczone, ['powtórzona karta', 'powtórzone karty', 'powtórzonych kart'])
  const dzis = talia.ocenioneDzis(stan.historia, teraz)
  const jutro = talia.prognozaNaJutro({
    slowa,
    karty: stan.karty,
    ustawienia: stan.ustawienia,
    teraz,
    pominiete: stan.pominiete,
    wylaczoneTalie: stan.ustawienia.wylaczoneTalie,
  })
  return el(
    'div',
    { klasa: 'koniec' },
    el('h2', { tekst: trening ? 'Trening ukończony' : 'Seria ukończona' }),
    el(
      'div',
      { klasa: `przyrosty ${jutro.znosna ? 'trzy' : 'dwa'}` },
      kafelekPrzyrostu(przybylo, podpisPrzybylo, 'utrwalone'),
      kafelekPrzyrostu(dzis, formaSlowa(dzis, ['karta dziś', 'karty dziś', 'kart dziś'])),
      jutro.znosna && kafelekPrzyrostu(jutro.liczba, formaSlowa(jutro.liczba, ['karta jutro', 'karty jutro', 'kart jutro'])),
    ),
  )
}

function pokazKoniec() {
  const teraz = new Date()
  // Sesja liczy sie do odzyskania serii: dwie sesje w ciagu 48 h od przerwy oddaja dni sprzed niej.
  stan.streak = talia.zaliczSesje(stan.streak, teraz).streak
  zapiszStan()
  const blok = podsumowanieSerii(teraz)
  wibruj('koniec')
  pokazWybor(blok)
  // Celebracja konca serii: 1,0-1,5 s, w kazdej chwili pomijalna tapnieciem.
  const sekcja = $('scena').querySelector('.ekran')
  if (!sekcja) return
  sekcja.classList.add('swietuje')
  pominCelebracje = () => {
    clearTimeout(czasCelebracji)
    sekcja.classList.remove('swietuje')
  }
  czasCelebracji = setTimeout(zakonczCelebracjeEkranu, MS_CELEBRACJI_KONCA)
  sekcja.addEventListener('click', zakonczCelebracjeEkranu)
}

function saNoweDoWprowadzenia() {
  const wylaczone = talia.zbiorWylaczonych(stan.ustawienia.wylaczoneTalie)
  return slowa.some((s) => {
    if (talia.jestPominiete(stan.pominiete, s.id)) return false
    if (wylaczone.has(talia.taliaSlowa(s))) return false
    const en = stan.karty[talia.klucz(s.id, 'en')]
    if (talia.jestNowa(en)) return true
    return stan.ustawienia.mowienie && talia.mowienieOdblokowane(en) && talia.jestNowa(stan.karty[talia.klucz(s.id, 'pl')])
  })
}

function dodajNoweNaDzis() {
  zamknijMenu()
  const dzis = talia.dzisiejszy(stan.dzis)
  stan.dzis = { ...dzis, dodatkoweNowe: dzis.dodatkoweNowe + talia.DODATKOWE_NOWE }
  zapiszStan()
  nowaSeriaLubPusto()
  if (ekran !== 'karta') toast('Brak nowych słów do wprowadzenia.')
}

// Ekran wyboru (E): pasek calej talii z jedna liczba, trzy duze przyciski i menu w rogu. Pokazuje sie
// po serii, po gescie w dol i wtedy, gdy nie ma czego powtarzac. Wtedy zamiast pustego komunikatu
// proponuje gry.
function przyciskGry(id, nazwa, dzialanie) {
  return el('button', { klasa: 'przycisk duzy', id, type: 'button', tekst: nazwa, onclick: dzialanie })
}

function pokazWybor(podsumowanieBlok = null) {
  zapomnijCofniecie()
  seria = null
  gra = null
  if (!slowa.length) {
    pokazBezSlow()
    return
  }
  const teraz = new Date()
  odswiezNadrabianie(teraz)
  const dzien = podsumowanie(teraz)
  odswiezOdznake(dzien.doZrobienia)
  const p = postepTalii()
  const jest = dzien.doZrobienia > 0
  pokazEkran(
    'wybor',
    el(
      'section',
      { klasa: 'ekran wybor' },
      podsumowanieBlok,
      el(
        'div',
        { klasa: 'talia-postep' },
        el(
          'div',
          { klasa: 'talia-tor' },
          el('i', { klasa: 'poznane', style: `transform: scaleX(${p.ulamekPoznanych})` }),
          el('i', { klasa: 'utrwalone', style: `transform: scaleX(${p.ulamekUtrwalonych})` }),
        ),
        el('div', { klasa: 'talia-liczba', tekst: `${p.poznane} / ${p.wszystkie}` }),
      ),
      !jest &&
        el('p', {
          klasa: 'przygaszony',
          tekst:
            p.wszystkie === 0
              ? 'Wszystkie talie są wyłączone. Włącz je w Menu > Talie.'
              : 'Na dziś wszystko. Zagraj albo wróć jutro.',
        }),
      el(
        'div',
        { klasa: 'wybor-przyciski' },
        // Gdy nie ma czego powtarzac, obok zablokowanego przycisku stoi "+10": dorzuca dziesiec nowych
        // slow na dzis, zeby dalo sie uczyc dalej bez wchodzenia w menu.
        el(
          'div',
          { klasa: 'wybor-rzad' },
          el('button', {
            klasa: 'przycisk glowny duzy',
            id: 'gra-powtorki',
            type: 'button',
            disabled: !jest,
            tekst: 'Powtórki',
            onclick: () => nowaSeriaLubPusto(),
          }),
          !jest &&
            el('button', {
              klasa: 'przycisk duzy dorzut',
              id: 'gra-dodaj-nowe',
              type: 'button',
              'aria-label': 'Dodaj dziesięć nowych słów na dziś',
              tekst: '+10',
              onclick: dodajNoweNaDzis,
            }),
        ),
        przyciskGry('gra-krzyzowka', 'Krzyżówka', zacznijKrzyzowke),
        przyciskGry('gra-literki', 'Literki', zacznijLiterki),
      ),
      banery(),
    ),
  )
}

// Gry (G)
//
// Zasada wspolna: gra nie dotyka `stan.karty` ani terminow. Dziala tak jak trening "Trudne slowa" -
// do serii dnia liczy sie wylacznie czas. Cala logika ukladania i sprawdzania siedzi w krzyzowka.js
// i literki.js; tutaj zostaje widok, dotyk i wynik.

// Karty do powtorki na dzis, a gdy jest ich mniej niz szesc, ostatnio uczone slowa. Generator krzyzowki
// miesci srednio ok. 83% podanych slow, wiec dostaje kilka wiecej, niz ma zmiescic.
function slowaNaGre(ile) {
  return talia
    .slowaDoGry({ ...opcjeDoboru(new Date()), ile })
    .map((id) => poId.get(id))
    .filter(Boolean)
}

// Czas gry dopisujemy raz, na wyjsciu: harmonogram zostaje nietkniety, a dzien nauki wie, ze cos sie dzialo.
function dopiszCzasGry(start) {
  const teraz = new Date()
  const sekundy = talia.czasGry((performance.now() - start) / 1000)
  if (!sekundy) return 0
  stan.dzis = talia.zaliczCzasGry(stan.dzis, sekundy, teraz)
  stan.historia = talia.dopiszDzien(stan.historia, { sekundy }, teraz)
  zapiszStan()
  return sekundy
}

// Czas na ekranie wyniku: m:ss, bez opisu w zdaniu.
function formatCzasu(sekundy) {
  const calk = Math.max(0, Math.round(sekundy))
  return `${Math.floor(calk / 60)}:${String(calk % 60).padStart(2, '0')}`
}

function wyjdzZGry() {
  if (!gra) return
  dopiszCzasGry(gra.start)
  gra = null
  pokazWybor()
}

const gornyPasekGry = (tytul, idTytulu, idZamkniecia) =>
  el(
    'div',
    { klasa: 'gra-gora' },
    el('span', { klasa: 'gra-tytul', id: idTytulu, tekst: tytul }),
    el('button', { klasa: 'zamknij', id: idZamkniecia, type: 'button', 'aria-label': 'Zamknij grę', tekst: '✕', onclick: wyjdzZGry }),
  )

// Wynik gry: trzy liczby i dwa wyjscia, jak na ekranie konca serii. Zadnych ocen i zadnych terminow.
function pokazWynikGry(nazwa, tytul, liczby, jeszczeRaz) {
  pokazEkran(
    nazwa,
    el(
      'section',
      { klasa: 'ekran' },
      el(
        'div',
        { klasa: 'koniec' },
        el('h2', { tekst: tytul }),
        el(
          'div',
          { klasa: 'przyrosty trzy' },
          liczby.map(([liczba, podpis, klasa]) => kafelekPrzyrostu(liczba, podpis, klasa)),
        ),
        el(
          'div',
          { klasa: 'przyciski' },
          el('button', { klasa: 'przycisk glowny', id: 'gra-jeszcze-raz', type: 'button', tekst: 'Jeszcze raz', onclick: jeszczeRaz }),
          el('button', { klasa: 'przycisk', id: 'gra-wroc', type: 'button', tekst: 'Wróć', onclick: () => pokazWybor() }),
        ),
      ),
    ),
  )
}

// G1. Krzyzowka

function zacznijKrzyzowke() {
  const lista = slowaNaGre(talia.SLOW_KRZYZOWKI + talia.ZAPAS_KRZYZOWKI)
  if (lista.length < talia.MIN_SLOW_GRY) {
    toast(`Za mało słów na krzyżówkę: potrzeba ${talia.MIN_SLOW_GRY}.`)
    return
  }
  const ziarno = Date.now()
  // `nieuzyte` z powodem "brak-miejsca" to normalny wynik generatora, nie blad: liczy sie to, co weszlo.
  const ulozona = krzyzowka.ulozKrzyzowke(lista, { ziarno })
  if (!ulozona.hasla.length) {
    toast('Z tych słów nie ułożyła się krzyżówka. Spróbuj jutro.')
    return
  }
  gra = {
    rodzaj: 'krzyzowka',
    siatka: ulozona.siatka,
    hasla: ulozona.hasla,
    komorki: ulozona.hasla.map(krzyzowka.komorkiHasla),
    odpowiedzi: {},
    uzyte: 0,
    ziarno,
    wybrane: 0,
    pole: null,
    oceny: null,
    pola: new Map(),
    start: performance.now(),
  }
  gra.pole = { ...gra.komorki[0][0] }
  rysujKrzyzowke()
}

function rysujKrzyzowke() {
  const kolumny = gra.siatka[0].length
  const numery = new Map()
  for (const h of gra.hasla) {
    const klucz = krzyzowka.kluczPola(h.wiersz, h.kolumna)
    if (!numery.has(klucz)) numery.set(klucz, h.numer)
  }
  const siatka = el('div', { klasa: 'krzyzowka-siatka', id: 'krzyzowka-siatka', style: `--kolumny: ${kolumny}` })
  gra.pola = new Map()
  gra.siatka.forEach((wiersz, w) => {
    wiersz.forEach((litera, k) => {
      if (litera === null) {
        siatka.append(el('div', { klasa: 'krzyzowka-pusto' }))
        return
      }
      const klucz = krzyzowka.kluczPola(w, k)
      const pole = el(
        'button',
        {
          klasa: 'krzyzowka-pole',
          type: 'button',
          'data-w': w,
          'data-k': k,
          'aria-label': `Pole ${w + 1}, ${k + 1}`,
          // Bez tego tapniecie w pole zabiera fokus ukrytemu polu i klawiatura systemowa chowa sie.
          onmousedown: (e) => e.preventDefault(),
          onclick: () => tapnijPole(w, k),
        },
        numery.has(klucz) && el('i', { klasa: 'krzyzowka-numer', tekst: String(numery.get(klucz)) }),
        el('span', { klasa: 'krzyzowka-litera' }),
      )
      gra.pola.set(klucz, pole)
      siatka.append(pole)
    })
  })
  // Ukryte pole tekstowe to jedyny sposob na klawiature systemowa w iOS. Musi byc widoczne dla przegladarki
  // (sama przezroczystosc, nie display: none), bo inaczej focus() jej nie otworzy.
  const wpis = el('input', {
    klasa: 'ukryte-pole',
    id: 'krzyzowka-wpis',
    type: 'text',
    autocapitalize: 'characters',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    'aria-label': 'Wpisz literę',
    oninput: obsluzWpisKrzyzowki,
  })
  wpis.value = WARTOWNIK_WPISU
  const sekcja = el(
    'section',
    { klasa: 'ekran gra krzyzowka' },
    gornyPasekGry('Krzyżówka', 'krzyzowka-tytul', 'krzyzowka-zamknij'),
    siatka,
    el('p', { klasa: 'gra-haslo', id: 'krzyzowka-haslo', 'aria-live': 'polite' }),
    wpis,
    el(
      'div',
      { klasa: 'gra-przyciski' },
      // Bez blokady mousedown przyciski zabieraja fokus ukrytemu polu i klawiatura systemowa chowa sie.
      el('button', { klasa: 'przycisk', id: 'krzyzowka-sprawdz', type: 'button', tekst: 'Sprawdź', onmousedown: (e) => e.preventDefault(), onclick: sprawdzKrzyzowke }),
      el('button', { klasa: 'przycisk', id: 'krzyzowka-podpowiedz', type: 'button', onmousedown: (e) => e.preventDefault(), onclick: podpowiedzKrzyzowki }),
    ),
  )
  // Krzyzowka nie ma wyjscia gestem: tu sie wpisuje litery, a przewijanie siatki w gore konczylo gre
  // w polowie hasla. Wychodzi sie krzyzykiem w rogu.
  pokazEkran('krzyzowka', sekcja)
  odswiezKrzyzowke()
  wpis.focus()
}

function odswiezKrzyzowke() {
  const wybrane = new Set(gra.komorki[gra.wybrane].map((c) => krzyzowka.kluczPola(c.wiersz, c.kolumna)))
  const aktywne = gra.pole && krzyzowka.kluczPola(gra.pole.wiersz, gra.pole.kolumna)
  for (const [klucz, pole] of gra.pola) {
    const [w, k] = klucz.split(',').map(Number)
    pole.querySelector('.krzyzowka-litera').textContent = gra.odpowiedzi[klucz] || ''
    pole.classList.toggle('wybrane', wybrane.has(klucz))
    pole.classList.toggle('aktywne', klucz === aktywne)
    const ocena = gra.oceny ? gra.oceny[w][k] : null
    pole.classList.toggle('poprawna', ocena === krzyzowka.OCENY.poprawna)
    pole.classList.toggle('bledna', ocena === krzyzowka.OCENY.bledna)
  }
  const h = gra.hasla[gra.wybrane]
  $('krzyzowka-haslo').textContent = `${h.numer} ${h.kierunek} · ${h.haslo}`
  const zostalo = krzyzowka.MAKS_PODPOWIEDZI - gra.uzyte
  const przycisk = $('krzyzowka-podpowiedz')
  przycisk.textContent = `Podpowiedz literę (${zostalo})`
  przycisk.disabled = zostalo <= 0
}

// Tapniecie wybiera haslo, a kolejne tapniecie w to samo pole zmienia kierunek, gdy krzyzuja sie tu dwa hasla.
function tapnijPole(w, k) {
  const tutaj = []
  gra.komorki.forEach((komorki, i) => {
    if (komorki.some((c) => c.wiersz === w && c.kolumna === k)) tutaj.push(i)
  })
  if (!tutaj.length) return
  const toSamoPole = gra.pole?.wiersz === w && gra.pole?.kolumna === k
  if (!tutaj.includes(gra.wybrane)) gra.wybrane = tutaj[0]
  else if (toSamoPole) gra.wybrane = tutaj[(tutaj.indexOf(gra.wybrane) + 1) % tutaj.length]
  gra.pole = { wiersz: w, kolumna: k }
  odswiezKrzyzowke()
  $('krzyzowka-wpis')?.focus()
}

function obsluzWpisKrzyzowki(e) {
  const wartosc = e.target.value
  e.target.value = WARTOWNIK_WPISU
  if (wartosc.length > WARTOWNIK_WPISU.length) wpiszLitere(wartosc.trim().slice(-1))
  else if (wartosc.length < WARTOWNIK_WPISU.length) cofnijLitereKrzyzowki()
}

// Kursor idzie wzdluz wybranego hasla i zatrzymuje sie na jego koncu.
function przesunPole(o) {
  const komorki = gra.komorki[gra.wybrane]
  const i = komorki.findIndex((c) => c.wiersz === gra.pole.wiersz && c.kolumna === gra.pole.kolumna)
  const nastepne = Math.min(Math.max(i + o, 0), komorki.length - 1)
  gra.pole = { ...komorki[nastepne] }
}

const bezPola = (odpowiedzi, klucz) => Object.fromEntries(Object.entries(odpowiedzi).filter(([k]) => k !== klucz))

function wpiszLitere(znak) {
  const litera = String(znak || '').toUpperCase()
  if (!gra?.pole || !/^\p{L}$/u.test(litera)) return
  gra.odpowiedzi = { ...gra.odpowiedzi, [krzyzowka.kluczPola(gra.pole.wiersz, gra.pole.kolumna)]: litera }
  gra.oceny = null
  przesunPole(1)
  odswiezKrzyzowke()
  sprawdzGdyPelna()
}

function cofnijLitereKrzyzowki() {
  if (!gra?.pole) return
  const klucz = () => krzyzowka.kluczPola(gra.pole.wiersz, gra.pole.kolumna)
  if (!gra.odpowiedzi[klucz()]) przesunPole(-1)
  gra.odpowiedzi = bezPola(gra.odpowiedzi, klucz())
  gra.oceny = null
  odswiezKrzyzowke()
}

function sprawdzKrzyzowke() {
  const wynik = krzyzowka.sprawdzKrzyzowke(gra.siatka, gra.odpowiedzi)
  gra.oceny = wynik.oceny
  odswiezKrzyzowke()
  if (wynik.ukonczone) {
    zakonczKrzyzowke()
    return
  }
  toast(`Dobrze: ${wynik.poprawne} z ${wynik.wszystkie}.`)
  $('krzyzowka-wpis')?.focus()
}

// Po uzupelnieniu wszystkich pol krzyzowka sprawdza sie sama.
function sprawdzGdyPelna() {
  const wynik = krzyzowka.sprawdzKrzyzowke(gra.siatka, gra.odpowiedzi)
  if (wynik.puste > 0) return
  gra.oceny = wynik.oceny
  odswiezKrzyzowke()
  if (wynik.ukonczone) zakonczKrzyzowke()
}

function podpowiedzKrzyzowki() {
  const wspolne = { siatka: gra.siatka, odpowiedzi: gra.odpowiedzi, uzyte: gra.uzyte, ziarno: gra.ziarno, maks: krzyzowka.MAKS_PODPOWIEDZI }
  // Najpierw w wybranym hasle; gdy nie ma tam czego odkryc, gdziekolwiek w siatce.
  let wynik = krzyzowka.podpowiedzLitere({ ...wspolne, komorki: gra.komorki[gra.wybrane] })
  if (!wynik.podpowiedz && wynik.powod !== 'limit') wynik = krzyzowka.podpowiedzLitere(wspolne)
  if (!wynik.podpowiedz) {
    toast(wynik.powod === 'limit' ? 'Podpowiedzi się skończyły.' : 'Nie ma czego podpowiedzieć.')
    return
  }
  gra.odpowiedzi = wynik.stan.odpowiedzi
  gra.uzyte = wynik.stan.uzyte
  gra.oceny = null
  gra.pole = { wiersz: wynik.podpowiedz.wiersz, kolumna: wynik.podpowiedz.kolumna }
  wibruj('prawie')
  odswiezKrzyzowke()
  sprawdzGdyPelna()
  $('krzyzowka-wpis')?.focus()
}

function zakonczKrzyzowke() {
  const sekundy = dopiszCzasGry(gra.start)
  const hasel = gra.hasla.length
  const uzyte = gra.uzyte
  wibruj('koniec')
  gra = null
  pokazWynikGry(
    'krzyzowka-wynik',
    'Krzyżówka ukończona',
    [
      [hasel, formaSlowa(hasel, ['hasło', 'hasła', 'haseł']), 'utrwalone'],
      [uzyte, formaSlowa(uzyte, ['podpowiedź', 'podpowiedzi', 'podpowiedzi'])],
      [formatCzasu(sekundy), 'czas'],
    ],
    zacznijKrzyzowke,
  )
}

// G2. Literki

function zacznijLiterki() {
  const lista = slowaNaGre(talia.SLOW_KRZYZOWKI + talia.ZAPAS_KRZYZOWKI)
  if (lista.length < talia.MIN_SLOW_GRY) {
    toast(`Za mało słów na literki: potrzeba ${talia.MIN_SLOW_GRY}.`)
    return
  }
  const runda = literki.nowaRunda(lista, { ziarno: Date.now(), dlugosc: literki.DLUGOSC_RUNDY })
  if (!runda.zadania.length) {
    toast('Te słowa nie nadają się do literek. Spróbuj jutro.')
    return
  }
  gra = { rodzaj: 'literki', runda, pozycja: 0, zadanie: runda.zadania[0], podpowiedzi: 0, zrobione: 0, start: performance.now() }
  rysujLiterki()
}

function rysujLiterki() {
  const sekcja = el(
    'section',
    { klasa: 'ekran gra literki' },
    gornyPasekGry('', 'literki-postep', 'literki-zamknij'),
    el('h2', { klasa: 'literki-znaczenie', id: 'literki-znaczenie' }),
    el('div', { klasa: 'literki-odpowiedz', id: 'literki-odpowiedz', 'aria-live': 'polite', onclick: cofnijLiterke }),
    el('div', { klasa: 'literki-kafelki', id: 'literki-kafelki' }),
    el(
      'div',
      { klasa: 'gra-przyciski' },
      el('button', { klasa: 'przycisk', id: 'literki-podpowiedz', type: 'button', onclick: podpowiedzLiterki }),
    ),
  )
  pokazEkran('literki', sekcja)
  odswiezLiterki()
}

function odswiezLiterki() {
  const z = gra.zadanie
  const ulozone = literki.ulozone(z)
  $('literki-postep').textContent = `${gra.pozycja + 1} / ${gra.runda.zadania.length}`
  $('literki-znaczenie').textContent = z.pl
  $('literki-odpowiedz').replaceChildren(
    ...[...z.poprawne].map((_, i) => el('span', { klasa: `literki-slot${ulozone[i] ? ' pelny' : ''}`, tekst: ulozone[i] || '' })),
  )
  $('literki-kafelki').replaceChildren(
    ...z.litery.map((znak, i) => {
      const uzyta = z.wybrane.includes(i)
      const kafelek = el('button', {
        klasa: `literka${uzyta ? ' uzyta' : ''}`,
        type: 'button',
        'data-i': i,
        disabled: uzyta,
        tekst: znak,
        onclick: () => dopiszLiterke(i),
      })
      if (!uzyta) dodajPrzelacznik(kafelek)
      return kafelek
    }),
  )
  $('literki-podpowiedz').textContent = `Podpowiedź (${gra.podpowiedzi})`
}

function dopiszLiterke(i) {
  const nowy = literki.dopiszLitere(gra.zadanie, i)
  // Ten sam obiekt znaczy ruch niemozliwy: nic sie nie dzieje i nic nie animujemy.
  if (nowy === gra.zadanie) return
  gra.zadanie = nowy
  odswiezLiterki()
  rozstrzygnijLiterki()
}

function cofnijLiterke() {
  const nowy = literki.cofnijLitere(gra.zadanie)
  if (nowy === gra.zadanie) return
  gra.zadanie = nowy
  odswiezLiterki()
}

function podpowiedzLiterki() {
  const { stan: nowy, indeks } = literki.podpowiedzKolejnaLitere(gra.zadanie)
  if (nowy === gra.zadanie && indeks === null) {
    toast('Nie ma czego podpowiedzieć.')
    return
  }
  gra.zadanie = nowy
  if (indeks !== null) gra.podpowiedzi += 1
  wibruj('prawie')
  odswiezLiterki()
  rozstrzygnijLiterki()
}

// Pelna odpowiedz: poprawna konczy slowo, blad tylko drga i zostawia mozliwosc poprawy. Bez kary.
function rozstrzygnijLiterki() {
  const z = gra.zadanie
  if (literki.ulozone(z).length < z.poprawne.length) return
  const kafelki = $('literki-kafelki')
  if (!literki.czyPoprawne(z)) {
    wibruj('nieUmiem')
    kafelki.classList.remove('drga')
    // Wymuszenie przeliczenia stylu, zeby drgniecie ruszylo takze przy drugiej pomylce pod rzad.
    void kafelki.offsetWidth
    kafelki.classList.add('drga')
    setTimeout(() => $('literki-kafelki')?.classList.remove('drga'), MS_DRGNIECIA)
    return
  }
  gra.zrobione += 1
  wibruj('umiem')
  powiedz(z.poprawne)
  $('literki-odpowiedz').classList.add('sukces')
  setTimeout(nastepneLiterki, malyRuch() ? MS_WYLOTU_BEZ_RUCHU : MS_SUKCESU_LITEREK)
}

function nastepneLiterki() {
  if (gra?.rodzaj !== 'literki') return
  gra.pozycja += 1
  if (gra.pozycja >= gra.runda.zadania.length) {
    zakonczLiterki()
    return
  }
  gra.zadanie = gra.runda.zadania[gra.pozycja]
  $('literki-odpowiedz')?.classList.remove('sukces')
  odswiezLiterki()
}

function zakonczLiterki() {
  const sekundy = dopiszCzasGry(gra.start)
  const zrobione = gra.zrobione
  const podpowiedzi = gra.podpowiedzi
  wibruj('koniec')
  gra = null
  pokazWynikGry(
    'literki-wynik',
    'Seria ukończona',
    [
      [zrobione, formaSlowa(zrobione, ['słowo', 'słowa', 'słów']), 'utrwalone'],
      [podpowiedzi, formaSlowa(podpowiedzi, ['podpowiedź', 'podpowiedzi', 'podpowiedzi'])],
      [formatCzasu(sekundy), 'czas'],
    ],
    zacznijLiterki,
  )
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

// Kotwica nawyku (D1): zdanie zapisane w ustawieniach, zmieniane wylacznie w menu. Ekran wyboru go nie
// pokazuje, bo ma zawierac tylko pasek talii i trzy przyciski.
function ustawKotwice(tekst) {
  stan.ustawienia = { ...stan.ustawienia, kotwica: tekst }
  zapiszStan()
  odswiezMenu()
  toast(tekst ? talia.zdanieKotwicy(tekst) : 'Bez kotwicy. Ustawisz ją w Menu > Ustawienia.')
}

// Wlasna kotwica przez prompt: to samo narzedzie, co przy kasowaniu postepu slowa, wiec nie dokladamy
// osobnego pola tekstowego.
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

// Statystyki maja byc przyjazne (D): najpierw krotkie zdania i heatmapa, a cala tabela liczb dopiero
// pod "Szczegóły". Zadnego procentu skutecznosci i zadnych punktow.
function zdaniaStatystyk(st, teraz) {
  const p = postepTalii()
  const zdania = [`Znasz ${p.poznane} z ${p.wszystkie} słów, utrwalonych ${p.utrwalone}.`]
  const tydzien = talia.kartyWTygodniu(stan.historia, teraz)
  if (tydzien) zdania.push(`W tym tygodniu ${liczebnik(tydzien, ['karta', 'karty', 'kart'])}.`)
  // Cel dnia nie ma juz wlasnego paska (D), ale ustawienie zostaje i to jest jego jedyne miejsce.
  const dzis = talia.ocenioneDzis(stan.historia, teraz)
  const cel = stan.ustawienia.celDzienny
  zdania.push(dzis >= cel ? `Cel dnia zrobiony: ${liczebnik(dzis, ['karta', 'karty', 'kart'])}.` : `Dziś ${dzis} z ${cel} kart.`)
  const najdluzsza = talia.najdluzszaSeriaDni(stan.historia)
  if (najdluzsza) zdania.push(`Najdłuższa seria: ${liczebnik(najdluzsza, ['dzień', 'dni', 'dni'])}.`)
  const tempo = talia.tempoOstatnich(stan.historia, talia.DNI_TEMPA, teraz)
  if (tempo) zdania.push(`Zwykle odpowiadasz w ${tempo.toLocaleString('pl-PL')} s.`)
  if (st.doWprowadzenia) zdania.push(tekstPrognozy(st.doWprowadzenia))
  return zdania
}

function sekcjaStatystyk() {
  const teraz = new Date()
  const st = talia.statystyki({ slowa, karty: stan.karty, pominiete: stan.pominiete, wylaczoneTalie: stan.ustawienia.wylaczoneTalie })
  const dzien = podsumowanie(teraz)
  const wKolizjach = Object.keys(kolizje).length
  return el(
    'div',
    { klasa: 'sekcja' },
    el('h3', { tekst: 'Statystyki' }),
    el('div', { klasa: 'zdania' }, zdaniaStatystyk(st, teraz).map((z) => el('p', { tekst: z }))),
    el('h3', { tekst: 'Ostatnie 30 dni', style: 'margin-top: 16px' }),
    heatmapa(),
    el(
      'details',
      { klasa: 'szczegoly', id: 'szczegoly-statystyk' },
      el('summary', { tekst: 'Szczegóły' }),
      wiersz('Poznane słowa', `${st.poznane} / ${st.wszystkie}`),
      wiersz('Utrwalone słowa', `${st.utrwalone} / ${st.wszystkie}`),
      wiersz('Opanowane', `${st.opanowane} / ${st.wszystkie}`),
      wiersz('Pominięte', st.pominiete),
      wiersz('W powtórkach', `${st.procentPowtorka.toLocaleString('pl-PL')}% listy`),
      wiersz('Odblokowane karty mówienia', st.mowienieOdblokowane),
      wiersz('Zaległe teraz', dzien.pozniejDzis ? `${dzien.zalegle} (+${dzien.pozniejDzis} później dziś)` : dzien.zalegle),
      wiersz('Dziś do zrobienia', dzien.doZrobienia),
      wiersz('Tryb nadrabiania', dzien.nadrabianie ? 'tak' : 'nie'),
      wiersz('Seria', liczebnik(talia.aktualnyStreak(stan.streak, teraz), ['dzień', 'dni', 'dni'])),
      wiersz('Dni nauki w ostatnich 30', `${talia.dniZNauka(stan.historia, talia.DNI_OSTATNICH, teraz)} / ${talia.DNI_OSTATNICH}`),
      wiersz('Indeks kolizji', wKolizjach ? `${wKolizjach} słów${czasIndeksuKolizji ? ` · ${czasIndeksuKolizji} ms` : ' · z pamięci'}` : 'liczony'),
      st.talie.length > 0 && el('h3', { tekst: 'Talie', style: 'margin-top: 16px' }),
      st.talie.map((t) => wierszStat(t.nazwa, t.poznane, t.wszystkie)),
      st.poziomy.length > 0 && el('h3', { tekst: 'Poziomy', style: 'margin-top: 16px' }),
      st.poziomy.map((p2) => wierszStat(p2.nazwa, p2.poznane, p2.wszystkie)),
    ),
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

// Talie (H): przelacznik "ucz sie z tej talii" i usuwanie calej talii razem z postepem. Wylaczona talia
// znika z nauki i z gier, ale jej karty zostaja w zapisie nietkniete, wiec powrot nic nie kosztuje.

const wylaczoneTalie = () => stan.ustawienia.wylaczoneTalie || []

function przelaczTalie(nazwa, wlaczona) {
  const bez = wylaczoneTalie().filter((n) => n !== nazwa)
  zmienUstawienie('wylaczoneTalie', wlaczona ? bez : [...bez, nazwa])
  odswiezPasekTalii()
  if (ekran === 'wybor') pokazWybor()
  if (!wlaczona && !talia.listaTalii({ slowa, karty: stan.karty, wylaczoneTalie: wylaczoneTalie() }).some((t) => t.wlaczona)) {
    toast('Nie uczysz się teraz z żadnej talii.', 'wazny')
  }
}

async function usunTalie(nazwa) {
  const wynik = talia.bezTalii({ slowa, karty: stan.karty, pominiete: stan.pominiete }, nazwa)
  const slow = liczebnik(wynik.usunieteSlowa, ['słowo', 'słowa', 'słów'])
  const kart = liczebnik(wynik.usunieteKarty, ['kartę postępu', 'karty postępu', 'kart postępu'])
  if (!confirm(`Usunąć talię "${nazwa}"? Stracisz ${slow} i ${kart}.`)) return
  if (!(await upewnijTalie())) {
    toast('Zapisana talia się nie wczytała, więc usuwanie mogłoby ją nadpisać. Zamknij i otwórz aplikację.', 'blad')
    return
  }
  const nowaTalia = { slowa: wynik.slowa, talie: talie.filter((t) => t.nazwa !== nazwa) }
  try {
    await baza.zapiszTalie(nowaTalia)
  } catch (blad) {
    toast(`Nie udało się usunąć talii: ${opis(blad)}`, 'blad')
    return
  }
  ustawTalie(nowaTalia)
  stan.karty = wynik.karty
  stan.pominiete = wynik.pominiete
  stan.ustawienia = { ...stan.ustawienia, wylaczoneTalie: wylaczoneTalie().filter((n) => n !== nazwa) }
  zapiszStan()
  odswiezPasekTalii()
  odswiezMenu()
  toast(`Talia "${nazwa}" usunięta.`)
  if (!slowa.length) {
    zamknijMenu()
    pokazBezSlow()
  } else if (ekran === 'wybor') {
    pokazWybor()
  }
}

function sekcjaTalii() {
  const lista = talia.listaTalii({ slowa, karty: stan.karty, wylaczoneTalie: wylaczoneTalie() })
  return el(
    'div',
    { klasa: 'sekcja', id: 'sekcja-talii' },
    el('h3', { tekst: 'Talie' }),
    !lista.length && el('p', { klasa: 'przygaszony', tekst: 'Nie masz jeszcze żadnej talii.' }),
    lista.map((t) =>
      el(
        'div',
        { klasa: 'talia-wiersz' },
        el(
          'div',
          { klasa: 'talia-opis' },
          el('span', { klasa: 'talia-nazwa', tekst: t.nazwa }),
          el('span', { klasa: 'przygaszony maly', tekst: `${t.poznane} / ${t.wszystkie} poznanych${t.wlaczona ? '' : ' · poza nauką'}` }),
        ),
        el('button', {
          klasa: 'przelacz',
          type: 'button',
          role: 'switch',
          'data-talia': t.nazwa,
          'aria-checked': String(t.wlaczona),
          'aria-label': `Ucz się z talii ${t.nazwa}`,
          onclick: () => przelaczTalie(t.nazwa, !t.wlaczona),
        }),
        el(
          'div',
          { klasa: 'talia-akcje' },
          el('button', { klasa: 'przycisk maly', type: 'button', 'aria-label': `Usuń talię ${t.nazwa}`, tekst: 'Usuń', onclick: () => usunTalie(t.nazwa) }),
        ),
      ),
    ),
    el(
      'div',
      { klasa: 'przyciski', style: 'margin-top: 10px' },
      el('button', { klasa: 'przycisk', id: 'dodaj-talie', type: 'button', tekst: 'Dodaj talię', onclick: () => pokazDodawanie() }),
    ),
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
  stan.streak = talia.zaliczDzien(stan.streak, teraz).streak
  stan.historia = talia.dopiszDzien(stan.historia, { oceny: 1, nowe: 1, exp: zdobyte }, teraz)
  zapiszStan()
  odswiezPasekTalii()
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
  odswiezPasekTalii()
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

// "Pomijam" z przegladu talii: slowo wypada z nauki, karty zostaja nietkniete.
function pomijajZListy(slowo) {
  if (talia.jestPominiete(stan.pominiete, slowo.id)) return
  const pierwsze = !Object.keys(stan.pominiete).length
  stan.pominiete = { ...stan.pominiete, [slowo.id]: talia.dataLokalna() }
  zapiszStan()
  odswiezPasekTalii()
  odswiezSlowka()
  odswiezMenu()
  toast(pierwsze ? PODPOWIEDZ_POMIJANIA : `"${slowo.w}" wypada z nauki.`, pierwsze ? 'wazny' : '')
}

// Pominiete slowo wraca do nauki dokladnie tam, gdzie bylo: karty nie byly ruszane, wiec wystarczy zdjac je z listy.
function przywrocSlowo(slowo) {
  if (!talia.jestPominiete(stan.pominiete, slowo.id)) return
  const reszta = { ...stan.pominiete }
  delete reszta[slowo.id]
  stan.pominiete = reszta
  zapiszStan()
  odswiezPasekTalii()
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
      // Ekran nauki nie ma juz przycisku "Pomijam" (B), wiec jedyne widoczne wyjscie dla slowa jest tutaj.
      !pominiete && el('button', { klasa: 'przycisk maly', type: 'button', tekst: 'Pomijam', onclick: () => pomijajZListy(slowo) }),
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
    'Nieudana próba plus poprawna odpowiedź uczy więcej niż samo patrzenie na odpowiedź. Dlatego apka nigdy nie pokazuje tłumaczenia sama z siebie. Słowo, które siedzi na pewno, oceniaj gestem od razu - ale przy każdym wahaniu najpierw odsłoń i sprawdź.',
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
        saNoweDoWprowadzenia() &&
          el('button', { klasa: 'przycisk', id: 'wiecej-nowych', type: 'button', tekst: `+${talia.DODATKOWE_NOWE} nowych na dziś`, onclick: dodajNoweNaDzis }),
        el('button', { klasa: 'przycisk', id: 'otworz-gesty', type: 'button', tekst: 'Gesty', onclick: pokazSamouczek }),
        el('button', { klasa: 'przycisk glowny', type: 'button', tekst: 'Dodaj słówka', onclick: () => pokazDodawanie() }),
      ),
    ),
    // Kolejnosc sekcji wedlug tego, jak czesto sie ich szuka: statystyki, slowka, jak sie uczyc,
    // ustawienia, kopia, offline, zrodla. Zgloszone bledy sa warunkowe i stoja przy slowkach, ktorych
    // dotycza, wiec nie rozbijaja tej kolejnosci.
    sekcjaStatystyk(),
    sekcjaTalii(),
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
  pokazWybor()
  if (wynik.pominiete) toast(`Kopia połączona z obecnym postępem. ${opisPominietych(wynik.pominiete)}.`, 'blad')
  else toast('Kopia połączona z obecnym postępem.')
}

// Dodawanie slowek

function pokazDodawanie() {
  zamknijMenu()
  zrodloImportu = null
  wynikImportu = null
  nazwaTaliiRecznie = false
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
        // Nazwa talii (H): domyslnie ta z pliku albo "Wklejone RRRR-MM-DD", dopoki uzytkownik jej nie zmieni.
        el('label', { klasa: 'etykieta-pola', for: 'nazwa-talii', tekst: 'Nazwa talii' }),
        el('input', {
          klasa: 'pole-szukania',
          id: 'nazwa-talii',
          type: 'text',
          maxlength: String(talia.MAKS_ZNAKOW_NAZWY_TALII),
          spellcheck: 'false',
          autocomplete: 'off',
          'aria-label': 'Nazwa talii',
          placeholder: 'np. Oxford 3000',
          oninput: () => {
            nazwaTaliiRecznie = true
            odswiezNazweTalii()
          },
        }),
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
  nazwaTaliiRecznie = false
}

// Nazwa z pola, a gdy jest puste, ta rozpoznana z pliku albo z wklejenia.
const nazwaDlaImportu = () => ($('nazwa-talii')?.value || '').trim().slice(0, talia.MAKS_ZNAKOW_NAZWY_TALII) || wynikImportu?.nazwa || ''

function odswiezNazweTalii() {
  const cel = $('podglad-talia')
  if (cel) cel.textContent = `Talia: ${nazwaDlaImportu()}${cel.dataset.reszta || ''}`
}

const wielka = (tekst) => tekst.charAt(0).toUpperCase() + tekst.slice(1)

// Slowa importu z nazwa talii wybrana przez uzytkownika. Slowo juz istniejace zostaje w swojej talii,
// bo tak dziala scal() - zmiana dotyczy wylacznie nowych pozycji.
const slowaDlaTalii = (wynik, nazwa) => (nazwa ? wynik.slowa.map((s) => (s.talia === nazwa ? s : { ...s, talia: nazwa })) : wynik.slowa)

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
  wynikImportu = w
  const pole = $('nazwa-talii')
  if (pole && !nazwaTaliiRecznie) pole.value = w.nazwa
  const s = scal(slowa, slowaDlaTalii(w, nazwaDlaImportu()))
  const liczby = [
    liczebnik(s.nowe, ['nowe', 'nowe', 'nowych']),
    liczebnik(s.zaktualizowane, ['zaktualizowane', 'zaktualizowane', 'zaktualizowanych']),
    liczebnik(w.bledy.length, ['błąd', 'błędy', 'błędów']),
  ]
  const bezZmian = s.bezZmian ? ` · bez zmian: ${s.bezZmian}` : ''
  // replaceChildren zamienia false na tekst "false", wiec puste pozycje odpadaja przed wstawieniem.
  const tresc = [
    el('p', { klasa: 'podsumowanie', tekst: liczby.join(', ') }),
    el('p', { klasa: 'przygaszony', id: 'podglad-talia', 'data-reszta': bezZmian, tekst: `Talia: ${nazwaDlaImportu()}${bezZmian}` }),
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
    const nazwa = nazwaDlaImportu()
    const s = scal(slowa, slowaDlaTalii(w, nazwa))
    const nowaTalia = { slowa: s.slowa, talie: dopiszTalie(talie, { ...w, nazwa }) }
    try {
      await baza.zapiszTalie(nowaTalia)
    } catch (blad) {
      pokazBlad(`Nie udało się zapisać słówek w pamięci telefonu: ${opis(blad)}`)
      return
    }
    ustawTalie(nowaTalia)
    zamknijDodawanie()
    toast(`Dodano: ${liczebnik(s.nowe, ['nowe', 'nowe', 'nowych'])}, ${liczebnik(s.zaktualizowane, ['zaktualizowane', 'zaktualizowane', 'zaktualizowanych'])}.`)
    if (ekran === 'bez-slow' || ekran === 'wybor') pokazWybor()
  } finally {
    zapisujeSlowka = false
  }
}

// Zdarzenia globalne

// Skroty klawiszowe odwzorowuja cztery gesty: strzalki w cztery strony, spacja odslania, `z` to "Znam".
function klawisze(e) {
  // Gry maja wlasne ekrany i wlasna obsluge dotyku, wiec skroty nauki ich nie dotycza. Zostaje Escape
  // jako wyjscie, takze z ukrytego pola krzyzowki.
  if (gra && e.key === 'Escape') {
    wyjdzZGry()
    return
  }
  if (e.target.closest?.('textarea, input')) return
  if (e.key === 'Escape') {
    zakonczCelebracje()
    zamknijSamouczek()
    zamknijMenu()
    zamknijJak()
    if (!$('dodawanie').hidden) zamknijDodawanie()
    return
  }
  if (samouczekOtwarty) {
    zamknijSamouczek()
    return
  }
  if (!$('menu').hidden || !$('jak').hidden || !$('dodawanie').hidden || ekran !== 'karta') return
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    odslon()
  } else if (e.key === 'ArrowRight') ocenKarte(3)
  else if (e.key === 'ArrowLeft') ocenKarte(1)
  // Strzalka w dol robi to samo co gest w dol (kosz), a nauke konczy Escape - jak krzyzyk na karcie.
  else if (e.key === 'ArrowDown') pomijajAktualna()
  else if (e.key === 'Escape') wyjdzDoWyboru()
  else if (e.key === 'z' || e.key === 'Z') ocenKarte(4)
}

// Haptyka (iPhone): systemowy klik daje wylacznie przelacznik <input switch> naprawde tapniety palcem,
// programowe klikniecie od iOS 26.5 nie dziala. Dlatego kazdy przycisk w apce dostaje wlasny, niewidoczny
// przelacznik - wczesniej wibrowala tylko karta i kafelki literek, wiec haptyki bylo jak na lekarstwo.
// Obserwator lapie tez ekrany rysowane pozniej, bo apka przerysowuje sie w calosci przy kazdym przejsciu.
// Gest oceny nie wibruje i wibrowac nie moze: swipe nie jest tapnieciem w przelacznik.
function pilnujHaptyki() {
  const dodaj = (wezel) => {
    if (!(wezel instanceof Element)) return
    const przyciski = wezel.matches('button') ? [wezel, ...wezel.querySelectorAll('button')] : [...wezel.querySelectorAll('button')]
    for (const przycisk of przyciski) {
      if (przycisk.classList.contains('tylko-czytnik') || przycisk.querySelector('.haptyka')) continue
      przycisk.classList.add('z-haptyka')
      dodajPrzelacznik(przycisk)
    }
  }
  dodaj(document.body)
  new MutationObserver((zmiany) => {
    for (const zmiana of zmiany) for (const wezel of zmiana.addedNodes) dodaj(wezel)
  }).observe(document.body, { childList: true, subtree: true })
}

function podepnijZdarzenia() {
  pilnujHaptyki()
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
  // Samouczek gestow zamyka tapniecie w dowolne miejsce nakladki (takze pierwszy gest, ktory w nia trafia).
  $('samouczek').addEventListener('pointerdown', zamknijSamouczekTapnieciem)
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
    odswiezPasekTalii()
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
  const { stan: wczytany, ostrzezenie, pominiete } = magazyn.wczytaj()
  stan = wczytany
  ustawKomunikat('wczytanie', ostrzezenie)
  if (pominiete) toast(`${opisPominietych(pominiete)}.`, 'blad')
  magazyn.kopiaDzienna()
  rozprosStareTerminy()
  magazyn.poprosOTrwalosc().then((wynik) => {
    trwalaPamiec = wynik
    odswiezSekcjeOffline()
  })
  podepnijZdarzenia()
  odswiezPasekTalii()
  odswiezZnacznik()
  // Talia wczytuje sie przed pierwszym renderem karty.
  await upewnijTalie()
  // Indeks kolizji tez, bo pierwsza seria powstaje od razu po starcie i bez niego przepuscilaby
  // nowe slowa kolidujace ze swiezo wprowadzonymi. Po pierwszym policzeniu lezy w IndexedDB.
  await przygotujKolizje().catch(() => {})
  document.documentElement.dataset.gotowe = '1'
  // Apka otwiera sie od razu na karcie (E). Ekran wyboru pokazuje sie dopiero, gdy nie ma czego powtarzac.
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
