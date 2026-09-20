// Zapis postepu, odzyskiwanie po uszkodzeniu i kopia zapasowa z talia. Uruchomienie: node --test
process.env.TZ = 'Europe/Warsaw'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nowaKarta, ocen } from './lib/fsrs.mjs'
import * as m from './zrodlo/magazyn.js'
import { PUSTE_NADRABIANIE, PUSTY_STREAK, dataLokalna } from './zrodlo/talia.js'

class Pamiec {
  constructor(limitZnakow = Infinity) {
    this.dane = new Map()
    this.limit = limitZnakow
  }
  getItem(k) {
    return this.dane.has(k) ? this.dane.get(k) : null
  }
  setItem(k, v) {
    const bez = [...this.dane].filter(([klucz]) => klucz !== k).reduce((s, [klucz, w]) => s + klucz.length + w.length, 0)
    if (bez + k.length + v.length > this.limit) {
      const blad = new Error('brak miejsca')
      blad.name = 'QuotaExceededError'
      throw blad
    }
    this.dane.set(k, String(v))
  }
  removeItem(k) {
    this.dane.delete(k)
  }
}

function stanPrzykladowy() {
  const stan = m.domyslnyStan()
  const teraz = new Date('2026-09-15T08:00:00.000Z')
  let apple = { ...nowaKarta(), ...ocen(nowaKarta(), 4, teraz) }
  apple = { ...apple, ...ocen(apple, 3, new Date('2026-09-24T08:00:00.000Z')) }
  stan.karty['apple|en'] = apple
  stan.karty['apple|pl'] = { ...nowaKarta(), ...ocen(nowaKarta(), 1, teraz) }
  stan.karty['May|en'] = { ...nowaKarta(), ...ocen(nowaKarta(), 3, teraz) }
  stan.expRazem = 130
  stan.streak = { ...PUSTY_STREAK, dni: 3, ostatniDzien: '2026-09-15', zamrozenia: 1, doZamrozenia: 3 }
  stan.dzis = { data: '2026-09-15', sekundy: 75.5, dodatkoweNowe: 10, powtorki: 4 }
  stan.ustawienia = {
    noweDziennie: 30,
    maksPowtorekDziennie: 100,
    dlugoscSerii: 10,
    autowymowa: false,
    mowienie: true,
    celDzienny: 100,
    podpowiedzMowienie: 'litera',
    kotwica: '',
    samouczekGestow: true,
    wylaczoneTalie: [],
  }
  stan.ostatniaKopia = '2026-09-10T08:00:00.000Z'
  return stan
}

// Zapis trzyma termin w minutach, ostatnio i wprowadzono jako dzien lokalny, pamiec FSRS z 3 miejscami po przecinku.
function porownajKarty(a, b) {
  const dzien = (iso) => (iso ? dataLokalna(new Date(iso)) : '')
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort())
  for (const k of Object.keys(a)) {
    for (const pole of ['stan', 'powtorki', 'pomylki', 'krok']) assert.equal(a[k][pole], b[k][pole], `${k}.${pole}`)
    for (const pole of ['stabilnosc', 'trudnosc']) assert.ok(Math.abs(a[k][pole] - b[k][pole]) <= 0.0005, `${k}.${pole}`)
    assert.ok(Math.abs(Date.parse(a[k].termin) - Date.parse(b[k].termin)) <= 30000, `${k}.termin`)
    for (const pole of ['ostatnio', 'wprowadzono']) assert.equal(dzien(a[k][pole]), dzien(b[k][pole]), `${k}.${pole}`)
  }
}

test('zapis i odczyt postepu w zwartej postaci', () => {
  const pamiec = new Pamiec()
  const stan = stanPrzykladowy()
  assert.deepEqual(m.zapisz(stan, pamiec), { ok: true })
  const surowy = JSON.parse(pamiec.getItem(m.KLUCZ))
  assert.equal(surowy.wersja, 1)
  assert.equal(surowy.karty.apple.length, 2)
  assert.deepEqual(Object.keys(surowy.karty).sort(), ['May', 'apple'])

  const { stan: wczytany, ostrzezenie } = m.wczytaj(pamiec)
  assert.equal(ostrzezenie, '')
  porownajKarty(wczytany.karty, stan.karty)
  const { karty: _a, ...reszta } = wczytany
  const { karty: _b, ...oczekiwana } = stan
  assert.deepEqual(reszta, oczekiwana)

  // ponowny zapis wczytanego stanu daje identyczny tekst (brak dryfu przy kolejnych uruchomieniach)
  const drugi = new Pamiec()
  m.zapisz(wczytany, drugi)
  assert.equal(drugi.getItem(m.KLUCZ), pamiec.getItem(m.KLUCZ))
})

test('pusty magazyn daje stan domyslny', () => {
  const { stan, ostrzezenie } = m.wczytaj(new Pamiec())
  assert.deepEqual(stan, m.domyslnyStan())
  assert.equal(ostrzezenie, '')
})

test('zapis ze starego telefonu (bez historii i zgloszen) wczytuje sie bez zmian', () => {
  const pamiec = new Pamiec()
  m.zapisz(stanPrzykladowy(), pamiec)
  const stary = JSON.parse(pamiec.getItem(m.KLUCZ))
  // Tak wyglada mmf-v1 sprzed tej wersji: WERSJA_ZAPISU 1 i tylko stare pola.
  delete stary.historia
  delete stary.zgloszenia
  delete stary.ustawienia.celDzienny
  delete stary.ustawienia.podpowiedzMowienie
  assert.equal(stary.wersja, m.WERSJA_ZAPISU)
  pamiec.setItem(m.KLUCZ, JSON.stringify(stary))

  const { stan, ostrzezenie, pominiete } = m.wczytaj(pamiec)
  assert.equal(ostrzezenie, '')
  assert.equal(pominiete, 0)
  assert.equal(stan.expRazem, 130)
  assert.deepEqual(Object.keys(stan.karty).sort(), ['May|en', 'apple|en', 'apple|pl'])
  assert.deepEqual(stan.streak, { ...PUSTY_STREAK, dni: 3, ostatniDzien: '2026-09-15', zamrozenia: 1, doZamrozenia: 3 })
  assert.deepEqual(stan.historia, {})
  assert.deepEqual(stan.zgloszenia, [])
  assert.equal(stan.ustawienia.celDzienny, 60)
  assert.equal(stan.ustawienia.podpowiedzMowienie, 'brak')
  assert.equal(stan.ustawienia.noweDziennie, 30)

  // stara kopia zapasowa (te same pola co stary zapis) tez sie wczytuje
  const kopia = JSON.parse(JSON.stringify(m.kopiaDoPliku(stanPrzykladowy(), { slowa: [{ id: 'apple', w: 'apple', pl: 'jabłko' }] })))
  delete kopia.postep.historia
  delete kopia.postep.zgloszenia
  const wynik = m.walidujKopie(kopia)
  assert.equal(wynik.ok, true, wynik.blad)
  assert.deepEqual(wynik.stan.historia, {})
  assert.deepEqual(wynik.stan.zgloszenia, [])

  // uszkodzone nowe pola nie uniewazniaja postepu
  const zle = JSON.parse(pamiec.getItem(m.KLUCZ))
  zle.historia = { 'nie data': { oceny: 1 }, '2026-09-15': { oceny: 3, nowe: 'x', exp: -2, sekundy: 9 } }
  zle.zgloszenia = ['nie obiekt', { w: 'bez id' }, { id: 'a', w: 'a', pl: 'b', kiedy: 5 }, { id: 'a', w: 'duplikat' }]
  pamiec.setItem(m.KLUCZ, JSON.stringify(zle))
  const drugi = m.wczytaj(pamiec).stan
  assert.deepEqual(drugi.historia, { '2026-09-15': { oceny: 3, nowe: 0, exp: 0, sekundy: 9 } })
  assert.deepEqual(drugi.zgloszenia, [{ id: 'a', w: 'a', pl: 'b', kiedy: '' }])
  assert.equal(drugi.expRazem, 130)
})

test('historia i zgloszenia w zapisie: przycinanie do 180 dni i scalanie kopii', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const stan = stanPrzykladowy()
  stan.historia = {
    '2026-09-15': { oceny: 10, nowe: 2, exp: 300, sekundy: 120 },
    '2026-01-01': { oceny: 5, nowe: 1, exp: 100, sekundy: 60 },
  }
  stan.zgloszenia = [{ id: 'apple', w: 'apple', pl: 'jabłko', kiedy: '2026-09-15T08:00:00.000Z' }]
  const spakowany = m.spakujStan(stan, teraz)
  assert.deepEqual(Object.keys(spakowany.historia), ['2026-09-15'], 'dzien starszy niz 180 dni odpada')
  assert.equal(spakowany.zgloszenia.length, 1)

  const pamiec = new Pamiec()
  m.zapisz(stan, pamiec)
  const wczytany = m.wczytaj(pamiec).stan
  assert.equal(wczytany.historia['2026-09-15'].exp, 300)
  assert.deepEqual(wczytany.zgloszenia, stan.zgloszenia)

  const zKopii = {
    ...m.domyslnyStan(),
    historia: {
      '2026-09-15': { oceny: 4, nowe: 0, exp: 40, sekundy: 20 },
      '2026-09-14': { oceny: 7, nowe: 3, exp: 200, sekundy: 90 },
    },
    zgloszenia: [
      { id: 'apple', w: 'apple', pl: 'stare', kiedy: '' },
      { id: 'May', w: 'May', pl: 'maj', kiedy: '' },
    ],
  }
  const scalony = m.scalStany(wczytany, zKopii)
  assert.equal(scalony.historia['2026-09-15'].oceny, 10, 'dzien z wieksza liczba ocen wygrywa')
  assert.equal(scalony.historia['2026-09-14'].oceny, 7, 'dzien tylko w kopii dochodzi')
  assert.deepEqual(scalony.zgloszenia.map((z) => z.id), ['apple', 'May'])
  assert.equal(scalony.zgloszenia[0].pl, 'jabłko', 'zgloszenie z telefonu nie jest nadpisywane')
})

test('uszkodzony zapis: przywrocenie kopii dnia i zachowanie surowych danych', () => {
  const pamiec = new Pamiec()
  m.zapisz(stanPrzykladowy(), pamiec)
  assert.equal(m.kopiaDzienna(pamiec, new Date(2026, 8, 15, 7, 0)), true)
  assert.equal(m.kopiaDzienna(pamiec, new Date(2026, 8, 15, 22, 0)), false)

  pamiec.setItem(m.KLUCZ, '{"wersja":1,"karty":{"x":[[1,0,1,1,1,0,0,null,null]]},"exp":"zle"}')
  const { stan, ostrzezenie } = m.wczytaj(pamiec)
  assert.match(ostrzezenie, /Przywrócono kopię/)
  assert.equal(stan.expRazem, 130)
  assert.match(pamiec.getItem(m.KLUCZ_USZKODZONY), /"x"/)

  // uszkodzony stan nie nadpisuje kopii dnia nastepnego dnia
  assert.equal(m.kopiaDzienna(pamiec, new Date(2026, 8, 16, 7, 0)), false)
  assert.equal(JSON.parse(pamiec.getItem(m.KLUCZ_POPRZEDNI)).exp, 130)

  const bezKopii = new Pamiec()
  bezKopii.setItem(m.KLUCZ, 'to nie jest json')
  const wynik = m.wczytaj(bezKopii)
  assert.deepEqual(wynik.stan, m.domyslnyStan())
  assert.match(wynik.ostrzezenie, /nie ma kopii dnia/)
  assert.equal(bezKopii.getItem(m.KLUCZ_USZKODZONY), 'to nie jest json')
})

test('brak miejsca: zapasowe kopie ustepuja biezacemu postepowi', () => {
  const stan = stanPrzykladowy()
  const rozmiar = JSON.stringify(m.spakujStan(stan)).length
  // miejsce na dwie kopie obecnego stanu i nazwy kluczy, ale nie na stan z jedna karta wiecej
  const pamiec = new Pamiec(rozmiar * 2 + 40)
  m.zapisz(stan, pamiec)
  pamiec.setItem(m.KLUCZ_PRZED_WCZYTANIEM, pamiec.getItem(m.KLUCZ))
  stan.karty = { ...stan.karty, 'book|en': { ...nowaKarta(), ...ocen(nowaKarta(), 3, new Date()) } }
  const wynik = m.zapisz(stan, pamiec)
  assert.equal(wynik.ok, true)
  assert.equal(wynik.zwolniono, m.KLUCZ_PRZED_WCZYTANIEM)
  assert.ok(m.wczytaj(pamiec).stan.karty['book|en'])

  const zaMala = new Pamiec(10)
  assert.equal(m.zapisz(stan, zaMala).ok, false)
})

test('kopia zapasowa zawiera talie i postep, walidacja dobrej kopii', () => {
  const stan = stanPrzykladowy()
  const talia = {
    slowa: [
      { id: 'apple', w: 'apple', pl: 'jabłko', ipa: 'ˈæpl', poziom: 'A1', talia: 'Oxford 3000' },
      { id: 'May', w: 'May', pl: 'maj', talia: 'Wklejone 2026-09-15' },
      { id: 'may', w: 'may', pl: 'móc', talia: 'Wklejone 2026-09-15' },
    ],
    talie: [{ nazwa: 'Oxford 3000', zrodlo: 'Oxford', dodano: '2026-09-15T08:00:00.000Z' }],
  }
  const plik = JSON.stringify(m.kopiaDoPliku(stan, talia, new Date(2026, 8, 15, 9, 0)))
  const wynik = m.walidujKopie(JSON.parse(plik))
  assert.equal(wynik.ok, true, wynik.blad)
  assert.deepEqual(wynik.talia, talia)
  porownajKarty(wynik.stan.karty, stan.karty)
  assert.equal(wynik.stan.expRazem, 130)
  assert.equal(m.nazwaPliku(new Date(2026, 8, 15, 23, 50)), 'fiszki-kopia-2026-09-15.json')
})

test('walidacja zlych kopii', () => {
  const dobra = () => JSON.parse(JSON.stringify(m.kopiaDoPliku(stanPrzykladowy(), { slowa: [{ id: 'apple', w: 'apple', pl: 'jabłko' }] })))
  const przypadki = [
    [null, /nie jest plik kopii/],
    [[], /nie jest plik kopii/],
    [{ karty: {} }, /nie jest plik kopii/],
    [{ ...dobra(), wersja: 1 }, /wersja kopii/],
    [{ ...dobra(), talia: undefined }, /brakuje talii/],
    [(() => { const k = dobra(); k.talia.slowa.push({ id: 'apple', w: 'apple', pl: 'x' }); return k })(), /dwa razy/],
    [(() => { const k = dobra(); k.talia.slowa.push({ w: 'bez tlumaczenia' }); return k })(), /Słowo nr 2/],
    [(() => { const k = dobra(); k.postep.exp = -5; return k })(), /exp/],
    [(() => { const k = dobra(); k.postep.karty = []; return k })(), /karty/],
    [(() => { const k = dobra(); k.postep.streak = { dni: 1.5, ostatniDzien: '' }; return k })(), /streak/],
    [(() => { const k = dobra(); delete k.postep.wersja; return k })(), /wersja zapisu/],
  ]
  for (const [dane, blad] of przypadki) {
    const wynik = m.walidujKopie(dane)
    assert.equal(wynik.ok, false, `oczekiwany blad ${blad}`)
    assert.match(wynik.blad, blad)
  }
})

test('uszkodzona karta jest pomijana, reszta postepu zostaje', () => {
  const pamiec = new Pamiec()
  m.zapisz(stanPrzykladowy(), pamiec)
  const surowy = JSON.parse(pamiec.getItem(m.KLUCZ))
  surowy.karty.apple[1] = [2, 'zly termin', 1, 5, 1, 0, 0, null, null]
  surowy.karty.zepsute = 'nie tablica'
  surowy.karty['a|b'] = [null]
  surowy.karty.nan = [[2, 1000, null, 5, 3, 0, 0, 250, 240]] // NaN z JSON.stringify zapisuje sie jako null
  surowy.karty.zero = [[2, 1000, 0, 5, 3, 0, 0, 250, 240]] // stabilnosc 0 w powtorce dalaby NaN przy ocenie
  pamiec.setItem(m.KLUCZ, JSON.stringify(surowy))

  const { stan, ostrzezenie, pominiete } = m.wczytaj(pamiec)
  assert.equal(ostrzezenie, '')
  assert.equal(pominiete, 5)
  assert.deepEqual(Object.keys(stan.karty).sort(), ['May|en', 'apple|en'])
  assert.equal(stan.expRazem, 130)
  assert.match(pamiec.getItem(m.KLUCZ_USZKODZONY), /zepsute/, 'surowy zapis z pominietymi kartami zachowany')

  const kopia = JSON.parse(JSON.stringify(m.kopiaDoPliku(stanPrzykladowy(), { slowa: [] })))
  kopia.postep.karty.apple[0][0] = 7
  const wynik = m.walidujKopie(kopia)
  assert.equal(wynik.ok, true)
  assert.equal(wynik.pominiete, 1)
  assert.deepEqual(Object.keys(wynik.stan.karty).sort(), ['May|en', 'apple|pl'])
})

test('scalanie kopii z obecnym stanem nie cofa nowszego postepu', () => {
  const karta = (powtorki, ostatnio, stabilnosc) => ({
    ...nowaKarta(),
    stan: 'powtorka',
    termin: '2026-09-20T10:00:00.000Z',
    stabilnosc,
    trudnosc: 5,
    powtorki,
    ostatnio,
    wprowadzono: '2026-09-01T10:00:00.000Z',
  })
  const obecny = {
    ...m.domyslnyStan(),
    karty: {
      'a|en': karta(5, '2026-09-14T10:00:00.000Z', 1),
      'b|en': karta(2, '2026-09-14T10:00:00.000Z', 1),
      'c|en': karta(3, '2026-09-10T10:00:00.000Z', 1),
      'tylkoTu|en': karta(1, '2026-09-14T10:00:00.000Z', 1),
    },
    expRazem: 500,
    streak: { ...PUSTY_STREAK, dni: 4, ostatniDzien: '2026-09-15' },
    dzis: { data: '2026-09-15', sekundy: 30, dodatkoweNowe: 0, powtorki: 0 },
    ustawienia: { noweDziennie: 30, dlugoscSerii: 10, autowymowa: false, mowienie: false },
    ostatniaKopia: '2026-09-15T08:00:00.000Z',
  }
  const zKopii = {
    ...m.domyslnyStan(),
    karty: {
      'a|en': karta(3, '2026-09-15T10:00:00.000Z', 2),
      'b|en': karta(4, '2026-09-01T10:00:00.000Z', 2),
      'c|en': karta(3, '2026-09-12T10:00:00.000Z', 2),
      'tylkoWKopii|pl': karta(1, '2026-09-01T10:00:00.000Z', 2),
    },
    expRazem: 900,
    streak: { ...PUSTY_STREAK, dni: 9, ostatniDzien: '2026-09-12' },
    dzis: { data: '2026-09-12', sekundy: 99, dodatkoweNowe: 10, powtorki: 0 },
    ostatniaKopia: '2026-09-01T08:00:00.000Z',
  }

  const s = m.scalStany(obecny, zKopii)
  assert.equal(s.karty['a|en'].stabilnosc, 1, 'wiecej powtorek w telefonie wygrywa mimo pozniejszej daty w kopii')
  assert.equal(s.karty['b|en'].stabilnosc, 2, 'wiecej powtorek w kopii wygrywa')
  assert.equal(s.karty['c|en'].stabilnosc, 2, 'remis powtorek: pozniejsza ocena')
  assert.ok(s.karty['tylkoTu|en'] && s.karty['tylkoWKopii|pl'], 'suma kluczy')
  assert.equal(Object.keys(s.karty).length, 5)
  assert.equal(s.expRazem, 900)
  assert.deepEqual(s.streak, obecny.streak)
  assert.deepEqual(s.dzis, obecny.dzis)
  assert.deepEqual(s.ustawienia, obecny.ustawienia)
  assert.equal(s.ostatniaKopia, obecny.ostatniaKopia)
  assert.equal(Object.keys(obecny.karty).length, 4, 'obecny stan nie jest zmieniany')

  const pozniejszaKopia = m.scalStany(obecny, {
    ...zKopii,
    streak: { ...PUSTY_STREAK, dni: 1, ostatniDzien: '2026-09-16' },
    dzis: { data: '2026-09-16', sekundy: 5, dodatkoweNowe: 0, powtorki: 0 },
  })
  assert.deepEqual(pozniejszaKopia.streak, { ...PUSTY_STREAK, dni: 1, ostatniDzien: '2026-09-16' })
  assert.equal(pozniejszaKopia.dzis.data, '2026-09-16')
  assert.equal(m.scalStany(obecny, { ...zKopii, streak: { dni: 7, ostatniDzien: '2026-09-15' } }).streak.dni, 7)
  assert.equal(m.scalStany(obecny, { ...zKopii, streak: { dni: 2, ostatniDzien: '2026-09-15' } }).streak.dni, 4)

  const pamiec = new Pamiec()
  assert.equal(m.zapisz(s, pamiec).ok, true)
  assert.equal(Object.keys(m.wczytaj(pamiec).stan.karty).length, 5)
})

test('karta z ostatnia ocena jutro (cofniety zegar, strefa na zachod) oceniona dzis: skonczone liczby i poprawny termin', () => {
  const teraz = new Date(2026, 8, 15, 9, 0)
  const karta = {
    ...nowaKarta(),
    stan: 'powtorka',
    termin: new Date(2026, 8, 20, 12, 0).toISOString(),
    stabilnosc: 10,
    trudnosc: 5,
    powtorki: 4,
    ostatnio: new Date(2026, 8, 16, 12, 0).toISOString(),
    wprowadzono: '2026-09-01T10:00:00.000Z',
  }
  for (const ocena of [1, 3, 4]) {
    const wynik = { ...karta, ...ocen(karta, ocena, teraz) }
    assert.ok(Number.isFinite(wynik.stabilnosc) && wynik.stabilnosc > 0, `ocena ${ocena}: stabilnosc ${wynik.stabilnosc}`)
    assert.ok(Number.isFinite(wynik.trudnosc) && wynik.trudnosc >= 1 && wynik.trudnosc <= 10, `ocena ${ocena}: trudnosc ${wynik.trudnosc}`)
    const termin = Date.parse(wynik.termin)
    assert.ok(termin > teraz.getTime(), `ocena ${ocena}: termin ${wynik.termin}`)
    if (ocena === 1) assert.equal(wynik.stan, 'ponowna')
    else assert.ok(termin - teraz.getTime() >= 86400000, `ocena ${ocena}: termin co najmniej dzien pozniej`)

    const pamiec = new Pamiec()
    assert.equal(m.zapisz({ ...m.domyslnyStan(), karty: { 'x|en': wynik } }, pamiec).ok, true)
    const wczytany = m.wczytaj(pamiec)
    assert.equal(wczytany.pominiete, 0, `ocena ${ocena}: karta przechodzi przez zapis`)
    assert.ok(wczytany.stan.karty['x|en'])
  }
})

test('ustawienia spoza dozwolonych wartosci wracaja do domyslnych', () => {
  const k = JSON.parse(JSON.stringify(m.kopiaDoPliku(stanPrzykladowy(), { slowa: [] })))
  k.postep.ustawienia = { noweDziennie: 999, dlugoscSerii: 15, autowymowa: 'tak' }
  k.postep.dzis = 'zle'
  const wynik = m.walidujKopie(k)
  assert.equal(wynik.ok, true)
  assert.deepEqual(wynik.stan.ustawienia, {
    noweDziennie: 10,
    maksPowtorekDziennie: 60,
    dlugoscSerii: 15,
    autowymowa: true,
    mowienie: true,
    celDzienny: 60,
    podpowiedzMowienie: 'brak',
    kotwica: '',
    samouczekGestow: false,
    wylaczoneTalie: [],
  })
  assert.deepEqual(wynik.stan.dzis, { data: '', sekundy: 0, dodatkoweNowe: 0, powtorki: 0 })
  // 40 nowych dziennie wypadlo z listy opcji, ale zapisane ustawienie zostaje.
  const stare = JSON.parse(JSON.stringify(m.kopiaDoPliku(stanPrzykladowy(), { slowa: [] })))
  stare.postep.ustawienia.noweDziennie = 40
  assert.equal(m.walidujKopie(stare).stan.ustawienia.noweDziennie, 40)
})

test('rozmiar postepu: 6000 slow w obu kierunkach', () => {
  let ziarno = 42
  const los = () => (ziarno = (ziarno * 1103515245 + 12345) % 2147483648) / 2147483648
  const litery = 'abcdefghijklmnopqrstuvwxyz'
  const stan = m.domyslnyStan()
  const poczatek = Date.UTC(2026, 8, 1)
  const data = (dniOd, dniDo) => new Date(poczatek + (dniOd + los() * (dniDo - dniOd)) * 86400000).toISOString()
  for (let i = 0; i < 6000; i++) {
    const dlugosc = 4 + Math.floor(los() * 8)
    let id = Array.from({ length: dlugosc }, () => litery[Math.floor(los() * 26)]).join('')
    if (i % 25 === 0) id += ' up'
    id += i
    for (const kierunek of ['en', 'pl']) {
      stan.karty[`${id}|${kierunek}`] = {
        stan: 'powtorka',
        termin: data(30, 700),
        stabilnosc: 0.1 + los() * 900,
        trudnosc: 1 + los() * 9,
        powtorki: 1 + Math.floor(los() * 40),
        pomylki: Math.floor(los() * 8),
        krok: 0,
        ostatnio: data(0, 30),
        wprowadzono: data(-300, 0),
      }
    }
  }
  const zwarty = JSON.stringify(m.spakujStan(stan)).length
  const obiekty = JSON.stringify(stan).length
  console.log(`postep 6000 slow x 2 kierunki: ${zwarty} znakow (jako obiekty z datami ISO: ${obiekty})`)
  assert.ok(zwarty < 1_000_000)

  // Jak w apce: po ocenie zmienia sie jeden obiekt karty, reszta ma spakowana postac w pamieci podrecznej.
  const pamiec = new Pamiec()
  m.zapisz(stan, pamiec)
  let czas = 0
  for (let i = 0; i < 20; i++) {
    stan.karty[`x${i}|en`] = { ...nowaKarta(), ...ocen(nowaKarta(), 3, new Date()) }
    const start = performance.now()
    assert.equal(m.zapisz(stan, pamiec).ok, true)
    czas += performance.now() - start
  }
  console.log(`zapis po ocenie przy 12 000 kartach: ${(czas / 20).toFixed(1)} ms`)
  assert.equal(Object.keys(m.wczytaj(pamiec).stan.karty).length, 12020)
})

// Pominiete slowa i jednorazowe rozproszenie terminow

test('pominiete slowa i flaga rozproszenia przechodza przez zapis', () => {
  const pamiec = new Pamiec()
  const stan = { ...stanPrzykladowy(), pominiete: { apple: '2026-09-15', May: '2026-09-16' }, rozproszono: 1 }
  assert.equal(m.zapisz(stan, pamiec).ok, true)
  const wczytany = m.wczytaj(pamiec).stan
  assert.deepEqual(wczytany.pominiete, { apple: '2026-09-15', May: '2026-09-16' })
  assert.equal(wczytany.rozproszono, 1)
  assert.ok(wczytany.karty['apple|en'], 'karty pominietego slowa zostaja w zapisie')
})

test('zapis bez nowych pol wczytuje sie bez zmian (stary telefon)', () => {
  const pamiec = new Pamiec()
  const spakowany = m.spakujStan(stanPrzykladowy())
  delete spakowany.pominiete
  delete spakowany.rozproszono
  delete spakowany.historia
  delete spakowany.zgloszenia
  pamiec.setItem(m.KLUCZ, JSON.stringify(spakowany))
  const { stan, ostrzezenie, pominiete } = m.wczytaj(pamiec)
  assert.equal(ostrzezenie, '')
  assert.equal(pominiete, 0, 'zadna karta nie jest uszkodzona')
  assert.deepEqual(stan.pominiete, {})
  assert.equal(stan.rozproszono, 0, 'stary zapis dostanie jednorazowe rozproszenie')
  assert.equal(stan.expRazem, 130)
  assert.equal(Object.keys(stan.karty).length, 3)
})

test('uszkodzone pole "pominiete" nie uniewaznia postepu', () => {
  const dobra = m.spakujStan(stanPrzykladowy())
  for (const zle of [null, 'tak', 7, []]) {
    const wynik = m.walidujStan({ ...dobra, pominiete: zle })
    assert.equal(wynik.ok, true, JSON.stringify(zle))
    assert.deepEqual(wynik.stan.pominiete, {})
  }
  const mieszane = m.walidujStan({ ...dobra, pominiete: { apple: 'kiedyś', 'zly|klucz': '2026-09-15', May: '2026-09-15' } })
  assert.deepEqual(mieszane.stan.pominiete, { apple: '', May: '2026-09-15' })
  assert.equal(m.walidujStan({ ...dobra, rozproszono: 'tak' }).stan.rozproszono, 0)
})

test('kopia zapasowa zawiera pominiete, a scalanie sumuje obie strony', () => {
  const stan = { ...stanPrzykladowy(), pominiete: { apple: '2026-09-15' }, rozproszono: 1 }
  const kopia = JSON.parse(JSON.stringify(m.kopiaDoPliku(stan, { slowa: [{ id: 'apple', w: 'apple', pl: 'jabłko' }] })))
  assert.deepEqual(kopia.postep.pominiete, { apple: '2026-09-15' })
  const wynik = m.walidujKopie(kopia)
  assert.equal(wynik.ok, true, wynik.blad)
  assert.deepEqual(wynik.stan.pominiete, { apple: '2026-09-15' })

  const obecny = { ...m.domyslnyStan(), pominiete: { May: '2026-09-17' }, rozproszono: 1 }
  const scalony = m.scalStany(obecny, wynik.stan)
  assert.deepEqual(scalony.pominiete, { May: '2026-09-17', apple: '2026-09-15' })
  assert.equal(scalony.rozproszono, 1, 'flaga rozproszenia zostaje z telefonu')
  assert.deepEqual(obecny.pominiete, { May: '2026-09-17' }, 'wejscie nietkniete')
})

// Migracja zapisu sprzed rangi (telefon uzytkownika: ok. 380 slow, tydzien nauki, EXP ok. 25 000)

test('zapis mmf-v1 sprzed rangi: karty, EXP i seria bez straty, EXP staje sie punktami lacznymi', () => {
  // Tak wyglada zapis z telefonu: tylko stare pola, karty po 9 liczb, exp jako laczny licznik poziomu gracza.
  const karty = {}
  for (let i = 0; i < 380; i++) {
    karty[`w${i}`] = [[2, 100000 + i, 8.5, 5.5, 3, i % 7 === 0 ? 1 : 0, 0, 250, 240]]
    if (i % 3 === 0) karty[`w${i}`].push([1, 100500 + i, 1.2, 6, 1, 0, 1, 250, 250])
  }
  const zTelefonu = {
    wersja: 1,
    karty,
    pominiete: { w7: '2026-09-10' },
    exp: 25140,
    streak: { dni: 7, ostatniDzien: '2026-09-15' },
    dzis: { data: '2026-09-15', sekundy: 240, dodatkoweNowe: 0 },
    historia: { '2026-09-14': { oceny: 60, nowe: 10, exp: 2400, sekundy: 300 }, '2026-09-15': { oceny: 42, nowe: 8, exp: 1800, sekundy: 210 } },
    zgloszenia: [],
    ustawienia: { noweDziennie: 20, dlugoscSerii: 15, autowymowa: true, mowienie: true, celDzienny: 60, podpowiedzMowienie: 'brak' },
    ostatniaKopia: '2026-09-12T08:00:00.000Z',
    rozproszono: 1,
  }
  const pamiec = new Pamiec()
  pamiec.setItem(m.KLUCZ, JSON.stringify(zTelefonu))
  const teraz = new Date(2026, 8, 16, 9, 0)
  const { stan, ostrzezenie, pominiete } = m.wczytaj(pamiec, teraz)

  assert.equal(ostrzezenie, '')
  assert.equal(pominiete, 0, 'zadna karta nie jest odrzucona')
  assert.equal(Object.keys(stan.karty).length, 380 + Math.ceil(380 / 3), 'wszystkie karty obu kierunkow')
  assert.equal(stan.expRazem, 25140, 'expRazem zostaje w zapisie dla zgodnosci, choc apka go nie pokazuje')
  assert.equal(stan.streak.dni, 7)
  assert.equal(stan.streak.ostatniDzien, '2026-09-15')
  assert.equal(stan.streak.zamrozenia, 0, 'brak pola w zapisie daje pusty bank, nie blad')
  assert.deepEqual(stan.nadrabianie, PUSTE_NADRABIANIE)
  assert.deepEqual(stan.historia, zTelefonu.historia, 'historia dni nie ginie')
  assert.deepEqual(stan.pominiete, { w7: '2026-09-10' })
  assert.equal(stan.dzis.powtorki, 0, 'nowy licznik powtorek zaczyna od zera')
  assert.equal(stan.ustawienia.noweDziennie, 20)
  assert.equal(stan.ustawienia.maksPowtorekDziennie, 60, 'brak sufitu w zapisie daje wartosc domyslna')
  assert.equal(stan.ustawienia.kotwica, '', 'brak kotwicy w zapisie daje pusta kotwice, nie blad')
  assert.equal(stan.ustawienia.samouczekGestow, false, 'zapis sprzed gestow ma prawo zobaczyc samouczek raz')
  assert.equal(stan.karty['w0|en'].kolejneUmiem, 0)
  assert.equal(stan.karty['w0|en'].leech, 0)

  // Ponowny zapis i odczyt nie gubi niczego.
  assert.equal(m.zapisz(stan, pamiec).ok, true)
  const drugi = m.wczytaj(pamiec, teraz)
  assert.equal(drugi.stan.expRazem, 25140)
  assert.equal(Object.keys(drugi.stan.karty).length, Object.keys(stan.karty).length)
})

test('nowe pola karty zapisuja sie tylko, gdy cos trzymaja', () => {
  const stan = m.domyslnyStan()
  stan.karty['a|en'] = { ...nowaKarta(), ...ocen(nowaKarta(), 3, new Date(2026, 8, 15, 9, 0)) }
  stan.karty['b|en'] = { ...nowaKarta(), ...ocen(nowaKarta(), 3, new Date(2026, 8, 15, 9, 0)), kolejneUmiem: 2, leech: 6 }
  const spakowany = m.spakujStan(stan)
  assert.equal(spakowany.karty.a[0].length, 9, 'karta bez nowych pol zapisuje sie jak dawniej')
  assert.equal(spakowany.karty.b[0].length, 11)
  assert.deepEqual(spakowany.karty.b[0].slice(9), [2, 6])

  const wynik = m.walidujStan(spakowany)
  assert.equal(wynik.ok, true)
  assert.equal(wynik.stan.karty['a|en'].kolejneUmiem, 0)
  assert.equal(wynik.stan.karty['b|en'].kolejneUmiem, 2)
  assert.equal(wynik.stan.karty['b|en'].leech, 6)
  // Karta z samym kolejneUmiem ma 10 pol, a ujemne liczniki sa odrzucane jak kazde inne.
  const dziesiec = m.walidujStan({ ...spakowany, karty: { c: [[2, 1000, 1, 5, 1, 0, 0, 250, 240, 1]] } })
  assert.equal(dziesiec.stan.karty['c|en'].kolejneUmiem, 1)
  assert.equal(m.walidujStan({ ...spakowany, karty: { c: [[2, 1000, 1, 5, 1, 0, 0, 250, 240, -1]] } }).pominiete, 1)
  assert.equal(m.walidujStan({ ...spakowany, karty: { c: [[2, 1000, 1, 5, 1, 0, 0, 250, 240, 1, 2, 3]] } }).pominiete, 1)
})

test('czas odpowiedzi w historii: mediana i surowe czasy sa opcjonalne', () => {
  const teraz = new Date(2026, 8, 16, 9, 0)
  const stan = stanPrzykladowy()
  stan.historia = {
    '2026-09-16': { oceny: 3, nowe: 1, exp: 90, sekundy: 12, tempo: 2.5, czasy: [1.5, 2.5, 6] },
    '2026-09-15': { oceny: 2, nowe: 0, exp: 60, sekundy: 8, tempo: 4 },
    '2026-09-14': { oceny: 1, nowe: 0, exp: 30, sekundy: 3 },
  }
  const spakowany = m.spakujStan(stan, teraz)
  const wczytany = m.walidujStan(spakowany, teraz).stan
  assert.deepEqual(wczytany.historia['2026-09-16'].czasy, [1.5, 2.5, 6], 'biezacy dzien trzyma surowe czasy')
  assert.equal(wczytany.historia['2026-09-16'].tempo, 2.5)
  assert.equal(wczytany.historia['2026-09-15'].tempo, 4, 'zamkniety dzien zostaje z sama mediana')
  assert.equal(wczytany.historia['2026-09-15'].czasy, undefined)
  assert.equal(wczytany.historia['2026-09-14'].tempo, undefined, 'zapis sprzed tej wersji nie ma tempa')

  // Bzdury w nowych polach nie moga uniewaznic calej historii ani postepu.
  const zepsuty = JSON.parse(JSON.stringify(spakowany))
  zepsuty.historia['2026-09-16'].tempo = 'szybko'
  zepsuty.historia['2026-09-16'].czasy = { a: 1 }
  const drugi = m.walidujStan(zepsuty, teraz)
  assert.equal(drugi.ok, true)
  assert.equal(drugi.stan.historia['2026-09-16'].oceny, 3)
  assert.equal(drugi.stan.historia['2026-09-16'].tempo, undefined)
  assert.equal(drugi.stan.historia['2026-09-16'].czasy, undefined)
  assert.equal(Object.keys(drugi.stan.karty).length, Object.keys(stan.karty).length)
})

// --- D1: kotwica nawyku w zapisie ---

test('kotwica nawyku zapisuje sie i wraca przycieta, a zle wartosci daja domyslne', () => {
  const pamiec = new Pamiec()
  const stan = stanPrzykladowy()
  stan.ustawienia = { ...stan.ustawienia, kotwica: '  po kawie  ', samouczekGestow: true }
  assert.equal(m.zapisz(stan, pamiec).ok, true)
  const wczytany = m.wczytaj(pamiec).stan
  assert.equal(wczytany.ustawienia.kotwica, 'po kawie', 'biale znaki z brzegow odpadaja')
  assert.equal(wczytany.ustawienia.samouczekGestow, true)

  // Zapis z bzdurami w tych polach nie moze uniewaznic calego postepu.
  const zepsuty = JSON.parse(pamiec.getItem(m.KLUCZ))
  zepsuty.ustawienia.kotwica = { a: 1 }
  zepsuty.ustawienia.samouczekGestow = 'tak'
  pamiec.setItem(m.KLUCZ, JSON.stringify(zepsuty))
  const drugi = m.wczytaj(pamiec).stan
  assert.equal(drugi.ustawienia.kotwica, '')
  assert.equal(drugi.ustawienia.samouczekGestow, false)
  assert.equal(Object.keys(drugi.karty).length, Object.keys(stan.karty).length, 'karty zostaja nietkniete')

  // Bardzo dluga kotwica jest przycinana, a nie odrzucana.
  const dlugi = JSON.parse(pamiec.getItem(m.KLUCZ))
  dlugi.ustawienia.kotwica = 'x'.repeat(200)
  pamiec.setItem(m.KLUCZ, JSON.stringify(dlugi))
  assert.equal(m.wczytaj(pamiec).stan.ustawienia.kotwica.length, 40)
})

test('wylaczone talie sa polem opcjonalnym: stary zapis daje pusta liste, nowy wraca bez zmian', () => {
  const pamiec = new Pamiec()
  const stan = stanPrzykladowy()
  stan.ustawienia = { ...stan.ustawienia, wylaczoneTalie: ['  Moja talia  ', 'Oxford 3000', 'Moja talia', '', 7] }
  m.zapisz(stan, pamiec)
  const zapisany = JSON.parse(pamiec.getItem(m.KLUCZ))
  assert.equal(zapisany.wersja, m.WERSJA_ZAPISU, 'WERSJA_ZAPISU zostaje 1')
  // Przyciete, bez powtorzen i bez wartosci, ktore nie sa napisami.
  assert.deepEqual(m.wczytaj(pamiec).stan.ustawienia.wylaczoneTalie, ['Moja talia', 'Oxford 3000'])

  // Zapis sprzed tej wersji nie ma pola w ogole: wszystkie talie maja zostac wlaczone.
  delete zapisany.ustawienia.wylaczoneTalie
  pamiec.setItem(m.KLUCZ, JSON.stringify(zapisany))
  const stary = m.wczytaj(pamiec)
  assert.equal(stary.ostrzezenie, '')
  assert.deepEqual(stary.stan.ustawienia.wylaczoneTalie, [])
  assert.equal(stary.stan.expRazem, 130, 'reszta postepu bez straty')

  // Uszkodzone pole tez nie uniewaznia postepu.
  zapisany.ustawienia.wylaczoneTalie = 'Moja talia'
  pamiec.setItem(m.KLUCZ, JSON.stringify(zapisany))
  assert.deepEqual(m.wczytaj(pamiec).stan.ustawienia.wylaczoneTalie, [])
})
