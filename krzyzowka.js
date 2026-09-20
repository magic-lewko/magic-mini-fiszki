// Generator krzyzowki z listy slow do powtorki. Czysty modul: bez DOM, bez timerow, bez Math.random.
// Uklada slowa na siatce maks. 11x11, krzyzujac je na wspolnych literach. Zabronione sa:
//   1) dwa rownolegle slowa stykajace sie bokami (powstalyby z tego przypadkowe "slowa" w poprzek),
//   2) dwa slowa stykajace sie koncami w jednej linii (czytaloby sie to jako jedno dluzsze haslo),
//   3) nakladanie sie slow w tej samej linii.
// Ukladanie jest zachlanne z kilkoma podejsciami: bierzemy najlepsze z `proby` losowan kolejnosci.
// Wynik jest w pelni powtarzalny przy tym samym `ziarno`, wiec da sie go testowac i odtworzyc z zapisu.

export const MAKS_SIATKA = 11
export const MIN_DLUGOSC = 3
export const MAKS_PODPOWIEDZI = 3
// Ile pol dostajesz wypelnionych na starcie. "Kilka" znaczy najwyzej co drugie haslo i nie wiecej niz tyle.
export const MAKS_DANYCH = 4
export const PROBY_UKLADANIA = 6

export const KIERUNKI = { poziomo: 'poziomo', pionowo: 'pionowo' }
export const OCENY = { poprawna: 'poprawna', bledna: 'bledna', brak: 'brak' }

// Kody trafiaja do `nieuzyte[].powod`, opisy sa gotowe do pokazania na ekranie.
export const POWODY = {
  znaki: 'znaki',
  krotkie: 'krotkie',
  dlugie: 'dlugie',
  powtorka: 'powtorka',
  brakMiejsca: 'brak-miejsca',
}

export const OPISY_POWODOW = {
  znaki: 'spacja, apostrof albo ukośnik',
  krotkie: 'mniej niż 3 litery',
  dlugie: 'nie mieści się w siatce',
  powtorka: 'te same litery co inne słowo',
  'brak-miejsca': 'brak wspólnej litery z resztą',
}

const PUSTE = null
const POZIOMO = KIERUNKI.poziomo
const PIONOWO = KIERUNKI.pionowo
// Tylko litery lacinskie: slowo ze spacja, apostrofem, ukosnikiem albo cyfra nie da sie wpisac w siatke.
const TYLKO_LITERY = /^[A-Za-z]+$/

// FNV-1a 32 bit, ten sam jak w talia.js: zamienia dowolne ziarno (liczbe albo tekst) na stan generatora.
function hash32(tekst) {
  let h = 2166136261
  for (let i = 0; i < tekst.length; i++) h = Math.imul(h ^ tekst.charCodeAt(i), 16777619)
  return h >>> 0
}

// Mulberry32: krotki generator pseudolosowy o powtarzalnym ciagu. Swoj, bo Math.random nie da sie testowac.
// Ten sam generator jest w literki.js - obie gry maja zostac niezalezne, wiec wolimy kopie niz wspolny import.
export function generator(ziarno) {
  let stan = hash32(String(ziarno ?? 0))
  return () => {
    stan = (stan + 0x6d2b79f5) >>> 0
    let t = stan
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Tasowanie Fishera-Yatesa na kopii: wejscie zostaje nietkniete.
function wymieszaj(lista, los) {
  const kopia = [...lista]
  for (let i = kopia.length - 1; i > 0; i--) {
    const j = Math.floor(los() * (i + 1))
    const pomoc = kopia[i]
    kopia[i] = kopia[j]
    kopia[j] = pomoc
  }
  return kopia
}

export const kluczPola = (wiersz, kolumna) => `${wiersz},${kolumna}`

// Odsiewa slowa, ktorych nie da sie wpisac w siatke. Zwraca gotowe do ukladania i odrzucone z powodem.
function przygotujSlowa(slowa, maksSiatka) {
  const dobre = []
  const nieuzyte = []
  const widziane = new Set()
  for (const pozycja of slowa) {
    const w = (typeof pozycja === 'string' ? pozycja : String(pozycja?.w ?? '')).trim()
    const wpis = { id: String(pozycja?.id ?? w), w, pl: String(pozycja?.pl ?? '') }
    if (!TYLKO_LITERY.test(w)) {
      nieuzyte.push({ ...wpis, powod: POWODY.znaki })
      continue
    }
    if (w.length < MIN_DLUGOSC) {
      nieuzyte.push({ ...wpis, powod: POWODY.krotkie })
      continue
    }
    if (w.length > maksSiatka) {
      nieuzyte.push({ ...wpis, powod: POWODY.dlugie })
      continue
    }
    // Siatka nie rozroznia wielkosci liter, wiec "May" i "may" walczylyby o te same pola.
    const litery = w.toUpperCase()
    if (widziane.has(litery)) {
      nieuzyte.push({ ...wpis, powod: POWODY.powtorka })
      continue
    }
    widziane.add(litery)
    dobre.push({ ...wpis, litery })
  }
  return { dobre, nieuzyte }
}

const pustaSiatka = (rozmiar) => Array.from({ length: rozmiar }, () => new Array(rozmiar).fill(PUSTE))

const pole = (siatka, w, k) => (siatka[w] === undefined || siatka[w][k] === undefined ? PUSTE : siatka[w][k])

// Zwraca liczbe skrzyzowan albo -1, gdy ulozenie lamie ktoras z regul krzyzowki.
function policzSkrzyzowania(siatka, litery, wiersz, kolumna, kierunek) {
  const rozmiar = siatka.length
  const dw = kierunek === PIONOWO ? 1 : 0
  const dk = kierunek === POZIOMO ? 1 : 0
  const koniecW = wiersz + dw * (litery.length - 1)
  const koniecK = kolumna + dk * (litery.length - 1)
  if (wiersz < 0 || kolumna < 0 || koniecW >= rozmiar || koniecK >= rozmiar) return -1
  // Pole przed poczatkiem i za koncem musi byc puste, inaczej dwa slowa skleilyby sie w jedna linie.
  if (pole(siatka, wiersz - dw, kolumna - dk) !== PUSTE) return -1
  if (pole(siatka, koniecW + dw, koniecK + dk) !== PUSTE) return -1

  let skrzyzowania = 0
  let poprzednieZajete = false
  for (let i = 0; i < litery.length; i++) {
    const w = wiersz + dw * i
    const k = kolumna + dk * i
    const znak = siatka[w][k]
    if (znak !== PUSTE) {
      if (znak !== litery[i]) return -1
      // Dwa zajete pola pod rzad znacza, ze nakladamy sie na slowo lezace w tej samej linii.
      if (poprzednieZajete) return -1
      poprzednieZajete = true
      skrzyzowania += 1
      continue
    }
    poprzednieZajete = false
    // Nowe pole nie moze miec sasiada z boku: tak wlasnie stykaja sie slowa rownolegle.
    if (pole(siatka, w - dk, k - dw) !== PUSTE) return -1
    if (pole(siatka, w + dk, k + dw) !== PUSTE) return -1
  }
  return skrzyzowania
}

// Siatka robocza jest prywatna dla jednej proby, wiec wolno ja zapisywac w miejscu.
function wstaw(siatka, litery, wiersz, kolumna, kierunek) {
  const dw = kierunek === PIONOWO ? 1 : 0
  const dk = kierunek === POZIOMO ? 1 : 0
  for (let i = 0; i < litery.length; i++) siatka[wiersz + dw * i][kolumna + dk * i] = litery[i]
}

// Najlepsze ulozenie slowa: wiecej skrzyzowan jest wazniejsze niz blizej srodka, reszte rozstrzyga ziarno.
function najlepszeUlozenie(siatka, litery, los) {
  const srodek = (siatka.length - 1) / 2
  let najlepsze = null
  for (let w = 0; w < siatka.length; w++) {
    for (let k = 0; k < siatka.length; k++) {
      const znak = siatka[w][k]
      if (znak === PUSTE) continue
      for (let i = 0; i < litery.length; i++) {
        if (litery[i] !== znak) continue
        const ulozenia = [
          { kierunek: POZIOMO, wiersz: w, kolumna: k - i },
          { kierunek: PIONOWO, wiersz: w - i, kolumna: k },
        ]
        for (const u of ulozenia) {
          const skrzyzowania = policzSkrzyzowania(siatka, litery, u.wiersz, u.kolumna, u.kierunek)
          if (skrzyzowania < 1) continue
          const odSrodka = Math.abs(u.wiersz - srodek) + Math.abs(u.kolumna - srodek)
          const ocena = skrzyzowania * 100 - odSrodka + los()
          if (!najlepsze || ocena > najlepsze.ocena) najlepsze = { ...u, ocena }
        }
      }
    }
  }
  return najlepsze
}

// Jedno podejscie: pierwsze slowo poziomo na srodku, reszta dobudowuje sie wokol niego.
// Powtarzamy przebiegi po nieulozonych slowach, bo slowo odrzucone na poczatku moze pasowac pozniej.
function jednaProba(kolejnosc, maksSiatka, los) {
  const siatka = pustaSiatka(maksSiatka)
  const zostaly = [...kolejnosc]
  const pierwsze = zostaly.shift()
  const wiersz = Math.floor((maksSiatka - 1) / 2)
  const kolumna = Math.floor((maksSiatka - pierwsze.litery.length) / 2)
  wstaw(siatka, pierwsze.litery, wiersz, kolumna, POZIOMO)
  const ulozone = [{ ...pierwsze, wiersz, kolumna, kierunek: POZIOMO }]

  let zmiana = true
  while (zmiana && zostaly.length) {
    zmiana = false
    for (let i = 0; i < zostaly.length; i++) {
      const gdzie = najlepszeUlozenie(siatka, zostaly[i].litery, los)
      if (!gdzie) continue
      wstaw(siatka, zostaly[i].litery, gdzie.wiersz, gdzie.kolumna, gdzie.kierunek)
      ulozone.push({ ...zostaly[i], wiersz: gdzie.wiersz, kolumna: gdzie.kolumna, kierunek: gdzie.kierunek })
      zostaly.splice(i, 1)
      i -= 1
      zmiana = true
    }
  }
  return { siatka, ulozone, zostaly }
}

// Przycina siatke do pol zajetych, zeby interfejs nie rysowal pustych marginesow.
function przytnij(siatka, ulozone) {
  let minW = Infinity
  let maksW = -1
  let minK = Infinity
  let maksK = -1
  for (let w = 0; w < siatka.length; w++) {
    for (let k = 0; k < siatka.length; k++) {
      if (siatka[w][k] === PUSTE) continue
      if (w < minW) minW = w
      if (w > maksW) maksW = w
      if (k < minK) minK = k
      if (k > maksK) maksK = k
    }
  }
  if (maksW < 0) return { siatka: [], ulozone: [] }
  const przycieta = []
  for (let w = minW; w <= maksW; w++) przycieta.push(siatka[w].slice(minK, maksK + 1))
  return {
    siatka: przycieta,
    ulozone: ulozone.map((u) => ({ ...u, wiersz: u.wiersz - minW, kolumna: u.kolumna - minK })),
  }
}

// Numeracja jak w papierowej krzyzowce: od gory w prawo, a dwa hasla z tego samego pola maja ten sam numer.
function ponumeruj(ulozone) {
  const kolejnosc = [...ulozone].sort(
    (a, b) =>
      a.wiersz - b.wiersz ||
      a.kolumna - b.kolumna ||
      (a.kierunek === POZIOMO ? 0 : 1) - (b.kierunek === POZIOMO ? 0 : 1)
  )
  let numer = 0
  let poprzedni = null
  return kolejnosc.map((u) => {
    if (!poprzedni || poprzedni.wiersz !== u.wiersz || poprzedni.kolumna !== u.kolumna) numer += 1
    poprzedni = u
    return {
      numer,
      kierunek: u.kierunek,
      wiersz: u.wiersz,
      kolumna: u.kolumna,
      dlugosc: u.litery.length,
      slowo: u.w,
      haslo: u.pl,
      id: u.id,
    }
  })
}

// Kolejnosc ukladania: dluzsze slowa najpierw (lepiej wiaza siatke), ale z rozrzutem z ziarna,
// zeby kazde ziarno dawalo inna krzyzowke z tych samych slow.
const uporzadkuj = (slowa, los) =>
  slowa
    .map((s) => ({ s, waga: s.litery.length + los() * 3 }))
    .sort((a, b) => b.waga - a.waga)
    .map((p) => p.s)

// Uklada krzyzowke. Nigdy nie rzuca wyjatkiem: gdy nie da sie uzyc zadnego slowa, zwraca pusta siatke,
// a wszystkie slowa trafiaja do `nieuzyte` z powodem.
export function ulozKrzyzowke(slowa, { maksSiatka = MAKS_SIATKA, ziarno = 0, proby = PROBY_UKLADANIA } = {}) {
  const { dobre, nieuzyte } = przygotujSlowa(Array.isArray(slowa) ? slowa : [], maksSiatka)
  if (!dobre.length) return { siatka: [], hasla: [], nieuzyte }

  const los = generator(ziarno)
  let najlepsza = null
  for (let p = 0; p < Math.max(1, proby); p++) {
    const proba = jednaProba(uporzadkuj(dobre, los), maksSiatka, los)
    if (!najlepsza || proba.ulozone.length > najlepsza.ulozone.length) najlepsza = proba
    if (!najlepsza.zostaly.length) break
  }

  const przyciete = przytnij(najlepsza.siatka, najlepsza.ulozone)
  const brakMiejsca = najlepsza.zostaly.map((s) => ({ id: s.id, w: s.w, pl: s.pl, powod: POWODY.brakMiejsca }))
  return { siatka: przyciete.siatka, hasla: ponumeruj(przyciete.ulozone), nieuzyte: [...nieuzyte, ...brakMiejsca] }
}

// Pola jednego hasla, w kolejnosci liter. Interfejs uzywa tego do zaznaczania i do ograniczenia podpowiedzi.
export function komorkiHasla(haslo) {
  const dw = haslo.kierunek === PIONOWO ? 1 : 0
  const dk = haslo.kierunek === POZIOMO ? 1 : 0
  const dlugosc = haslo.dlugosc ?? String(haslo.slowo ?? '').length
  return Array.from({ length: dlugosc }, (_, i) => ({ wiersz: haslo.wiersz + dw * i, kolumna: haslo.kolumna + dk * i }))
}

// Sprawdza wpisane litery. `odpowiedzi` to mapa "wiersz,kolumna" -> litera; porownanie ignoruje wielkosc liter.
// Zwraca siatke ocen tego samego ksztaltu co `siatka` (null na polach poza krzyzowka) i liczniki.
export function sprawdzKrzyzowke(siatka, odpowiedzi = {}) {
  const wpisane = odpowiedzi ?? {}
  const oceny = []
  let poprawne = 0
  let bledne = 0
  let puste = 0
  for (let w = 0; w < siatka.length; w++) {
    const wiersz = []
    for (let k = 0; k < siatka[w].length; k++) {
      const oczekiwana = siatka[w][k]
      if (oczekiwana === PUSTE) {
        wiersz.push(null)
        continue
      }
      const litera = String(wpisane[kluczPola(w, k)] ?? '').trim().toUpperCase()
      if (!litera) {
        wiersz.push(OCENY.brak)
        puste += 1
      } else if (litera === oczekiwana) {
        wiersz.push(OCENY.poprawna)
        poprawne += 1
      } else {
        wiersz.push(OCENY.bledna)
        bledne += 1
      }
    }
    oceny.push(wiersz)
  }
  const wszystkie = poprawne + bledne + puste
  return { oceny, poprawne, bledne, puste, wszystkie, ukonczone: wszystkie > 0 && poprawne === wszystkie }
}

// Litery dane z gory: kilka pol jest wypelnionych juz na starcie, najwyzej po jednej na haslo. Pusta
// siatka zniechecala do wejscia w gre, a jedna litera hasla nie rozwiazuje za gracza. Litera na
// skrzyzowaniu liczy sie obu haslom naraz. Czysta funkcja: to samo ziarno daje ten sam uklad.
export function daneLitery(siatka = [], hasla = [], { ziarno = 0, maks = MAKS_DANYCH } = {}) {
  if (!hasla.length) return {}
  const los = generator(`dane|${ziarno}`)
  const ile = Math.max(1, Math.min(maks, Math.floor(hasla.length / 2)))
  const komorki = hasla.map((h) => komorkiHasla(h).map((c) => kluczPola(c.wiersz, c.kolumna)))
  const obsluzone = new Set()
  const wynik = {}
  for (const i of wymieszaj(
    hasla.map((_, indeks) => indeks),
    los,
  )) {
    if (Object.keys(wynik).length >= ile) break
    if (obsluzone.has(i)) continue
    // Pole nie moze nalezec do hasla, ktore juz dostalo litere.
    const wolne = komorki[i].filter((kl) => !komorki.some((lista, j) => obsluzone.has(j) && lista.includes(kl)))
    if (!wolne.length) continue
    const kl = wolne[Math.floor(los() * wolne.length)]
    const [w, k] = kl.split(',').map(Number)
    const litera = pole(siatka, w, k)
    if (litera === PUSTE) continue
    wynik[kl] = litera
    komorki.forEach((lista, j) => {
      if (lista.includes(kl)) obsluzone.add(j)
    })
  }
  return wynik
}

// Odkrywa jedna litere. `stan` to { siatka, odpowiedzi, uzyte, ziarno, komorki?, maks? }:
// `komorki` zaweza wybor do jednego hasla (z komorkiHasla), `maks` to limit podpowiedzi na krzyzowke.
// Zwraca nowy stan i odkryte pole; stan wejsciowy zostaje nietkniety.
export function podpowiedzLitere(stan) {
  const { siatka = [], odpowiedzi = {}, uzyte = 0, ziarno = 0, komorki = null, maks = MAKS_PODPOWIEDZI } = stan ?? {}
  if (uzyte >= maks) return { stan, podpowiedz: null, powod: 'limit' }

  const dozwolone = komorki ? new Set(komorki.map((p) => kluczPola(p.wiersz, p.kolumna))) : null
  const kandydaci = []
  for (let w = 0; w < siatka.length; w++) {
    for (let k = 0; k < siatka[w].length; k++) {
      const litera = siatka[w][k]
      if (litera === PUSTE) continue
      const kl = kluczPola(w, k)
      if (dozwolone && !dozwolone.has(kl)) continue
      // Pole juz wpisane poprawnie nie jest podpowiedzia; bledne wolno poprawic.
      if (String(odpowiedzi[kl] ?? '').trim().toUpperCase() === litera) continue
      kandydaci.push({ wiersz: w, kolumna: k, litera })
    }
  }
  if (!kandydaci.length) return { stan, podpowiedz: null, powod: 'brak' }

  // Ziarno z licznikiem uzyc: druga podpowiedz w tej samej krzyzowce trafia gdzie indziej niz pierwsza.
  const los = generator(`${ziarno}|${uzyte}`)
  const wybrana = kandydaci[Math.floor(los() * kandydaci.length)]
  const nowe = { ...odpowiedzi, [kluczPola(wybrana.wiersz, wybrana.kolumna)]: wybrana.litera }
  return { stan: { ...stan, odpowiedzi: nowe, uzyte: uzyte + 1 }, podpowiedz: wybrana, powod: '' }
}
