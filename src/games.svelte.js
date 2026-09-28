// Games (G): crossword and letters.
//
// The shared rule: a game does not touch `state.karty` or due dates. It works like the "Hard words" training -
// only the time counts to the study day. All logic of building and checking lives in crossword.js
// and letters.js; here stays the game state, and the view is drawn by Crossword.svelte and Letters.svelte from ui.game.

import * as study from './study.js'
import * as crossword from './crossword.js'
import * as letters from './letters.js'
import { vibrate } from './haptics.js'
import { speak } from './speech.js'
import { FLY_OUT_NO_MOTION_MS, INPUT_SENTINEL, LETTERS_SUCCESS_MS, crosswordLetter, formatTime, plural } from './text.js'
import { reducedMotion, toast, ui } from './ui.svelte.js'
import { addGameTimeToday, drawNow, pickOptions, showHome, showScreen, wordById } from './app.svelte.js'

// The state of the open game. Games do not touch state.karty or due dates, so all their memory lives here.
let game = null

export const hasGame = () => !!game

// The home screen closes the game without adding time (as before `gra = null` in the home screen).
export function dropGame() {
  game = null
}

const focusInput = () => document.getElementById('crossword-input')?.focus()

// Cards due today, and when there are fewer than six, recently studied words. The crossword generator fits
// about 83% of the given words on average, so it gets a few more than it has to fit.
function wordsForGame(count) {
  return study
    .gameWords({ ...pickOptions(new Date()), count })
    .map((id) => wordById(id))
    .filter(Boolean)
}

export function leaveGame() {
  if (!game) return
  addGameTimeToday(game.start)
  game = null
  showHome()
}

// Game result: three numbers and two ways out, as on the session end screen. No grades and no due dates.
function showGameResult(name, title, numbers, again) {
  showScreen(name, { title, numbers, again })
}

// G1. Crossword

export function startCrossword() {
  const list = wordsForGame(study.CROSSWORD_WORDS + study.CROSSWORD_SPARE)
  if (list.length < study.MIN_GAME_WORDS) {
    toast(`Not enough words for a crossword: you need ${study.MIN_GAME_WORDS}.`)
    return
  }
  const seed = Date.now()
  // `unused` with the reason "no-room" is a normal generator result, not an error: what fits is what counts.
  const built = crossword.buildCrossword(list, { seed })
  if (!built.clues.length) {
    toast('These words did not make a crossword. Try tomorrow.')
    return
  }
  game = {
    kind: 'crossword',
    grid: built.grid,
    clues: built.clues,
    cells: built.clues.map(crossword.clueCells),
    answers: {},
    used: 0,
    seed,
    selected: 0,
    cell: null,
    marks: null,
    start: performance.now(),
  }
  game.cell = { ...game.cells[0][0] }
  // The crossword has no way out by swipe: here you type letters, and scrolling the grid up ended the game
  // in the middle of an entry. You leave with the cross in the corner.
  showScreen('crossword')
  refreshCrossword()
  // The hidden field must get focus in the same tap, otherwise iOS does not show the keyboard.
  drawNow()
  focusInput()
}

// A view snapshot: grid cells with numbers, letters and state, the text of the chosen entry and the hint counter.
function refreshCrossword() {
  const numbers = new Map()
  for (const clue of game.clues) {
    const key = crossword.cellKey(clue.row, clue.col)
    if (!numbers.has(key)) numbers.set(key, clue.number)
  }
  const selected = new Set(game.cells[game.selected].map((c) => crossword.cellKey(c.row, c.col)))
  const active = game.cell && crossword.cellKey(game.cell.row, game.cell.col)
  const cells = []
  game.grid.forEach((row, r) => {
    row.forEach((letter, c) => {
      const key = crossword.cellKey(r, c)
      if (letter === null) {
        cells.push({ key, row: r, col: c, empty: true })
        return
      }
      const mark = game.marks ? game.marks[r][c] : null
      cells.push({
        key,
        row: r,
        col: c,
        empty: false,
        number: numbers.get(key) ?? null,
        letter: game.answers[key] || '',
        selected: selected.has(key),
        active: key === active,
        correct: mark === crossword.MARKS.correct,
        wrong: mark === crossword.MARKS.wrong,
      })
    })
  })
  const clue = game.clues[game.selected]
  ui.game = {
    kind: 'crossword',
    columns: game.grid[0].length,
    cells,
    clue: `${clue.number} ${clue.direction} · ${clue.clue}`,
    hintsLeft: crossword.MAX_HINTS - game.used,
  }
}

// A tap chooses the entry, and another tap on the same cell switches the direction, when two entries cross here.
export function tapCell(r, c) {
  if (game?.kind !== 'crossword') return
  const here = []
  game.cells.forEach((cells, i) => {
    if (cells.some((p) => p.row === r && p.col === c)) here.push(i)
  })
  if (!here.length) return
  const sameCell = game.cell?.row === r && game.cell?.col === c
  if (!here.includes(game.selected)) game.selected = here[0]
  else if (sameCell) game.selected = here[(here.indexOf(game.selected) + 1) % here.length]
  game.cell = { row: r, col: c }
  refreshCrossword()
  focusInput()
}

export function onCrosswordInput(e) {
  const value = e.target.value
  e.target.value = INPUT_SENTINEL
  if (game?.kind !== 'crossword') return
  if (value.length > INPUT_SENTINEL.length) typeLetter(value.trim().slice(-1))
  else if (value.length < INPUT_SENTINEL.length) deleteCrosswordLetter()
}

// The cursor goes along the chosen entry and stops at its end.
function moveCell(by) {
  const cells = game.cells[game.selected]
  const i = cells.findIndex((c) => c.row === game.cell.row && c.col === game.cell.col)
  const next = Math.min(Math.max(i + by, 0), cells.length - 1)
  game.cell = { ...cells[next] }
}

const withoutCell = (answers, key) => Object.fromEntries(Object.entries(answers).filter(([k]) => k !== key))

function typeLetter(char) {
  const letter = crosswordLetter(char)
  if (!game?.cell || !letter) return
  game.answers = { ...game.answers, [crossword.cellKey(game.cell.row, game.cell.col)]: letter }
  game.marks = null
  moveCell(1)
  refreshCrossword()
  checkWhenFull()
}

function deleteCrosswordLetter() {
  if (!game?.cell) return
  const key = () => crossword.cellKey(game.cell.row, game.cell.col)
  if (!game.answers[key()]) moveCell(-1)
  game.answers = withoutCell(game.answers, key())
  game.marks = null
  refreshCrossword()
}

export function checkCrossword() {
  if (game?.kind !== 'crossword') return
  const result = crossword.checkCrossword(game.grid, game.answers)
  game.marks = result.marks
  refreshCrossword()
  if (result.done) {
    finishCrossword()
    return
  }
  toast(`Correct: ${result.correct} of ${result.total}.`)
  focusInput()
}

// When all cells are filled, the crossword checks itself.
function checkWhenFull() {
  const result = crossword.checkCrossword(game.grid, game.answers)
  if (result.empty > 0) return
  game.marks = result.marks
  refreshCrossword()
  if (result.done) finishCrossword()
}

export function crosswordHint() {
  if (game?.kind !== 'crossword') return
  const shared = { grid: game.grid, answers: game.answers, used: game.used, seed: game.seed, max: crossword.MAX_HINTS }
  // First in the chosen entry; when there is nothing to reveal there, anywhere in the grid.
  let result = crossword.hintLetter({ ...shared, cells: game.cells[game.selected] })
  if (!result.hint && result.reason !== 'limit') result = crossword.hintLetter(shared)
  if (!result.hint) {
    toast(result.reason === 'limit' ? 'No hints left.' : 'Nothing to hint.')
    return
  }
  game.answers = result.state.answers
  game.used = result.state.used
  game.marks = null
  game.cell = { row: result.hint.row, col: result.hint.col }
  vibrate('almost')
  refreshCrossword()
  checkWhenFull()
  focusInput()
}

function finishCrossword() {
  const seconds = addGameTimeToday(game.start)
  const clues = game.clues.length
  const used = game.used
  vibrate('end')
  game = null
  showGameResult(
    'crossword-result',
    'Crossword done',
    [
      [clues, plural(clues, 'entry', 'entries'), 'solid'],
      [used, plural(used, 'hint', 'hints')],
      [formatTime(seconds), 'time'],
    ],
    startCrossword,
  )
}

// G2. Letters

export function startLetters() {
  const list = wordsForGame(study.CROSSWORD_WORDS + study.CROSSWORD_SPARE)
  if (list.length < study.MIN_GAME_WORDS) {
    toast(`Not enough words for Letters: you need ${study.MIN_GAME_WORDS}.`)
    return
  }
  const round = letters.newRound(list, { seed: Date.now(), length: letters.ROUND_LENGTH })
  if (!round.tasks.length) {
    toast('These words do not work for Letters. Try tomorrow.')
    return
  }
  game = { kind: 'letters', round, position: 0, task: round.tasks[0], hints: 0, done: 0, success: false, start: performance.now() }
  showScreen('letters')
  refreshLetters()
}

// A view snapshot after every move.
function refreshLetters() {
  const t = game.task
  const built = letters.built(t)
  ui.game = {
    kind: 'letters',
    progress: `${game.position + 1} / ${game.round.tasks.length}`,
    pl: t.pl,
    slots: [...t.answer].map((_, i) => built[i] || ''),
    tiles: t.letters.map((char, i) => ({ char, used: t.picked.includes(i) })),
    hints: game.hints,
    success: game.success,
  }
}

export function addTile(i) {
  if (game?.kind !== 'letters') return
  const next = letters.addLetter(game.task, i)
  // The same object means an impossible move: nothing happens and nothing is animated.
  if (next === game.task) return
  game.task = next
  refreshLetters()
  settleLetters()
}

export function removeTile() {
  if (game?.kind !== 'letters') return
  const next = letters.removeLetter(game.task)
  if (next === game.task) return
  game.task = next
  refreshLetters()
}

export function lettersHint() {
  if (game?.kind !== 'letters') return
  const { state: next, index } = letters.hintNextLetter(game.task)
  if (next === game.task && index === null) {
    toast('Nothing to hint.')
    return
  }
  game.task = next
  if (index !== null) game.hints += 1
  vibrate('almost')
  refreshLetters()
  settleLetters()
}

// A full answer: a correct one ends the word, a wrong one only shakes and leaves a chance to fix. No penalty.
function settleLetters() {
  const t = game.task
  if (letters.built(t).length < t.answer.length) return
  if (!letters.isCorrect(t)) {
    vibrate('dontKnow')
    ui.shake += 1
    return
  }
  game.done += 1
  vibrate('know')
  speak(t.answer)
  game.success = true
  // Only the success class on the answer: the tiles stay the same, as before with classList.add.
  ui.game = { ...ui.game, success: true }
  setTimeout(nextLetters, reducedMotion() ? FLY_OUT_NO_MOTION_MS : LETTERS_SUCCESS_MS)
}

function nextLetters() {
  if (game?.kind !== 'letters') return
  game.position += 1
  if (game.position >= game.round.tasks.length) {
    finishLetters()
    return
  }
  game.task = game.round.tasks[game.position]
  game.success = false
  refreshLetters()
}

function finishLetters() {
  const seconds = addGameTimeToday(game.start)
  const done = game.done
  const hints = game.hints
  vibrate('end')
  game = null
  showGameResult(
    'letters-result',
    'Series done',
    [
      [done, plural(done, 'word', 'words'), 'solid'],
      [hints, plural(hints, 'hint', 'hints')],
      [formatTime(seconds), 'time'],
    ],
    startLetters,
  )
}
