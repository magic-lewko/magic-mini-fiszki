// Logika serii, limitow, streaka i podpowiedzi. Uruchomienie: node --test
// Strefa ustawiona na Polske, zeby granica dnia lokalnego roznila sie od UTC i test wylapal liczenie po UTC.
process.env.TZ = 'Europe/Warsaw'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STANY as STANY_FSRS, nowaKarta, ocen } from './lib/fsrs.mjs'
import * as t from './zrodlo/talia.js'

const slowa = (...ids) => ids.map((id) => ({ id, w: id, pl: `pl-${id}` }))
const minut = (data, m) => new Date(data.getTime() + m * 60000)
const karta = (stan, termin, inne = {}) => ({
  ...nowaKarta(),
  stan,
  termin: termin.toISOString(),
  stabilnosc: 3,
  trudnosc: 5,
  powtorki: 2,
  ostatnio: '2026-09-01T10:00:00.000Z',
  wprowadzono: '2026-09-01T10:00:00.000Z',
  ...inne,
})

test('stany zgodne z lib/fsrs.mjs', () => {
  assert.deepEqual(t.STANY, STANY_FSRS)
})

test('strefa testu rozni sie od UTC', () => {
  assert.notEqual(new Date(2026, 8, 15, 0, 10).getTimezoneOffset(), 0)
})

test('kolejnosc priorytetow serii', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const karty = {
    'a|en': karta('powtorka', minut(teraz, -2 * 1440), { stabilnosc: 5.5 }),
    'a|pl': karta('powtorka', minut(teraz, -180)),
    'b|en': karta('powtorka', minut(teraz, -60), { stabilnosc: 10 }),
    'c|en': karta('nauka', minut(teraz, -5)),
    'd|en': karta('ponowna', minut(teraz, -10)),
    'e|en': karta('powtorka', minut(teraz, 1440), { stabilnosc: 6 }),
    'g|en': karta('nauka', minut(teraz, 5)),
  }
  const lista = slowa('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h')
  const seria = t.zbudujSerie({ slowa: lista, karty, ustawienia: {}, dzis: null, teraz })
  // 1) nauka/ponowna po terminie, 2) powtorki od najstarszej, 3) nowe mowienie, 4) nowe EN w kolejnosci listy
  assert.deepEqual(seria, ['d|en', 'c|en', 'a|en', 'a|pl', 'b|en', 'b|pl', 'e|pl', 'f|en', 'h|en'])

  const krotka = t.zbudujSerie({ slowa: lista, karty, ustawienia: { dlugoscSerii: 10 }, dzis: null, teraz, dlugosc: 3 })
  assert.deepEqual(krotka, ['d|en', 'c|en', 'a|en'])

  const bezMowienia = t.zbudujSerie({ slowa: lista, karty, ustawienia: { mowienie: false }, dzis: null, teraz })
  assert.deepEqual(bezMowienia, ['d|en', 'c|en', 'a|en', 'b|en', 'f|en', 'h|en'])
})

test('karty slow spoza listy zostaja w pamieci, ale nie trafiaja do serii', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const karty = { 'usuniete|en': karta('nauka', minut(teraz, -5)) }
  assert.deepEqual(t.zbudujSerie({ slowa: slowa('x'), karty, ustawienia: {}, dzis: null, teraz }), ['x|en'])
})

test('dzienny limit nowych liczony po dacie lokalnej, osobno EN i PL', () => {
  const lista = slowa(...Array.from({ length: 40 }, (_, i) => `s${i}`))
  const wieczorem = new Date(2026, 8, 14, 23, 50)
  const karty = {}
  for (let i = 0; i < 10; i++) {
    karty[`s${i}|en`] = karta('nauka', minut(wieczorem, 7 * 1440), { wprowadzono: wieczorem.toISOString() })
  }
  // 23:50 i 00:10 w Polsce to ten sam dzien UTC, ale dwa rozne dni lokalne.
  assert.equal(wieczorem.toISOString().slice(0, 10), new Date(2026, 8, 15, 0, 10).toISOString().slice(0, 10))

  const ustawienia = { noweDziennie: 10, dlugoscSerii: 20 }
  const tegoDnia = t.zbudujSerie({ slowa: lista, karty, ustawienia, dzis: null, teraz: new Date(2026, 8, 14, 23, 55) })
  assert.deepEqual(tegoDnia, [])

  const poPolnocy = t.zbudujSerie({ slowa: lista, karty, ustawienia, dzis: null, teraz: new Date(2026, 8, 15, 0, 10) })
  assert.equal(poPolnocy.length, 10)
  assert.equal(poPolnocy[0], 's10|en')

  const dzis = { data: '2026-09-14', sekundy: 0, dodatkoweNowe: 10 }
  const zDodatkowymi = t.zbudujSerie({ slowa: lista, karty, ustawienia, dzis, teraz: new Date(2026, 8, 14, 23, 55) })
  assert.equal(zDodatkowymi.length, 10)
  // dodatkowe nowe z wczoraj nie przechodza na nowy dzien
  const nastepnegoDnia = t.zbudujSerie({ slowa: lista, karty, ustawienia, dzis, teraz: new Date(2026, 8, 15, 0, 10) })
  assert.equal(nastepnegoDnia.length, 10)

  assert.deepEqual(t.noweDzis(karty, new Date(2026, 8, 14, 23, 59)), { en: 10, pl: 0 })
  assert.deepEqual(t.noweDzis(karty, new Date(2026, 8, 15, 0, 1)), { en: 0, pl: 0 })
})

test('limit mowienia jest osobny od limitu EN', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const lista = slowa('a', 'b', 'c', 'd')
  const karty = {
    'a|en': karta('powtorka', minut(teraz, 3000), { stabilnosc: 9 }),
    'b|en': karta('powtorka', minut(teraz, 3000), { stabilnosc: 9 }),
    'a|pl': karta('nauka', minut(teraz, 3000), { wprowadzono: teraz.toISOString() }),
  }
  const seria = t.zbudujSerie({ slowa: lista, karty, ustawienia: { noweDziennie: 1 }, dzis: null, teraz })
  // limit PL (1) wyczerpany przez a|pl, limit EN (1) wolny
  assert.deepEqual(seria, ['c|en'])
})

test('nie umiem wstawia karte ponownie jako czwarta, seria konczy sie po oczyszczeniu wszystkich', () => {
  let seria = t.nowaSeria(['a', 'b', 'c', 'd', 'e', 'f'])
  seria = t.poOcenie(seria, 1)
  assert.deepEqual(seria.kolejka, ['b', 'c', 'd', 'a', 'e', 'f'])
  assert.equal(seria.nieUmiem, 1)
  assert.equal(t.postepSerii(seria), 0)

  for (const oczekiwana of ['b', 'c', 'd']) {
    assert.equal(t.aktualnaKarta(seria), oczekiwana)
    seria = t.poOcenie(seria, 3)
  }
  assert.equal(t.aktualnaKarta(seria), 'a')
  assert.equal(t.postepSerii(seria), 0.5)

  seria = t.poOcenie(seria, 4)
  seria = t.poOcenie(seria, 1)
  assert.deepEqual(seria.kolejka, ['f', 'e'])
  seria = t.poOcenie(seria, 3)
  assert.deepEqual(seria.kolejka, ['e'])
  seria = t.poOcenie(seria, 1)
  assert.deepEqual(seria.kolejka, ['e'])
  assert.equal(t.koniecSerii(seria), false)
  seria = t.poOcenie(seria, 3)

  assert.equal(t.koniecSerii(seria), true)
  assert.equal(t.postepSerii(seria), 1)
  assert.equal(seria.umiem, 6)
  assert.equal(seria.nieUmiem, 3)
  assert.equal(seria.exp, 3 * 10 + 5 * 50 + 20)
})

test('pasek postepu przyspiesza w drugiej polowie', () => {
  assert.equal(t.pasekPostepu(0), 0)
  assert.equal(t.pasekPostepu(1), 1)
  assert.equal(t.pasekPostepu(0.25), 0.125)
  const przyrost = (a, b) => t.pasekPostepu(b) - t.pasekPostepu(a)
  assert.ok(przyrost(0.8, 0.9) > przyrost(0.1, 0.2))
})

test('odblokowanie karty mowienia', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  assert.equal(t.mowienieOdblokowane(undefined), false)
  assert.equal(t.mowienieOdblokowane(karta('nauka', teraz, { stabilnosc: 20 })), false)
  assert.equal(t.mowienieOdblokowane(karta('powtorka', teraz, { stabilnosc: 4.99 })), false)
  assert.equal(t.mowienieOdblokowane(karta('powtorka', teraz, { stabilnosc: 5 })), true)

  // z prawdziwym FSRS: "Znam juz" na nowej karcie daje powtorke z S = 8.3, a "Umiem" dwa razy tylko S = 2.3
  const znamJuz = { ...nowaKarta(), ...ocen(nowaKarta(), 4, teraz) }
  assert.equal(t.mowienieOdblokowane(znamJuz), true)
  let umiem = { ...nowaKarta(), ...ocen(nowaKarta(), 3, teraz) }
  umiem = { ...umiem, ...ocen(umiem, 3, minut(teraz, 10)) }
  assert.equal(umiem.stan, 'powtorka')
  assert.equal(t.mowienieOdblokowane(umiem), false)

  const lista = slowa('x', 'y')
  const pozniej = minut(teraz, 20)
  assert.deepEqual(t.zbudujSerie({ slowa: lista, karty: { 'x|en': znamJuz }, ustawienia: {}, dzis: null, teraz: pozniej }), ['x|pl', 'y|en'])
  assert.deepEqual(t.zbudujSerie({ slowa: lista, karty: { 'x|en': umiem }, ustawienia: {}, dzis: null, teraz: pozniej }), ['y|en'])
})

test('streak: 60 sekund dziennie, ciaglosc i przerwa', () => {
  let s = { streak: { dni: 0, ostatniDzien: '' }, dzis: null }
  const dzien = (d, g = 12) => new Date(2026, 8, d, g, 0)

  s = t.zaliczCzas(s, 20, dzien(14))
  s = t.zaliczCzas(s, 100, dzien(14)) // jedna karta liczy sie najwyzej 20 s
  assert.equal(s.dzis.sekundy, 40)
  assert.equal(s.streak.dni, 0)
  s = t.zaliczCzas(s, 20, dzien(14))
  assert.deepEqual(s.streak, { dni: 1, ostatniDzien: '2026-09-14' })
  s = t.zaliczCzas(s, 20, dzien(14))
  assert.equal(s.streak.dni, 1)

  for (let i = 0; i < 3; i++) s = t.zaliczCzas(s, 20, dzien(15))
  assert.deepEqual(s.streak, { dni: 2, ostatniDzien: '2026-09-15' })

  assert.equal(t.aktualnyStreak(s.streak, dzien(15)), 2)
  assert.equal(t.aktualnyStreak(s.streak, dzien(16)), 2) // wczoraj zaliczony, dzis jeszcze jest czas
  assert.equal(t.aktualnyStreak(s.streak, dzien(17)), 0) // przerwa

  for (let i = 0; i < 3; i++) s = t.zaliczCzas(s, 20, dzien(17))
  assert.deepEqual(s.streak, { dni: 1, ostatniDzien: '2026-09-17' })

  // sekundy z 23:59 nie przechodza na nastepny dzien
  let noc = { streak: { dni: 0, ostatniDzien: '' }, dzis: null }
  for (let i = 0; i < 2; i++) noc = t.zaliczCzas(noc, 20, new Date(2026, 8, 20, 23, 59))
  noc = t.zaliczCzas(noc, 20, new Date(2026, 8, 21, 0, 1))
  assert.equal(noc.dzis.sekundy, 20)
  assert.equal(noc.streak.dni, 0)

  // koniec miesiaca i zmiana czasu na zimowy nie psuja ciaglosci
  assert.equal(t.dzienPrzed('2026-03-01'), '2026-02-28')
  assert.equal(t.dzienPrzed('2026-10-26'), '2026-10-25')
})

test('podpowiedz do mowienia', () => {
  assert.equal(t.podpowiedz('lunch'), 'l _ _ _ _')
  assert.equal(t.podpowiedz('look after'), 'l _ _ _   _ _ _ _ _')
  assert.equal(t.podpowiedz('ice cream'), 'i _ _   _ _ _ _ _')
  assert.equal(t.podpowiedz("o'clock"), "o ' _ _ _ _ _")
  assert.equal(t.podpowiedz('  well-known '), 'w _ _ _ - _ _ _ _ _')
})

test('statystyki per talia i poziom, podsumowanie dnia', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const lista = [
    { id: 'a', w: 'a', pl: 'a', poziom: 'B1', talia: 'Oxford' },
    { id: 'b', w: 'b', pl: 'b', poziom: 'A1', talia: 'Oxford' },
    { id: 'c', w: 'c', pl: 'c', talia: 'Wklejone' },
  ]
  const karty = {
    'a|en': karta('powtorka', minut(teraz, -1), { stabilnosc: 7 }),
    'c|en': karta('nauka', minut(teraz, 30)),
  }
  const st = t.statystyki({ slowa: lista, karty })
  assert.deepEqual(st.talie, [
    { nazwa: 'Oxford', poznane: 1, wszystkie: 2 },
    { nazwa: 'Wklejone', poznane: 1, wszystkie: 1 },
  ])
  assert.deepEqual(st.poziomy.map((p) => p.nazwa), ['A1', 'B1'])
  assert.equal(st.procentPowtorka, 33.3)
  assert.equal(st.mowienieOdblokowane, 1)

  const dzien = t.podsumowanieDnia({ slowa: lista, karty, ustawienia: {}, dzis: null, teraz })
  assert.deepEqual(dzien, { zalegle: 1, pozniejDzis: 1, noweDostepne: 2 })
})

test('poziomy gracza: progi rosna, kazdy prog zaczyna swoj poziom', () => {
  assert.equal(t.PROGI.length, t.MAKS_POZIOM)
  assert.equal(t.progPoziomu(1), 0)
  assert.equal(t.progPoziomu(2), 200)
  assert.equal(t.progPoziomu(3), 430) // koszt 200, potem 230
  assert.equal(t.progPoziomu(4), 690) // 264,5 zaokraglone do 260
  for (let n = 2; n <= t.MAKS_POZIOM; n++) {
    assert.ok(t.progPoziomu(n) > t.progPoziomu(n - 1), `prog ${n} musi byc wiekszy od ${n - 1}`)
    assert.equal(t.poziomZExp(t.progPoziomu(n)).poziom, n)
    assert.equal(t.poziomZExp(t.progPoziomu(n) - 1).poziom, n - 1)
  }

  assert.deepEqual(t.poziomZExp(0), { poziom: 1, tytul: 'Początkujący', wPoziomie: 0, doNastepnego: 200, procent: 0 })
  assert.deepEqual(t.poziomZExp(150), { poziom: 1, tytul: 'Początkujący', wPoziomie: 150, doNastepnego: 50, procent: 75 })
  assert.deepEqual(t.poziomZExp(200), { poziom: 2, tytul: 'Początkujący', wPoziomie: 0, doNastepnego: 230, procent: 0 })
  // EXP spoza zakresu nie moze dac NaN w pasku postepu
  assert.equal(t.poziomZExp(-5).poziom, 1)
  const maks = t.poziomZExp(t.progPoziomu(t.MAKS_POZIOM) * 2)
  assert.equal(maks.poziom, t.MAKS_POZIOM)
  assert.equal(maks.doNastepnego, 0)
  assert.equal(maks.procent, 100)

  const tytuly = [1, 4, 5, 9, 10, 14, 15, 19, 20, 29, 30, 99].map((p) => t.tytulPoziomu(p))
  assert.deepEqual(tytuly, [
    'Początkujący',
    'Początkujący',
    'Turysta',
    'Turysta',
    'Rozmówca',
    'Rozmówca',
    'Swobodny',
    'Swobodny',
    'Biegły',
    'Biegły',
    'Native wannabe',
    'Native wannabe',
  ])
})

test('ocena "Prawie" zdejmuje karte jak "Umiem" i daje 30 EXP', () => {
  assert.deepEqual(t.EXP_ZA_OCENE, { 1: 10, 2: 30, 3: 50, 4: 20 })
  let seria = t.nowaSeria(['a', 'b', 'c'])
  seria = t.poOcenie(seria, 2)
  assert.deepEqual(seria.kolejka, ['b', 'c'])
  assert.equal(seria.prawie, 1)
  assert.equal(seria.umiem, 0)
  assert.equal(seria.oczyszczone, 1)
  assert.equal(seria.exp, 30)
  // tylko "Nie umiem" wraca do kolejki
  seria = t.poOcenie(seria, 1)
  assert.deepEqual(seria.kolejka, ['c', 'b'])
})

test('combo: zerowane przez "Nie umiem", bonus co piate', () => {
  assert.equal(t.bonusComba(0), 0)
  assert.equal(t.bonusComba(4), 0)
  assert.equal(t.bonusComba(5), t.EXP_ZA_COMBO)
  assert.equal(t.bonusComba(10), t.EXP_ZA_COMBO)

  let seria = t.nowaSeria(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  assert.equal(seria.combo, 0)
  for (let i = 1; i <= 4; i++) {
    seria = t.poOcenie(seria, 3)
    assert.equal(seria.combo, i)
    assert.equal(seria.bonus, 0)
  }
  seria = t.poOcenie(seria, 2)
  assert.equal(seria.combo, 5)
  assert.equal(seria.bonus, t.EXP_ZA_COMBO)
  assert.equal(seria.exp, 4 * 50 + 30 + 10)
  seria = t.poOcenie(seria, 1)
  assert.equal(seria.combo, 0)
  assert.equal(seria.bonus, 0)
  seria = t.poOcenie(seria, 3)
  assert.equal(seria.combo, 1)
})

test('historia dni i cel dzienny', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  let historia = {}
  historia = t.dopiszDzien(historia, { oceny: 1, nowe: 1, exp: 50, sekundy: 4.2 }, teraz)
  historia = t.dopiszDzien(historia, { oceny: 1, nowe: 0, exp: 30, sekundy: 3.1 }, teraz)
  assert.deepEqual(historia['2026-09-15'], { oceny: 2, nowe: 1, exp: 80, sekundy: 7.3 })
  assert.equal(t.ocenioneDzis(historia, teraz), 2)
  assert.equal(t.ocenioneDzis(historia, new Date(2026, 8, 16, 12, 0)), 0)
  assert.equal(t.ocenioneDzis(undefined, teraz), 0)

  // dopisanie nie zmienia poprzedniego obiektu (potrzebne do cofania oceny)
  const kolejna = t.dopiszDzien(historia, { oceny: 1 }, teraz)
  assert.equal(historia['2026-09-15'].oceny, 2)
  assert.equal(kolejna['2026-09-15'].oceny, 3)

  // granica dnia lokalnego, nie UTC
  const noc = t.dopiszDzien({}, { oceny: 1 }, new Date(2026, 8, 20, 23, 50))
  assert.deepEqual(Object.keys(noc), ['2026-09-20'])

  assert.deepEqual([0, 1, 9, 10, 25, 500].map(t.stopienDnia), [0, 1, 1, 2, 3, 4])

  const dni = t.historiaDni({ '2026-09-15': { oceny: 30, nowe: 3, exp: 0, sekundy: 0 } }, 30, teraz)
  assert.equal(dni.length, 30)
  assert.deepEqual(dni.at(-1), { data: '2026-09-15', oceny: 30, nowe: 3, stopien: 3 })
  assert.deepEqual(dni[0], { data: '2026-08-17', oceny: 0, nowe: 0, stopien: 0 })
  // przelom roku
  assert.equal(t.historiaDni({}, 3, new Date(2027, 0, 2, 12, 0))[0].data, '2026-12-31')
})

test('przycinanie historii do 180 dni', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const pusty = { oceny: 1, nowe: 0, exp: 0, sekundy: 0 }
  const historia = {
    '2026-09-15': pusty,
    '2026-03-20': pusty, // 179 dni wstecz, zostaje
    '2026-03-19': pusty, // 180 dni wstecz, odpada
    '2025-01-01': pusty,
  }
  assert.deepEqual(Object.keys(t.przytnijHistorie(historia, teraz)).sort(), ['2026-03-20', '2026-09-15'])
  assert.deepEqual(t.przytnijHistorie(undefined, teraz), {})
})

test('prognoza ukonczenia talii', () => {
  const dzien = (historia, data, nowe) => ({ ...historia, [data]: { oceny: nowe, nowe, exp: 0, sekundy: 0 } })
  const grudzien = new Date(2026, 11, 20, 12, 0)
  let historia = dzien({}, '2026-12-19', 7)
  historia = dzien(historia, '2026-12-18', 7)
  // 14 nowych w 14 dniach = 1 dziennie, 20 slow do konca: przelom roku
  const rok = t.prognozaUkonczenia({ pozostale: 20, historia, ustawienia: {}, teraz: grudzien })
  assert.equal(rok.tempo, 1)
  assert.equal(rok.dni, 20)
  assert.equal(rok.data, '2027-01-09')

  // przelom miesiaca
  let styczen = dzien({}, '2026-01-19', 7)
  styczen = dzien(styczen, '2026-01-18', 7)
  const miesiac = t.prognozaUkonczenia({ pozostale: 20, historia: styczen, ustawienia: {}, teraz: new Date(2026, 0, 20, 12, 0) })
  assert.equal(miesiac.dni, 20)
  assert.equal(miesiac.data, '2026-02-09')

  // brak wpisow w okresie: tempo z ustawien
  const zUstawien = t.prognozaUkonczenia({ pozostale: 100, historia: {}, ustawienia: { noweDziennie: 10 }, teraz: grudzien })
  assert.equal(zUstawien.tempo, 10)
  assert.equal(zUstawien.dni, 10)
  assert.equal(zUstawien.data, '2026-12-30')

  // wpisy sa, ale nic nowego: brak danych o tempie
  const zero = t.prognozaUkonczenia({ pozostale: 100, historia: dzien({}, '2026-12-19', 0), ustawienia: {}, teraz: grudzien })
  assert.deepEqual(zero, { tempo: 0, dni: null, data: '' })

  // stare wpisy nie licza sie do tempa z ostatnich 14 dni
  assert.equal(t.sredniaNowych(dzien({}, '2026-11-01', 100), t.DNI_TEMPA, grudzien), null)
})

test('trudne slowa: oba kierunki, wiecej pomylek pierwsze', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const karty = {
    'b|en': karta('powtorka', teraz, { pomylki: 1, ostatnio: '2026-09-14T10:00:00.000Z' }),
    'a|en': karta('powtorka', teraz, { pomylki: 3, ostatnio: '2026-09-10T10:00:00.000Z' }),
    'b|pl': karta('powtorka', teraz, { pomylki: 1, ostatnio: '2026-09-12T10:00:00.000Z' }),
    'c|en': karta('powtorka', teraz, { pomylki: 0 }),
    'usuniete|en': karta('powtorka', teraz, { pomylki: 9 }),
  }
  const lista = slowa('a', 'b', 'c')
  assert.equal(t.liczbaTrudnych({ slowa: lista, karty }), 3)
  assert.deepEqual(t.trudneKarty({ slowa: lista, karty, ustawienia: {} }), ['a|en', 'b|en', 'b|pl'])
  assert.deepEqual(t.trudneKarty({ slowa: lista, karty, ustawienia: {}, dlugosc: 2 }), ['a|en', 'b|en'])
  assert.deepEqual(t.trudneKarty({ slowa: lista, karty: {}, ustawienia: {} }), [])
  assert.equal(t.liczbaTrudnych({ slowa: [], karty }), 0)

  // seria treningowa jest oznaczona, zwykla nie
  assert.equal(t.nowaSeria(['a|en'], true).trening, true)
  assert.equal(t.nowaSeria(['a|en']).trening, false)
})

test('cofniecie oceny: funkcje nie zmieniaja poprzedniego stanu', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const seriaPrzed = t.nowaSeria(['a|en', 'b|en', 'c|en'])
  const stanPrzed = {
    exp: 500,
    streak: { dni: 2, ostatniDzien: '2026-09-14' },
    dzis: { data: '2026-09-15', sekundy: 55, dodatkoweNowe: 0 },
    historia: { '2026-09-15': { oceny: 4, nowe: 1, exp: 200, sekundy: 55 } },
  }
  const migawka = { seria: seriaPrzed, ...stanPrzed }
  const doPorownania = structuredClone(stanPrzed)

  const seriaPo = t.poOcenie(seriaPrzed, 3)
  const czas = t.zaliczCzas(stanPrzed, 8, teraz)
  const historiaPo = t.dopiszDzien(stanPrzed.historia, { oceny: 1, nowe: 0, exp: 50, sekundy: 8 }, teraz)

  // stan po ocenie naprawde sie zmienil
  assert.equal(seriaPo.exp, 50)
  assert.equal(czas.dzis.sekundy, 63)
  assert.deepEqual(czas.streak, { dni: 3, ostatniDzien: '2026-09-15' })
  assert.equal(historiaPo['2026-09-15'].oceny, 5)

  // a migawka dalej pokazuje stan sprzed oceny
  assert.deepEqual(migawka.seria, t.nowaSeria(['a|en', 'b|en', 'c|en']))
  assert.deepEqual({ exp: migawka.exp, streak: migawka.streak, dzis: migawka.dzis, historia: migawka.historia }, doPorownania)
})

test('podpowiedz w trzech poziomach', () => {
  assert.equal(t.podpowiedz('lunch', 'brak'), '')
  assert.equal(t.podpowiedz('lunch', 'dlugosc'), '_ _ _ _ _')
  assert.equal(t.podpowiedz('lunch', 'litera'), 'l _ _ _ _')
  assert.equal(t.podpowiedz('ice cream', 'dlugosc'), '_ _ _   _ _ _ _ _')
  assert.equal(t.podpowiedz("o'clock", 'dlugosc'), "_ ' _ _ _ _ _")
  assert.equal(t.podpowiedz('  well-known ', 'dlugosc'), '_ _ _ _ - _ _ _ _ _')
  // bez poziomu zachowuje sie jak dotad
  assert.equal(t.podpowiedz('lunch'), t.podpowiedz('lunch', 'litera'))

  assert.equal(t.nastepnaPodpowiedz('brak'), 'dlugosc')
  assert.equal(t.nastepnaPodpowiedz('dlugosc'), 'litera')
  assert.equal(t.nastepnaPodpowiedz('litera'), 'litera')
  assert.equal(t.nastepnaPodpowiedz('nieznany'), 'dlugosc')
})

test('wyszukiwarka slowek: bez wielkosci liter i bez polskich znakow', () => {
  const lista = [
    { id: 'apple', w: 'apple', pl: 'jabłko' },
    { id: 'lake', w: 'lake', pl: 'jezioro' },
    { id: 'spoon', w: 'spoon', pl: 'łyżka' },
  ]
  const indeks = t.budujIndeks(lista)
  const ids = (fraza) => t.szukajSlow(indeks, fraza).slowa.map((s) => s.id)

  assert.equal(t.bezZnakow('ŁYŻKA Zażółć'), 'lyzka zazolc')
  assert.deepEqual(ids('APP'), ['apple'])
  assert.deepEqual(ids('jab'), ['apple'])
  assert.deepEqual(ids('lyz'), ['spoon'])
  assert.deepEqual(ids('łyż'), ['spoon'])
  assert.deepEqual(ids('ake'), ['lake'])
  assert.deepEqual(ids(''), ['apple', 'lake', 'spoon'])
  assert.deepEqual(ids('   '), ['apple', 'lake', 'spoon'])
  assert.deepEqual(t.szukajSlow(indeks, 'zzz'), { slowa: [], wszystkie: 0 })

  // licznik "pokazano 50 z 312" liczy wszystkie trafienia, lista jest przycieta
  const duza = t.budujIndeks(Array.from({ length: 312 }, (_, i) => ({ id: `s${i}`, w: `word${i}`, pl: 'słowo' })))
  const wynik = t.szukajSlow(duza, 'word')
  assert.equal(wynik.wszystkie, 312)
  assert.equal(wynik.slowa.length, t.MAKS_WYNIKOW)
  assert.equal(t.szukajSlow(duza, '').slowa.length, t.MAKS_WYNIKOW)
})

test('stan karty EN po polsku i licznik opanowanych', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  assert.equal(t.opisStanuKarty(undefined, teraz), 'nowa')
  assert.equal(t.opisStanuKarty(karta('nauka', minut(teraz, 10)), teraz), 'w nauce')
  assert.equal(t.opisStanuKarty(karta('ponowna', minut(teraz, 10)), teraz), 'w nauce')
  assert.equal(t.opisStanuKarty(karta('powtorka', minut(teraz, -60)), teraz), 'powtórka teraz')
  assert.equal(t.opisStanuKarty(karta('powtorka', minut(teraz, 1440)), teraz), 'powtórka za 1 dzień')
  assert.equal(t.opisStanuKarty(karta('powtorka', minut(teraz, 5 * 1440)), teraz), 'powtórka za 5 dni')
  assert.equal(t.opisStanuKarty(karta('powtorka', minut(teraz, 1440), { stabilnosc: t.PROG_OPANOWANIA }), teraz), 'opanowane')

  const lista = slowa('a', 'b', 'c')
  const karty = {
    'a|en': karta('powtorka', teraz, { stabilnosc: 25 }),
    'b|en': karta('powtorka', teraz, { stabilnosc: 20.9 }),
  }
  assert.equal(t.statystyki({ slowa: lista, karty }).opanowane, 1)
})

// Poprawki po przegladzie kodu

test('odejmijNowe oddaje nowe slowo z dnia wprowadzenia, a nie z dnia resetu', () => {
  const historia = { '2026-09-14': { oceny: 20, nowe: 5, exp: 700 }, '2026-09-18': { oceny: 30, nowe: 2, exp: 900 } }
  const wynik = t.odejmijNowe(historia, [new Date(2026, 8, 14, 9, 30).toISOString(), ''])
  assert.equal(wynik['2026-09-14'].nowe, 4)
  assert.equal(wynik['2026-09-14'].oceny, 20, 'reszta dnia bez zmian')
  assert.equal(wynik['2026-09-18'].nowe, 2, 'inne dni bez zmian')
  assert.equal(historia['2026-09-14'].nowe, 5, 'wejscie nietkniete')
})

test('odejmijNowe nie schodzi ponizej zera i znosi brakujace dni', () => {
  const historia = { '2026-09-18': { oceny: 3, nowe: 0, exp: 90 } }
  const iso = new Date(2026, 8, 18, 12, 0).toISOString()
  assert.equal(t.odejmijNowe(historia, [iso, iso])['2026-09-18'].nowe, 0)
  assert.deepEqual(t.odejmijNowe(historia, [null, undefined]), historia)
  assert.deepEqual(t.odejmijNowe(historia, [new Date(2020, 0, 1).toISOString()]), historia)
})

test('przytnijHistorie wyrzuca dni z przyszlosci po cofnietym zegarze', () => {
  const teraz = new Date(2026, 8, 18, 10, 0)
  const historia = { '2026-09-18': { oceny: 1 }, '2026-09-19': { oceny: 9 }, '2099-01-01': { oceny: 9 }, '2026-09-17': { oceny: 2 } }
  const wynik = t.przytnijHistorie(historia, teraz)
  assert.deepEqual(Object.keys(wynik).sort(), ['2026-09-17', '2026-09-18'])
})

test('pasek poziomu nie pokazuje 100% przed samym awansem', () => {
  const prog = t.PROGI[1]
  assert.equal(t.poziomZExp(prog - 1).procent, 99)
  assert.equal(t.poziomZExp(prog).poziom, 2)
  assert.equal(t.poziomZExp(0).procent, 0)
})
