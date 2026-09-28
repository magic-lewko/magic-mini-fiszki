// Crossword generator from a list of words due for review. A pure module: no DOM, no timers, no Math.random.
// It places words on a grid of max 11x11, crossing them on shared letters. Not allowed are:
//   1) two parallel words touching sides (random "words" across would appear),
//   2) two words touching ends in one line (it would read as one longer entry),
//   3) words overlapping in the same line.
// Placing is greedy with a few attempts: we take the best of `attempts` random orders.
// The result is fully repeatable with the same `seed`, so it can be tested and restored.

export const MAX_GRID = 11
export const MIN_LENGTH = 3
export const MAX_HINTS = 3
export const PLACING_ATTEMPTS = 6

export const DIRECTIONS = { across: 'across', down: 'down' }
export const MARKS = { correct: 'correct', wrong: 'wrong', empty: 'empty' }

// Codes go to `unused[].reason`, descriptions are ready to show on the screen.
export const REASONS = {
  chars: 'chars',
  short: 'short',
  long: 'long',
  repeat: 'repeat',
  noRoom: 'no-room',
}

export const REASON_TEXTS = {
  chars: 'a space, apostrophe or slash',
  short: 'fewer than 3 letters',
  long: 'does not fit in the grid',
  repeat: 'the same letters as another word',
  'no-room': 'no shared letter with the rest',
}

const EMPTY = null
const ACROSS = DIRECTIONS.across
const DOWN = DIRECTIONS.down
// Only Latin letters: a word with a space, apostrophe, slash or digit cannot be written in the grid.
const ONLY_LETTERS = /^[A-Za-z]+$/

// FNV-1a 32 bit, the same as in study.js: turns any seed (a number or text) into the generator state.
function hash32(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

// Mulberry32: a short pseudo-random generator with a repeatable sequence. Our own, because Math.random cannot be tested.
// The same generator is in letters.js - both games are meant to stay independent, so we prefer a copy to a shared import.
export function generator(seed) {
  let state = hash32(String(seed ?? 0))
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fisher-Yates shuffle on a copy: the input stays untouched.
function shuffle(list, random) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const temp = copy[i]
    copy[i] = copy[j]
    copy[j] = temp
  }
  return copy
}

export const cellKey = (row, col) => `${row},${col}`

// Filters out words that cannot be written in the grid. Returns the ones ready to place and the rejected ones with a reason.
function prepareWords(words, maxGrid) {
  const good = []
  const unused = []
  const seen = new Set()
  for (const item of words) {
    const w = (typeof item === 'string' ? item : String(item?.w ?? '')).trim()
    const entry = { id: String(item?.id ?? w), w, pl: String(item?.pl ?? '') }
    if (!ONLY_LETTERS.test(w)) {
      unused.push({ ...entry, reason: REASONS.chars })
      continue
    }
    if (w.length < MIN_LENGTH) {
      unused.push({ ...entry, reason: REASONS.short })
      continue
    }
    if (w.length > maxGrid) {
      unused.push({ ...entry, reason: REASONS.long })
      continue
    }
    // The grid does not care about case, so "May" and "may" would fight for the same cells.
    const letters = w.toUpperCase()
    if (seen.has(letters)) {
      unused.push({ ...entry, reason: REASONS.repeat })
      continue
    }
    seen.add(letters)
    good.push({ ...entry, letters })
  }
  return { good, unused }
}

const emptyGrid = (size) => Array.from({ length: size }, () => new Array(size).fill(EMPTY))

const cell = (grid, r, c) => (grid[r] === undefined || grid[r][c] === undefined ? EMPTY : grid[r][c])

// Returns the number of crossings or -1 when the placement breaks one of the crossword rules.
function countCrossings(grid, letters, row, col, direction) {
  const size = grid.length
  const dr = direction === DOWN ? 1 : 0
  const dc = direction === ACROSS ? 1 : 0
  const endRow = row + dr * (letters.length - 1)
  const endCol = col + dc * (letters.length - 1)
  if (row < 0 || col < 0 || endRow >= size || endCol >= size) return -1
  // The cell before the start and after the end must be empty, otherwise two words would join into one line.
  if (cell(grid, row - dr, col - dc) !== EMPTY) return -1
  if (cell(grid, endRow + dr, endCol + dc) !== EMPTY) return -1

  let crossings = 0
  let previousTaken = false
  for (let i = 0; i < letters.length; i++) {
    const r = row + dr * i
    const c = col + dc * i
    const char = grid[r][c]
    if (char !== EMPTY) {
      if (char !== letters[i]) return -1
      // Two taken cells in a row mean we overlap a word lying in the same line.
      if (previousTaken) return -1
      previousTaken = true
      crossings += 1
      continue
    }
    previousTaken = false
    // A new cell must not have a neighbor on the side: this is exactly how parallel words touch.
    if (cell(grid, r - dc, c - dr) !== EMPTY) return -1
    if (cell(grid, r + dc, c + dr) !== EMPTY) return -1
  }
  return crossings
}

// The working grid is private to one attempt, so it may be written in place.
function put(grid, letters, row, col, direction) {
  const dr = direction === DOWN ? 1 : 0
  const dc = direction === ACROSS ? 1 : 0
  for (let i = 0; i < letters.length; i++) grid[row + dr * i][col + dc * i] = letters[i]
}

// The best placement of a word: more crossings matter more than being near the center, the seed decides the rest.
function bestPlacement(grid, letters, random) {
  const center = (grid.length - 1) / 2
  let best = null
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid.length; c++) {
      const char = grid[r][c]
      if (char === EMPTY) continue
      for (let i = 0; i < letters.length; i++) {
        if (letters[i] !== char) continue
        const placements = [
          { direction: ACROSS, row: r, col: c - i },
          { direction: DOWN, row: r - i, col: c },
        ]
        for (const p of placements) {
          const crossings = countCrossings(grid, letters, p.row, p.col, p.direction)
          if (crossings < 1) continue
          const fromCenter = Math.abs(p.row - center) + Math.abs(p.col - center)
          const score = crossings * 100 - fromCenter + random()
          if (!best || score > best.score) best = { ...p, score }
        }
      }
    }
  }
  return best
}

// One attempt: the first word across in the center, the rest builds around it.
// We repeat passes over the words not placed yet, because a word rejected at the start may fit later.
function oneAttempt(order, maxGrid, random) {
  const grid = emptyGrid(maxGrid)
  const left = [...order]
  const first = left.shift()
  const row = Math.floor((maxGrid - 1) / 2)
  const col = Math.floor((maxGrid - first.letters.length) / 2)
  put(grid, first.letters, row, col, ACROSS)
  const placed = [{ ...first, row, col, direction: ACROSS }]

  let changed = true
  while (changed && left.length) {
    changed = false
    for (let i = 0; i < left.length; i++) {
      const where = bestPlacement(grid, left[i].letters, random)
      if (!where) continue
      put(grid, left[i].letters, where.row, where.col, where.direction)
      placed.push({ ...left[i], row: where.row, col: where.col, direction: where.direction })
      left.splice(i, 1)
      i -= 1
      changed = true
    }
  }
  return { grid, placed, left }
}

// Crops the grid to the taken cells, so the UI does not draw empty margins.
function crop(grid, placed) {
  let minRow = Infinity
  let maxRow = -1
  let minCol = Infinity
  let maxCol = -1
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid.length; c++) {
      if (grid[r][c] === EMPTY) continue
      if (r < minRow) minRow = r
      if (r > maxRow) maxRow = r
      if (c < minCol) minCol = c
      if (c > maxCol) maxCol = c
    }
  }
  if (maxRow < 0) return { grid: [], placed: [] }
  const cropped = []
  for (let r = minRow; r <= maxRow; r++) cropped.push(grid[r].slice(minCol, maxCol + 1))
  return {
    grid: cropped,
    placed: placed.map((p) => ({ ...p, row: p.row - minRow, col: p.col - minCol })),
  }
}

// Numbering as in a paper crossword: from the top to the right, and two entries from the same cell have the same number.
function number(placed) {
  const order = [...placed].sort(
    (a, b) => a.row - b.row || a.col - b.col || (a.direction === ACROSS ? 0 : 1) - (b.direction === ACROSS ? 0 : 1),
  )
  let n = 0
  let previous = null
  return order.map((p) => {
    if (!previous || previous.row !== p.row || previous.col !== p.col) n += 1
    previous = p
    return {
      number: n,
      direction: p.direction,
      row: p.row,
      col: p.col,
      length: p.letters.length,
      word: p.w,
      clue: p.pl,
      id: p.id,
    }
  })
}

// Placing order: longer words first (they tie the grid better), but spread by the seed,
// so every seed gives a different crossword from the same words.
const arrange = (words, random) =>
  words
    .map((w) => ({ w, weight: w.letters.length + random() * 3 }))
    .sort((a, b) => b.weight - a.weight)
    .map((item) => item.w)

// Builds the crossword. It never throws: when no word can be used, it returns an empty grid,
// and all words go to `unused` with a reason.
export function buildCrossword(words, { maxGrid = MAX_GRID, seed = 0, attempts = PLACING_ATTEMPTS } = {}) {
  const { good, unused } = prepareWords(Array.isArray(words) ? words : [], maxGrid)
  if (!good.length) return { grid: [], clues: [], unused }

  const random = generator(seed)
  let best = null
  for (let a = 0; a < Math.max(1, attempts); a++) {
    const attempt = oneAttempt(arrange(good, random), maxGrid, random)
    if (!best || attempt.placed.length > best.placed.length) best = attempt
    if (!best.left.length) break
  }

  const cropped = crop(best.grid, best.placed)
  const noRoom = best.left.map((w) => ({ id: w.id, w: w.w, pl: w.pl, reason: REASONS.noRoom }))
  return { grid: cropped.grid, clues: number(cropped.placed), unused: [...unused, ...noRoom] }
}

// Cells of one entry, in letter order. The UI uses this to highlight and to limit hints.
export function clueCells(clue) {
  const dr = clue.direction === DOWN ? 1 : 0
  const dc = clue.direction === ACROSS ? 1 : 0
  const length = clue.length ?? String(clue.word ?? '').length
  return Array.from({ length }, (_, i) => ({ row: clue.row + dr * i, col: clue.col + dc * i }))
}

// Checks the typed letters. `answers` is a map "row,col" -> letter; the comparison ignores case.
// Returns a grid of marks of the same shape as `grid` (null on cells outside the crossword) and counters.
export function checkCrossword(grid, answers = {}) {
  const typed = answers ?? {}
  const marks = []
  let correct = 0
  let wrong = 0
  let empty = 0
  for (let r = 0; r < grid.length; r++) {
    const row = []
    for (let c = 0; c < grid[r].length; c++) {
      const expected = grid[r][c]
      if (expected === EMPTY) {
        row.push(null)
        continue
      }
      const letter = String(typed[cellKey(r, c)] ?? '')
        .trim()
        .toUpperCase()
      if (!letter) {
        row.push(MARKS.empty)
        empty += 1
      } else if (letter === expected) {
        row.push(MARKS.correct)
        correct += 1
      } else {
        row.push(MARKS.wrong)
        wrong += 1
      }
    }
    marks.push(row)
  }
  const total = correct + wrong + empty
  return { marks, correct, wrong, empty, total, done: total > 0 && correct === total }
}

// Reveals one letter. `state` is { grid, answers, used, seed, cells?, max? }:
// `cells` narrows the choice to one entry (from clueCells), `max` is the hint limit per crossword.
// Returns the new state and the revealed cell; the input state stays untouched.
export function hintLetter(state) {
  const { grid = [], answers = {}, used = 0, seed = 0, cells = null, max = MAX_HINTS } = state ?? {}
  if (used >= max) return { state, hint: null, reason: 'limit' }

  const allowed = cells ? new Set(cells.map((p) => cellKey(p.row, p.col))) : null
  const candidates = []
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const letter = grid[r][c]
      if (letter === EMPTY) continue
      const key = cellKey(r, c)
      if (allowed && !allowed.has(key)) continue
      // A cell already typed correctly is not a hint; a wrong one may be fixed.
      if (
        String(answers[key] ?? '')
          .trim()
          .toUpperCase() === letter
      )
        continue
      candidates.push({ row: r, col: c, letter })
    }
  }
  if (!candidates.length) return { state, hint: null, reason: 'none' }

  // The seed with the use counter: the second hint in the same crossword lands somewhere else than the first.
  const random = generator(`${seed}|${used}`)
  const chosen = candidates[Math.floor(random() * candidates.length)]
  const newAnswers = { ...answers, [cellKey(chosen.row, chosen.col)]: chosen.letter }
  return { state: { ...state, answers: newAnswers, used: used + 1 }, hint: chosen, reason: '' }
}
