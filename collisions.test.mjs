// Index of collisions between words: synonyms and close spelling. Run: node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as c from './src/collisions.js'

const ROOT = dirname(fileURLToPath(import.meta.url))
// The Oxford 3000 deck is local data outside the repo (license): talie/oxford3000.json or MMF_DECK.
const OXFORD = process.env.MMF_DECK || join(ROOT, 'talie', 'oxford3000.json')

test('withoutPolishLetters removes Polish letters and case', () => {
  assert.equal(c.withoutPolishLetters('Zażółć gęślą jaźń'), 'zazolc gesla jazn')
  assert.equal(c.withoutPolishLetters('Jabłko'), 'jablko')
  assert.equal(c.withoutPolishLetters(undefined), '')
})

test('close: one edit or a swap of neighboring letters', () => {
  // one letter changed
  assert.equal(c.close('test', 'text'), true)
  assert.equal(c.close('cold', 'gold'), true)
  // neighbors swapped
  assert.equal(c.close('quiet', 'quite'), true)
  assert.equal(c.close('form', 'from'), true)
  // one letter inserted or deleted
  assert.equal(c.close('cold', 'could'), true)
  assert.equal(c.close('here', 'hear'), false, 'two changes are already too far')
  assert.equal(c.close('small', 'mall'), true)
  // too far
  assert.equal(c.close('room', 'soon'), false)
  assert.equal(c.close('house', 'mouse cat'), false)
  assert.equal(c.close('abc', 'abcde'), false, 'length difference over 1')
  assert.equal(c.close('same', 'same'), false, 'the same word is not a collision')
})

test('main meanings: the first part, without brackets, without short words', () => {
  assert.deepEqual(c.mainMeanings('cichy, spokojny; cisza'), ['cichy', 'spokojny'])
  assert.deepEqual(c.mainMeanings('jabłko (owoc)'), ['jablko'])
  assert.deepEqual(c.mainMeanings('on, ja, ona'), ['ona'], 'parts shorter than 3 chars are dropped')
  assert.deepEqual(c.mainMeanings('DUŻY'), ['duzy'])
  assert.equal(c.MIN_MEANING_LENGTH, 3)
})

test('buildCollisions: synonyms, spelling, group limit and the per-word limit', () => {
  const words = [
    { id: 'quiet', w: 'quiet', pl: 'cichy, spokojny' },
    { id: 'silent', w: 'silent', pl: 'cichy' },
    { id: 'quite', w: 'quite', pl: 'całkiem' },
    { id: 'big', w: 'big', pl: 'duży' },
    { id: 'large', w: 'large', pl: 'duży' },
    { id: 'cat', w: 'cat', pl: 'kot' },
    { id: 'cut', w: 'cut', pl: 'ciąć' },
  ]
  const collisions = c.buildCollisions(words)
  assert.deepEqual([...collisions.quiet].sort(), ['quite', 'silent'])
  assert.deepEqual(collisions.silent, ['quiet'], 'a synonym works both ways')
  assert.deepEqual(collisions.quite, ['quiet'], 'spelling works both ways')
  assert.deepEqual(collisions.big, ['large'])
  assert.equal(collisions.cat, undefined, 'words shorter than 4 chars do not count for spelling')
  assert.equal(c.MIN_SPELLING_LENGTH, 4)

  // A meaning group over 5 words is a catch-all word and gives no collision. The words differ in spelling,
  // so only the meaning rule works.
  const different = ['make', 'perform', 'commit', 'execute', 'produce', 'handle']
  const catchAll = different.map((w) => ({ id: w, w, pl: 'robić' }))
  assert.deepEqual(Object.keys(c.buildCollisions(catchAll)), [], 'a group of 6 words with the same meaning is dropped')
  assert.equal(c.MAX_MEANING_GROUP, 5)
  const five = catchAll.slice(0, 5)
  assert.equal(c.buildCollisions(five).make.length, 4)

  // The per-word limit: one meaning shared by a few groups gives more collisions than the limit.
  const many = []
  for (let g = 0; g < 4; g++) {
    for (let i = 0; i < 3; i++) many.push({ id: `w${g}${i}`, w: `w${g}${i}`, pl: `znaczenie${g}, wspolne` })
  }
  const cut = c.buildCollisions(many, 3)
  for (const list of Object.values(cut)) assert.ok(list.length <= 3, JSON.stringify(list))
  assert.equal(c.MAX_COLLISIONS, 8)
})

test('indexKey changes after every deck change', () => {
  const a = [
    { id: 'apple', w: 'apple', pl: 'jabłko' },
    { id: 'book', w: 'book', pl: 'książka' },
  ]
  assert.equal(c.indexKey(a), c.indexKey([...a]))
  assert.notEqual(c.indexKey(a), c.indexKey([a[1], a[0]]), 'the word order also changes the key')
  assert.notEqual(c.indexKey(a), c.indexKey([...a, { id: 'cat', w: 'cat', pl: 'kot' }]))
  // The same word count, another id: the key must change (a spelling fix).
  assert.notEqual(c.indexKey(a), c.indexKey([a[0], { id: 'boook', w: 'boook', pl: 'książka' }]))
  assert.match(c.indexKey(a), /^2-[a-z0-9]+$/)
})

test('the index key is the same as in the Polish version, so the saved index stays valid', () => {
  // The value counted by the Polish version (kolizje.js, kluczIndeksu) for this deck.
  const words = [
    { id: 'apple', w: 'apple', pl: 'jabłko' },
    { id: 'book', w: 'book', pl: 'książka' },
  ]
  assert.equal(c.indexKey(words), '2-bx8m3s')
})

test('the Oxford 3000 deck: numbers from the study and counting time', () => {
  const deck = JSON.parse(readFileSync(OXFORD, 'utf8'))
  const words = deck.slowa
  assert.equal(words.length, 2981)

  const start = performance.now()
  const collisions = c.buildCollisions(words)
  const ms = performance.now() - start

  const withCollision = Object.keys(collisions).length
  const sizes = Object.values(collisions)
    .map((l) => l.length)
    .sort((a, b) => b - a)
  const median = sizes[Math.floor(sizes.length / 2)]
  console.log(`collision index: ${ms.toFixed(0)} ms, ${withCollision} words with a collision (${Math.round((withCollision / words.length) * 100)}%), median ${median}`)

  assert.equal(Math.round((withCollision / words.length) * 100), 56, 'about 56% of words have some collision')
  assert.equal(median, 2)
  assert.ok(sizes[0] <= c.MAX_COLLISIONS)
  // Known pairs from the deck review.
  assert.ok(collisions.test.includes('text'))
  assert.ok(collisions.cold.includes('could'))
  assert.ok(collisions.quiet.includes('quite'))
  // The index is counted once per deck, so even on a slow phone it fits in one frame with room to spare.
  assert.ok(ms < 1000, `counting the index took ${ms.toFixed(0)} ms`)
})

// Fixes after a review

test('a word does not collide with itself with a repeated meaning', () => {
  const index = c.buildCollisions([
    { id: 'x', w: 'xxxx', pl: 'kot, kot' },
    { id: 'y', w: 'yyyy', pl: 'pies' },
  ])
  assert.equal(index.x, undefined)
})

test('the index key changes after a translation fix and a spelling fix', () => {
  const before = [
    { id: 'a', w: 'test', pl: 'test' },
    { id: 'b', w: 'text', pl: 'tekst' },
  ]
  const afterTranslation = [
    { id: 'a', w: 'test', pl: 'sprawdzian' },
    { id: 'b', w: 'text', pl: 'tekst' },
  ]
  const afterSpelling = [
    { id: 'a', w: 'tests', pl: 'test' },
    { id: 'b', w: 'text', pl: 'tekst' },
  ]
  assert.notEqual(c.indexKey(before), c.indexKey(afterTranslation))
  assert.notEqual(c.indexKey(before), c.indexKey(afterSpelling))
  assert.equal(c.indexKey(before), c.indexKey([...before]), 'the same deck gives the same key')
})
