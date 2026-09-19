// Logika serii, limitow, streaka i podpowiedzi. Uruchomienie: node --test
// Strefa ustawiona na Polske, zeby granica dnia lokalnego roznila sie od UTC i test wylapal liczenie po UTC.
process.env.TZ = 'Europe/Warsaw'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STANY as STANY_FSRS, nowaKarta, ocen, przypomnienie } from './lib/fsrs.mjs'
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

test('odblokowanie karty mowienia: stabilnosc 4 albo dwie kolejne oceny Umiem', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  assert.equal(t.PROG_STABILNOSCI_MOWIENIA, 4)
  assert.equal(t.mowienieOdblokowane(undefined), false)
  assert.equal(t.mowienieOdblokowane(karta('nowa', teraz, { stabilnosc: 20 })), false)
  assert.equal(t.mowienieOdblokowane(karta('nauka', teraz, { stabilnosc: 20 })), false, 'stabilnosc liczy sie dopiero w powtorce')
  assert.equal(t.mowienieOdblokowane(karta('powtorka', teraz, { stabilnosc: 3.99 })), false)
  assert.equal(t.mowienieOdblokowane(karta('powtorka', teraz, { stabilnosc: 4 })), true)
  // Druga droga: dwie kolejne oceny "Umiem", niezaleznie od stabilnosci.
  assert.equal(t.mowienieOdblokowane(karta('nauka', teraz, { stabilnosc: 0.5, kolejneUmiem: 1 })), false)
  assert.equal(t.mowienieOdblokowane(karta('nauka', teraz, { stabilnosc: 0.5, kolejneUmiem: 2 })), true)

  // Licznik kolejnych "Umiem": ocena 3 i 4 podbija, kazda inna zeruje.
  assert.equal(t.kolejneUmiem(undefined, 3), 1)
  assert.equal(t.kolejneUmiem({ kolejneUmiem: 1 }, 3), 2)
  assert.equal(t.kolejneUmiem({ kolejneUmiem: 1 }, 4), 2)
  assert.equal(t.kolejneUmiem({ kolejneUmiem: 3 }, 2), 0)
  assert.equal(t.kolejneUmiem({ kolejneUmiem: 3 }, 1), 0)

  // z prawdziwym FSRS: "Znam juz" na nowej karcie daje powtorke z S = 8.3, a "Umiem" dwa razy tylko S = 2.3,
  // ale dwie kolejne oceny "Umiem" i tak odblokowuja mowienie.
  const znamJuz = { ...nowaKarta(), ...ocen(nowaKarta(), 4, teraz), kolejneUmiem: 1 }
  assert.equal(t.mowienieOdblokowane(znamJuz), true)
  let umiem = { ...nowaKarta(), ...ocen(nowaKarta(), 3, teraz), kolejneUmiem: 1 }
  umiem = { ...umiem, ...ocen(umiem, 3, minut(teraz, 10)), kolejneUmiem: 2 }
  assert.equal(umiem.stan, 'powtorka')
  assert.ok(umiem.stabilnosc < t.PROG_STABILNOSCI_MOWIENIA, `stabilnosc ${umiem.stabilnosc}`)
  assert.equal(t.mowienieOdblokowane(umiem), true)

  const lista = slowa('x', 'y')
  const pozniej = minut(teraz, 20)
  assert.deepEqual(t.zbudujSerie({ slowa: lista, karty: { 'x|en': znamJuz }, ustawienia: {}, dzis: null, teraz: pozniej }), ['x|pl', 'y|en'])
  assert.deepEqual(t.zbudujSerie({ slowa: lista, karty: { 'x|en': umiem }, ustawienia: {}, dzis: null, teraz: pozniej }), ['x|pl', 'y|en'])
})

test('limit odblokowan kart mowienia: 12 dziennie, osobno od limitu nowych slow', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const lista = slowa(...Array.from({ length: 40 }, (_, i) => `s${i}`))
  const karty = {}
  for (const s of lista) karty[`${s.id}|en`] = karta('powtorka', minut(teraz, 5000), { stabilnosc: 9 })
  const seria = t.zbudujSerie({ slowa: lista, karty, ustawienia: { noweDziennie: 30 }, dzis: null, teraz, dlugosc: Infinity })
  assert.equal(t.MAKS_ODBLOKOWAN_DZIENNIE, 12)
  assert.equal(seria.filter((k) => k.endsWith('|pl')).length, t.MAKS_ODBLOKOWAN_DZIENNIE)
  assert.equal(seria.length, t.MAKS_ODBLOKOWAN_DZIENNIE, 'wszystkie karty EN sa juz w powtorkach, wiec nowych EN nie ma')

  // Odblokowania z dzisiaj zjadaja limit.
  for (let i = 0; i < 10; i++) karty[`s${i}|pl`] = karta('nauka', minut(teraz, 30), { wprowadzono: teraz.toISOString() })
  const reszta = t.zbudujSerie({ slowa: lista, karty, ustawienia: { noweDziennie: 30 }, dzis: null, teraz, dlugosc: Infinity })
  assert.equal(reszta.filter((k) => k.endsWith('|pl') && !karty[k]).length, 2)
})

test('czas nauki jest tylko statystyka i nie przechodzi na nastepny dzien', () => {
  let dzis = t.zaliczCzas(null, 20, new Date(2026, 8, 14, 12, 0))
  dzis = t.zaliczCzas(dzis, 100, new Date(2026, 8, 14, 12, 1)) // jedna karta liczy sie najwyzej 20 s
  assert.equal(dzis.sekundy, 40)
  assert.equal(dzis.powtorki, 0)

  let noc = t.zaliczCzas(null, 20, new Date(2026, 8, 20, 23, 59))
  noc = t.zaliczCzas(noc, 20, new Date(2026, 8, 20, 23, 59))
  noc = t.zaliczCzas(noc, 20, new Date(2026, 8, 21, 0, 1))
  assert.equal(noc.sekundy, 20)
  assert.equal(noc.data, '2026-09-21')

  // koniec miesiaca i zmiana czasu na zimowy nie psuja ciaglosci
  assert.equal(t.dzienPrzed('2026-03-01'), '2026-02-28')
  assert.equal(t.dzienPrzed('2026-10-26'), '2026-10-25')
  assert.equal(t.dniMiedzyDatami('2026-10-25', '2026-10-26'), 1)
  assert.equal(t.dniMiedzyDatami('2026-02-28', '2026-03-01'), 1)
  assert.equal(t.dniMiedzyDatami('2026-09-14', '2026-09-21'), 7)
})

test('seria: prog jednej ocenionej karty, ciaglosc i przerwa bez kary', () => {
  const dzien = (d, g = 12) => new Date(2026, 8, d, g, 0)
  assert.equal(t.PROG_SERII, 1)

  // Jedna karta zalicza dzien; kolejne tego samego dnia nic nie zmieniaja.
  let w = t.zaliczDzien(t.PUSTY_STREAK, dzien(14))
  assert.equal(w.zaliczony, true)
  assert.deepEqual([w.streak.dni, w.streak.ostatniDzien], [1, '2026-09-14'])
  const drugiRaz = t.zaliczDzien(w.streak, dzien(14, 20))
  assert.equal(drugiRaz.zaliczony, false)
  assert.equal(drugiRaz.streak.dni, 1)

  w = t.zaliczDzien(w.streak, dzien(15))
  assert.equal(w.streak.dni, 2)
  assert.equal(t.aktualnyStreak(w.streak, dzien(15)), 2)
  assert.equal(t.aktualnyStreak(w.streak, dzien(16)), 2, 'wczoraj zaliczony, dzis jeszcze jest czas')
  assert.equal(t.aktualnyStreak(w.streak, dzien(17)), 0, 'przerwa bez zamrozenia')

  // Przerwa bez zamrozenia: seria zaczyna sie od nowa, ale nigdzie nie ma komunikatu o stracie.
  const poPrzerwie = t.zaliczDzien(w.streak, dzien(17))
  assert.equal(poPrzerwie.zerwano, true)
  assert.equal(poPrzerwie.zamrozono, false)
  assert.equal(poPrzerwie.streak.dni, 1)
  assert.equal(poPrzerwie.streak.zerwane.dni, 2, 'wartosc sprzed przerwy czeka na odzyskanie')
  assert.equal(Date.parse(poPrzerwie.streak.zerwane.do) - dzien(17).getTime(), t.GODZIN_NA_ODZYSKANIE * 3600000)

  // Wejscie nietkniete (migawka cofniecia trzyma referencje).
  assert.deepEqual(w.streak.zerwane, t.PUSTE_ZERWANIE)
})

test('zamrozenia serii: jedno co 7 dni nauki, bank 2, zuzywane w dniu bez nauki', () => {
  const dzien = (d) => new Date(2026, 8, d, 12, 0)
  let s = t.PUSTY_STREAK
  for (let d = 1; d <= 6; d++) s = t.zaliczDzien(s, dzien(d)).streak
  assert.equal(s.zamrozenia, 0, 'po 6 dniach jeszcze nic')
  s = t.zaliczDzien(s, dzien(7)).streak
  assert.equal(s.zamrozenia, 1, 'siodmy dzien nauki daje zamrozenie')
  assert.equal(s.doZamrozenia, 0)
  for (let d = 8; d <= 14; d++) s = t.zaliczDzien(s, dzien(d)).streak
  assert.equal(s.zamrozenia, 2)
  for (let d = 15; d <= 21; d++) s = t.zaliczDzien(s, dzien(d)).streak
  assert.equal(s.zamrozenia, t.MAKS_ZAMROZEN, 'bank nie rosnie ponad 2')
  assert.equal(s.dni, 21)

  // Jeden dzien wolnego: zamrozenie pokrywa przerwe, seria idzie dalej.
  const poWolnym = t.zaliczDzien(s, dzien(23))
  assert.equal(poWolnym.zamrozono, true)
  assert.equal(poWolnym.zerwano, false)
  assert.equal(poWolnym.streak.dni, 22)
  assert.equal(poWolnym.streak.zamrozenia, 1)

  // Zamrozenie trzyma licznik takze zanim uzytkownik znow otworzy apke.
  assert.equal(t.aktualnyStreak(s, dzien(23)), 21)
  assert.equal(t.aktualnyStreak(s, dzien(24)), 21, 'dwa dni wolnego pokrywa bank 2')
  assert.equal(t.aktualnyStreak(s, dzien(25)), 0, 'trzeciego dnia nie ma juz czym pokryc')

  // Trzy dni wolnego przy banku 2: seria zaczyna sie od nowa, bank zostaje nietkniety.
  const zerwane = t.zaliczDzien(s, dzien(25))
  assert.equal(zerwane.zerwano, true)
  assert.equal(zerwane.streak.zamrozenia, 2)
})

test('odzyskanie serii: dwie sesje w 48 h, raz na 30 dni', () => {
  const dzien = (d, g = 12) => new Date(2026, 8, d, g, 0)
  let s = { ...t.PUSTY_STREAK, dni: 12, ostatniDzien: '2026-09-10' }
  const zerwane = t.zaliczDzien(s, dzien(14))
  assert.equal(zerwane.zerwano, true)
  s = zerwane.streak
  assert.equal(s.dni, 1)

  const pierwsza = t.zaliczSesje(s, dzien(14, 13))
  assert.equal(pierwsza.odzyskano, false)
  assert.equal(pierwsza.streak.sesje, 1)
  const druga = t.zaliczSesje(pierwsza.streak, dzien(15, 9))
  assert.equal(druga.odzyskano, true)
  assert.equal(druga.streak.dni, 13, 'dni sprzed przerwy plus dni zebrane po niej')
  assert.deepEqual(druga.streak.zerwane, t.PUSTE_ZERWANIE)
  assert.equal(druga.streak.ostatnieOdzyskanie, '2026-09-15')

  // Po 48 h okno sie zamyka.
  const pozno = t.zaliczSesje(t.zaliczSesje(s, dzien(14, 13)).streak, dzien(17))
  assert.equal(pozno.odzyskano, false)
  assert.deepEqual(pozno.streak.zerwane, t.PUSTE_ZERWANIE)

  // Drugie odzyskanie w ciagu 30 dni nie przechodzi, po 30 dniach juz tak.
  const znowZerwana = t.zaliczDzien({ ...druga.streak, dni: 5, ostatniDzien: '2026-09-16' }, dzien(20)).streak
  const proba = t.zaliczSesje(t.zaliczSesje(znowZerwana, dzien(20, 13)).streak, dzien(20, 14))
  assert.equal(proba.odzyskano, false, 'od ostatniego odzyskania minelo 5 dni')
  const pozniej = { ...znowZerwana, ostatnieOdzyskanie: '2026-08-01' }
  assert.equal(t.zaliczSesje(t.zaliczSesje(pozniej, dzien(20, 13)).streak, dzien(20, 14)).odzyskano, true)
  assert.equal(t.DNI_MIEDZY_ODZYSKANIAMI, 30)

  // Bez zerwania sesje niczego nie zmieniaja.
  const bezZerwania = t.zaliczSesje({ ...t.PUSTY_STREAK, dni: 3, ostatniDzien: '2026-09-15' }, dzien(15))
  assert.equal(bezZerwania.odzyskano, false)
  assert.equal(bezZerwania.streak.dni, 3)
})

test('dni nauki w ostatnich 30: licznik, ktory nigdy sie nie zeruje', () => {
  const teraz = new Date(2026, 8, 30, 12, 0)
  const historia = {}
  for (const d of [1, 2, 3, 10, 15, 16, 17, 28, 29, 30]) {
    historia[`2026-09-${String(d).padStart(2, '0')}`] = { oceny: 5, nowe: 0, exp: 0, sekundy: 0 }
  }
  historia['2026-09-20'] = { oceny: 0, nowe: 0, exp: 0, sekundy: 0 }
  historia['2026-08-20'] = { oceny: 40, nowe: 0, exp: 0, sekundy: 0 }
  assert.equal(t.dniZNauka(historia, 30, teraz), 10, 'dni spoza okresu i dni bez ocen nie licza sie')
  assert.equal(t.dniZNauka(historia, 7, teraz), 3)
  assert.equal(t.dniZNauka({}, 30, teraz), 0)
  assert.equal(t.DNI_OSTATNICH, 30)
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
  assert.deepEqual(dzien, { zalegle: 1, pozniejDzis: 1, noweDostepne: 2, doZrobienia: 3, nadrabianie: false })
})

test('ranga: progi i pasek do nastepnego progu', () => {
  assert.deepEqual(
    t.PROGI_RANG.map(([prog]) => prog),
    [0, 50, 150, 350, 700, 1200, 1800, 2500, 2981],
  )
  assert.deepEqual(
    t.PROGI_RANG.map(([, nazwa]) => nazwa),
    ['Start', 'Pierwsze słowa', 'Turysta', 'Rozmowa', 'Swobodnie', 'Pewnie', 'Biegle', 'Prawie natywnie', 'Cała talia'],
  )
  for (const [i, [prog]] of t.PROGI_RANG.entries()) {
    assert.equal(t.ranga(prog).stopien, i, `prog ${prog} zaczyna swoja range`)
    if (i > 0) assert.equal(t.ranga(prog - 1).stopien, i - 1)
  }

  const start = t.ranga(0)
  assert.equal(start.nazwa, 'Start')
  assert.equal(start.doNastepnej, 50)
  assert.equal(start.nastepnaNazwa, 'Pierwsze słowa')
  assert.equal(start.procent, 0)
  const wPolowie = t.ranga(100)
  assert.equal(wPolowie.nazwa, 'Pierwsze słowa')
  assert.equal(wPolowie.procent, 50)
  assert.equal(wPolowie.doNastepnej, 50)
  // Pasek nie pokazuje 100% przed samym awansem.
  assert.equal(t.ranga(149).procent, 99)
  assert.equal(t.ranga(149).nazwa, 'Pierwsze słowa')

  const najwyzsza = t.ranga(5000)
  assert.equal(najwyzsza.nazwa, 'Cała talia')
  assert.equal(najwyzsza.ostatnia, true)
  assert.equal(najwyzsza.doNastepnej, 0)
  assert.equal(najwyzsza.procent, 100)
  // Liczba spoza zakresu nie moze dac NaN w pasku postepu.
  assert.equal(t.ranga(-5).stopien, 0)
  assert.equal(t.ranga('x').utrwalone, 0)
  assert.equal(t.opisRangi(t.ranga(100)), 'Pierwsze słowa · 100 / 150 słów utrwalonych')
  assert.equal(t.opisRangi(najwyzsza), 'Cała talia · 5000 słów utrwalonych')
})

test('ranga liczy sie z kart EN o stabilnosci co najmniej 30 dni', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  assert.equal(t.PROG_UTRWALENIA, 30)
  const lista = slowa('a', 'b', 'c', 'd', 'e')
  const karty = {
    'a|en': karta('powtorka', teraz, { stabilnosc: 30 }),
    'b|en': karta('powtorka', teraz, { stabilnosc: 29.9 }),
    'c|en': karta('powtorka', teraz, { stabilnosc: 200 }),
    // karta mowienia nie liczy sie do rangi, nowa karta tez nie
    'c|pl': karta('powtorka', teraz, { stabilnosc: 200 }),
    'd|en': karta('nowa', teraz, { stabilnosc: 90 }),
    'e|en': karta('powtorka', teraz, { stabilnosc: 45 }),
  }
  assert.equal(t.liczbaUtrwalonych({ slowa: lista, karty }), 3)
  assert.equal(t.statystyki({ slowa: lista, karty }).utrwalone, 3)
  assert.equal(t.ranga(t.liczbaUtrwalonych({ slowa: lista, karty })).nazwa, 'Start')

  // Karta po "Znam" ma stabilnosc ok. 8 dni, wiec rangi nie zawyza.
  const znam = t.kartaZnam({ ...nowaKarta(), ...ocen(nowaKarta(), 4, teraz) }, 'x|en', teraz)
  assert.ok(znam.stabilnosc < t.PROG_UTRWALENIA, `stabilnosc po "Znam": ${znam.stabilnosc}`)
  assert.equal(t.liczbaUtrwalonych({ slowa: slowa('x'), karty: { 'x|en': znam } }), 0)
})

test('punkty tygodnia: licznik zerowany w poniedzialek rano', () => {
  const wtorek = new Date(2026, 8, 15, 12, 0)
  const niedziela = new Date(2026, 8, 20, 23, 30)
  const poniedzialek = new Date(2026, 8, 21, 0, 10)
  assert.equal(t.poczatekTygodnia(wtorek), '2026-09-14')
  assert.equal(t.poczatekTygodnia(niedziela), '2026-09-14')
  assert.equal(t.poczatekTygodnia(poniedzialek), '2026-09-21')
  assert.equal(t.poczatekTygodnia(new Date(2026, 8, 14, 0, 0)), '2026-09-14')

  let p = t.dolozPunkty(undefined, 50, wtorek)
  assert.deepEqual(p, { tydzien: '2026-09-14', punkty: 50 })
  p = t.dolozPunkty(p, 30, niedziela)
  assert.deepEqual(p, { tydzien: '2026-09-14', punkty: 80 })
  // Poniedzialek rano zaczyna nowy licznik, laczne punkty (expRazem) zostaja poza nim.
  assert.deepEqual(t.punktyTygodnia(p, poniedzialek), { tydzien: '2026-09-21', punkty: 0 })
  assert.deepEqual(t.dolozPunkty(p, 10, poniedzialek), { tydzien: '2026-09-21', punkty: 10 })
  assert.deepEqual(t.punktyTygodnia(p, niedziela), p)
  assert.deepEqual(t.punktyTygodnia({ tydzien: '2026-09-14', punkty: -5 }, wtorek), { tydzien: '2026-09-14', punkty: 0 })
  assert.equal(t.dolozPunkty(p, -100, niedziela).punkty, 80, 'ujemne punkty nie zabieraja licznika')
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
    expRazem: 500,
    punktyTygodnia: { tydzien: '2026-09-14', punkty: 200 },
    streak: { ...t.PUSTY_STREAK, dni: 2, ostatniDzien: '2026-09-14' },
    dzis: { data: '2026-09-15', sekundy: 55, dodatkoweNowe: 0, powtorki: 3 },
    historia: { '2026-09-15': { oceny: 4, nowe: 1, exp: 200, sekundy: 55 } },
  }
  const migawka = { seria: seriaPrzed, ...stanPrzed }
  const doPorownania = structuredClone(stanPrzed)

  const seriaPo = t.poOcenie(seriaPrzed, 3)
  const dzisPo = t.zaliczCzas(stanPrzed.dzis, 8, teraz)
  const streakPo = t.zaliczDzien(stanPrzed.streak, teraz)
  const punktyPo = t.dolozPunkty(stanPrzed.punktyTygodnia, 50, teraz)
  const historiaPo = t.dopiszDzien(stanPrzed.historia, { oceny: 1, nowe: 0, exp: 50, sekundy: 8 }, teraz)

  // stan po ocenie naprawde sie zmienil
  assert.equal(seriaPo.exp, 50)
  assert.equal(dzisPo.sekundy, 63)
  assert.equal(streakPo.streak.dni, 3)
  assert.equal(punktyPo.punkty, 250)
  assert.equal(historiaPo['2026-09-15'].oceny, 5)

  // a migawka dalej pokazuje stan sprzed oceny
  assert.deepEqual(migawka.seria, t.nowaSeria(['a|en', 'b|en', 'c|en']))
  assert.deepEqual(
    {
      expRazem: migawka.expRazem,
      punktyTygodnia: migawka.punktyTygodnia,
      streak: migawka.streak,
      dzis: migawka.dzis,
      historia: migawka.historia,
    },
    doPorownania,
  )
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

// "Pomijam": slowo wypada z nauki, karty zostaja nietkniete

test('pominiete slowo nie trafia do serii, a jego karty zostaja w pamieci', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const karty = {
    'a|en': karta('powtorka', minut(teraz, -1440)),
    'b|en': karta('powtorka', minut(teraz, -60)),
  }
  const lista = slowa('a', 'b', 'c', 'd')
  const pominiete = { a: '2026-09-15', c: '2026-09-15' }
  assert.deepEqual(t.zbudujSerie({ slowa: lista, karty, ustawienia: {}, dzis: null, teraz }), ['a|en', 'b|en', 'c|en', 'd|en'])
  assert.deepEqual(t.zbudujSerie({ slowa: lista, karty, ustawienia: {}, dzis: null, teraz, pominiete }), ['b|en', 'd|en'])
  assert.ok(karty['a|en'], 'karta pominietego slowa zostaje')
})

test('pominiete slowo wypada z limitu nowych, zaleglych i trudnych', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const karty = {
    'a|en': karta('powtorka', minut(teraz, -1440), { pomylki: 3 }),
    'b|en': karta('powtorka', minut(teraz, 120)),
  }
  const lista = slowa('a', 'b', 'c')
  const pominiete = { a: '2026-09-15' }
  const bez = t.podsumowanieDnia({ slowa: lista, karty, ustawienia: {}, dzis: null, teraz })
  const z = t.podsumowanieDnia({ slowa: lista, karty, ustawienia: {}, dzis: null, teraz, pominiete })
  assert.equal(bez.zalegle, 1)
  assert.equal(z.zalegle, 0, 'pominiete nie jest zalegle')
  assert.equal(bez.noweDostepne, 1)
  assert.equal(z.noweDostepne, 1, 'c dalej jest nowe')
  assert.equal(z.pozniejDzis, 1, 'b bez zmian')
  assert.equal(t.liczbaTrudnych({ slowa: lista, karty }), 1)
  assert.equal(t.liczbaTrudnych({ slowa: lista, karty, pominiete }), 0)
  assert.deepEqual(t.trudneKarty({ slowa: lista, karty, ustawienia: {}, pominiete }), [])
})

test('statystyki: pominiete osobno, poznane po nauce dalej sie licza', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const lista = slowa('a', 'b', 'c', 'd')
  const karty = { 'a|en': karta('powtorka', teraz), 'b|en': karta('powtorka', teraz) }
  // a przeszlo nauke i zostalo pominiete, c jest pominiete jako nowe
  const st = t.statystyki({ slowa: lista, karty, pominiete: { a: '2026-09-15', c: '2026-09-15' } })
  assert.equal(st.poznane, 2, 'pominiete po nauce dalej liczy sie jako poznane')
  assert.equal(st.pominiete, 2)
  assert.equal(st.doWprowadzenia, 1, 'do wprowadzenia zostaje tylko d')
  assert.equal(t.statystyki({ slowa: lista, karty }).doWprowadzenia, 2)
})

test('stan "pominięte" w przegladzie talii', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  assert.equal(t.opisStanuKarty(undefined, teraz, true), 'pominięte')
  assert.equal(t.opisStanuKarty(karta('powtorka', minut(teraz, 5 * 1440)), teraz, true), 'pominięte')
  assert.equal(t.opisStanuKarty(karta('powtorka', minut(teraz, 5 * 1440)), teraz, false), 'powtórka za 5 dni')
  assert.equal(t.jestPominiete({ a: '2026-09-15' }, 'a'), true)
  assert.equal(t.jestPominiete({ a: '2026-09-15' }, 'b'), false)
  assert.equal(t.jestPominiete(undefined, 'a'), false)
})

// Rozrzut terminow (fuzz)

const dniDo = (iso, teraz) => (Date.parse(iso) - teraz.getTime()) / 86400000
const zaDni = (teraz, dni) => new Date(teraz.getTime() + dni * 86400000).toISOString()

test('rozrzucTermin jest deterministyczny', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const termin = zaDni(teraz, 10)
  const a = t.rozrzucTermin('apple|en', termin, teraz)
  assert.equal(a, t.rozrzucTermin('apple|en', termin, teraz))
  assert.notEqual(a, t.rozrzucTermin('book|en', termin, teraz), 'inny klucz daje inne przesuniecie')
  assert.notEqual(a, t.rozrzucTermin('apple|en', zaDni(teraz, 10.5), teraz), 'inny termin daje inne przesuniecie')
})

test('rozrzucTermin zostawia krotkie terminy i trzyma sie zakresu', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  for (const dni of [0, 0.007, 1, 2, 2.99]) {
    const termin = zaDni(teraz, dni)
    assert.equal(t.rozrzucTermin('apple|en', termin, teraz), termin, `${dni} dni bez zmian`)
  }
  assert.equal(t.rozrzucTermin('apple|en', zaDni(teraz, -5), teraz), zaDni(teraz, -5), 'zalegle bez zmian')
  for (const k of ['a|en', 'b|en', 'c|pl', 'dlugie slowo|en']) {
    const dni = dniDo(t.rozrzucTermin(k, zaDni(teraz, 10), teraz), teraz)
    assert.ok(dni >= 9.2 && dni <= 10.8, `${k}: ${dni} dni poza zakresem 9,2-10,8`)
  }
})

test('rozrzucTermin nie cofa terminu przed teraz + 1 dzien i daje pelne minuty', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  for (let i = 0; i < 300; i++) {
    const iso = t.rozrzucTermin(`s${i}|en`, zaDni(teraz, 3), teraz, 1)
    const dni = dniDo(iso, teraz)
    assert.ok(dni >= 1, `s${i}: ${dni} dni`)
    assert.equal(Date.parse(iso) % 60000, 0, 'termin zaokraglony do pelnych minut')
  }
  // Maksymalne przesuniecie to 21 dni, takze przy bardzo dalekim terminie.
  const dni = dniDo(t.rozrzucTermin('x|en', zaDni(teraz, 400), teraz, 1), teraz)
  assert.ok(dni >= 400 - t.MAKS_DNI_ROZRZUTU && dni <= 400 + t.MAKS_DNI_ROZRZUTU, `${dni} dni`)
})

test('400 kart z tym samym terminem rozklada sie na kilka dni', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const termin = zaDni(teraz, t.DNI_ZNAM)
  const dni = new Set()
  for (let i = 0; i < 400; i++) dni.add(t.dataLokalna(new Date(t.rozrzucTermin(`s${i}|en`, termin, teraz))))
  assert.ok(dni.size >= 3, `tylko ${dni.size} roznych dni`)
})

test('rozprosTerminy rusza tylko przyszle terminy kart w powtorkach', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const karty = {}
  for (let i = 0; i < 400; i++) karty[`s${i}|en`] = karta('powtorka', minut(teraz, 8 * 1440))
  karty['zalegla|en'] = karta('powtorka', minut(teraz, -1440))
  karty['jutro|en'] = karta('powtorka', minut(teraz, 1440))
  karty['wnauce|en'] = karta('nauka', minut(teraz, 10))
  karty['nowa|en'] = karta('nowa', minut(teraz, 30 * 1440))
  const wynik = t.rozprosTerminy(karty, teraz)
  assert.equal(wynik.przesuniete, 400)
  for (const k of ['zalegla|en', 'jutro|en', 'wnauce|en', 'nowa|en']) {
    assert.equal(wynik.karty[k].termin, karty[k].termin, `${k} nietknieta`)
    assert.equal(wynik.karty[k], karty[k], `${k} to ten sam obiekt`)
  }
  const dni = new Set()
  for (let i = 0; i < 400; i++) dni.add(t.dataLokalna(new Date(wynik.karty[`s${i}|en`].termin)))
  assert.ok(dni.size >= 3, `tylko ${dni.size} roznych dni`)
  assert.equal(karty['s0|en'].termin, minut(teraz, 8 * 1440).toISOString(), 'wejscie nietkniete')
})

test('"Znam" daje jedno sprawdzenie za okolo 45 dni', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const nowa = nowaKarta(teraz.toISOString())
  const poFsrs = { ...nowa, ...ocen(nowa, 4, teraz) }
  assert.ok(dniDo(poFsrs.termin, teraz) < 20, `sam FSRS daje ${dniDo(poFsrs.termin, teraz)} dni`)
  const znam = t.kartaZnam(poFsrs, 'apple|en', teraz)
  assert.equal(znam.stan, 'powtorka')
  assert.equal(znam.krok, 0)
  assert.equal(znam.stabilnosc, poFsrs.stabilnosc, 'stabilnosc bez zmian: slowo nie przeszlo jeszcze powtorki')
  const dni = dniDo(znam.termin, teraz)
  assert.ok(Math.abs(dni - t.DNI_ZNAM) <= t.DNI_ZNAM * 0.08 + 0.001, `${dni} dni`)
  assert.equal(znam.trudnosc, poFsrs.trudnosc, 'reszta pamieci FSRS bez zmian')
  assert.equal(znam.powtorki, poFsrs.powtorki)
  assert.equal(znam.wprowadzono, poFsrs.wprowadzono)
  // Karta z wieksza stabilnoscia nie traci jej przez "Znam".
  assert.equal(t.kartaZnam({ ...poFsrs, stabilnosc: 90 }, 'apple|en', teraz).stabilnosc, 90)
})

// Sufit powtorek, kolejnosc po pilnosci i tryb nadrabiania (A1, A2)

test('sufit dzienny powtorek: nadmiar przechodzi na kolejne dni, nowe slowa go nie dotycza', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const lista = slowa(...Array.from({ length: 200 }, (_, i) => `s${i}`))
  const karty = {}
  for (let i = 0; i < 150; i++) {
    karty[`s${i}|en`] = karta('powtorka', minut(teraz, -60 - i), { stabilnosc: 10 + i })
  }
  const ustawienia = { noweDziennie: 10, maksPowtorekDziennie: 40, mowienie: false }
  const wszystko = t.zbudujSerie({ slowa: lista, karty, ustawienia, dzis: null, teraz, dlugosc: Infinity, przypomnienie })
  assert.equal(wszystko.filter((k) => karty[k]).length, 40, 'zalegle przyciete do sufitu')
  assert.equal(wszystko.filter((k) => !karty[k]).length, 10, 'nowe slowa maja wlasny limit')

  // Karty zrobione dzisiaj zjadaja budzet.
  const dzis = { data: '2026-09-15', sekundy: 0, dodatkoweNowe: 0, powtorki: 35 }
  assert.equal(t.budzetPowtorek({ ustawienia, dzis, teraz }), 5)
  const reszta = t.zbudujSerie({ slowa: lista, karty, ustawienia, dzis, teraz, dlugosc: Infinity, przypomnienie })
  assert.equal(reszta.filter((k) => karty[k]).length, 5)
  assert.equal(reszta.filter((k) => !karty[k]).length, 10, 'sufit nie dotyczy nowych slow')

  // Po wyczerpaniu sufitu zostaja same nowe, a nadmiar czeka na jutro.
  const wyczerpany = { data: '2026-09-15', sekundy: 0, dodatkoweNowe: 0, powtorki: 100 }
  assert.equal(t.budzetPowtorek({ ustawienia, dzis: wyczerpany, teraz }), 0)
  assert.equal(t.zbudujSerie({ slowa: lista, karty, ustawienia, dzis: wyczerpany, teraz, dlugosc: Infinity, przypomnienie }).length, 10)

  // "bez limitu" (0) zdejmuje sufit.
  const bezLimitu = { ...ustawienia, maksPowtorekDziennie: 0 }
  assert.equal(t.budzetPowtorek({ ustawienia: bezLimitu, dzis: wyczerpany, teraz }), Infinity)
  assert.equal(
    t.zbudujSerie({ slowa: lista, karty, ustawienia: bezLimitu, dzis: wyczerpany, teraz, dlugosc: Infinity, przypomnienie }).length,
    160,
  )
})

test('kolejnosc zaleglych po pilnosci, nie po terminie', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const lista = slowa('stara', 'swieza', 'wnauce')
  // "stara" ma bardzo dawny termin, ale ogromna stabilnosc: pamiec trzyma. "swieza" jest slabsza i pilniejsza.
  const karty = {
    'stara|en': karta('powtorka', minut(teraz, -60 * 24 * 20), { stabilnosc: 400, ostatnio: new Date(2026, 6, 1, 12, 0).toISOString() }),
    'swieza|en': karta('powtorka', minut(teraz, -10), { stabilnosc: 3, ostatnio: new Date(2026, 8, 11, 12, 0).toISOString() }),
    'wnauce|en': karta('nauka', minut(teraz, -5), { stabilnosc: 0.5, ostatnio: new Date(2026, 8, 15, 11, 0).toISOString() }),
  }
  assert.ok(
    t.pilnosc(karty['swieza|en'], teraz, przypomnienie) < t.pilnosc(karty['stara|en'], teraz, przypomnienie),
    'nizsza szansa przypomnienia = pilniejsza karta',
  )
  const ustawienia = { mowienie: false, noweDziennie: 5 }
  const seria = t.zbudujSerie({ slowa: lista, karty, ustawienia, dzis: null, teraz, przypomnienie })
  assert.deepEqual(seria, ['wnauce|en', 'swieza|en', 'stara|en'])

  // Bez podanej funkcji `przypomnienie` zostaje kolejnosc po terminie (zachowanie sprzed sufitu).
  const poTerminie = t.zbudujSerie({ slowa: lista, karty, ustawienia, dzis: null, teraz })
  assert.deepEqual(poTerminie, ['wnauce|en', 'stara|en', 'swieza|en'])
  assert.equal(t.pilnosc(karty['stara|en'], teraz, null), null)
  assert.equal(t.pilnosc({ stabilnosc: 0, ostatnio: '' }, teraz, przypomnienie), 0, 'karta bez historii jest najpilniejsza')
})

test('tryb nadrabiania: wejscie, wyjscie i 50% nowych przez 3 dni', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const ustawienia = { noweDziennie: 10, maksPowtorekDziennie: 60, mowienie: false }
  assert.equal(t.KROTNOSC_NADRABIANIA, 2)

  // 121 zaleglych przy sufycie 60 to ponad 2x sufit: wchodzimy w tryb nadrabiania.
  let n = t.stanNadrabiania(t.PUSTE_NADRABIANIE, 121, ustawienia, teraz)
  assert.equal(n.aktywne, 1)
  assert.equal(t.stanNadrabiania(t.PUSTE_NADRABIANIE, 120, ustawienia, teraz).aktywne, 0, 'dokladnie 2x sufit jeszcze nie wlacza')

  // W trybie nadrabiania nowych nie ma, a limit powtorek rosnie do 1,5x sufitu.
  assert.equal(t.mnoznikNowych(n, teraz), 0)
  assert.equal(t.budzetPowtorek({ ustawienia, dzis: null, teraz, nadrabianie: n }), 90)

  // Miedzy sufitem a 2x sufit tryb zostaje wlaczony (histereza).
  n = t.stanNadrabiania(n, 80, ustawienia, teraz)
  assert.equal(n.aktywne, 1)

  // Ponizej sufitu wychodzimy i przez 3 dni (liczac dzien wyjscia) nowych jest polowa.
  n = t.stanNadrabiania(n, 59, ustawienia, teraz)
  assert.equal(n.aktywne, 0)
  assert.equal(n.polowaDo, '2026-09-17')
  assert.equal(t.budzetPowtorek({ ustawienia, dzis: null, teraz, nadrabianie: n }), 60)
  for (const d of [15, 16, 17]) assert.equal(t.mnoznikNowych(n, new Date(2026, 8, d, 9, 0)), 0.5, `dzien ${d}`)
  assert.equal(t.mnoznikNowych(n, new Date(2026, 8, 18, 9, 0)), 1, 'czwartego dnia pelny limit')
  assert.equal(t.DNI_POLOWY_NOWYCH, 3)

  // Limit nowych naprawde spada o polowe, a "+10 nowych na dzis" dziala mimo trybu.
  const lista = slowa(...Array.from({ length: 40 }, (_, i) => `s${i}`))
  const polowa = t.zbudujSerie({ slowa: lista, karty: {}, ustawienia, dzis: null, teraz, dlugosc: Infinity, nadrabianie: n })
  assert.equal(polowa.length, 5)
  const wTrybie = { aktywne: 1, polowaDo: '' }
  assert.equal(t.zbudujSerie({ slowa: lista, karty: {}, ustawienia, dzis: null, teraz, dlugosc: Infinity, nadrabianie: wTrybie }).length, 0)
  const zDodatkowymi = { data: '2026-09-15', sekundy: 0, dodatkoweNowe: 10, powtorki: 0 }
  assert.equal(
    t.zbudujSerie({ slowa: lista, karty: {}, ustawienia, dzis: zDodatkowymi, teraz, dlugosc: Infinity, nadrabianie: wTrybie }).length,
    10,
    'swiadome "+10 nowych" dziala takze w nadrabianiu',
  )

  // Bez sufitu tryb nadrabiania sie nie wlacza.
  const bezSufitu = { ...ustawienia, maksPowtorekDziennie: 0 }
  assert.equal(t.stanNadrabiania(t.PUSTE_NADRABIANIE, 5000, bezSufitu, teraz).aktywne, 0)
  assert.equal(t.stanNadrabiania({ aktywne: 1, polowaDo: '' }, 5000, bezSufitu, teraz).aktywne, 0)
})

test('podsumowanie dnia w nadrabianiu: jedna liczba do zrobienia, bez liczby dlugu na ekranie powrotu', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const lista = slowa(...Array.from({ length: 300 }, (_, i) => `s${i}`))
  const karty = {}
  for (let i = 0; i < 250; i++) karty[`s${i}|en`] = karta('powtorka', minut(teraz, -60 - i), { stabilnosc: 10 })
  const ustawienia = { noweDziennie: 10, maksPowtorekDziennie: 60, mowienie: false }
  const nadrabianie = t.stanNadrabiania(t.PUSTE_NADRABIANIE, 250, ustawienia, teraz)
  const d = t.podsumowanieDnia({ slowa: lista, karty, ustawienia, dzis: null, teraz, nadrabianie, przypomnienie })
  assert.equal(d.nadrabianie, true)
  assert.equal(d.zalegle, 250)
  assert.equal(d.doZrobienia, 90, '1,5x sufit, bez nowych slow')
  assert.equal(d.noweDostepne, 0)
})

// Interferencja miedzy slowami (A6)

test('blokada interferencji: nowe slowo czeka, gdy kolizja jest swieza albo w nauce', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  const lista = slowa('quiet', 'quite', 'silent', 'apple', 'text')
  const kolizje = { quiet: ['quite', 'silent'], quite: ['quiet'], silent: ['quiet'], text: ['apple'], apple: ['text'] }
  const ustawienia = { noweDziennie: 10, mowienie: false }

  // "quite" wprowadzone wczoraj blokuje "quiet", "apple" sprzed 8 dni juz nie blokuje "text".
  const karty = {
    'quite|en': karta('powtorka', minut(teraz, 5000), { stabilnosc: 9, wprowadzono: minut(teraz, -1440).toISOString() }),
    'apple|en': karta('powtorka', minut(teraz, 5000), { stabilnosc: 9, wprowadzono: minut(teraz, -8 * 1440).toISOString() }),
  }
  assert.equal(t.kolidujeTeraz({ kolizje, id: 'quiet', karty, teraz }), true)
  assert.equal(t.kolidujeTeraz({ kolizje, id: 'text', karty, teraz }), false)
  assert.equal(t.kolidujeTeraz({ kolizje: {}, id: 'quiet', karty, teraz }), false, 'bez indeksu nic nie blokuje')
  assert.equal(t.kolidujeTeraz({ kolizje, id: 'silent', karty, teraz }), false, 'kolizja "silent" to tylko nowe "quiet"')
  assert.equal(t.DNI_INTERFERENCJI, 7)

  // Slowo kolidujace w stanie nauka albo ponowna blokuje niezaleznie od daty wprowadzenia.
  for (const stan of ['nauka', 'ponowna']) {
    const wNauce = { 'quite|en': karta(stan, minut(teraz, 5), { wprowadzono: minut(teraz, -30 * 1440).toISOString() }) }
    assert.equal(t.kolidujeTeraz({ kolizje, id: 'quiet', karty: wNauce, teraz }), true, stan)
  }

  // W doborze serii kolidujace slowo jest pomijane, a apka bierze kolejne z listy.
  const seria = t.zbudujSerie({ slowa: lista, karty, ustawienia, dzis: null, teraz, dlugosc: Infinity, kolizje, przypomnienie })
  assert.deepEqual(seria, ['silent|en', 'text|en'], 'quiet czeka, reszta wchodzi normalnie')
  const bezIndeksu = t.zbudujSerie({ slowa: lista, karty, ustawienia, dzis: null, teraz, dlugosc: Infinity, przypomnienie })
  assert.deepEqual(bezIndeksu, ['quiet|en', 'silent|en', 'text|en'])
})

// Slowa oporne (A7)

test('panel leecha po 6 pomylkach, odlozenie na 3 tygodnie i licznik proponowania', () => {
  const teraz = new Date(2026, 8, 15, 12, 0)
  assert.equal(t.PROG_LEECHA, 6)
  assert.equal(t.czyPanelLeecha(undefined), false)
  assert.equal(t.czyPanelLeecha(karta('powtorka', teraz, { pomylki: 5 })), false)
  const oporna = karta('powtorka', teraz, { pomylki: 6 })
  assert.equal(t.czyPanelLeecha(oporna), true)

  // Po decyzji panel nie wraca, dopoki nie uzbiera sie kolejnych 6 pomylek.
  const poDecyzji = t.kartaPoLeechu(oporna)
  assert.equal(poDecyzji.leech, 6)
  assert.equal(t.czyPanelLeecha(poDecyzji), false)
  assert.equal(t.czyPanelLeecha({ ...poDecyzji, pomylki: 11 }), false)
  assert.equal(t.czyPanelLeecha({ ...poDecyzji, pomylki: 12 }), true)

  // "Odloz na 3 tygodnie": termin na dzis + 21 dni, historia karty nietknieta.
  const odlozona = t.kartaOdlozona(oporna, 'x|en', teraz)
  const dni = (Date.parse(odlozona.termin) - teraz.getTime()) / 86400000
  assert.ok(Math.abs(dni - t.DNI_ODLOZENIA_LEECHA) <= 1.8, `termin za ${dni} dni`)
  assert.equal(odlozona.stan, 'powtorka')
  assert.equal(odlozona.krok, 0)
  assert.equal(odlozona.leech, 6)
  assert.equal(odlozona.pomylki, 6, 'historia pomylek zostaje, FSRS uczy sie na niej')
  assert.equal(odlozona.powtorki, oporna.powtorki)
  assert.equal(odlozona.stabilnosc, oporna.stabilnosc)
  assert.equal(t.czyPanelLeecha(odlozona), false)
  assert.equal(oporna.leech, undefined, 'wejscie nietkniete')
})

// Podpowiedz jako trudnosc pozadana (A5)

test('reguly podpowiedzi: widoczna po 7 s, po uzyciu ocena najwyzej Prawie', () => {
  assert.equal(t.SEKUNDY_DO_PODPOWIEDZI, 7)
  assert.deepEqual(t.regulyPodpowiedzi(), { widoczna: false, umiemZablokowane: false, podpisUmiem: '' })
  assert.equal(t.regulyPodpowiedzi({ sekundy: 6.9 }).widoczna, false)
  assert.equal(t.regulyPodpowiedzi({ sekundy: 7 }).widoczna, true)
  assert.equal(t.regulyPodpowiedzi({ sekundy: 30 }).umiemZablokowane, false)
  const poUzyciu = t.regulyPodpowiedzi({ sekundy: 8, uzyto: true })
  assert.equal(poUzyciu.umiemZablokowane, true)
  assert.equal(poUzyciu.podpisUmiem, t.PODPIS_BLOKADY_UMIEM)
  assert.equal(poUzyciu.podpisUmiem, 'z podpowiedzią maks. Prawie')
  // Podpowiedz uzyta przed uplywem 7 s (np. po cofnieciu) zostaje widoczna.
  assert.equal(t.regulyPodpowiedzi({ sekundy: 0, uzyto: true }).widoczna, true)
})

test('domyslne ustawienia po przebudowie silnika', () => {
  assert.deepEqual(t.DOMYSLNE_USTAWIENIA, {
    noweDziennie: 10,
    maksPowtorekDziennie: 60,
    dlugoscSerii: 15,
    autowymowa: true,
    mowienie: true,
    celDzienny: 60,
    podpowiedzMowienie: 'brak',
    kotwica: '',
    kotwicaPytano: false,
  })
  assert.deepEqual(t.OPCJE_NOWYCH, [5, 8, 10, 15, 20, 30])
  assert.deepEqual(t.OPCJE_SUFITU, [40, 60, 100, 0])
})

// --- D1: kotwica nawyku (implementation intention) ---

test('zdanie kotwicy powstaje tylko z niepustej wskazowki', () => {
  assert.equal(t.zdanieKotwicy('po kawie'), 'Uczysz się po kawie.')
  assert.equal(t.zdanieKotwicy('  przed snem  '), 'Uczysz się przed snem.')
  assert.equal(t.zdanieKotwicy(''), '')
  assert.equal(t.zdanieKotwicy('   '), '')
  assert.equal(t.zdanieKotwicy(undefined), '')
  assert.equal(t.zdanieKotwicy(null), '')
})

test('gotowe kotwice sa wskazowkami zdarzeniowymi, nie godzinami', () => {
  assert.deepEqual(t.KOTWICE, ['po kawie', 'po umyciu zębów', 'w drodze', 'przed snem'])
  assert.ok(t.KOTWICE.every((k) => !/\d/.test(k)))
  assert.equal(t.MAKS_ZNAKOW_KOTWICY, 40)
})

// --- C5: prognoza "co dalej" na ekranie konca serii ---

test('prognoza na jutro liczy karty do konca jutrzejszego dnia', () => {
  const teraz = new Date(2026, 8, 15, 20, 0)
  const jutro = new Date(2026, 8, 16, 9, 0)
  const pojutrze = new Date(2026, 8, 17, 9, 0)
  const karty = {
    'a|en': karta('powtorka', teraz),
    'b|en': karta('powtorka', jutro),
    'c|en': karta('powtorka', pojutrze),
    'd|en': { ...nowaKarta(), stan: 'nowa' },
  }
  const wynik = t.prognozaNaJutro({ slowa: slowa('a', 'b', 'c', 'd'), karty, ustawienia: {}, teraz, pominiete: {} })
  assert.equal(wynik.liczba, 2)
  assert.equal(wynik.znosna, true)
})

test('prognoza na jutro pomija slowa pominiete i karty mowienia przy wylaczonym mowieniu', () => {
  const teraz = new Date(2026, 8, 15, 20, 0)
  const karty = {
    'a|en': karta('powtorka', teraz),
    'a|pl': karta('powtorka', teraz),
    'b|en': karta('powtorka', teraz),
  }
  const opcje = { slowa: slowa('a', 'b'), karty, teraz, pominiete: {} }
  assert.equal(t.prognozaNaJutro({ ...opcje, ustawienia: {} }).liczba, 3)
  assert.equal(t.prognozaNaJutro({ ...opcje, ustawienia: { mowienie: false } }).liczba, 2)
  assert.equal(t.prognozaNaJutro({ ...opcje, ustawienia: {}, pominiete: { a: '2026-09-15' } }).liczba, 1)
})

test('prognozy na jutro nie pokazujemy, gdy liczba przestaje byc znosna', () => {
  const teraz = new Date(2026, 8, 15, 20, 0)
  const lista = Array.from({ length: 80 }, (_, i) => `s${i}`)
  const karty = Object.fromEntries(lista.map((id) => [t.klucz(id, 'en'), karta('powtorka', teraz)]))
  const opcje = { slowa: slowa(...lista), karty, teraz, pominiete: {} }
  // Sufit 60: 80 kart to juz dlug, wiec liczby nie pokazujemy.
  assert.equal(t.prognozaNaJutro({ ...opcje, ustawienia: { maksPowtorekDziennie: 60 } }).znosna, false)
  assert.equal(t.prognozaNaJutro({ ...opcje, ustawienia: { maksPowtorekDziennie: 100 } }).znosna, true)
  // "Bez limitu" (0) korzysta z progu znosnosci, a nie z braku progu.
  assert.equal(t.prognozaNaJutro({ ...opcje, ustawienia: { maksPowtorekDziennie: 0 } }).znosna, false)
  // Zero kart to nie jest informacja "co dalej", tylko brak tresci.
  assert.equal(t.prognozaNaJutro({ slowa: [], karty: {}, ustawienia: {}, teraz, pominiete: {} }).znosna, false)
})

// --- C5: licznik nowych slow w serii ("co przybylo") ---

test('seria liczy nowe slowa wprowadzone w jej trakcie', () => {
  let s = t.nowaSeria(['a|en', 'b|en', 'c|en'])
  assert.equal(s.nowe, 0)
  s = t.poOcenie(s, 3, true)
  assert.equal(s.nowe, 1)
  s = t.poOcenie(s, 2, true)
  assert.equal(s.nowe, 2)
  s = t.poOcenie(s, 3, false)
  assert.equal(s.nowe, 2)
})

test('nowe slowo po "Nie umiem" liczy sie raz, mimo powrotu karty do kolejki', () => {
  let s = t.nowaSeria(['a|en', 'b|en'])
  s = t.poOcenie(s, 1, true)
  assert.equal(s.nowe, 1)
  assert.equal(s.kolejka.includes('a|en'), true)
  // Drugie podejscie do tej samej karty juz nie jest nowe (ma date wprowadzenia).
  s = t.poOcenie(s, 3, false)
  assert.equal(s.nowe, 1)
})

test('brak trzeciego argumentu nie zmienia licznika nowych', () => {
  const s = t.poOcenie(t.nowaSeria(['a|en']), 3)
  assert.equal(s.nowe, 0)
  assert.equal(s.oczyszczone, 1)
})

// Poprawki po przegladzie silnika v3

test('K1: karta zaczeta dzis wchodzi do serii takze przy wyczerpanym suficie powtorek', () => {
  const teraz = new Date(2026, 8, 19, 20, 0)
  const minute = (n) => new Date(teraz.getTime() + n * 60000)
  const lista = slowa('a', 'b', 'c', 'd')
  const karty = {
    'a|en': karta('nauka', minute(-5), { stabilnosc: 0.5 }),
    'b|en': karta('ponowna', minute(-3), { stabilnosc: 0.5 }),
    'c|en': karta('powtorka', minute(-10), { stabilnosc: 10 }),
  }
  const dzis = { data: t.dataLokalna(teraz), sekundy: 0, dodatkoweNowe: 0, powtorki: 999 }
  const seria = t.zbudujSerie({ slowa: lista, karty, ustawienia: { dlugoscSerii: 15 }, dzis, teraz })
  assert.ok(seria.includes('a|en'), 'karta w nauce musi dac sie dzis skonczyc')
  assert.ok(seria.includes('b|en'), 'karta po pomylce takze')
  assert.ok(!seria.includes('c|en'), 'zwykla powtorka juz nie: sufit wyczerpany')
  const p = t.podsumowanieDnia({ slowa: lista, karty, ustawienia: { dlugoscSerii: 15 }, dzis, teraz })
  assert.ok(p.doZrobienia >= 2, `doZrobienia: ${p.doZrobienia}`)
  assert.ok(p.noweDostepne >= 0, `noweDostepne nie moze byc ujemne: ${p.noweDostepne}`)
})

test('W2: dwa kolidujace nowe slowa nie trafiaja do jednej serii', () => {
  const teraz = new Date(2026, 8, 19, 20, 0)
  const lista = slowa('test', 'text', 'cold')
  const kolizje = { test: ['text'], text: ['test'] }
  const seria = t.zbudujSerie({ slowa: lista, karty: {}, ustawienia: { dlugoscSerii: 15 }, dzis: null, teraz, kolizje })
  assert.ok(seria.includes('test|en'))
  assert.ok(!seria.includes('text|en'), 'partner kolizji czeka na kolejny dzien')
  assert.ok(seria.includes('cold|en'), 'slowo bez kolizji wchodzi normalnie')
})

test('W3: slowo pominiete nie blokuje partnerow przez interferencje', () => {
  const teraz = new Date(2026, 8, 19, 20, 0)
  const karty = { 'test|en': karta('nauka', new Date(2025, 0, 1), { stabilnosc: 0.5 }) }
  const kolizje = { text: ['test'] }
  assert.equal(t.kolidujeTeraz({ kolizje, id: 'text', karty, teraz }), true, 'bez pominiecia blokuje')
  assert.equal(t.kolidujeTeraz({ kolizje, id: 'text', karty, teraz, pominiete: { test: '2026-09-18' } }), false)
})

test('W5: cofniety zegar nie cofa ani nie zrywa serii', () => {
  const streak = { dni: 50, ostatniDzien: '2026-09-19', zamrozenia: 0, doZamrozenia: 0 }
  const wczoraj = t.zaliczDzien(streak, new Date(2026, 8, 17, 10, 0))
  assert.equal(wczoraj.zaliczony, false, 'data z przeszlosci nie zalicza dnia')
  assert.equal(wczoraj.streak.ostatniDzien, '2026-09-19', 'ostatni dzien zostaje')
  assert.equal(wczoraj.streak.dni, 50)
  const powrot = t.zaliczDzien(wczoraj.streak, new Date(2026, 8, 20, 10, 0))
  assert.equal(powrot.streak.dni, 51, 'powrot do wlasciwej daty przedluza serie')
  assert.equal(powrot.zerwano, false)
})
