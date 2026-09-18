// Postep w localStorage i kopia zapasowa (talia + postep) do pliku. Zapis synchronicznie po kazdej ocenie.
// Zapis jest zwarty: WebKit daje ok. 5 MB liczone w UTF-16 (ok. 2,5 mln znakow), a 6000 slow w dwoch
// kierunkach jako obiekty z datami ISO zajeloby ok. 2,5 mln znakow. Tablice i minuty mieszcza sie w ulamku tego.
// Funkcje przyjmuja magazyn (domyslnie localStorage), zeby dalo sie je testowac w Node.

import {
  DOMYSLNE_USTAWIENIA,
  OPCJE_CELU,
  OPCJE_DLUGOSCI,
  OPCJE_NOWYCH,
  POZIOMY_PODPOWIEDZI,
  STANY,
  dataLokalna,
  klucz,
  przytnijHistorie,
} from './talia.js'
import { normalizujSlowo } from './slowka.js'

export const KLUCZ = 'mmf-v1'
export const KLUCZ_POPRZEDNI = 'mmf-v1-poprzedni'
export const KLUCZ_DNIA_POPRZEDNIEGO = 'mmf-v1-poprzedni-dzien'
export const KLUCZ_PRZED_WCZYTANIEM = 'mmf-v1-przed-wczytaniem'
export const KLUCZ_USZKODZONY = 'mmf-v1-uszkodzony'
export const FORMAT_KOPII = 'mmf-kopia'
export const WERSJA_ZAPISU = 1
export const WERSJA_KOPII = 2

// Termin jako minuty od 2026-01-01 UTC: 6-7 cyfr zamiast 24 znakow ISO. Pola ostatnio i wprowadzono sa potrzebne
// tylko z dokladnoscia do dnia lokalnego (FSRS liczy dni po kalendarzu, limit nowych idzie po dacie), wiec
// zapisujemy numer dnia i odtwarzamy poludnie tego dnia.
export const BAZA_MINUT = Date.UTC(2026, 0, 1) / 60000
const BAZA_DNI = Date.UTC(2026, 0, 1) / 86400000

const pamiecDomyslna = () => globalThis.localStorage

export function domyslnyStan() {
  return {
    karty: {},
    pominiete: {},
    exp: 0,
    streak: { dni: 0, ostatniDzien: '' },
    dzis: { data: '', sekundy: 0, dodatkoweNowe: 0 },
    historia: {},
    zgloszenia: [],
    ustawienia: { ...DOMYSLNE_USTAWIENIA },
    ostatniaKopia: '',
    rozproszono: 0,
  }
}

const jestObiektem = (x) => typeof x === 'object' && x !== null && !Array.isArray(x)
const liczbaNieujemna = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0
const calkowitaNieujemna = (x) => Number.isInteger(x) && x >= 0
const minutaZakresu = (x) => Number.isInteger(x) && Math.abs(x) < 1e9
const dzienZakresu = (x) => Number.isInteger(x) && Math.abs(x) < 1e6
const dataLubPusto = (x) => x === '' || (typeof x === 'string' && !Number.isNaN(Date.parse(x)))
const dzienRrrrMmDd = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const tekst = (x) => (typeof x === 'string' ? x.trim() : '')
const nie = (blad) => ({ ok: false, blad })

const minuty = (iso) => (iso ? Math.round(Date.parse(iso) / 60000) - BAZA_MINUT : null)
const zMinut = (m) => (m === null ? '' : new Date((m + BAZA_MINUT) * 60000).toISOString())

function dzien(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 - BAZA_DNI
}

function zDnia(n) {
  if (n === null) return ''
  const d = new Date((n + BAZA_DNI) * 86400000)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12).toISOString()
}
// Trzy miejsca po przecinku: stabilnosc (w dniach) z dokladnoscia do ok. 1,5 minuty, trudnosc 1-10. FSRS i tak
// zaokragla interwal do pelnych dni.
const trzyMiejsca = (x) => Math.round(x * 1000) / 1000

// Karty w pamieci sa niemutowalne (po ocenie powstaje nowy obiekt), wiec spakowana postac mozna trzymac
// przy obiekcie. Zapis po ocenie pakuje wtedy tylko jedna zmieniona karte, a nie wszystkie 12 000.
const spakowane = new WeakMap()

export function spakujKarte(karta) {
  let t = spakowane.get(karta)
  if (!t) {
    t = [
      STANY.indexOf(karta.stan),
      minuty(karta.termin) ?? 0,
      trzyMiejsca(karta.stabilnosc),
      trzyMiejsca(karta.trudnosc),
      karta.powtorki,
      karta.pomylki,
      karta.krok,
      dzien(karta.ostatnio),
      dzien(karta.wprowadzono),
    ]
    spakowane.set(karta, t)
  }
  return t
}

function rozpakujKarte(t) {
  if (!Array.isArray(t) || t.length !== 9) return { blad: 'zły format karty' }
  const [s, termin, stabilnosc, trudnosc, powtorki, pomylki, krok, ostatnio, wprowadzono] = t
  if (!calkowitaNieujemna(s) || s >= STANY.length) return { blad: 'nieznany stan' }
  if (!minutaZakresu(termin)) return { blad: 'niepoprawny termin' }
  if (!liczbaNieujemna(stabilnosc) || !liczbaNieujemna(trudnosc)) return { blad: 'niepoprawna pamięć FSRS' }
  // Oceniona karta ma dodatnia stabilnosc i trudnosc 1-10. Inne wartosci daja NaN w FSRS przy nastepnej ocenie.
  if (s > 0 && !(stabilnosc > 0 && trudnosc >= 1 && trudnosc <= 10)) return { blad: 'niepoprawna pamięć FSRS' }
  if (![powtorki, pomylki, krok].every(calkowitaNieujemna)) return { blad: 'niepoprawne liczniki' }
  if (![ostatnio, wprowadzono].every((d) => d === null || dzienZakresu(d))) return { blad: 'niepoprawna data' }
  const karta = {
    stan: STANY[s],
    termin: zMinut(termin),
    stabilnosc,
    trudnosc,
    powtorki,
    pomylki,
    krok,
    ostatnio: zDnia(ostatnio),
    wprowadzono: zDnia(wprowadzono),
  }
  spakowane.set(karta, t)
  return { karta }
}

// Postac zapisu: karty pogrupowane po id slowa, [en] albo [en, pl] (null, gdy kierunku nie dotknieto).
// Historia jest przycinana przy kazdym zapisie, zeby nie rosla w nieskonczonosc.
export function spakujStan(stan, teraz = new Date()) {
  const karty = Object.create(null)
  for (const [k, karta] of Object.entries(stan.karty)) {
    const i = k.lastIndexOf('|')
    const id = k.slice(0, i)
    if (!karty[id]) karty[id] = [null]
    karty[id][k.slice(i + 1) === 'pl' ? 1 : 0] = spakujKarte(karta)
  }
  return {
    wersja: WERSJA_ZAPISU,
    karty,
    pominiete: stan.pominiete || {},
    exp: stan.exp,
    streak: stan.streak,
    dzis: stan.dzis,
    historia: przytnijHistorie(stan.historia, teraz),
    zgloszenia: stan.zgloszenia || [],
    ustawienia: stan.ustawienia,
    ostatniaKopia: stan.ostatniaKopia,
    rozproszono: stan.rozproszono || 0,
  }
}

function ustawieniaPoprawione(u) {
  const wynik = { ...DOMYSLNE_USTAWIENIA }
  if (!jestObiektem(u)) return wynik
  if (OPCJE_NOWYCH.includes(u.noweDziennie)) wynik.noweDziennie = u.noweDziennie
  if (OPCJE_DLUGOSCI.includes(u.dlugoscSerii)) wynik.dlugoscSerii = u.dlugoscSerii
  if (OPCJE_CELU.includes(u.celDzienny)) wynik.celDzienny = u.celDzienny
  if (POZIOMY_PODPOWIEDZI.includes(u.podpowiedzMowienie)) wynik.podpowiedzMowienie = u.podpowiedzMowienie
  if (typeof u.autowymowa === 'boolean') wynik.autowymowa = u.autowymowa
  if (typeof u.mowienie === 'boolean') wynik.mowienie = u.mowienie
  return wynik
}

// Nowe pola zapisu sa opcjonalne: zapis ze starego telefonu (bez historii i zgloszen) wczytuje sie bez zmian,
// a brakujace albo uszkodzone pole daje wartosc domyslna zamiast uniewaznic caly postep.
function historiaPoprawiona(h) {
  if (!jestObiektem(h)) return {}
  const wynik = {}
  const liczba = (x) => (liczbaNieujemna(x) ? x : 0)
  for (const [data, wpis] of Object.entries(h)) {
    if (!dzienRrrrMmDd(data) || !jestObiektem(wpis)) continue
    wynik[data] = { oceny: liczba(wpis.oceny), nowe: liczba(wpis.nowe), exp: liczba(wpis.exp), sekundy: liczba(wpis.sekundy) }
  }
  return wynik
}

// Pominiete slowa: { id: 'RRRR-MM-DD' }. Data jest tylko informacja, wiec zly format daje pusty tekst,
// a samo slowo zostaje poza nauka.
function pominietePoprawione(p) {
  if (!jestObiektem(p)) return {}
  const wynik = {}
  for (const [id, data] of Object.entries(p)) {
    if (!id || id.includes('|')) continue
    wynik[id] = dzienRrrrMmDd(data) ? data : ''
  }
  return wynik
}

function zgloszeniaPoprawione(z) {
  if (!Array.isArray(z)) return []
  const wynik = []
  const widziane = new Set()
  for (const w of z) {
    if (!jestObiektem(w)) continue
    const id = tekst(w.id)
    if (!id || widziane.has(id)) continue
    widziane.add(id)
    wynik.push({ id, w: tekst(w.w), pl: tekst(w.pl), kiedy: dataLubPusto(w.kiedy) ? w.kiedy : '' })
  }
  return wynik
}

// Z postaci zapisu do stanu w pamieci. Karta z niepoprawnymi danymi jest pomijana i liczona w `pominiete` przy
// wyniku (to co innego niz `stan.pominiete`, czyli slowa wyrzucone z nauki przyciskiem "Pomijam"), zeby jedna
// uszkodzona karta nie uniewazniala calego postepu. EXP musi byc poprawne, ustawienia i licznik dnia mozna
// bezpiecznie zastapic domyslnymi.
export function walidujStan(dane) {
  if (!jestObiektem(dane)) return nie('To nie jest obiekt JSON.')
  if (dane.wersja !== WERSJA_ZAPISU) return nie(`Nieznana wersja zapisu postępu: ${dane.wersja}.`)
  if (!jestObiektem(dane.karty)) return nie('Brak pola "karty".')
  const karty = {}
  let pominiete = 0
  for (const [id, para] of Object.entries(dane.karty)) {
    if (!id || id.includes('|') || !Array.isArray(para) || para.length < 1 || para.length > 2) {
      pominiete += 1
      continue
    }
    for (const [i, kierunek] of ['en', 'pl'].entries()) {
      if (para[i] === null || para[i] === undefined) continue
      const { karta } = rozpakujKarte(para[i])
      if (karta) karty[klucz(id, kierunek)] = karta
      else pominiete += 1
    }
  }
  if (!liczbaNieujemna(dane.exp)) return nie('Niepoprawne pole "exp".')

  let streak = { dni: 0, ostatniDzien: '' }
  if (dane.streak !== undefined) {
    const s = dane.streak
    if (!jestObiektem(s) || !calkowitaNieujemna(s.dni)) return nie('Niepoprawne pole "streak".')
    if (s.ostatniDzien !== '' && !dzienRrrrMmDd(s.ostatniDzien)) return nie('Niepoprawna data w "streak".')
    streak = { dni: s.dni, ostatniDzien: s.ostatniDzien }
  }

  const d = dane.dzis
  const dzis =
    jestObiektem(d) && dzienRrrrMmDd(d.data) && liczbaNieujemna(d.sekundy) && liczbaNieujemna(d.dodatkoweNowe)
      ? { data: d.data, sekundy: d.sekundy, dodatkoweNowe: d.dodatkoweNowe }
      : domyslnyStan().dzis

  return {
    ok: true,
    pominiete,
    stan: {
      karty,
      pominiete: pominietePoprawione(dane.pominiete),
      exp: dane.exp,
      streak,
      dzis,
      historia: historiaPoprawiona(dane.historia),
      zgloszenia: zgloszeniaPoprawione(dane.zgloszenia),
      ustawienia: ustawieniaPoprawione(dane.ustawienia),
      ostatniaKopia: dataLubPusto(dane.ostatniaKopia) ? dane.ostatniaKopia : '',
      rozproszono: dane.rozproszono === 1 ? 1 : 0,
    },
  }
}

// Kopia zawiera talie i postep, zeby nowy telefon odtworzyl wszystko z jednego pliku.
export function kopiaDoPliku(stan, talia, teraz = new Date()) {
  return {
    format: FORMAT_KOPII,
    wersja: WERSJA_KOPII,
    utworzono: teraz.toISOString(),
    talia: { slowa: talia.slowa, talie: talia.talie || [] },
    postep: spakujStan(stan, teraz),
  }
}

// Zwraca { ok, talia: { slowa, talie }, stan, pominiete } albo { ok: false, blad }. Talia jest przyjmowana w calosci
// albo wcale, uszkodzone karty postepu sa pomijane.
export function walidujKopie(dane) {
  if (!jestObiektem(dane) || dane.format !== FORMAT_KOPII) return nie('To nie jest plik kopii fiszek.')
  if (dane.wersja !== WERSJA_KOPII) return nie(`Nieznana wersja kopii: ${dane.wersja}.`)
  if (!jestObiektem(dane.talia) || !Array.isArray(dane.talia.slowa)) return nie('W kopii brakuje talii słówek.')
  const slowa = []
  const ids = new Set()
  for (const [i, surowe] of dane.talia.slowa.entries()) {
    const { slowo, blad } = normalizujSlowo(surowe, jestObiektem(surowe) ? surowe.talia : '')
    if (blad) return nie(`Słowo nr ${i + 1} w kopii: ${blad}.`)
    if (ids.has(slowo.id)) return nie(`Słowo "${slowo.id}" występuje w kopii dwa razy.`)
    ids.add(slowo.id)
    slowa.push(slowo)
  }
  const talie = (Array.isArray(dane.talia.talie) ? dane.talia.talie : [])
    .filter(jestObiektem)
    .map((t) => ({ nazwa: tekst(t.nazwa), zrodlo: tekst(t.zrodlo), dodano: tekst(t.dodano) }))
    .filter((t) => t.nazwa)
  const postep = walidujStan(dane.postep)
  if (!postep.ok) return nie(`Postęp w kopii: ${postep.blad}`)
  return { ok: true, talia: { slowa, talie }, stan: postep.stan, pominiete: postep.pominiete }
}

const czasOceny = (karta) => Date.parse(karta.ostatnio) || 0

// Karta z kopii zastepuje obecna tylko, gdy ma wiecej powtorek, a przy remisie pozniejsza ocene.
function kartaZKopiiNowsza(zKopii, obecna) {
  if (zKopii.powtorki !== obecna.powtorki) return zKopii.powtorki > obecna.powtorki
  return czasOceny(zKopii) > czasOceny(obecna)
}

// Wczytanie kopii laczy ja z obecnym postepem zamiast go zastepowac, zeby starszy plik nie skasowal nowszych powtorek.
// Ustawienia i data ostatniej kopii zostaja z telefonu. Daty dni (RRRR-MM-DD) porownuja sie jako tekst.
export function scalStany(obecny, zKopii) {
  const karty = { ...obecny.karty }
  for (const [k, karta] of Object.entries(zKopii.karty)) {
    if (!karty[k] || kartaZKopiiNowsza(karta, karty[k])) karty[k] = karta
  }
  const a = obecny.streak
  const b = zKopii.streak
  const streakZKopii = b.ostatniDzien > a.ostatniDzien || (b.ostatniDzien === a.ostatniDzien && b.dni > a.dni)
  // Historia: dla kazdego dnia wygrywa zapis z wieksza liczba ocen. Zgloszenia sa sumowane po id.
  const historia = { ...obecny.historia }
  for (const [data, wpis] of Object.entries(zKopii.historia || {})) {
    if (!historia[data] || wpis.oceny > historia[data].oceny) historia[data] = wpis
  }
  const zgloszenia = [...(obecny.zgloszenia || [])]
  const znane = new Set(zgloszenia.map((z) => z.id))
  for (const z of zKopii.zgloszenia || []) {
    if (znane.has(z.id)) continue
    znane.add(z.id)
    zgloszenia.push(z)
  }
  return {
    karty,
    // Pominiete slowa to suma obu stron: jesli na ktoryms telefonie slowo wypadlo z nauki, ma zostac poza nia.
    pominiete: { ...(obecny.pominiete || {}), ...(zKopii.pominiete || {}) },
    exp: Math.max(obecny.exp, zKopii.exp),
    streak: streakZKopii ? b : a,
    dzis: zKopii.dzis.data > obecny.dzis.data ? zKopii.dzis : obecny.dzis,
    historia,
    zgloszenia,
    ustawienia: obecny.ustawienia,
    ostatniaKopia: obecny.ostatniaKopia,
    // Jednorazowe rozlozenie terminow to sprawa tego telefonu, a nie pliku kopii.
    rozproszono: obecny.rozproszono || 0,
  }
}

export const nazwaPliku = (teraz = new Date()) => `fiszki-kopia-${dataLokalna(teraz)}.json`

function parsuj(surowy) {
  if (typeof surowy !== 'string') return nie('Brak danych.')
  try {
    return walidujStan(JSON.parse(surowy))
  } catch {
    return nie('Uszkodzony JSON.')
  }
}

const opisBledu = (blad) => (blad && (blad.name || blad.message)) || String(blad)

function zachowajUszkodzony(pamiec, surowy) {
  try {
    pamiec.setItem(KLUCZ_USZKODZONY, surowy)
  } catch {
    // brak miejsca na zachowanie uszkodzonego tekstu nie moze zablokowac startu
  }
}

// Uszkodzony zapis nie jest nadpisywany na slepo: surowy tekst trafia pod osobny klucz, a stan wraca z kopii dnia.
// `pominiete` to liczba uszkodzonych kart pominietych przy odczycie.
export function wczytaj(pamiec = pamiecDomyslna()) {
  let surowy
  try {
    surowy = pamiec.getItem(KLUCZ)
  } catch (blad) {
    return {
      stan: domyslnyStan(),
      ostrzezenie: `Brak dostępu do pamięci telefonu (${opisBledu(blad)}). Postęp nie będzie zapisywany.`,
      pominiete: 0,
    }
  }
  if (surowy === null) return { stan: domyslnyStan(), ostrzezenie: '', pominiete: 0 }
  const wynik = parsuj(surowy)
  if (wynik.ok) {
    // Pominiete karty znikna przy najblizszym zapisie, wiec surowy tekst zostaje pod osobnym kluczem.
    if (wynik.pominiete) zachowajUszkodzony(pamiec, surowy)
    return { stan: wynik.stan, ostrzezenie: '', pominiete: wynik.pominiete }
  }

  zachowajUszkodzony(pamiec, surowy)
  let zapas
  try {
    zapas = parsuj(pamiec.getItem(KLUCZ_POPRZEDNI))
  } catch {
    zapas = nie('')
  }
  if (zapas.ok) {
    return {
      stan: zapas.stan,
      ostrzezenie: `Zapisany postęp był uszkodzony (${wynik.blad}). Przywrócono kopię z początku dnia.`,
      pominiete: zapas.pominiete,
    }
  }
  return {
    stan: domyslnyStan(),
    ostrzezenie: `Zapisany postęp był uszkodzony (${wynik.blad}) i nie ma kopii dnia. Surowe dane zachowano pod kluczem ${KLUCZ_USZKODZONY}.`,
    pominiete: 0,
  }
}

const brakMiejsca = (blad) => blad && (blad.name === 'QuotaExceededError' || blad.code === 22 || blad.code === 1014)

export function zapisz(stan, pamiec = pamiecDomyslna()) {
  let tekstZapisu
  try {
    tekstZapisu = JSON.stringify(spakujStan(stan))
    pamiec.setItem(KLUCZ, tekstZapisu)
    return { ok: true }
  } catch (blad) {
    if (!tekstZapisu || !brakMiejsca(blad)) return { ok: false, blad: opisBledu(blad) }
    // Przy braku miejsca biezacy postep jest wazniejszy niz starsze kopie awaryjne.
    for (const k of [KLUCZ_PRZED_WCZYTANIEM, KLUCZ_USZKODZONY, KLUCZ_POPRZEDNI]) {
      try {
        pamiec.removeItem(k)
        pamiec.setItem(KLUCZ, tekstZapisu)
        return { ok: true, zwolniono: k }
      } catch {
        // probujemy zwolnic kolejna kopie
      }
    }
    return { ok: false, blad: opisBledu(blad) }
  }
}

// Raz dziennie kopia stanu na wypadek bledu w kodzie. Kopiowany jest tylko stan, ktory przechodzi walidacje.
export function kopiaDzienna(pamiec = pamiecDomyslna(), teraz = new Date()) {
  const dzien = dataLokalna(teraz)
  try {
    if (pamiec.getItem(KLUCZ_DNIA_POPRZEDNIEGO) === dzien) return false
    const surowy = pamiec.getItem(KLUCZ)
    if (surowy === null || !parsuj(surowy).ok) return false
    pamiec.setItem(KLUCZ_POPRZEDNI, surowy)
    pamiec.setItem(KLUCZ_DNIA_POPRZEDNIEGO, dzien)
    return true
  } catch {
    return false
  }
}

export function zachowajPrzedWczytaniem(pamiec = pamiecDomyslna()) {
  const surowy = pamiec.getItem(KLUCZ)
  if (surowy !== null) pamiec.setItem(KLUCZ_PRZED_WCZYTANIEM, surowy)
}

export async function poprosOTrwalosc() {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) === true
  } catch {
    return false
  }
}

// iOS nie zapisze pliku przez <a download> w apce z ekranu glownego, wiec najpierw arkusz udostepniania.
// Nie kazdy system udostepnia typ application/json, dlatego druga proba jako text/plain z ta sama nazwa.
// Wolac bez wczesniejszego await w obsludze tapniecia, inaczej iOS uzna, ze to nie gest uzytkownika.
// Zwraca 'udostepniono', 'pobrano' albo 'anulowano'.
export async function zapiszKopie(stan, talia, teraz = new Date()) {
  const nazwa = nazwaPliku(teraz)
  const tresc = JSON.stringify(kopiaDoPliku(stan, talia, teraz))
  for (const typ of ['application/json', 'text/plain']) {
    const plik = new File([tresc], nazwa, { type: typ })
    if (!navigator.canShare?.({ files: [plik] })) continue
    try {
      await navigator.share({ files: [plik], title: nazwa })
      return 'udostepniono'
    } catch (blad) {
      if (blad?.name === 'AbortError') return 'anulowano'
      throw blad
    }
  }
  const url = URL.createObjectURL(new Blob([tresc], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nazwa
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  return 'pobrano'
}
