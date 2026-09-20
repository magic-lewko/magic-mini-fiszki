// Gra "Literki": ukladanie angielskiego slowa z rozsypanych liter. Czysty modul: bez DOM, bez timerow,
// bez Math.random. Stan ukladania jest przekazywany i zwracany, nigdy zmieniany w miejscu.
// Do kazdego slowa dokladamy kilka liter zbednych (bez nich gra byla za latwa, a slowa powyzej 6 znakow
// szly z samych wlasnych liter). Zbedna moze byc tylko taka litera, ktora z reszta nie ulozyla by sie w
// inne slowo z talii - inaczej gracz ulozylby poprawne slowo i dostal blad. Kafelkow nigdy nie ma wiecej
// niz MAKS_KAFELKOW, zeby zmiescily sie na ekranie telefonu jako cele dotyku po 44 px.

export const MIN_DLUGOSC = 3
export const MAKS_KAFELKOW = 14
export const DODATKOWE_MIN = 4
export const DODATKOWE_MAKS = 6
export const DLUGOSC_RUNDY = 10

const ALFABET = 'abcdefghijklmnopqrstuvwxyz'
// Tylko litery lacinskie: slowa ze spacja, apostrofem albo ukosnikiem nie nadaja sie na kafelki.
const TYLKO_LITERY = /^[A-Za-z]+$/

// FNV-1a 32 bit, ten sam jak w talia.js: zamienia dowolne ziarno (liczbe albo tekst) na stan generatora.
function hash32(tekst) {
  let h = 2166136261
  for (let i = 0; i < tekst.length; i++) h = Math.imul(h ^ tekst.charCodeAt(i), 16777619)
  return h >>> 0
}

// Mulberry32: krotki generator pseudolosowy o powtarzalnym ciagu. Kopia z krzyzowka.js jest celowa -
// obie gry maja byc niezalezne, zeby interfejs mogl wczytac tylko jedna z nich.
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

const angielskie = (pozycja) => (typeof pozycja === 'string' ? pozycja : String(pozycja?.w ?? '')).trim()

const nadajeSie = (w) => TYLKO_LITERY.test(w) && w.length >= MIN_DLUGOSC

// Ile razy kazda litera wystepuje w slowie. Klucz "letter": dwa T i dwa E musza byc dwoma kafelkami.
function liczLitery(tekst) {
  const mapa = new Map()
  for (const znak of tekst) mapa.set(znak, (mapa.get(znak) || 0) + 1)
  return mapa
}

const daSieUlozyc = (zapas, slowo) => {
  for (const [litera, ile] of slowo) if ((zapas.get(litera) || 0) < ile) return false
  return true
}

// Slowa z talii, ktore da sie ulozyc dopiero po dolozeniu 1..`ile` liter. Te, ktore powstaja juz z samych
// liter zadania (np. "cat" z "cats"), pomijamy: zadna dodatkowa litera ich nie cofnie.
function groznaZTalii(talia, male, zapas, ile) {
  const wynik = []
  const maks = male.length + ile
  for (const pozycja of talia) {
    const slowo = angielskie(pozycja).toLowerCase()
    if (slowo === male || slowo.length < MIN_DLUGOSC || slowo.length > maks) continue
    if (!TYLKO_LITERY.test(slowo)) continue
    const mapa = liczLitery(slowo)
    let brakuje = 0
    for (const [litera, potrzeba] of mapa) brakuje += Math.max(0, potrzeba - (zapas.get(litera) || 0))
    if (brakuje > 0 && brakuje <= ile) wynik.push(mapa)
  }
  return wynik
}

// Litery zbedne: z alfabetu, zawsze spoza slowa (inaczej nie dalo by sie ich odroznic od potrzebnych)
// i takie, ktore z zapasem nie ukladaja sie w inne slowo z talii.
function wybierzDodatkowe(male, ile, talia, los) {
  if (ile <= 0) return []
  const zapas = liczLitery(male)
  const grozne = groznaZTalii(Array.isArray(talia) ? talia : [], male, zapas, ile)
  const dodane = []
  for (const litera of wymieszaj([...ALFABET].filter((z) => !zapas.has(z)), los)) {
    if (dodane.length >= ile) break
    zapas.set(litera, 1)
    if (grozne.some((g) => daSieUlozyc(zapas, g))) {
      zapas.delete(litera)
      continue
    }
    dodane.push(litera.toUpperCase())
  }
  return dodane
}

// Im dluzsze slowo, tym mniej zbednych liter sie miesci: limit kafelkow obejmuje oba skladniki.
const ileDodatkowych = (dlugosc, dodatkowe, los) => {
  if (typeof dodatkowe === 'number') return Math.max(0, Math.trunc(dodatkowe))
  const ile = DODATKOWE_MIN + Math.floor(los() * (DODATKOWE_MAKS - DODATKOWE_MIN + 1))
  return Math.max(0, Math.min(ile, MAKS_KAFELKOW - dlugosc))
}

// Przygotowuje kafelki dla jednego slowa. `slowo` to napis albo pozycja talii, `talia` to lista slow,
// ktorych nie wolno dac sie ulozyc z dodatkowych liter. Kafelki sa wielkimi literami, zeby wielkosc
// liter w slowie ("May") nie podpowiadala, ktora litera jest pierwsza.
export function przygotujLiterki(slowo, { ziarno = 0, dodatkowe, talia = [] } = {}) {
  const w = angielskie(slowo)
  if (!nadajeSie(w)) return { litery: [], poprawne: w, dodane: [] }
  const los = generator(`${ziarno}|${w}`)
  const male = w.toLowerCase()
  const dodane = wybierzDodatkowe(male, ileDodatkowych(w.length, dodatkowe, los), talia, los)
  return { litery: wymieszaj([...w.toUpperCase(), ...dodane], los), poprawne: w, dodane }
}

// Slowo ulozone z wybranych kafelkow.
export const ulozone = (stan) => (stan?.wybrane ?? []).map((i) => stan.litery[i]).join('')

// Dostawia kafelek o danym indeksie. Nie da sie uzyc tego samego kafelka dwa razy ani przekroczyc dlugosci
// slowa. Gdy ruch jest niemozliwy, zwracamy ten sam stan - interfejs pozna po tym, ze nic sie nie stalo.
export function dopiszLitere(stan, indeks) {
  const litery = stan?.litery ?? []
  const wybrane = stan?.wybrane ?? []
  if (!Number.isInteger(indeks) || indeks < 0 || indeks >= litery.length) return stan
  if (wybrane.includes(indeks)) return stan
  if (wybrane.length >= String(stan?.poprawne ?? '').length) return stan
  return { ...stan, wybrane: [...wybrane, indeks] }
}

// Zdejmuje ostatni kafelek. Przy pustej odpowiedzi zwraca ten sam stan.
export function cofnijLitere(stan) {
  const wybrane = stan?.wybrane ?? []
  if (!wybrane.length) return stan
  return { ...stan, wybrane: wybrane.slice(0, -1) }
}

// Slowo ulozone poprawnie? Wielkosc liter nie ma znaczenia, bo kafelki sa wielkimi literami.
export function czyPoprawne(stan) {
  const poprawne = String(stan?.poprawne ?? '')
  if (!poprawne) return false
  return ulozone(stan).toLowerCase() === poprawne.toLowerCase()
}

// Podpowiedz: najpierw zdejmuje litery od pierwszego bledu, potem doklada kolejna poprawna.
// Zwraca { stan, indeks, znak, usuniete }; `indeks` to null, gdy nie ma juz czego podpowiedziec.
export function podpowiedzKolejnaLitere(stan) {
  const poprawne = String(stan?.poprawne ?? '')
  const litery = stan?.litery ?? []
  const wybrane = stan?.wybrane ?? []
  let dobre = 0
  while (
    dobre < wybrane.length &&
    dobre < poprawne.length &&
    String(litery[wybrane[dobre]] ?? '').toLowerCase() === poprawne[dobre].toLowerCase()
  ) {
    dobre += 1
  }
  const zostawione = wybrane.slice(0, dobre)
  const usuniete = wybrane.length - dobre
  const przyciety = usuniete ? { ...stan, wybrane: zostawione } : stan

  if (dobre >= poprawne.length) return { stan: przyciety, indeks: null, znak: '', usuniete }
  const szukana = poprawne[dobre].toLowerCase()
  const uzyte = new Set(zostawione)
  const indeks = litery.findIndex((znak, i) => !uzyte.has(i) && String(znak).toLowerCase() === szukana)
  if (indeks < 0) return { stan: przyciety, indeks: null, znak: '', usuniete }

  return {
    stan: { ...stan, wybrane: [...zostawione, indeks], podpowiedzi: (stan?.podpowiedzi ?? 0) + 1 },
    indeks,
    znak: litery[indeks],
    usuniete,
  }
}

// Seria slow do gry. Kazde zadanie jest gotowym stanem ukladania, wiec dopiszLitere i reszta dzialaja
// na nim wprost. Ziarno kazdego zadania bierze sie z id slowa, wiec kolejnosc w serii go nie zmienia.
export function nowaRunda(slowa, { dlugosc = DLUGOSC_RUNDY, ziarno = 0 } = {}) {
  const lista = Array.isArray(slowa) ? slowa : []
  const dobre = lista.filter((pozycja) => nadajeSie(angielskie(pozycja)))
  const wylosowane = wymieszaj(dobre, generator(ziarno)).slice(0, Math.max(0, Math.trunc(dlugosc)))
  const zadania = wylosowane.map((pozycja) => {
    const w = angielskie(pozycja)
    const id = String(pozycja?.id ?? w)
    const { litery, poprawne, dodane } = przygotujLiterki(w, { ziarno: `${ziarno}|${id}`, talia: lista })
    return { id, pl: String(pozycja?.pl ?? ''), poprawne, litery, dodane, wybrane: [], podpowiedzi: 0 }
  })
  return { ziarno, dlugosc, pozycja: 0, zadania }
}
