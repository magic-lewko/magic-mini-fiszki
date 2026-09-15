// Logika nauki bez DOM: budowa serii, dzienne limity nowych, kolejka w serii, EXP i streak.
// Nie importuje fsrs.mjs, bo w zrodle lezy on w lib/, a w dist obok. Algorytm podaje app.js.
// Klucz karty to `${id}|en` (widzisz EN, przypominasz PL) albo `${id}|pl` (widzisz PL, mowisz EN).

// Te same stany co STANY w lib/fsrs.mjs. Test pilnuje, zeby sie nie rozjechaly.
export const STANY = ['nowa', 'nauka', 'powtorka', 'ponowna']

export const PROG_STABILNOSCI_MOWIENIA = 5
export const ODSTEP_PO_POMYLCE = 4
export const EXP_ZA_OCENE = { 1: 10, 3: 50, 4: 20 }
export const SEKUNDY_DNIA = 60
export const MAKS_SEKUND_KARTY = 20
export const POZIOMY = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
export const OPCJE_NOWYCH = [10, 15, 20, 30, 40]
export const OPCJE_DLUGOSCI = [10, 15, 20]
export const DODATKOWE_NOWE = 10

export const DOMYSLNE_USTAWIENIA = { noweDziennie: 20, dlugoscSerii: 15, autowymowa: true, mowienie: true }

const dwie = (n) => String(n).padStart(2, '0')

// Granica dnia wedlug zegara telefonu, nie UTC: w Polsce UTC przesuwaloby polnoc na 1:00 albo 2:00.
export function dataLokalna(teraz = new Date()) {
  return `${teraz.getFullYear()}-${dwie(teraz.getMonth() + 1)}-${dwie(teraz.getDate())}`
}

export function dzienPrzed(data) {
  const [r, m, d] = data.split('-').map(Number)
  return dataLokalna(new Date(r, m - 1, d - 1))
}

export const klucz = (id, kierunek) => `${id}|${kierunek}`

export function rozbierzKlucz(k) {
  const i = k.lastIndexOf('|')
  return { id: k.slice(0, i), kierunek: k.slice(i + 1) }
}

export function mowienieOdblokowane(kartaEn) {
  return !!kartaEn && kartaEn.stan === 'powtorka' && kartaEn.stabilnosc >= PROG_STABILNOSCI_MOWIENIA
}

export const jestNowa = (karta) => !karta || karta.stan === 'nowa'

export function ustawieniaZDomyslnymi(ustawienia) {
  return { ...DOMYSLNE_USTAWIENIA, ...ustawienia }
}

// Stan dnia (sekundy nauki, dodatkowe nowe) zeruje sie o lokalnej polnocy.
export function dzisiejszy(dzis, teraz = new Date()) {
  const data = dataLokalna(teraz)
  if (dzis?.data === data) return dzis
  return { data, sekundy: 0, dodatkoweNowe: 0 }
}

// Ile kart wprowadzono dzisiaj (pierwsza ocena), osobno dla obu kierunkow.
export function noweDzis(karty, teraz = new Date()) {
  const data = dataLokalna(teraz)
  const wynik = { en: 0, pl: 0 }
  for (const [k, karta] of Object.entries(karty)) {
    if (!karta.wprowadzono) continue
    if (dataLokalna(new Date(karta.wprowadzono)) !== data) continue
    if (k.endsWith('|pl')) wynik.pl += 1
    else wynik.en += 1
  }
  return wynik
}

function limityNowych({ karty, ustawienia, dzis, teraz }) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const dodatkowe = dzisiejszy(dzis, teraz).dodatkoweNowe || 0
  const wprowadzone = noweDzis(karty, teraz)
  return {
    en: Math.max(0, u.noweDziennie + dodatkowe - wprowadzone.en),
    pl: u.mowienie ? Math.max(0, u.noweDziennie + dodatkowe - wprowadzone.pl) : 0,
  }
}

// Termin, ktorego nie da sie odczytac, traktujemy jako zalegly, zeby karta nie utknela na zawsze.
const czasTerminu = (karta) => Date.parse(karta.termin) || 0

function zalegle({ slowa, karty, ustawienia, teraz }) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const ids = new Set(slowa.map((s) => s.id))
  const czas = teraz.getTime()
  const nauka = []
  const powtorki = []
  for (const [k, karta] of Object.entries(karty)) {
    if (karta.stan === 'nowa') continue
    const { id, kierunek } = rozbierzKlucz(k)
    // Karty slow usunietych z listy zostaja w pamieci, ale nie da sie ich pokazac.
    if (!ids.has(id)) continue
    if (kierunek === 'pl' && !u.mowienie) continue
    const termin = czasTerminu(karta)
    if (termin > czas) continue
    const pozycja = { k, termin }
    if (karta.stan === 'powtorka') powtorki.push(pozycja)
    else nauka.push(pozycja)
  }
  const wgTerminu = (a, b) => a.termin - b.termin
  return { nauka: nauka.sort(wgTerminu), powtorki: powtorki.sort(wgTerminu) }
}

// Kolejnosc: zalegla nauka i ponowne, zalegle powtorki (najstarsze najpierw), nowe mowienie, nowe EN.
export function zbudujSerie({ slowa, karty, ustawienia, dzis, teraz = new Date(), dlugosc }) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const maks = dlugosc ?? u.dlugoscSerii
  const { nauka, powtorki } = zalegle({ slowa, karty, ustawienia: u, teraz })
  const wynik = [...nauka, ...powtorki].slice(0, maks).map((p) => p.k)
  const limity = limityNowych({ karty, ustawienia: u, dzis, teraz })

  for (const s of slowa) {
    if (wynik.length >= maks || limity.pl <= 0) break
    const kPl = klucz(s.id, 'pl')
    if (mowienieOdblokowane(karty[klucz(s.id, 'en')]) && jestNowa(karty[kPl])) {
      wynik.push(kPl)
      limity.pl -= 1
    }
  }
  for (const s of slowa) {
    if (wynik.length >= maks || limity.en <= 0) break
    const kEn = klucz(s.id, 'en')
    if (jestNowa(karty[kEn])) {
      wynik.push(kEn)
      limity.en -= 1
    }
  }
  return wynik
}

// Do ekranu konca serii i menu: ile zaleglych teraz, ile dojdzie jeszcze dzisiaj, ile nowych w limicie.
export function podsumowanieDnia({ slowa, karty, ustawienia, dzis, teraz = new Date() }) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const { nauka, powtorki } = zalegle({ slowa, karty, ustawienia: u, teraz })
  const polnoc = new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() + 1).getTime()
  const ids = new Set(slowa.map((s) => s.id))
  let pozniejDzis = 0
  for (const [k, karta] of Object.entries(karty)) {
    if (karta.stan === 'nowa') continue
    const { id, kierunek } = rozbierzKlucz(k)
    if (!ids.has(id) || (kierunek === 'pl' && !u.mowienie)) continue
    const termin = czasTerminu(karta)
    if (termin > teraz.getTime() && termin < polnoc) pozniejDzis += 1
  }
  const noweDostepne = zbudujSerie({ slowa, karty, ustawienia: u, dzis, teraz, dlugosc: Infinity }).length -
    nauka.length - powtorki.length
  return { zalegle: nauka.length + powtorki.length, pozniejDzis, noweDostepne }
}

function dolicz(mapa, nazwa, poznane) {
  const wpis = mapa.get(nazwa) || { nazwa, poznane: 0, wszystkie: 0 }
  wpis.wszystkie += 1
  wpis.poznane += poznane
  mapa.set(nazwa, wpis)
}

const kolejnoscPoziomu = (p) => (POZIOMY.includes(p) ? POZIOMY.indexOf(p) : POZIOMY.length)

// Poznane = karta EN juz nie jest nowa. Talie w kolejnosci dodania, poziomy tylko te, ktore wystepuja w slowach.
export function statystyki({ slowa, karty }) {
  const talie = new Map()
  const poziomy = new Map()
  let poznaneRazem = 0
  let wPowtorce = 0
  let odblokowane = 0
  for (const s of slowa) {
    const en = karty[klucz(s.id, 'en')]
    const poznane = jestNowa(en) ? 0 : 1
    poznaneRazem += poznane
    dolicz(talie, s.talia || 'Bez nazwy', poznane)
    if (s.poziom) dolicz(poziomy, s.poziom, poznane)
    if (en?.stan === 'powtorka') wPowtorce += 1
    if (mowienieOdblokowane(en)) odblokowane += 1
  }
  return {
    wszystkie: slowa.length,
    poznane: poznaneRazem,
    talie: [...talie.values()],
    poziomy: [...poziomy.values()].sort(
      (a, b) => kolejnoscPoziomu(a.nazwa) - kolejnoscPoziomu(b.nazwa) || a.nazwa.localeCompare(b.nazwa),
    ),
    procentPowtorka: slowa.length ? Math.round((wPowtorce / slowa.length) * 1000) / 10 : 0,
    mowienieOdblokowane: odblokowane,
  }
}

export function nowaSeria(klucze) {
  return { kolejka: [...klucze], wszystkie: klucze.length, oczyszczone: 0, umiem: 0, nieUmiem: 0, exp: 0 }
}

export const aktualnaKarta = (seria) => seria.kolejka[0]

export const koniecSerii = (seria) => seria.kolejka.length === 0

// "Nie umiem" odklada karte tak, ze wraca jako czwarta z kolei (albo ostatnia, gdy kolejka jest krotsza).
// Kazda inna ocena zdejmuje ja z serii.
export function poOcenie(seria, ocena) {
  const [karta, ...reszta] = seria.kolejka
  if (karta === undefined) return seria
  const exp = seria.exp + (EXP_ZA_OCENE[ocena] ?? 0)
  if (ocena === 1) {
    reszta.splice(Math.min(ODSTEP_PO_POMYLCE - 1, reszta.length), 0, karta)
    return { ...seria, kolejka: reszta, nieUmiem: seria.nieUmiem + 1, exp }
  }
  return { ...seria, kolejka: reszta, oczyszczone: seria.oczyszczone + 1, umiem: seria.umiem + 1, exp }
}

export const postepSerii = (seria) => (seria.wszystkie ? seria.oczyszczone / seria.wszystkie : 1)

// Wykladnik 1.5: pasek rusza powoli i przyspiesza pod koniec (goal-gradient), zeby chcialo sie dokonczyc.
export const pasekPostepu = (postep) => Math.pow(Math.min(Math.max(postep, 0), 1), 1.5)

export function zaliczCzas({ streak, dzis }, sekundy, teraz = new Date()) {
  const data = dataLokalna(teraz)
  const dzien = dzisiejszy(dzis, teraz)
  const dodane = Math.min(Math.max(Number(sekundy) || 0, 0), MAKS_SEKUND_KARTY)
  const razem = Math.round((dzien.sekundy + dodane) * 10) / 10
  let nowyStreak = streak
  if (razem >= SEKUNDY_DNIA && streak.ostatniDzien !== data) {
    const ciagiem = streak.ostatniDzien === dzienPrzed(data)
    nowyStreak = { dni: ciagiem ? streak.dni + 1 : 1, ostatniDzien: data }
  }
  return { streak: nowyStreak, dzis: { ...dzien, sekundy: razem } }
}

// Przerwa (ostatni zaliczony dzien starszy niz wczoraj) pokazuje 0, choc zapis zmieni sie dopiero przy zaliczeniu.
export function aktualnyStreak(streak, teraz = new Date()) {
  const data = dataLokalna(teraz)
  if (streak.ostatniDzien === data || streak.ostatniDzien === dzienPrzed(data)) return streak.dni
  return 0
}

// Podpowiedz do mowienia: pierwsza litera, reszta liter jako podkreslenia. Wyrazy rozdziela potrojna spacja,
// zeby bylo widac granice slow, a znaki inne niz litery (apostrof, dywiz) zostaja.
export function podpowiedz(tekst) {
  let pierwsza = true
  return String(tekst)
    .trim()
    .split(/\s+/)
    .map((wyraz) =>
      [...wyraz]
        .map((znak) => {
          if (!/[\p{L}\p{N}]/u.test(znak)) return znak
          if (pierwsza) {
            pierwsza = false
            return znak
          }
          return '_'
        })
        .join(' '),
    )
    .join('   ')
}
