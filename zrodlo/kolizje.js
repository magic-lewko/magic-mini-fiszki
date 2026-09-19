// Indeks kolizji miedzy slowami: pary, ktorych nie powinno sie wprowadzac obok siebie (interferencja).
// Badania: grupowanie semantyczne szkodzi (metaanaliza System 2026), a slowa podobne generuja bledy
// interferencyjne (Nakata i Suzuki 2019). Lapiemy dwa rodzaje kolizji:
//   1) synonimy: to samo glowne polskie znaczenie,
//   2) bliskie ortograficznie: jedna operacja edycji ALBO przestawienie sasiednich liter (quiet/quite),
//      przy dlugosci co najmniej 4 znakow.
// Dystans 2 jest za luzny: lapie room/soon i obejmuje 79% talii.
// Modul jest czysty (bez DOM), liczony raz po wczytaniu talii; wynik trzyma app.js w IndexedDB.

export const MAKS_KOLIZJI = 8
export const MIN_DLUGOSC_PISOWNI = 4
export const MIN_DLUGOSC_ZNACZENIA = 3
export const MAKS_GRUPY_ZNACZEN = 5

const OGONKI = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' }

export const bezOgonkow = (tekst) => String(tekst ?? '').toLowerCase().replace(/[ąćęłńóśźż]/g, (z) => OGONKI[z])

// Damerau-Levenshtein z limitem 1: jedna zamiana, wstawienie, usuniecie albo przestawienie sasiadow.
export function blisko(a, b) {
  if (a === b) return false
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const rozne = []
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) rozne.push(i)
    if (rozne.length === 1) return true
    // przestawienie sasiednich liter: quiet / quite
    if (rozne.length === 2 && rozne[1] === rozne[0] + 1) {
      return a[rozne[0]] === b[rozne[0] + 1] && a[rozne[0] + 1] === b[rozne[0]]
    }
    return false
  }
  // jedno wstawienie albo usuniecie
  const [krotsze, dluzsze] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  let j = 0
  let pominieto = false
  while (i < krotsze.length && j < dluzsze.length) {
    if (krotsze[i] === dluzsze[j]) {
      i += 1
      j += 1
      continue
    }
    if (pominieto) return false
    pominieto = true
    j += 1
  }
  return true
}

// Glowne znaczenia: pierwszy segment przed ";", rozbity po przecinkach, bez nawiasow, bez polskich znakow,
// tylko segmenty dluzsze niz 2 znaki ("byc", "miec" zostaja, "on" odpada).
export const glowneZnaczenia = (pl) =>
  bezOgonkow(pl)
    .split(';')[0]
    .split(',')
    .map((z) => z.replace(/\(.*?\)/g, '').trim())
    .filter((z) => z.length >= MIN_DLUGOSC_ZNACZENIA)

// Zwraca { [id]: [id kolidujacych] } tylko dla slow, ktore maja jakakolwiek kolizje.
// Lista jest przycieta do `maks` pozycji: przy 8 kolizjach dalsze i tak niczego nie zmieniaja.
export function budujKolizje(slowa, maks = MAKS_KOLIZJI) {
  const kolizje = new Map(slowa.map((s) => [s.id, new Set()]))
  const dodaj = (a, b) => {
    kolizje.get(a).add(b)
    kolizje.get(b).add(a)
  }

  // 1) synonimy: to samo glowne polskie znaczenie. Grupy powyzej MAKS_GRUPY_ZNACZEN to slowa-wytrychy
  // ("robic", "rzecz"), gdzie kolizja nic nie mowi.
  const poZnaczeniu = new Map()
  for (const s of slowa) {
    // Zbior, a nie lista: powtorzone znaczenie w jednym polu ("kot, kot") wkladaloby id dwa razy
    // i slowo kolidowaloby samo ze soba.
    for (const z of glowneZnaczenia(s.pl)) {
      if (!poZnaczeniu.has(z)) poZnaczeniu.set(z, new Set())
      poZnaczeniu.get(z).add(s.id)
    }
  }
  for (const zbior of poZnaczeniu.values()) {
    const lista = [...zbior]
    if (lista.length < 2 || lista.length > MAKS_GRUPY_ZNACZEN) continue
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) dodaj(lista[i], lista[j])
    }
  }

  // 2) bliskie ortograficznie. Porownujemy tylko slowa o tej samej dlugosci i o jeden dluzsze, bo przy
  // wiekszej roznicy jedna operacja edycji nie wystarczy.
  const wgDlugosci = new Map()
  for (const s of slowa) {
    const w = String(s.w ?? '').toLowerCase()
    if (w.length < MIN_DLUGOSC_PISOWNI || w.includes(' ')) continue
    if (!wgDlugosci.has(w.length)) wgDlugosci.set(w.length, [])
    wgDlugosci.get(w.length).push({ id: s.id, w })
  }
  for (const [dlugosc, lista] of wgDlugosci) {
    const kandydaci = [...lista, ...(wgDlugosci.get(dlugosc + 1) || [])]
    for (const a of lista) {
      for (const b of kandydaci) {
        if (a.id >= b.id) continue
        if (blisko(a.w, b.w)) dodaj(a.id, b.id)
      }
    }
  }

  const wynik = Object.create(null)
  for (const [id, zbior] of kolizje) {
    if (zbior.size) wynik[id] = [...zbior].slice(0, maks)
  }
  return wynik
}

// FNV-1a 32 bit po id slow: klucz zapisanego indeksu ma sie zmienic po kazdej zmianie talii,
// a nie tylko po zmianie liczby slow (poprawka pisowni zostawia stara liczbe).
export function sumaKontrolna(slowa) {
  let h = 2166136261
  for (const s of slowa) {
    // Tresc, a nie samo id: poprawka pisowni albo tlumaczenia zmienia kolizje, wiec indeks musi sie przeliczyc.
    const wpis = `${s.id ?? ''}|${s.w ?? ''}|${s.pl ?? ''}`
    for (let i = 0; i < wpis.length; i++) h = Math.imul(h ^ wpis.charCodeAt(i), 16777619)
    h = Math.imul(h ^ 124, 16777619)
  }
  return (h >>> 0).toString(36)
}

export const kluczIndeksu = (slowa) => `${slowa.length}-${sumaKontrolna(slowa)}`
