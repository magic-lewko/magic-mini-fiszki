// Slowka z wklejonego tekstu albo pliku i scalanie z talia. Bez DOM, testowane w Node.
// Formaty: obiekt JSON { nazwa?, zrodlo?, slowa: [...] }, sama tablica JSON slow albo tekst
// linia po linii "english ; polski" (albo tabulator), z opcjonalnymi kolumnami zdanie i zdaniePl.
// id to domyslnie `w` i rozroznia wielkosc liter: "May" (maj) i "may" (moc) to rozne slowa.

import { dataLokalna } from './talia.js'

export const POLA_TRESCI = ['w', 'pl', 'poziom', 'ipa', 'czesci', 'zdanie', 'zdaniePl']

const jestObiektem = (x) => typeof x === 'object' && x !== null && !Array.isArray(x)
const tekst = (x) => (typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : '')

// Zwraca { slowo } albo { blad }. Puste pola opcjonalne nie sa zapisywane, zeby talia zajmowala mniej miejsca.
export function normalizujSlowo(surowe, talia = '') {
  if (!jestObiektem(surowe)) return { blad: 'to nie jest obiekt słowa' }
  const w = tekst(surowe.w)
  const pl = tekst(surowe.pl)
  if (!w) return { blad: 'brak słowa angielskiego (pole "w")' }
  if (!pl) return { blad: 'brak tłumaczenia (pole "pl")' }
  const id = tekst(surowe.id) || w
  if (id.includes('|')) return { blad: 'znak "|" w id jest niedozwolony' }

  const slowo = { id, w, pl }
  const poziom = tekst(surowe.poziom).toUpperCase()
  if (poziom) slowo.poziom = poziom
  // Transkrypcja bywa zapisana w ukosnikach, a interfejs dodaje je sam.
  const ipa = tekst(surowe.ipa).replace(/^[/[\s]+|[/\]\s]+$/g, '')
  if (ipa) slowo.ipa = ipa
  const czesci = (Array.isArray(surowe.czesci) ? surowe.czesci.map(tekst) : tekst(surowe.czesci).split(','))
    .map((c) => c.trim())
    .filter(Boolean)
  if (czesci.length) slowo.czesci = czesci
  const zdanie = tekst(surowe.zdanie)
  if (zdanie) slowo.zdanie = zdanie
  const zdaniePl = tekst(surowe.zdaniePl)
  if (zdaniePl) slowo.zdaniePl = zdaniePl
  const nazwaTalii = tekst(talia)
  if (nazwaTalii) slowo.talia = nazwaTalii
  return { slowo }
}

function wynik(format, nazwa, zrodlo) {
  return { format, nazwa, zrodlo, jednostka: format === 'tekst' ? 'wiersz' : 'pozycja', slowa: [], bledy: [], bladOgolny: '' }
}

// Powtorzone id w jednym imporcie to prawie zawsze pomylka, wiec zglaszamy je zamiast po cichu nadpisywac.
function dodaj(w, nr, surowe) {
  const { slowo, blad } = normalizujSlowo(surowe, w.nazwa)
  if (blad) {
    w.bledy.push({ nr, blad })
    return
  }
  const pierwszy = w.numery.get(slowo.id)
  if (pierwszy !== undefined) {
    w.bledy.push({ nr, blad: `powtórzone słowo "${slowo.id}" (pierwszy raz: ${w.jednostka} ${pierwszy})` })
    return
  }
  w.numery.set(slowo.id, nr)
  w.slowa.push(slowo)
}

function zTablicy(tablica, format, nazwa, zrodlo) {
  const w = { ...wynik(format, nazwa, zrodlo), numery: new Map() }
  tablica.forEach((surowe, i) => dodaj(w, i + 1, surowe))
  delete w.numery
  return w
}

function zTekstu(calosc, nazwa) {
  const w = { ...wynik('tekst', nazwa, ''), numery: new Map() }
  calosc.split(/\r\n|\r|\n/).forEach((linia, i) => {
    if (!linia.trim() || linia.trimStart().startsWith('#')) return
    const separator = linia.includes('\t') ? '\t' : linia.includes(';') ? ';' : ''
    if (!separator) {
      w.bledy.push({ nr: i + 1, blad: 'brak średnika albo tabulatora między słowem a tłumaczeniem' })
      return
    }
    const [slowoEn, pl, zdanie, zdaniePl] = linia.split(separator)
    dodaj(w, i + 1, { w: slowoEn, pl, zdanie, zdaniePl })
  })
  delete w.numery
  return w
}

export function parsujWklejone(wejscie, teraz = new Date()) {
  const calosc = String(wejscie ?? '').replace(/^\uFEFF/, '')
  const domyslnaNazwa = `Wklejone ${dataLokalna(teraz)}`
  const poczatek = calosc.trimStart()[0]
  if (poczatek !== '{' && poczatek !== '[') return zTekstu(calosc, domyslnaNazwa)

  let dane
  try {
    dane = JSON.parse(calosc)
  } catch (blad) {
    return { ...wynik('json', domyslnaNazwa, ''), bladOgolny: `Niepoprawny JSON: ${blad.message}` }
  }
  if (Array.isArray(dane)) return zTablicy(dane, 'tablica', domyslnaNazwa, '')
  if (!jestObiektem(dane) || !Array.isArray(dane.slowa)) {
    return { ...wynik('json', domyslnaNazwa, ''), bladOgolny: 'W pliku JSON brakuje tablicy "slowa".' }
  }
  return zTablicy(dane.slowa, 'json', tekst(dane.nazwa) || domyslnaNazwa, tekst(dane.zrodlo))
}

const tresc = (s, pole) => (Array.isArray(s[pole]) ? s[pole].join('\u0000') : s[pole] ?? '')

// Nowe slowa na koniec kolejnosci nauki, istniejace dostaja nowa tresc. Pole pominiete w imporcie zostaje stare,
// zeby wklejenie "apple ; jablko" nie skasowalo transkrypcji i zdan z pelnej listy. Istniejace slowo zostaje
// w swojej talii. Postep jest trzymany osobno po id, wiec scalanie go nie dotyka.
export function scal(obecne, przychodzace) {
  const pozycje = new Map(obecne.map((s, i) => [s.id, i]))
  const slowa = [...obecne]
  let nowe = 0
  let zaktualizowane = 0
  let bezZmian = 0
  for (const s of przychodzace) {
    const i = pozycje.get(s.id)
    if (i === undefined) {
      pozycje.set(s.id, slowa.length)
      slowa.push(s)
      nowe += 1
      continue
    }
    const stare = slowa[i]
    const polaczone = { ...stare }
    for (const pole of POLA_TRESCI) {
      if (s[pole] !== undefined) polaczone[pole] = s[pole]
    }
    if (POLA_TRESCI.some((pole) => tresc(polaczone, pole) !== tresc(stare, pole))) {
      slowa[i] = polaczone
      zaktualizowane += 1
    } else {
      bezZmian += 1
    }
  }
  return { slowa, nowe, zaktualizowane, bezZmian }
}

// Lista talii do menu (zrodla i licencje). Ponowny import tej samej nazwy aktualizuje wpis.
export function dopiszTalie(talie, { nazwa, zrodlo }, teraz = new Date()) {
  const bez = (talie || []).filter((t) => t.nazwa !== nazwa)
  return [...bez, { nazwa, zrodlo: zrodlo || '', dodano: teraz.toISOString() }]
}
