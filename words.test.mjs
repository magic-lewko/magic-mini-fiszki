// Loading words (3 formats) and merging them into the deck. Run: node --test
process.env.TZ = 'Europe/Warsaw'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nowaKarta as newFsrsCard } from './lib/fsrs.mjs'
import { merge, normalizeWord, parsePasted } from './src/words.js'
import { buildSession } from './src/study.js'

const now = new Date(2026, 8, 15, 9, 0)

test('format 1: a JSON object with a name and a words array', () => {
  const text = JSON.stringify({
    wersja: 1,
    nazwa: 'Oxford 3000',
    zrodlo: 'Oxford',
    slowa: [
      { id: 'abandon', w: 'abandon', poziom: 'b2', ipa: '/əˈbændən/', czesci: ['verb'], pl: 'porzucić', zdanie: 'They abandoned the car.', zdaniePl: 'Porzucili samochód.' },
      { w: 'apple', pl: '' },
      { w: 'book', pl: 'książka', czesci: 'noun, verb', other: 'ignored' },
    ],
  })
  const r = parsePasted(text, now)
  assert.equal(r.format, 'json')
  assert.equal(r.name, 'Oxford 3000')
  assert.equal(r.source, 'Oxford')
  assert.equal(r.generalError, '')
  assert.deepEqual(r.words, [
    { id: 'abandon', w: 'abandon', pl: 'porzucić', poziom: 'B2', ipa: 'əˈbændən', czesci: ['verb'], zdanie: 'They abandoned the car.', zdaniePl: 'Porzucili samochód.', talia: 'Oxford 3000' },
    { id: 'book', w: 'book', pl: 'książka', czesci: ['noun', 'verb'], talia: 'Oxford 3000' },
  ])
  assert.equal(r.errors.length, 1)
  assert.equal(r.errors[0].nr, 2)
  assert.equal(r.unit, 'item')
})

test('format 2: a plain JSON array, default name with the local date', () => {
  const r = parsePasted('﻿[{"w":"cat","pl":"kot"},{"w":"dog","pl":"pies","id":"dog-1"}, 5]', now)
  assert.equal(r.format, 'array')
  assert.equal(r.name, 'Pasted 2026-09-15')
  assert.deepEqual(
    r.words.map((w) => w.id),
    ['cat', 'dog-1'],
  )
  assert.deepEqual(
    r.errors.map((e) => e.nr),
    [3],
  )
})

test('format 3: text with semicolons or tabs, numbers of wrong lines', () => {
  const text = [
    'apple ; jabłko',
    '',
    '# comment',
    'look after\topiekować się\tShe looks after her sister.\tOpiekuje się siostrą.',
    'no separator',
    'house ;',
    ' ice cream ; lody ; I like ice cream. ; Lubię lody. ',
  ].join('\r\n')
  const r = parsePasted(text, now)
  assert.equal(r.format, 'text')
  assert.equal(r.unit, 'line')
  assert.deepEqual(r.words, [
    { id: 'apple', w: 'apple', pl: 'jabłko', talia: 'Pasted 2026-09-15' },
    { id: 'look after', w: 'look after', pl: 'opiekować się', zdanie: 'She looks after her sister.', zdaniePl: 'Opiekuje się siostrą.', talia: 'Pasted 2026-09-15' },
    { id: 'ice cream', w: 'ice cream', pl: 'lody', zdanie: 'I like ice cream.', zdaniePl: 'Lubię lody.', talia: 'Pasted 2026-09-15' },
  ])
  assert.deepEqual(
    r.errors.map((e) => e.nr),
    [5, 6],
  )
})

test('the id is case sensitive, a repeat in one import is an error', () => {
  const r = parsePasted('May ; maj\nmay ; móc\nIT ; informatyka\nit ; to\nmay ; może', now)
  assert.deepEqual(
    r.words.map((w) => w.id),
    ['May', 'may', 'IT', 'it'],
  )
  assert.equal(r.errors.length, 1)
  assert.equal(r.errors[0].nr, 5)
  assert.match(r.errors[0].error, /repeated.*line 2/)

  const { words, added } = merge([{ id: 'May', w: 'May', pl: 'maj' }], parsePasted('may ; móc', now).words)
  assert.equal(added, 1)
  assert.deepEqual(
    words.map((w) => w.pl),
    ['maj', 'móc'],
  )
})

test('invalid JSON and no words array', () => {
  assert.match(parsePasted('{ "slowa": [ }', now).generalError, /Invalid JSON/)
  assert.match(parsePasted('{ "nazwa": "x" }', now).generalError, /has no "slowa" array/)
})

test('merging: new ones at the end, existing ones updated, progress untouched', () => {
  const current = [
    { id: 'apple', w: 'apple', pl: 'jabłko', ipa: 'ˈæpl', poziom: 'A1', talia: 'Oxford 3000' },
    { id: 'book', w: 'book', pl: 'książka', talia: 'Oxford 3000' },
    { id: 'cat', w: 'cat', pl: 'kot', talia: 'Oxford 3000' },
  ]
  const incoming = parsePasted('zebra ; zebra\napple ; jabłko (owoc)\nbook ; książka\nant ; mrówka', now).words
  const cards = {
    'apple|en': { ...newFsrsCard(), stan: 'powtorka', termin: '2026-09-20T10:00:00.000Z', stabilnosc: 12, trudnosc: 4, powtorki: 5 },
    'apple|pl': { ...newFsrsCard(), stan: 'nauka', termin: '2026-09-15T06:00:00.000Z', stabilnosc: 2, trudnosc: 5, powtorki: 1 },
  }
  const before = structuredClone(cards)

  const result = merge(current, incoming)
  assert.deepEqual(
    result.words.map((w) => w.id),
    ['apple', 'book', 'cat', 'zebra', 'ant'],
  )
  assert.equal(result.added, 2)
  assert.equal(result.updated, 1)
  assert.equal(result.unchanged, 1)
  // new content, fields missing in the import and the deck stay
  assert.deepEqual(result.words[0], { id: 'apple', w: 'apple', pl: 'jabłko (owoc)', ipa: 'ˈæpl', poziom: 'A1', talia: 'Oxford 3000' })
  assert.equal(result.words[3].talia, 'Pasted 2026-09-15')
  assert.deepEqual(current[0].pl, 'jabłko', 'merge does not change the input')

  assert.deepEqual(cards, before)
  const session = buildSession({ words: result.words, cards, settings: { noweDziennie: 10 }, today: null, now })
  assert.deepEqual(session, ['apple|pl', 'book|en', 'cat|en', 'zebra|en', 'ant|en'])
})

test('example.json loads with no errors', () => {
  const r = parsePasted(readFileSync(new URL('./data/example.json', import.meta.url), 'utf8'), now)
  assert.equal(r.generalError, '')
  assert.deepEqual(r.errors, [])
  assert.equal(r.name, 'Przykład')
  assert.ok(r.words.length >= 40)
  assert.ok(r.words.every((w) => w.poziom === 'A1' || w.poziom === 'A2'))
})

test('a big deck (6000 words) parses and merges fast', () => {
  const words = Array.from({ length: 6000 }, (_, i) => ({
    id: `word${i}`,
    w: `word${i}`,
    poziom: 'B1',
    ipa: 'wɜːd',
    czesci: ['noun'],
    pl: `słowo ${i}`,
    zdanie: 'This is a fairly typical example sentence.',
    zdaniePl: 'To jest dość typowe przykładowe zdanie.',
  }))
  const text = JSON.stringify({ nazwa: 'Big', slowa: words })
  const start = performance.now()
  const r = parsePasted(text, now)
  const half = merge(r.words.slice(0, 3000), [])
  const result = merge(half.words, r.words)
  const ms = performance.now() - start
  console.log(`6000 words, ${(text.length / 1024).toFixed(0)} KB: parse and merge ${ms.toFixed(0)} ms`)
  assert.equal(result.added, 3000)
  assert.equal(result.unchanged, 3000)
  assert.ok(ms < 2000)
})

test('meanings: a list from two meanings, empty fields dropped, merge sees a change', () => {
  const raw = {
    w: 'get',
    pl: 'dostać; dotrzeć',
    znaczenia: [
      { pl: 'dostać', zdanie: 'I got a letter.', zdaniePl: 'Dostałem list.' },
      { pl: 'dotrzeć', zdanie: ' We got home late. ', zdaniePl: '' },
      { pl: '', zdanie: 'no translation, dropped' },
      'not an object',
    ],
  }
  const { word } = normalizeWord(raw)
  assert.deepEqual(word.znaczenia, [
    { pl: 'dostać', zdanie: 'I got a letter.', zdaniePl: 'Dostałem list.' },
    { pl: 'dotrzeć', zdanie: 'We got home late.' },
  ])
  assert.equal(normalizeWord({ w: 'cat', pl: 'kot', znaczenia: [{ pl: 'kot' }] }).word.znaczenia, undefined)
  const changed = { ...word, znaczenia: [word.znaczenia[0], { pl: 'stawać się', zdanie: 'It got dark.' }] }
  assert.equal(merge([word], [changed]).updated, 1)
  assert.equal(merge([word], [word]).unchanged, 1)
})
