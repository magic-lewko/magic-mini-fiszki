// Crossword generator: word validation, grid rules, repeatability and placing time. Run: node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as cw from './src/crossword.js'

const ROOT = dirname(fileURLToPath(import.meta.url))
const OXFORD = process.env.MMF_DECK || join(ROOT, 'talie', 'oxford3000.json')

const FRUIT = [
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

// All runs of at least two letters in a row, in both directions. A correct crossword has exactly as many of them
// as it has entries: every longer run means joined ends, and every extra one - touching sides.
function runs(grid) {
  const result = []
  const collect = (outerLength, innerLength, read, direction) => {
    for (let a = 0; a < outerLength; a++) {
      let start = -1
      let text = ''
      for (let b = 0; b <= innerLength; b++) {
        const char = b < innerLength ? read(a, b) : null
        if (char) {
          if (start < 0) start = b
          text += char
          continue
        }
        if (text.length >= 2) {
          result.push({
            direction,
            row: direction === 'across' ? a : start,
            col: direction === 'across' ? start : a,
            text,
          })
        }
        start = -1
        text = ''
      }
    }
  }
  const rows = grid.length
  const cols = rows ? grid[0].length : 0
  collect(rows, cols, (r, c) => grid[r][c], 'across')
  collect(cols, rows, (c, r) => grid[r][c], 'down')
  return result
}

function checkGridRules(result, label) {
  const { grid, clues } = result
  for (const row of grid) assert.equal(row.length, grid[0].length, `${label}: rows of equal length`)
  // Every entry lies where it says and has its letters.
  for (const clue of clues) {
    const letters = cellsOf(clue)
      .map((p) => grid[p.row][p.col])
      .join('')
    assert.equal(letters, clue.word.toUpperCase(), `${label}: entry ${clue.word} does not match the grid`)
    assert.equal(clue.length, clue.word.length)
  }
  // The set of runs must be the same as the set of entries.
  const found = runs(grid)
    .map((r) => `${r.direction} ${r.row},${r.col} ${r.text}`)
    .sort()
  const expected = clues.map((c) => `${c.direction} ${c.row},${c.col} ${c.word.toUpperCase()}`).sort()
  assert.deepEqual(found, expected, `${label}: the grid has runs that are not entries`)
}

const cellsOf = (clue) => cw.clueCells(clue)

// The grid of FRUIT with seed 7, drawn by the Polish version (krzyzowka.js).
const EXPECTED_SEED_7 = ['..PEACH', '..L....', '..U....', 'LEMON..', '...R.M.', 'BANANA.', '.P.N.N.', '.P.G.G.', '.L.E.O.', '.E.....'].join('\n')

const draw = (grid) => grid.map((row) => row.map((c) => c || '.').join('')).join('\n')

test('rejects words that cannot be written in the grid', () => {
  const result = cw.buildCrossword(
    [
      { id: 'a', w: 'ice cream', pl: 'lody' },
      { id: 'b', w: "don't", pl: 'nie' },
      { id: 'c', w: 'and/or', pl: 'albo' },
      { id: 'd', w: 'go', pl: 'iść' },
      { id: 'e', w: 'extraordinary', pl: 'niezwykły' },
      { id: 'f', w: 'table', pl: 'stół' },
      { id: 'g', w: 'TABLE', pl: 'tabela' },
    ],
    { seed: 1 },
  )
  const reasons = Object.fromEntries(result.unused.map((u) => [u.id, u.reason]))
  assert.equal(reasons.a, cw.REASONS.chars, 'space')
  assert.equal(reasons.b, cw.REASONS.chars, 'apostrophe')
  assert.equal(reasons.c, cw.REASONS.chars, 'slash')
  assert.equal(reasons.d, cw.REASONS.short)
  assert.equal(reasons.e, cw.REASONS.long, '13 letters do not fit in a grid of 11')
  assert.equal(reasons.g, cw.REASONS.repeat, 'the grid does not care about case')
  assert.equal(result.clues.length, 1)
  assert.equal(result.clues[0].word, 'table')
  // The reason has a text for the UI.
  for (const u of result.unused) assert.ok(cw.REASON_TEXTS[u.reason], u.reason)
})

test('an empty list and only bad words do not throw', () => {
  const empty = cw.buildCrossword([], { seed: 1 })
  assert.deepEqual(empty, { grid: [], clues: [], unused: [] })
  assert.deepEqual(cw.buildCrossword(undefined, { seed: 1 }), { grid: [], clues: [], unused: [] })

  const bad = cw.buildCrossword(
    [
      { id: 'a', w: 'go', pl: 'iść' },
      { id: 'b', w: 'at', pl: 'przy' },
    ],
    { seed: 1 },
  )
  assert.deepEqual(bad.grid, [])
  assert.deepEqual(bad.clues, [])
  assert.equal(bad.unused.length, 2, 'all words come back with a reason')
})

test('one word gives a crossword with one entry', () => {
  const result = cw.buildCrossword([{ id: 'apple', w: 'apple', pl: 'jabłko' }], { seed: 5 })
  assert.equal(result.grid.length, 1)
  assert.equal(draw(result.grid), 'APPLE')
  assert.deepEqual(result.clues, [{ number: 1, direction: 'across', row: 0, col: 0, length: 5, word: 'apple', clue: 'jabłko', id: 'apple' }])
  assert.deepEqual(result.unused, [])
})

test('words without shared letters: only one is placed, the rest come back with a reason', () => {
  const result = cw.buildCrossword(
    [
      { id: 'abc', w: 'abc', pl: 'abc' },
      { id: 'def', w: 'def', pl: 'def' },
      { id: 'ghi', w: 'ghi', pl: 'ghi' },
    ],
    { seed: 3 },
  )
  assert.equal(result.clues.length, 1)
  assert.equal(result.unused.length, 2)
  for (const u of result.unused) assert.equal(u.reason, cw.REASONS.noRoom)
  checkGridRules(result, 'no shared letters')
})

test('the grid keeps the crossword rules on many seeds', () => {
  for (let seed = 0; seed < 40; seed++) {
    const result = cw.buildCrossword(FRUIT, { seed })
    checkGridRules(result, `seed ${seed}`)
    assert.ok(result.grid.length <= cw.MAX_GRID, 'the grid does not go over the limit')
    assert.ok(result.grid[0].length <= cw.MAX_GRID)
    // Numbering: growing from the top to the right, a shared number for entries from the same cell.
    const numbers = result.clues.map((c) => c.number)
    assert.deepEqual(
      numbers,
      [...numbers].sort((a, b) => a - b),
    )
    assert.equal(Math.max(...numbers), new Set(numbers).size)
  }
})

test('a smaller grid forces a smaller result', () => {
  const result = cw.buildCrossword(FRUIT, { seed: 1, maxGrid: 5 })
  checkGridRules(result, 'grid 5')
  assert.ok(result.grid.length <= 5, draw(result.grid))
  assert.ok(result.grid[0].length <= 5)
  const long = result.unused.filter((u) => u.reason === cw.REASONS.long).map((u) => u.w)
  assert.deepEqual(long.sort(), ['banana', 'cherry', 'orange'], '5 letters fit, more do not')
})

test('the same seed gives the same crossword, different seeds different ones', () => {
  const a = cw.buildCrossword(FRUIT, { seed: 'test' })
  const b = cw.buildCrossword(FRUIT, { seed: 'test' })
  assert.deepEqual(a, b, 'repeatable with the same seed')
  assert.deepEqual(cw.buildCrossword(FRUIT, { seed: 7 }), cw.buildCrossword(FRUIT, { seed: 7 }))

  const different = new Set()
  for (let seed = 0; seed < 10; seed++) different.add(draw(cw.buildCrossword(FRUIT, { seed }).grid))
  assert.ok(different.size >= 5, `10 seeds gave only ${different.size} different grids`)
})

test('the grid is the same as the Polish version gave for the same seed', () => {
  // The generator did not change, only names: this drawing comes from krzyzowka.js (ziarno 7).
  assert.equal(draw(cw.buildCrossword(FRUIT, { seed: 7 }).grid), EXPECTED_SEED_7)
})

test('the input is not changed in place', () => {
  const copy = JSON.parse(JSON.stringify(FRUIT))
  cw.buildCrossword(FRUIT, { seed: 2 })
  assert.deepEqual(FRUIT, copy)
})

test('with 6-12 words it places at least half', () => {
  const deck = JSON.parse(readFileSync(OXFORD, 'utf8')).slowa
  const sets = []
  for (let i = 0; i < 30; i++) {
    const count = 6 + (i % 7)
    sets.push(deck.slice(i * 37, i * 37 + count))
  }

  let worst = 1
  let complete = 0
  let shareSum = 0
  let pieces = 0
  for (const set of sets) {
    for (const seed of [0, 1, 2]) {
      const result = cw.buildCrossword(set, { seed })
      checkGridRules(result, `set ${set.map((w) => w.w).join(',')} seed ${seed}`)
      // Words rejected at the input (space, apostrophe, too short) do not count to placing.
      const toPlace = result.clues.length + result.unused.filter((u) => u.reason === cw.REASONS.noRoom).length
      if (!toPlace) continue
      const share = result.clues.length / toPlace
      assert.ok(share >= 0.5, `placed ${result.clues.length} of ${toPlace}:\n${draw(result.grid)}`)
      if (share === 1) complete += 1
      if (share < worst) worst = share
      shareSum += share
      pieces += 1
    }
  }
  console.log(
    `crossword: ${pieces} sets of 6-12 words, on average ${Math.round((shareSum / pieces) * 100)}% of words in the grid, ` +
      `complete in ${Math.round((complete / pieces) * 100)}% of cases, worst result ${Math.round(worst * 100)}%`,
  )
})

test('12 words are placed in under 50 ms', () => {
  const times = []
  for (let seed = 0; seed < 20; seed++) {
    const start = performance.now()
    const result = cw.buildCrossword(FRUIT, { seed })
    times.push(performance.now() - start)
    assert.ok(result.clues.length >= 6)
  }
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]
  const worst = times[times.length - 1]
  console.log(`crossword of 12 words: median ${median.toFixed(2)} ms, worst ${worst.toFixed(2)} ms (20 seeds)`)
  assert.ok(worst < 50, `the slowest placing took ${worst.toFixed(1)} ms`)
})

test('checkCrossword counts correct, wrong and empty letters', () => {
  const result = cw.buildCrossword([{ id: 'apple', w: 'apple', pl: 'jabłko' }], { seed: 1 })
  const empty = cw.checkCrossword(result.grid)
  assert.equal(empty.total, 5)
  assert.equal(empty.empty, 5)
  assert.equal(empty.done, false)
  assert.deepEqual(empty.marks, [['empty', 'empty', 'empty', 'empty', 'empty']])

  // Case does not matter, spaces neither.
  const partial = cw.checkCrossword(result.grid, { '0,0': 'a', '0,1': ' p ', '0,2': 'x', '0,3': '' })
  assert.deepEqual(partial.marks, [['correct', 'correct', 'wrong', 'empty', 'empty']])
  assert.equal(partial.correct, 2)
  assert.equal(partial.wrong, 1)
  assert.equal(partial.empty, 2)

  const full = cw.checkCrossword(result.grid, { '0,0': 'A', '0,1': 'P', '0,2': 'P', '0,3': 'L', '0,4': 'E' })
  assert.equal(full.done, true)
  assert.equal(full.correct, 5)
  assert.equal(cw.checkCrossword([], {}).done, false, 'an empty crossword is not done')
})

test('checkCrossword leaves null on cells outside the crossword', () => {
  const result = cw.buildCrossword(FRUIT, { seed: 1 })
  const marks = cw.checkCrossword(result.grid, {}).marks
  for (let r = 0; r < result.grid.length; r++) {
    for (let c = 0; c < result.grid[r].length; c++) {
      assert.equal(marks[r][c] === null, result.grid[r][c] === null, `cell ${r},${c}`)
    }
  }
})

test('clueCells returns cells in letter order', () => {
  const across = cw.clueCells({ direction: 'across', row: 2, col: 3, length: 3 })
  assert.deepEqual(across, [
    { row: 2, col: 3 },
    { row: 2, col: 4 },
    { row: 2, col: 5 },
  ])
  const down = cw.clueCells({ direction: 'down', row: 2, col: 3, word: 'cat' })
  assert.deepEqual(down, [
    { row: 2, col: 3 },
    { row: 3, col: 3 },
    { row: 4, col: 3 },
  ])
})

test('hintLetter reveals one letter, keeps the limit and does not change the state in place', () => {
  const result = cw.buildCrossword(FRUIT, { seed: 4 })
  let state = { grid: result.grid, answers: {}, used: 0, seed: 4 }
  const before = JSON.parse(JSON.stringify(state))

  const revealed = []
  for (let i = 0; i < cw.MAX_HINTS; i++) {
    const step = cw.hintLetter(state)
    assert.ok(step.hint, `hint ${i + 1}`)
    assert.equal(step.state.used, i + 1)
    assert.equal(step.state.answers[cw.cellKey(step.hint.row, step.hint.col)], step.hint.letter)
    revealed.push(`${step.hint.row},${step.hint.col}`)
    state = step.state
  }
  assert.deepEqual(before, { grid: result.grid, answers: {}, used: 0, seed: 4 }, 'input state untouched')
  assert.equal(new Set(revealed).size, cw.MAX_HINTS, 'the next hints land on different cells')

  const afterLimit = cw.hintLetter(state)
  assert.equal(afterLimit.hint, null)
  assert.equal(afterLimit.reason, 'limit')
  assert.equal(afterLimit.state, state, 'after the limit the state comes back unchanged')
})

test('hintLetter narrowed to one entry and used up', () => {
  const result = cw.buildCrossword([{ id: 'apple', w: 'apple', pl: 'jabłko' }], { seed: 1 })
  const cells = cw.clueCells(result.clues[0])
  const state = { grid: result.grid, answers: {}, used: 0, seed: 1, cells: cells.slice(0, 1), max: 9 }
  const step = cw.hintLetter(state)
  assert.deepEqual(step.hint, { row: 0, col: 0, letter: 'A' })

  // The same cell is already correct, so there is nothing to hint.
  const none = cw.hintLetter(step.state)
  assert.equal(none.hint, null)
  assert.equal(none.reason, 'none')

  // A wrong letter is still a candidate to fix.
  const wrong = cw.hintLetter({ ...state, answers: { '0,0': 'X' } })
  assert.deepEqual(wrong.hint, { row: 0, col: 0, letter: 'A' })
})
