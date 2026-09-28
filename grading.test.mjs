// Grading a card and taking cards off the session. Run: node --test
process.env.TZ = 'Europe/Warsaw'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nowaKarta as newFsrsCard } from './lib/fsrs.mjs'
import { gradedCard, sessionWithout, sessionWithoutCurrent, sessionWithoutWord } from './src/grading.js'
import { KNOWN_DAYS, newSession } from './src/study.js'

const now = new Date(2026, 8, 15, 12, 0)
const daysTo = (iso) => (Date.parse(iso) - now.getTime()) / 86400000

test('a grade gives a new card object with finite FSRS memory and a counter of Know in a row', () => {
  const fresh = newFsrsCard(now.toISOString())
  const card = gradedCard(fresh, 3, now, 'apple|en')
  assert.notEqual(card, fresh)
  assert.equal(card.stan, 'nauka')
  assert.ok(Number.isFinite(card.stabilnosc) && Number.isFinite(card.trudnosc))
  assert.equal(card.kolejneUmiem, 1)
  assert.equal(gradedCard(card, 1, now, 'apple|en').kolejneUmiem, 0, '"Don\'t know" resets the counter')
  assert.equal(fresh.stan, 'nowa', 'input untouched')
})

test('"Already know" on a new card gives one check in about 45 days', () => {
  const card = gradedCard(newFsrsCard(now.toISOString()), 4, now, 'apple|en')
  assert.equal(card.stan, 'powtorka')
  assert.ok(Math.abs(daysTo(card.termin) - KNOWN_DAYS) <= KNOWN_DAYS * 0.08 + 0.001, `${daysTo(card.termin)} days`)
})

test('a broken card throws instead of saving NaN', () => {
  const broken = { ...newFsrsCard(now.toISOString()), stan: 'nauka', stabilnosc: 5, trudnosc: Number.NaN, ostatnio: now.toISOString() }
  assert.throws(() => gradedCard(broken, 1, now, 'x|en'), /wrong result/)
})

test('taking cards off the session keeps the cleared count', () => {
  let session = newSession(['a|en', 'a|pl', 'b|en', 'c|en'])
  session = { ...session, cleared: 3 }
  assert.deepEqual(sessionWithoutWord(session, 'a').queue, ['b|en', 'c|en'])
  assert.equal(sessionWithoutWord(session, 'a').total, 3, 'total does not drop below cleared')
  assert.deepEqual(sessionWithout(newSession(['a|en', 'b|en']), (k) => k === 'b|en').queue, ['a|en'])
  assert.equal(sessionWithout(newSession(['a|en', 'b|en']), (k) => k === 'b|en').total, 1)
  const current = sessionWithoutCurrent(newSession(['a|en', 'b|en']))
  assert.deepEqual(current.queue, ['b|en'])
  assert.equal(current.total, 1)
})
