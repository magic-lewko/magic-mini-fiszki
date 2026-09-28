// The "Letters" game: scattered letters, the building state, hints and a series of words. Run: node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as le from './src/letters.js'

const ROOT = dirname(fileURLToPath(import.meta.url))
const DECK = JSON.parse(readFileSync(process.env.MMF_DECK || join(ROOT, 'talie', 'oxford3000.json'), 'utf8')).slowa

const sorted = (text) => [...text.toUpperCase()].sort().join('')

const countLetters = (text) => {
  const map = new Map()
  for (const char of text.toLowerCase()) map.set(char, (map.get(char) || 0) + 1)
  return map
}

const canBuild = (stock, word) => {
  for (const [letter, count] of countLetters(word)) if ((stock.get(letter) || 0) < count) return false
  return true
}

// No other word from the deck may be buildable from the scattered letters, unless it already comes from the task word
// itself (for example "eat" from "date") - no extra letter can undo that.
function noForeignWord(letters, answer, deck) {
  const stock = countLetters(letters.join(''))
  const fromWordAlone = countLetters(answer)
  for (const item of deck) {
    const word = String(item?.w ?? item).toLowerCase()
    if (word === answer.toLowerCase() || word.length < le.MIN_LENGTH) continue
    if (!canBuild(stock, word)) continue
    assert.ok(canBuild(fromWordAlone, word), `from the letters ${letters.join('')} for "${answer}" you can build "${word}"`)
  }
}

// Building a word step by step, as when tapping tiles.
function buildByHand(state, text) {
  let current = state
  for (const char of text.toUpperCase()) {
    const used = new Set(current.picked)
    const index = current.letters.findIndex((c, i) => !used.has(i) && c === char)
    current = le.addLetter(current, index)
  }
  return current
}

test('prepareLetters gives all letters of the word plus extra ones', () => {
  const cat = le.prepareLetters('cat', { seed: 1 })
  assert.equal(cat.answer, 'cat')
  assert.ok(cat.added.length >= le.EXTRA_MIN && cat.added.length <= le.EXTRA_MAX)
  assert.equal(cat.letters.length, 3 + cat.added.length)
  assert.equal(sorted(cat.letters.join('')), sorted('cat' + cat.added.join('')))
  // An extra letter cannot be a letter from the word, because it could not be told apart.
  for (const letter of cat.added) assert.ok(!'CAT'.includes(letter), letter)

  // Long words get extra letters too, just fewer: the tiles must fit on the screen.
  const long = le.prepareLetters('beautiful', { seed: 1 })
  assert.ok(long.added.length > 0, 'a word longer than 6 chars also has extra letters')
  assert.ok(long.letters.length <= le.MAX_TILES, `tiles: ${long.letters.length}`)
  assert.equal(le.prepareLetters('orange', { seed: 1 }).added.length >= le.EXTRA_MIN, true)
  assert.ok(le.prepareLetters('oranges', { seed: 1 }).added.length >= 1, '7 chars also with extras')

  // A word so long that not a single extra letter fits any more.
  const veryLong = le.prepareLetters('responsibility', { seed: 1 })
  assert.equal(veryLong.letters.length, 14)
  assert.ok(veryLong.letters.length <= le.MAX_TILES)
})

test('repeated letters get separate tiles', () => {
  const state = { ...le.prepareLetters('letter', { seed: 3 }), picked: [] }
  const letters = state.letters.join('')
  assert.equal([...letters].filter((c) => c === 'T').length, 2)
  assert.equal([...letters].filter((c) => c === 'E').length, 2)
  assert.equal(le.isCorrect(buildByHand(state, 'letter')), true)
  // The same letters in a wrong order are not this word.
  assert.equal(le.isCorrect(buildByHand(state, 'lettre')), false)
})

test('case: tiles are capital letters, the answer keeps the original', () => {
  const may = le.prepareLetters({ id: 'May', w: 'May', pl: 'maj' }, { seed: 2 })
  assert.equal(may.answer, 'May', 'the original spelling stays for display and pronunciation')
  assert.equal(may.letters.join(''), may.letters.join('').toUpperCase())
  const state = { ...may, picked: [] }
  assert.equal(le.isCorrect(buildByHand(state, 'MAY')), true)
  assert.equal(le.built(buildByHand(state, 'MAY')), 'MAY')
})

test('extra letters do not build another word from the deck', () => {
  const deck = ['cat', 'cart', 'chat', 'cast', 'coat', 'scat', 'cats', 'mat', 'bat', 'rat', 'tab', 'act']
  for (let seed = 0; seed < 20; seed++) {
    const result = le.prepareLetters('cat', { seed, deck })
    noForeignWord(result.letters, 'cat', deck)
    for (const letter of result.added) assert.ok(!'RHSOMB'.includes(letter), `the letter ${letter} makes another word`)
  }
  // Without a deck there is nothing to guard, so letters may be any from outside the word.
  const noDeck = le.prepareLetters('cat', { seed: 0 })
  assert.equal(noDeck.added.length >= le.EXTRA_MIN, true)
})

test('the extra option forces the number of extra letters', () => {
  assert.deepEqual(le.prepareLetters('cat', { seed: 1, extra: 0 }).added, [])
  assert.equal(le.prepareLetters('cat', { seed: 1, extra: 0 }).letters.length, 3)
  assert.equal(le.prepareLetters('cat', { seed: 1, extra: 5 }).added.length, 5)
  assert.equal(le.prepareLetters('beautiful', { seed: 1, extra: 2 }).added.length, 2, 'a long word also takes the forced value')
})

test('words not for the game return an empty set of letters', () => {
  for (const bad of ['go', 'at', '', "don't", 'ice cream', 'and/or', '   ']) {
    const result = le.prepareLetters(bad, { seed: 1 })
    assert.deepEqual(result.letters, [], bad)
    assert.deepEqual(result.added, [], bad)
  }
  assert.deepEqual(le.prepareLetters(undefined, { seed: 1 }).letters, [])
})

test('the same seed gives the same set, different seeds different ones', () => {
  assert.deepEqual(le.prepareLetters('orange', { seed: 9 }), le.prepareLetters('orange', { seed: 9 }))
  assert.deepEqual(le.prepareLetters('orange', { seed: 'abc' }), le.prepareLetters('orange', { seed: 'abc' }))
  const sets = new Set()
  for (let seed = 0; seed < 10; seed++) sets.add(le.prepareLetters('orange', { seed }).letters.join(''))
  assert.ok(sets.size >= 8, `10 seeds gave only ${sets.size} different sets`)
})

test('the tiles are the same as the Polish version gave for the same seed', () => {
  // The generator did not change, only names: these values come from literki.js.
  assert.equal(le.prepareLetters('orange', { seed: 9 }).letters.join(''), 'NSGFREIAOV')
  const first = le.newRound(DECK, { seed: 11 }).tasks[0]
  assert.equal(`${first.id}:${first.letters.join('')}`, 'ride:RQJDIZME')
})

test('addLetter and removeLetter do not change the state in place', () => {
  const state = { letters: ['C', 'A', 'T', 'Q'], answer: 'cat', picked: [], hints: 0 }
  const frozen = JSON.parse(JSON.stringify(state))

  const after = le.addLetter(state, 0)
  assert.deepEqual(after.picked, [0])
  assert.deepEqual(state, frozen, 'input untouched')
  assert.notEqual(after, state)

  assert.deepEqual(le.removeLetter(after).picked, [])
  assert.deepEqual(after.picked, [0])
})

test('addLetter rejects impossible moves', () => {
  const state = { letters: ['C', 'A', 'T', 'Q'], answer: 'cat', picked: [0], hints: 0 }
  assert.equal(le.addLetter(state, 0), state, 'the same tile a second time')
  assert.equal(le.addLetter(state, 4), state, 'index out of range')
  assert.equal(le.addLetter(state, -1), state, 'negative index')
  assert.equal(le.addLetter(state, 1.5), state, 'fractional index')
  const full = { ...state, picked: [0, 1, 2] }
  assert.equal(le.addLetter(full, 3), full, 'the answer cannot be longer than the word')
  const empty = { letters: ['C'], answer: 'cat', picked: [] }
  assert.equal(le.removeLetter(empty), empty, 'nothing to undo')
})

test('isCorrect compares the whole word', () => {
  const state = { letters: ['C', 'A', 'T', 'Q'], answer: 'cat', picked: [] }
  assert.equal(le.isCorrect(state), false, 'empty answer')
  assert.equal(le.isCorrect({ ...state, picked: [0, 1] }), false, 'too short answer')
  assert.equal(le.isCorrect({ ...state, picked: [0, 1, 2] }), true)
  assert.equal(le.isCorrect({ ...state, picked: [2, 1, 0] }), false)
  assert.equal(le.isCorrect({ letters: ['C'], answer: '', picked: [0] }), false, 'no word is not a success')
  assert.equal(le.isCorrect(undefined), false)
})

test('hintNextLetter adds letters up to the whole word', () => {
  let state = { ...le.prepareLetters('letter', { seed: 3 }), picked: [], hints: 0 }
  for (let i = 0; i < 'letter'.length; i++) {
    const step = le.hintNextLetter(state)
    assert.ok(step.index !== null, `step ${i}`)
    assert.equal(step.removed, 0)
    assert.equal(step.state.hints, i + 1)
    state = step.state
    assert.equal(le.built(state).toLowerCase(), 'letter'.slice(0, i + 1))
  }
  assert.equal(le.isCorrect(state), true)

  const end = le.hintNextLetter(state)
  assert.equal(end.index, null, 'with the full word there is nothing to hint')
  assert.equal(end.state, state)
})

test('hintNextLetter takes off a wrong tail', () => {
  const prepared = le.prepareLetters('cat', { seed: 1, extra: 0 })
  const wrong = buildByHand({ ...prepared, picked: [], hints: 0 }, 'cta')
  assert.equal(le.built(wrong), 'CTA')

  const step = le.hintNextLetter(wrong)
  assert.equal(step.removed, 2, 'C stays, TA goes')
  assert.equal(le.built(step.state), 'CA')
  assert.equal(step.char, 'A')
  assert.equal(step.state.hints, 1)
  assert.deepEqual(wrong.picked.length, 3, 'input untouched')
})

test('newRound prepares a series of ready states', () => {
  const round = le.newRound(DECK, { seed: 11 })
  assert.equal(round.tasks.length, le.ROUND_LENGTH)
  assert.equal(round.position, 0)
  assert.equal(round.length, le.ROUND_LENGTH)
  const ids = round.tasks.map((t) => t.id)
  assert.equal(new Set(ids).size, ids.length, 'words in the series do not repeat')

  for (const task of round.tasks) {
    assert.deepEqual(task.picked, [])
    assert.equal(task.hints, 0)
    assert.ok(task.pl.length > 0, 'the Polish meaning is the game clue')
    assert.equal(task.letters.length, task.answer.length + task.added.length)
    assert.equal(le.isCorrect(buildByHand(task, task.answer)), true, task.answer)
    noForeignWord(task.letters, task.answer, DECK)
  }
})

test('newRound: repeatability, shorter lists and empty input', () => {
  assert.deepEqual(le.newRound(DECK, { seed: 5 }), le.newRound(DECK, { seed: 5 }))
  const other = le.newRound(DECK, { seed: 6 }).tasks.map((t) => t.id)
  assert.notDeepEqual(
    le.newRound(DECK, { seed: 5 }).tasks.map((t) => t.id),
    other,
  )

  assert.deepEqual(le.newRound([], { seed: 1 }).tasks, [])
  assert.deepEqual(le.newRound(undefined, { seed: 1 }).tasks, [])
  const small = le.newRound(
    [
      { id: 'cat', w: 'cat', pl: 'kot' },
      { id: 'go', w: 'go', pl: 'iść' },
    ],
    { seed: 1 },
  )
  assert.equal(small.tasks.length, 1, 'too short words are dropped, the series is shorter')
  assert.equal(small.tasks[0].answer, 'cat')
  assert.equal(le.newRound(DECK, { seed: 1, length: 3 }).tasks.length, 3)
  assert.deepEqual(le.newRound(DECK, { seed: 1, length: 0 }).tasks, [])

  // The task seed comes from the word id, not from the position in the series, so a shorter series is the start of a longer one.
  const long = le.newRound(DECK, { seed: 5 })
  assert.deepEqual(le.newRound(DECK, { seed: 5, length: 3 }).tasks, long.tasks.slice(0, 3))
  const one = long.tasks[0]
  const alone = le.prepareLetters(
    DECK.find((w) => w.id === one.id),
    { seed: `5|${one.id}`, deck: DECK },
  )
  assert.deepEqual(alone.letters, one.letters)
})

test('preparing a series from the full deck fits in one frame', () => {
  const times = []
  for (let seed = 0; seed < 10; seed++) {
    const start = performance.now()
    const round = le.newRound(DECK, { seed })
    times.push(performance.now() - start)
    assert.equal(round.tasks.length, le.ROUND_LENGTH)
  }
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]
  const worst = times[times.length - 1]
  console.log(`letters: a series of 10 words from a deck of ${DECK.length} words - median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms`)
  assert.ok(worst < 50, `preparing the series took ${worst.toFixed(1)} ms`)
})
