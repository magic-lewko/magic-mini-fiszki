// Indeks kolizji miedzy slowami: synonimy i bliskie pisownia. Uruchomienie: node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as k from './zrodlo/kolizje.js'

const KORZEN = dirname(fileURLToPath(import.meta.url))

test('bezOgonkow zdejmuje polskie znaki i wielkosc liter', () => {
  assert.equal(k.bezOgonkow('Zażółć gęślą jaźń'), 'zazolc gesla jazn')
  assert.equal(k.bezOgonkow('Jabłko'), 'jablko')
  assert.equal(k.bezOgonkow(undefined), '')
})

test('blisko: jedna operacja edycji albo przestawienie sasiednich liter', () => {
  // zamiana jednej litery
  assert.equal(k.blisko('test', 'text'), true)
  assert.equal(k.blisko('cold', 'gold'), true)
  // przestawienie sasiadow
  assert.equal(k.blisko('quiet', 'quite'), true)
  assert.equal(k.blisko('form', 'from'), true)
  // wstawienie albo usuniecie jednej litery
  assert.equal(k.blisko('cold', 'could'), true)
  assert.equal(k.blisko('here', 'hear'), false, 'dwie zamiany to juz za daleko')
  assert.equal(k.blisko('small', 'mall'), true)
  // za daleko
  assert.equal(k.blisko('room', 'soon'), false)
  assert.equal(k.blisko('house', 'mouse cat'), false)
  assert.equal(k.blisko('abc', 'abcde'), false, 'roznica dlugosci wieksza niz 1')
  assert.equal(k.blisko('same', 'same'), false, 'to samo slowo to nie kolizja')
})

test('glowne znaczenia: pierwszy segment, bez nawiasow, bez krotkich slow', () => {
  assert.deepEqual(k.glowneZnaczenia('cichy, spokojny; cisza'), ['cichy', 'spokojny'])
  assert.deepEqual(k.glowneZnaczenia('jabłko (owoc)'), ['jablko'])
  assert.deepEqual(k.glowneZnaczenia('on, ja, ona'), ['ona'], 'segmenty krotsze niz 3 znaki odpadaja')
  assert.deepEqual(k.glowneZnaczenia('DUŻY'), ['duzy'])
  assert.equal(k.MIN_DLUGOSC_ZNACZENIA, 3)
})

test('budujKolizje: synonimy, pisownia, limit grupy i limit kolizji na slowo', () => {
  const slowa = [
    { id: 'quiet', w: 'quiet', pl: 'cichy, spokojny' },
    { id: 'silent', w: 'silent', pl: 'cichy' },
    { id: 'quite', w: 'quite', pl: 'całkiem' },
    { id: 'big', w: 'big', pl: 'duży' },
    { id: 'large', w: 'large', pl: 'duży' },
    { id: 'cat', w: 'cat', pl: 'kot' },
    { id: 'cut', w: 'cut', pl: 'ciąć' },
  ]
  const kolizje = k.budujKolizje(slowa)
  assert.deepEqual([...kolizje.quiet].sort(), ['quite', 'silent'])
  assert.deepEqual(kolizje.silent, ['quiet'], 'synonim dziala w obie strony')
  assert.deepEqual(kolizje.quite, ['quiet'], 'pisownia dziala w obie strony')
  assert.deepEqual(kolizje.big, ['large'])
  assert.equal(kolizje.cat, undefined, 'slowa krotsze niz 4 znaki nie licza sie do pisowni')
  assert.equal(k.MIN_DLUGOSC_PISOWNI, 4)

  // Grupa znaczenia powyzej 5 slow to slowo-wytrych i nie daje kolizji. Slowa sa rozne w pisowni,
  // zeby zadzialala sama regula znaczenia.
  const rozne = ['make', 'perform', 'commit', 'execute', 'produce', 'handle']
  const wytrych = rozne.map((w) => ({ id: w, w, pl: 'robić' }))
  assert.deepEqual(Object.keys(k.budujKolizje(wytrych)), [], 'grupa 6 slow o tym samym znaczeniu odpada')
  assert.equal(k.MAKS_GRUPY_ZNACZEN, 5)
  const piec = wytrych.slice(0, 5)
  assert.equal(k.budujKolizje(piec).make.length, 4)

  // Limit kolizji na slowo: jedno znaczenie dzielone przez kilka grup daje wiecej kolizji niz limit.
  const duzo = []
  for (let g = 0; g < 4; g++) {
    for (let i = 0; i < 3; i++) duzo.push({ id: `w${g}${i}`, w: `w${g}${i}`, pl: `znaczenie${g}, wspolne` })
  }
  const przyciete = k.budujKolizje(duzo, 3)
  for (const lista of Object.values(przyciete)) assert.ok(lista.length <= 3, JSON.stringify(lista))
  assert.equal(k.MAKS_KOLIZJI, 8)
})

test('kluczIndeksu zmienia sie po kazdej zmianie talii', () => {
  const a = [
    { id: 'apple', w: 'apple', pl: 'jabłko' },
    { id: 'book', w: 'book', pl: 'książka' },
  ]
  assert.equal(k.kluczIndeksu(a), k.kluczIndeksu([...a]))
  assert.notEqual(k.kluczIndeksu(a), k.kluczIndeksu([a[1], a[0]]), 'kolejnosc slow tez zmienia klucz')
  assert.notEqual(k.kluczIndeksu(a), k.kluczIndeksu([...a, { id: 'cat', w: 'cat', pl: 'kot' }]))
  // Ta sama liczba slow, inne id: klucz musi sie zmienic (poprawka pisowni slowa).
  assert.notEqual(k.kluczIndeksu(a), k.kluczIndeksu([a[0], { id: 'boook', w: 'boook', pl: 'książka' }]))
  assert.match(k.kluczIndeksu(a), /^2-[a-z0-9]+$/)
})

test('talia Oxford 3000: liczby z badania i czas liczenia', () => {
  const talia = JSON.parse(readFileSync(join(KORZEN, 'talie', 'oxford3000.json'), 'utf8'))
  const slowa = talia.slowa
  assert.equal(slowa.length, 2981)

  const start = performance.now()
  const kolizje = k.budujKolizje(slowa)
  const ms = performance.now() - start

  const zKolizja = Object.keys(kolizje).length
  const rozmiary = Object.values(kolizje)
    .map((l) => l.length)
    .sort((a, b) => b - a)
  const mediana = rozmiary[Math.floor(rozmiary.length / 2)]
  console.log(`indeks kolizji: ${ms.toFixed(0)} ms, ${zKolizja} slow z kolizja (${Math.round((zKolizja / slowa.length) * 100)}%), mediana ${mediana}`)

  assert.equal(Math.round((zKolizja / slowa.length) * 100), 56, 'okolo 56% slow ma jakas kolizje')
  assert.equal(mediana, 2)
  assert.ok(rozmiary[0] <= k.MAKS_KOLIZJI)
  // Znane pary z przegladu talii.
  assert.ok(kolizje.test.includes('text'))
  assert.ok(kolizje.cold.includes('could'))
  assert.ok(kolizje.quiet.includes('quite'))
  // Indeks liczy sie raz na talie, wiec nawet na wolnym telefonie zmiesci sie w jednej klatce z zapasem.
  assert.ok(ms < 1000, `liczenie indeksu zajelo ${ms.toFixed(0)} ms`)
})

// Poprawki po przegladzie

test('slowo nie koliduje samo ze soba przy powtorzonym znaczeniu', () => {
  const indeks = k.budujKolizje([{ id: 'x', w: 'xxxx', pl: 'kot, kot' }, { id: 'y', w: 'yyyy', pl: 'pies' }])
  assert.equal(indeks.x, undefined)
})

test('klucz indeksu zmienia sie po poprawce tlumaczenia i pisowni', () => {
  const przed = [{ id: 'a', w: 'test', pl: 'test' }, { id: 'b', w: 'text', pl: 'tekst' }]
  const poTlumaczeniu = [{ id: 'a', w: 'test', pl: 'sprawdzian' }, { id: 'b', w: 'text', pl: 'tekst' }]
  const poPisowni = [{ id: 'a', w: 'tests', pl: 'test' }, { id: 'b', w: 'text', pl: 'tekst' }]
  assert.notEqual(k.kluczIndeksu(przed), k.kluczIndeksu(poTlumaczeniu))
  assert.notEqual(k.kluczIndeksu(przed), k.kluczIndeksu(poPisowni))
  assert.equal(k.kluczIndeksu(przed), k.kluczIndeksu([...przed]), 'ta sama talia daje ten sam klucz')
})
