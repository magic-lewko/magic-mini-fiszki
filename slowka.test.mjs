// Wczytywanie slowek (3 formaty) i scalanie z talia. Uruchomienie: node --test
process.env.TZ = 'Europe/Warsaw'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nowaKarta } from './lib/fsrs.mjs'
import { parsujWklejone, scal } from './zrodlo/slowka.js'
import { zbudujSerie } from './zrodlo/talia.js'

const teraz = new Date(2026, 8, 15, 9, 0)

test('format 1: obiekt JSON z nazwa i tablica slowa', () => {
  const tekst = JSON.stringify({
    wersja: 1,
    nazwa: 'Oxford 3000',
    zrodlo: 'Oxford',
    slowa: [
      { id: 'abandon', w: 'abandon', poziom: 'b2', ipa: '/əˈbændən/', czesci: ['verb'], pl: 'porzucić', zdanie: 'They abandoned the car.', zdaniePl: 'Porzucili samochód.' },
      { w: 'apple', pl: '' },
      { w: 'book', pl: 'książka', czesci: 'noun, verb', inne: 'pomijane' },
    ],
  })
  const w = parsujWklejone(tekst, teraz)
  assert.equal(w.format, 'json')
  assert.equal(w.nazwa, 'Oxford 3000')
  assert.equal(w.zrodlo, 'Oxford')
  assert.equal(w.bladOgolny, '')
  assert.deepEqual(w.slowa, [
    { id: 'abandon', w: 'abandon', pl: 'porzucić', poziom: 'B2', ipa: 'əˈbændən', czesci: ['verb'], zdanie: 'They abandoned the car.', zdaniePl: 'Porzucili samochód.', talia: 'Oxford 3000' },
    { id: 'book', w: 'book', pl: 'książka', czesci: ['noun', 'verb'], talia: 'Oxford 3000' },
  ])
  assert.equal(w.bledy.length, 1)
  assert.equal(w.bledy[0].nr, 2)
  assert.equal(w.jednostka, 'pozycja')
})

test('format 2: sama tablica JSON, nazwa domyslna z data lokalna', () => {
  const w = parsujWklejone('﻿[{"w":"cat","pl":"kot"},{"w":"dog","pl":"pies","id":"dog-1"}, 5]', teraz)
  assert.equal(w.format, 'tablica')
  assert.equal(w.nazwa, 'Wklejone 2026-09-15')
  assert.deepEqual(w.slowa.map((s) => s.id), ['cat', 'dog-1'])
  assert.deepEqual(w.bledy.map((b) => b.nr), [3])
})

test('format 3: tekst ze srednikami albo tabulatorami, numery blednych wierszy', () => {
  const tekst = [
    'apple ; jabłko',
    '',
    '# komentarz',
    'look after\topiekować się\tShe looks after her sister.\tOpiekuje się siostrą.',
    'bez separatora',
    'house ;',
    ' ice cream ; lody ; I like ice cream. ; Lubię lody. ',
  ].join('\r\n')
  const w = parsujWklejone(tekst, teraz)
  assert.equal(w.format, 'tekst')
  assert.equal(w.jednostka, 'wiersz')
  assert.deepEqual(w.slowa, [
    { id: 'apple', w: 'apple', pl: 'jabłko', talia: 'Wklejone 2026-09-15' },
    { id: 'look after', w: 'look after', pl: 'opiekować się', zdanie: 'She looks after her sister.', zdaniePl: 'Opiekuje się siostrą.', talia: 'Wklejone 2026-09-15' },
    { id: 'ice cream', w: 'ice cream', pl: 'lody', zdanie: 'I like ice cream.', zdaniePl: 'Lubię lody.', talia: 'Wklejone 2026-09-15' },
  ])
  assert.deepEqual(w.bledy.map((b) => b.nr), [5, 6])
})

test('id rozroznia wielkosc liter, powtorzenie w jednym imporcie jest bledem', () => {
  const w = parsujWklejone('May ; maj\nmay ; móc\nIT ; informatyka\nit ; to\nmay ; może', teraz)
  assert.deepEqual(w.slowa.map((s) => s.id), ['May', 'may', 'IT', 'it'])
  assert.equal(w.bledy.length, 1)
  assert.equal(w.bledy[0].nr, 5)
  assert.match(w.bledy[0].blad, /powtórzone.*wiersz 2/)

  const { slowa, nowe } = scal([{ id: 'May', w: 'May', pl: 'maj' }], parsujWklejone('may ; móc', teraz).slowa)
  assert.equal(nowe, 1)
  assert.deepEqual(slowa.map((s) => s.pl), ['maj', 'móc'])
})

test('bledny JSON i brak tablicy slowa', () => {
  assert.match(parsujWklejone('{ "slowa": [ }', teraz).bladOgolny, /Niepoprawny JSON/)
  assert.match(parsujWklejone('{ "nazwa": "x" }', teraz).bladOgolny, /brakuje tablicy/)
})

test('scalanie: nowe na koniec, istniejace zaktualizowane, postep nietkniety', () => {
  const obecne = [
    { id: 'apple', w: 'apple', pl: 'jabłko', ipa: 'ˈæpl', poziom: 'A1', talia: 'Oxford 3000' },
    { id: 'book', w: 'book', pl: 'książka', talia: 'Oxford 3000' },
    { id: 'cat', w: 'cat', pl: 'kot', talia: 'Oxford 3000' },
  ]
  const przychodzace = parsujWklejone('zebra ; zebra\napple ; jabłko (owoc)\nbook ; książka\nant ; mrówka', teraz).slowa
  const karty = {
    'apple|en': { ...nowaKarta(), stan: 'powtorka', termin: '2026-09-20T10:00:00.000Z', stabilnosc: 12, trudnosc: 4, powtorki: 5 },
    'apple|pl': { ...nowaKarta(), stan: 'nauka', termin: '2026-09-15T06:00:00.000Z', stabilnosc: 2, trudnosc: 5, powtorki: 1 },
  }
  const przed = structuredClone(karty)

  const wynik = scal(obecne, przychodzace)
  assert.deepEqual(wynik.slowa.map((s) => s.id), ['apple', 'book', 'cat', 'zebra', 'ant'])
  assert.equal(wynik.nowe, 2)
  assert.equal(wynik.zaktualizowane, 1)
  assert.equal(wynik.bezZmian, 1)
  // tresc nowa, pola pominiete w imporcie i talia zostaja
  assert.deepEqual(wynik.slowa[0], { id: 'apple', w: 'apple', pl: 'jabłko (owoc)', ipa: 'ˈæpl', poziom: 'A1', talia: 'Oxford 3000' })
  assert.equal(wynik.slowa[3].talia, 'Wklejone 2026-09-15')
  assert.deepEqual(obecne[0].pl, 'jabłko', 'scal nie zmienia wejscia')

  assert.deepEqual(karty, przed)
  const seria = zbudujSerie({ slowa: wynik.slowa, karty, ustawienia: { noweDziennie: 10 }, dzis: null, teraz })
  assert.deepEqual(seria, ['apple|pl', 'book|en', 'cat|en', 'zebra|en', 'ant|en'])
})

test('przyklad.json wczytuje sie bez bledow', () => {
  const w = parsujWklejone(readFileSync(new URL('./dane/przyklad.json', import.meta.url), 'utf8'), teraz)
  assert.equal(w.bladOgolny, '')
  assert.deepEqual(w.bledy, [])
  assert.equal(w.nazwa, 'Przykład')
  assert.ok(w.slowa.length >= 40)
  assert.ok(w.slowa.every((s) => s.poziom === 'A1' || s.poziom === 'A2'))
})

test('duza talia (6000 slow) parsuje sie i scala szybko', () => {
  const slowa = Array.from({ length: 6000 }, (_, i) => ({
    id: `word${i}`, w: `word${i}`, poziom: 'B1', ipa: 'wɜːd', czesci: ['noun'], pl: `słowo ${i}`,
    zdanie: 'This is a fairly typical example sentence.', zdaniePl: 'To jest dość typowe przykładowe zdanie.',
  }))
  const tekst = JSON.stringify({ nazwa: 'Duża', slowa })
  const start = performance.now()
  const w = parsujWklejone(tekst, teraz)
  const polowa = scal(w.slowa.slice(0, 3000), [])
  const wynik = scal(polowa.slowa, w.slowa)
  const ms = performance.now() - start
  console.log(`6000 slow, ${(tekst.length / 1024).toFixed(0)} KB: parsowanie i scalanie ${ms.toFixed(0)} ms`)
  assert.equal(wynik.nowe, 3000)
  assert.equal(wynik.bezZmian, 3000)
  assert.ok(ms < 2000)
})
