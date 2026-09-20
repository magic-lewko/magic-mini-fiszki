// Generator krzyzowki: walidacja slow, reguly siatki, powtarzalnosc i czas ukladania. Uruchomienie: node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as kr from './zrodlo/krzyzowka.js'

const KORZEN = dirname(fileURLToPath(import.meta.url))

const OWOCE = [
  { id: 'apple', w: 'apple', pl: 'jabłko' },
  { id: 'banana', w: 'banana', pl: 'banan' },
  { id: 'orange', w: 'orange', pl: 'pomarańcza' },
  { id: 'lemon', w: 'lemon', pl: 'cytryna' },
  { id: 'grape', w: 'grape', pl: 'winogrono' },
  { id: 'melon', w: 'melon', pl: 'melon' },
  { id: 'cherry', w: 'cherry', pl: 'wiśnia' },
  { id: 'peach', w: 'peach', pl: 'brzoskwinia' },
  { id: 'plum', w: 'plum', pl: 'śliwka' },
  { id: 'kiwi', w: 'kiwi', pl: 'kiwi' },
  { id: 'mango', w: 'mango', pl: 'mango' },
  { id: 'pear', w: 'pear', pl: 'gruszka' },
]

// Wszystkie ciagi co najmniej dwoch liter w rzedzie, w obu kierunkach. Poprawna krzyzowka ma ich dokladnie
// tyle, ile ma hasel: kazdy dluzszy ciag oznacza sklejone konce, a kazdy nadmiarowy - stykanie sie bokami.
function ciagi(siatka) {
  const wynik = []
  const zbierz = (dlugoscZewn, dlugoscWewn, czytaj, kierunek) => {
    for (let a = 0; a < dlugoscZewn; a++) {
      let start = -1
      let tekst = ''
      for (let b = 0; b <= dlugoscWewn; b++) {
        const znak = b < dlugoscWewn ? czytaj(a, b) : null
        if (znak) {
          if (start < 0) start = b
          tekst += znak
          continue
        }
        if (tekst.length >= 2) {
          wynik.push({
            kierunek,
            wiersz: kierunek === 'poziomo' ? a : start,
            kolumna: kierunek === 'poziomo' ? start : a,
            tekst,
          })
        }
        start = -1
        tekst = ''
      }
    }
  }
  const wierszy = siatka.length
  const kolumn = wierszy ? siatka[0].length : 0
  zbierz(wierszy, kolumn, (w, k) => siatka[w][k], 'poziomo')
  zbierz(kolumn, wierszy, (k, w) => siatka[w][k], 'pionowo')
  return wynik
}

function sprawdzRegulySiatki(wynik, opis) {
  const { siatka, hasla } = wynik
  for (const wiersz of siatka) assert.equal(wiersz.length, siatka[0].length, `${opis}: wiersze rownej dlugosci`)
  // Kazde haslo lezy tam, gdzie mowi, i ma swoje litery.
  for (const h of hasla) {
    const litery = komorki(h)
      .map((p) => siatka[p.wiersz][p.kolumna])
      .join('')
    assert.equal(litery, h.slowo.toUpperCase(), `${opis}: haslo ${h.slowo} nie zgadza sie z siatka`)
    assert.equal(h.dlugosc, h.slowo.length)
  }
  // Zbior ciagow musi byc identyczny ze zbiorem hasel.
  const znalezione = ciagi(siatka)
    .map((c) => `${c.kierunek} ${c.wiersz},${c.kolumna} ${c.tekst}`)
    .sort()
  const oczekiwane = hasla
    .map((h) => `${h.kierunek} ${h.wiersz},${h.kolumna} ${h.slowo.toUpperCase()}`)
    .sort()
  assert.deepEqual(znalezione, oczekiwane, `${opis}: siatka ma ciagi, ktore nie sa haslami`)
}

const komorki = (h) => kr.komorkiHasla(h)

const rysuj = (siatka) => siatka.map((w) => w.map((z) => z || '.').join('')).join('\n')

test('odrzuca slowa, ktorych nie da sie wpisac w siatke', () => {
  const wynik = kr.ulozKrzyzowke(
    [
      { id: 'a', w: 'ice cream', pl: 'lody' },
      { id: 'b', w: "don't", pl: 'nie' },
      { id: 'c', w: 'and/or', pl: 'albo' },
      { id: 'd', w: 'go', pl: 'iść' },
      { id: 'e', w: 'extraordinary', pl: 'niezwykły' },
      { id: 'f', w: 'table', pl: 'stół' },
      { id: 'g', w: 'TABLE', pl: 'tabela' },
    ],
    { ziarno: 1 }
  )
  const powody = Object.fromEntries(wynik.nieuzyte.map((n) => [n.id, n.powod]))
  assert.equal(powody.a, kr.POWODY.znaki, 'spacja')
  assert.equal(powody.b, kr.POWODY.znaki, 'apostrof')
  assert.equal(powody.c, kr.POWODY.znaki, 'ukosnik')
  assert.equal(powody.d, kr.POWODY.krotkie)
  assert.equal(powody.e, kr.POWODY.dlugie, '13 liter nie miesci sie w siatce 11')
  assert.equal(powody.g, kr.POWODY.powtorka, 'siatka nie rozroznia wielkosci liter')
  assert.equal(wynik.hasla.length, 1)
  assert.equal(wynik.hasla[0].slowo, 'table')
  // Powod ma tlumaczenie na tekst dla interfejsu.
  for (const n of wynik.nieuzyte) assert.ok(kr.OPISY_POWODOW[n.powod], n.powod)
})

test('pusta lista i same zle slowa nie rzucaja wyjatkiem', () => {
  const pusta = kr.ulozKrzyzowke([], { ziarno: 1 })
  assert.deepEqual(pusta, { siatka: [], hasla: [], nieuzyte: [] })
  assert.deepEqual(kr.ulozKrzyzowke(undefined, { ziarno: 1 }), { siatka: [], hasla: [], nieuzyte: [] })

  const zle = kr.ulozKrzyzowke([{ id: 'a', w: 'go', pl: 'iść' }, { id: 'b', w: 'at', pl: 'przy' }], { ziarno: 1 })
  assert.deepEqual(zle.siatka, [])
  assert.deepEqual(zle.hasla, [])
  assert.equal(zle.nieuzyte.length, 2, 'wszystkie slowa wracaja z powodem')
})

test('jedno slowo daje krzyzowke z jednym haslem', () => {
  const wynik = kr.ulozKrzyzowke([{ id: 'apple', w: 'apple', pl: 'jabłko' }], { ziarno: 5 })
  assert.equal(wynik.siatka.length, 1)
  assert.equal(rysuj(wynik.siatka), 'APPLE')
  assert.deepEqual(wynik.hasla, [
    { numer: 1, kierunek: 'poziomo', wiersz: 0, kolumna: 0, dlugosc: 5, slowo: 'apple', haslo: 'jabłko', id: 'apple' },
  ])
  assert.deepEqual(wynik.nieuzyte, [])
})

test('slowa bez wspolnych liter: uklada sie tylko jedno, reszta wraca z powodem', () => {
  const wynik = kr.ulozKrzyzowke(
    [
      { id: 'abc', w: 'abc', pl: 'abc' },
      { id: 'def', w: 'def', pl: 'def' },
      { id: 'ghi', w: 'ghi', pl: 'ghi' },
    ],
    { ziarno: 3 }
  )
  assert.equal(wynik.hasla.length, 1)
  assert.equal(wynik.nieuzyte.length, 2)
  for (const n of wynik.nieuzyte) assert.equal(n.powod, kr.POWODY.brakMiejsca)
  sprawdzRegulySiatki(wynik, 'bez wspolnych liter')
})

test('siatka trzyma reguly krzyzowki na wielu ziarnach', () => {
  for (let ziarno = 0; ziarno < 40; ziarno++) {
    const wynik = kr.ulozKrzyzowke(OWOCE, { ziarno })
    sprawdzRegulySiatki(wynik, `ziarno ${ziarno}`)
    assert.ok(wynik.siatka.length <= kr.MAKS_SIATKA, 'siatka nie przekracza limitu')
    assert.ok(wynik.siatka[0].length <= kr.MAKS_SIATKA)
    // Numeracja: rosnaca od gory w prawo, wspolny numer dla hasel z tego samego pola.
    const numery = wynik.hasla.map((h) => h.numer)
    assert.deepEqual(numery, [...numery].sort((a, b) => a - b))
    assert.equal(Math.max(...numery), new Set(numery).size)
  }
})

test('mniejsza siatka wymusza mniejszy wynik', () => {
  const wynik = kr.ulozKrzyzowke(OWOCE, { ziarno: 1, maksSiatka: 5 })
  sprawdzRegulySiatki(wynik, 'siatka 5')
  assert.ok(wynik.siatka.length <= 5, rysuj(wynik.siatka))
  assert.ok(wynik.siatka[0].length <= 5)
  const dlugie = wynik.nieuzyte.filter((n) => n.powod === kr.POWODY.dlugie).map((n) => n.w)
  assert.deepEqual(dlugie.sort(), ['banana', 'cherry', 'orange'], '5 liter miesci sie, wiecej nie')
})

test('to samo ziarno daje ta sama krzyzowke, rozne ziarna rozne', () => {
  const a = kr.ulozKrzyzowke(OWOCE, { ziarno: 'test' })
  const b = kr.ulozKrzyzowke(OWOCE, { ziarno: 'test' })
  assert.deepEqual(a, b, 'powtarzalnosc przy tym samym ziarnie')
  assert.deepEqual(kr.ulozKrzyzowke(OWOCE, { ziarno: 7 }), kr.ulozKrzyzowke(OWOCE, { ziarno: 7 }))

  const rozne = new Set()
  for (let ziarno = 0; ziarno < 10; ziarno++) rozne.add(rysuj(kr.ulozKrzyzowke(OWOCE, { ziarno }).siatka))
  assert.ok(rozne.size >= 5, `10 ziaren dalo tylko ${rozne.size} roznych siatek`)
})

test('wejscie nie jest zmieniane w miejscu', () => {
  const kopia = JSON.parse(JSON.stringify(OWOCE))
  kr.ulozKrzyzowke(OWOCE, { ziarno: 2 })
  assert.deepEqual(OWOCE, kopia)
})

test('przy 6-12 slowach uklada co najmniej polowe', () => {
  const talia = JSON.parse(readFileSync(join(KORZEN, 'talie', 'oxford3000.json'), 'utf8')).slowa
  const zestawy = []
  for (let i = 0; i < 30; i++) {
    const ile = 6 + (i % 7)
    zestawy.push(talia.slice(i * 37, i * 37 + ile))
  }

  let najgorszy = 1
  let pelnych = 0
  let sumaUdzialu = 0
  let sztuk = 0
  for (const zestaw of zestawy) {
    for (const ziarno of [0, 1, 2]) {
      const wynik = kr.ulozKrzyzowke(zestaw, { ziarno })
      sprawdzRegulySiatki(wynik, `zestaw ${zestaw.map((s) => s.w).join(',')} ziarno ${ziarno}`)
      // Slowa odrzucone na wejsciu (spacja, apostrof, za krotkie) nie licza sie do ukladania.
      const doUlozenia = wynik.hasla.length + wynik.nieuzyte.filter((n) => n.powod === kr.POWODY.brakMiejsca).length
      if (!doUlozenia) continue
      const udzial = wynik.hasla.length / doUlozenia
      assert.ok(udzial >= 0.5, `ulozono ${wynik.hasla.length} z ${doUlozenia}:\n${rysuj(wynik.siatka)}`)
      if (udzial === 1) pelnych += 1
      if (udzial < najgorszy) najgorszy = udzial
      sumaUdzialu += udzial
      sztuk += 1
    }
  }
  console.log(
    `krzyzowka: ${sztuk} zestawow 6-12 slow, srednio ${Math.round((sumaUdzialu / sztuk) * 100)}% slow w siatce, ` +
      `komplet w ${Math.round((pelnych / sztuk) * 100)}% przypadkow, najgorszy wynik ${Math.round(najgorszy * 100)}%`
  )
})

test('12 slow uklada sie ponizej 50 ms', () => {
  const czasy = []
  for (let ziarno = 0; ziarno < 20; ziarno++) {
    const start = performance.now()
    const wynik = kr.ulozKrzyzowke(OWOCE, { ziarno })
    czasy.push(performance.now() - start)
    assert.ok(wynik.hasla.length >= 6)
  }
  czasy.sort((a, b) => a - b)
  const mediana = czasy[Math.floor(czasy.length / 2)]
  const najgorszy = czasy[czasy.length - 1]
  console.log(`krzyzowka 12 slow: mediana ${mediana.toFixed(2)} ms, najgorszy ${najgorszy.toFixed(2)} ms (20 ziaren)`)
  assert.ok(najgorszy < 50, `najwolniejsze ulozenie zajelo ${najgorszy.toFixed(1)} ms`)
})

test('sprawdzKrzyzowke liczy poprawne, blednie i puste litery', () => {
  const wynik = kr.ulozKrzyzowke([{ id: 'apple', w: 'apple', pl: 'jabłko' }], { ziarno: 1 })
  const pusta = kr.sprawdzKrzyzowke(wynik.siatka)
  assert.equal(pusta.wszystkie, 5)
  assert.equal(pusta.puste, 5)
  assert.equal(pusta.ukonczone, false)
  assert.deepEqual(pusta.oceny, [['brak', 'brak', 'brak', 'brak', 'brak']])

  // Wielkosc liter nie ma znaczenia, biale znaki tez nie.
  const czesciowa = kr.sprawdzKrzyzowke(wynik.siatka, { '0,0': 'a', '0,1': ' p ', '0,2': 'x', '0,3': '' })
  assert.deepEqual(czesciowa.oceny, [['poprawna', 'poprawna', 'bledna', 'brak', 'brak']])
  assert.equal(czesciowa.poprawne, 2)
  assert.equal(czesciowa.bledne, 1)
  assert.equal(czesciowa.puste, 2)

  const pelna = kr.sprawdzKrzyzowke(wynik.siatka, { '0,0': 'A', '0,1': 'P', '0,2': 'P', '0,3': 'L', '0,4': 'E' })
  assert.equal(pelna.ukonczone, true)
  assert.equal(pelna.poprawne, 5)
  assert.equal(kr.sprawdzKrzyzowke([], {}).ukonczone, false, 'pusta krzyzowka nie jest ukonczona')
})

test('sprawdzKrzyzowke zostawia null na polach poza krzyzowka', () => {
  const wynik = kr.ulozKrzyzowke(OWOCE, { ziarno: 1 })
  const oceny = kr.sprawdzKrzyzowke(wynik.siatka, {}).oceny
  for (let w = 0; w < wynik.siatka.length; w++) {
    for (let k = 0; k < wynik.siatka[w].length; k++) {
      assert.equal(oceny[w][k] === null, wynik.siatka[w][k] === null, `pole ${w},${k}`)
    }
  }
})

test('komorkiHasla zwraca pola w kolejnosci liter', () => {
  const poziome = kr.komorkiHasla({ kierunek: 'poziomo', wiersz: 2, kolumna: 3, dlugosc: 3 })
  assert.deepEqual(poziome, [
    { wiersz: 2, kolumna: 3 },
    { wiersz: 2, kolumna: 4 },
    { wiersz: 2, kolumna: 5 },
  ])
  const pionowe = kr.komorkiHasla({ kierunek: 'pionowo', wiersz: 2, kolumna: 3, slowo: 'cat' })
  assert.deepEqual(pionowe, [
    { wiersz: 2, kolumna: 3 },
    { wiersz: 3, kolumna: 3 },
    { wiersz: 4, kolumna: 3 },
  ])
})

test('podpowiedzLitere odkrywa jedna litere, pilnuje limitu i nie zmienia stanu w miejscu', () => {
  const wynik = kr.ulozKrzyzowke(OWOCE, { ziarno: 4 })
  let stan = { siatka: wynik.siatka, odpowiedzi: {}, uzyte: 0, ziarno: 4 }
  const przed = JSON.parse(JSON.stringify(stan))

  const odkryte = []
  for (let i = 0; i < kr.MAKS_PODPOWIEDZI; i++) {
    const krok = kr.podpowiedzLitere(stan)
    assert.ok(krok.podpowiedz, `podpowiedz ${i + 1}`)
    assert.equal(krok.stan.uzyte, i + 1)
    assert.equal(
      krok.stan.odpowiedzi[kr.kluczPola(krok.podpowiedz.wiersz, krok.podpowiedz.kolumna)],
      krok.podpowiedz.litera
    )
    odkryte.push(`${krok.podpowiedz.wiersz},${krok.podpowiedz.kolumna}`)
    stan = krok.stan
  }
  assert.deepEqual(przed, { siatka: wynik.siatka, odpowiedzi: {}, uzyte: 0, ziarno: 4 }, 'stan wejsciowy nietkniety')
  assert.equal(new Set(odkryte).size, kr.MAKS_PODPOWIEDZI, 'kolejne podpowiedzi trafiaja w rozne pola')

  const poLimicie = kr.podpowiedzLitere(stan)
  assert.equal(poLimicie.podpowiedz, null)
  assert.equal(poLimicie.powod, 'limit')
  assert.equal(poLimicie.stan, stan, 'po limicie stan wraca bez zmian')
})

test('podpowiedzLitere zawezona do jednego hasla i wyczerpana', () => {
  const wynik = kr.ulozKrzyzowke([{ id: 'apple', w: 'apple', pl: 'jabłko' }], { ziarno: 1 })
  const komorki = kr.komorkiHasla(wynik.hasla[0])
  let stan = { siatka: wynik.siatka, odpowiedzi: {}, uzyte: 0, ziarno: 1, komorki: komorki.slice(0, 1), maks: 9 }
  const krok = kr.podpowiedzLitere(stan)
  assert.deepEqual(krok.podpowiedz, { wiersz: 0, kolumna: 0, litera: 'A' })

  // To samo pole juz jest poprawne, wiec nie ma czego podpowiadac.
  const brak = kr.podpowiedzLitere(krok.stan)
  assert.equal(brak.podpowiedz, null)
  assert.equal(brak.powod, 'brak')

  // Bledna litera wciaz jest kandydatem do poprawienia.
  const bledna = kr.podpowiedzLitere({ ...stan, odpowiedzi: { '0,0': 'X' } })
  assert.deepEqual(bledna.podpowiedz, { wiersz: 0, kolumna: 0, litera: 'A' })
})
