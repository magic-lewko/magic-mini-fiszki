// App control: study by swipe, the home screen, menu, decks, adding words, backup, offline.
// Domain data (progress, deck) and all actions live here, and Svelte components only draw the state from ui.svelte.js
// and call actions from here. Session logic is in study.js, saving in storage.js and database.js.

import { nowaKarta as newFsrsCard, przypomnienie as recall } from '../lib/fsrs.mjs'
import * as study from './study.js'
import * as storage from './storage.js'
import * as database from './database.js'
import { buildCollisions, indexKey } from './collisions.js'
import { addDeck, merge, parsePasted } from './words.js'
import { vibrate } from './haptics.js'
import { speak } from './speech.js'
import { gradedCard, sessionWithout, sessionWithoutCurrent, sessionWithoutWord } from './grading.js'
import {
  CARDS_WITH_TIP,
  DAYS_TO_BACKUP_REMINDER,
  END_CELEBRATION_MS,
  FLY_OUT_MS,
  FLY_OUT_NO_MOTION_MS,
  GRADES,
  MAX_ERRORS_IN_PREVIEW,
  SECONDS_TO_UNDO,
  SKIP_TIP,
  capitalize,
  count,
  daysSince,
  errorText,
  plural,
  skippedCardsText,
  wordsForDeck,
} from './text.js'
import { flash, reducedMotion, setMessage, toast, ui } from './ui.svelte.js'

let state = storage.defaultState()
let words = []
let decks = []
let byId = new Map()
let index = []
let collisions = Object.create(null)
let collisionsKey = ''
let collisionsTime = 0
let libraryLoaded = false
let session = null
let skipCelebration = null
let celebrationTimer = 0
let cardsWithTip = 0
let revealTime = 0
let paceTimers = []
let undo = null
let undoUntil = 0
let undoTimer = 0
let hintLevel = null
let hintUsed = false
let hintTimer = 0
let revealAtOnce = false
let deckNameByHand = false
let busy = false
let cardStart = 0
let registration = null
let waitingForUpdate = false
let importSource = null
let importResult = null
let previewTimer = 0
let savingWords = false

// Domain data for components (menu, banners). Reading through a getter tracks ui.version, so the view
// is counted again after every save.
export const model = {
  get state() {
    void ui.version
    return state
  },
  get words() {
    void ui.version
    return words
  },
  get decks() {
    void ui.version
    return decks
  },
  get index() {
    void ui.version
    return index
  },
  get collisions() {
    void ui.version
    return collisions
  },
  get collisionsTime() {
    void ui.version
    return collisionsTime
  },
  get session() {
    void ui.version
    return session
  },
  get undo() {
    void ui.version
    return undo
  },
}

export const isBusy = () => busy

// Data changed outside a save, or the menu must be drawn again.
const touch = () => {
  ui.version += 1
}

function refreshMenu() {
  ui.reportsText = ''
  touch()
}

// Saving after every grade is synchronous. An error stays on the screen until the next save succeeds.
export function saveState() {
  const result = storage.save(state)
  const text = result.ok ? '' : `Could not save progress (${result.error}). Make a backup in the menu before you close the app.`
  setMessage('save', text, false)
  touch()
  return result.ok
}

// The search index is counted once when the deck loads, so filtering 3000 words after each key is smooth.
function setLibrary(library) {
  words = library.words
  decks = library.decks
  byId = new Map(words.map((w) => [w.id, w]))
  index = study.buildIndex(words)
  touch()
  afterFirstRender(prepareCollisions)
}

// The collision index (interference between words) is counted once per deck: about 50 ms with 3000 words in Node.
// It lives in IndexedDB under a key from the word count and a checksum, so a deck change forces a new count.
// We count it after the first render, so even on a slow phone it does not delay the start.
async function prepareCollisions() {
  if (!words.length) {
    collisions = Object.create(null)
    collisionsKey = ''
    return
  }
  const key = indexKey(words)
  if (collisionsKey === key) return
  const saved = await database.loadCollisions(key)
  if (saved) {
    collisions = saved
    collisionsKey = key
    touch()
    return
  }
  const start = performance.now()
  collisions = buildCollisions(words)
  collisionsTime = Math.round(performance.now() - start)
  collisionsKey = key
  touch()
  database.saveCollisions(key, collisions)
}

// One frame to draw the screen, then the task. No requestIdleCallback, because Safari on iOS does not have it,
// and a separate fallback path would be the only branch the Chrome smoke test never goes through.
function afterFirstRender(action) {
  requestAnimationFrame(() => setTimeout(() => Promise.resolve(action()).catch(() => {}), 0))
}

// Until the saved deck loads, it must not be overwritten (adding words or a backup would save an incomplete list).
async function ensureLibrary() {
  if (libraryLoaded) return true
  try {
    setLibrary(await database.loadLibrary())
    libraryLoaded = true
    setMessage('database', '')
    return true
  } catch (error) {
    const text =
      error?.name === 'DatabaseNotResponding' ? error.message : `Could not load words from the phone storage (IndexedDB): ${errorText(error)}. Close and open the app.`
    setMessage('database', text)
    return false
  }
}

// Top bar: the only progress indicator in the whole app (F).

export const deckProgress = () => study.deckProgress({ words, cards: state.karty, disabledDecks: state.ustawienia.wylaczoneTalie })

// The whole deck bar: the fill is known words, the lighter part is solid words (stability >= 30 days).
// No digits and no percent: the number is only on the home screen.
function refreshBar() {
  const p = deckProgress()
  ui.bar = {
    known: p.knownRatio,
    solid: p.solidRatio,
    label: `Known ${p.known} of ${p.total} words, solid ${p.solid}`,
  }
}

export const offlineReady = () => !!navigator.serviceWorker?.controller && !!ui.offline && !ui.offline.error && ui.offline.saved === ui.offline.files

// The offline badge is a warning, so it goes away when everything is saved, and never hangs over the card:
// during study the top of the screen has nothing to click (C1). The offline state is in the menu.
function refreshBadge() {
  const ok = offlineReady()
  ui.badgeOk = ok
  ui.badgeHidden = ok || ui.screen === 'card'
}

// Screens

export function showScreen(name, screenData = null) {
  ui.screen = name
  endCelebrations()
  ui.data = screenData
  ui.screenNr += 1
  if (name !== 'card') {
    ui.actions = null
    stopPace()
  }
  // During study the top has nothing to click (B): the menu comes back only on the home screen.
  ui.menuButtonHidden = name === 'card'
  refreshBar()
  refreshBadge()
  // A screen change changes the session and the undo, which the menu shows.
  touch()
}

// Celebrations can be skipped with a tap: one click ends the animation and shows the final state at once.
export function endCelebration() {
  if (!skipCelebration) return
  const skip = skipCelebration
  skipCelebration = null
  skip()
}

// Called at every screen change, so no celebration is left stopped halfway.
const endCelebrations = endCelebration

// Catch-up mode comes from the backlog before cutting by the cap, so we count it before every card pick.
function refreshCatchUp(now = new Date()) {
  const due = study.dueCount({
    words,
    cards: state.karty,
    settings: state.ustawienia,
    now,
    skipped: state.pominiete,
    disabledDecks: state.ustawienia.wylaczoneTalie,
  })
  const previous = study.withDefaultCatchUp(state.nadrabianie)
  const next = study.nextCatchUp(previous, due, state.ustawienia, now)
  if (next.aktywne !== previous.aktywne || next.polowaDo !== previous.polowaDo) {
    state.nadrabianie = next
    saveState()
  }
  return next
}

export const pickOptions = (now = new Date()) => ({
  words,
  cards: state.karty,
  settings: state.ustawienia,
  today: state.dzis,
  now,
  skipped: state.pominiete,
  // A turned off deck leaves study with one filter in the engine (H).
  disabledDecks: state.ustawienia.wylaczoneTalie,
  catchUp: state.nadrabianie,
  collisions,
  recall,
})

export const wordById = (id) => byId.get(id)

export function startSession() {
  forgetUndo()
  if (!words.length) {
    showNoWords()
    return
  }
  const now = new Date()
  refreshCatchUp(now)
  const keys = study.buildSession(pickOptions(now))
  if (!keys.length) {
    session = null
    showHome()
    return
  }
  session = study.newSession(keys)
  showCard()
}

// Training on cards where the user already made a mistake. Grades do not change card state or due dates.
export function hardSession() {
  closeMenu()
  forgetUndo()
  if (!words.length) {
    showNoWords()
    return
  }
  const keys = study.hardCards({
    words,
    cards: state.karty,
    settings: state.ustawienia,
    skipped: state.pominiete,
    disabledDecks: state.ustawienia.wylaczoneTalie,
  })
  if (!keys.length) {
    toast('No hard words.')
    return
  }
  session = study.newSession(keys, true)
  showCard()
}

export const hardCount = () => study.hardCount({ words, cards: state.karty, skipped: state.pominiete, disabledDecks: state.ustawienia.wylaczoneTalie })

export function pronounce(text) {
  if (!speak(text)) toast('No speech synthesis on this device.', 'error')
}

// The card leaves the session without a grade and without a save.
function dropCurrent() {
  session = sessionWithoutCurrent(session)
  if (study.sessionDone(session)) showSessionEnd()
  else showCard()
}

function showCard() {
  const key = study.currentCard(session)
  const { id, direction } = study.splitKey(key)
  const word = byId.get(id)
  if (!word) {
    // The deck only grows, but if a word is missing, there is nothing to show.
    dropCurrent()
    return
  }
  hintLevel = null
  hintUsed = false
  clearTimeout(hintTimer)
  stopPace()
  ui.newCard()
  ui.swipeDirection = ''
  if (direction === 'pl') drawHint(word)
  const cardData = {
    word,
    direction,
    isNew: study.isNew(state.karty[key]),
    training: session.training,
    tip: cardsWithTip < CARDS_WITH_TIP,
  }
  cardsWithTip += 1
  showScreen('card', cardData)
  // After an undone grade the card comes back revealed at once, without vibration and without speaking again.
  if (revealAtOnce) {
    revealAtOnce = false
    ui.card.revealed = true
    startPace()
  }
  refreshActions()
  cardStart = performance.now()
  if (direction === 'pl') {
    hintTimer = setTimeout(() => {
      if (ui.screen === 'card') ui.card.hintButton = true
    }, study.HINT_DELAY_SECONDS * 1000)
  }
}

function drawHint(word) {
  const level = hintLevel ?? state.ustawienia.podpowiedzMowienie
  ui.card.hint = study.hint(word.w, level) || ''
}

// Desirable difficulty: the button is invisible for the first 7 seconds, and using it lowers "Know".
export function useHint() {
  const word = ui.data?.word
  if (ui.screen !== 'card' || !word) return
  hintLevel = study.nextHint(hintLevel ?? state.ustawienia.podpowiedzMowienie)
  hintUsed = true
  drawHint(word)
  refreshActions()
}

// The study screen has no visible button (B). These buttons are real, have labels and work from the keyboard,
// but only the screen reader sees them: without them an app driven only by swipes would be unusable
// with VoiceOver.
function refreshActions() {
  if (ui.screen !== 'card' || !session) {
    ui.actions = null
    return
  }
  const isNew = study.isNew(state.karty[study.currentCard(session)])
  ui.actions = [
    !ui.card.revealed && ['Reveal card', reveal],
    // Grades are available at once, the same as swipes: the screen reader does not have to reveal the card first.
    [GRADES[1].label, () => gradeCard(1)],
    [GRADES[2].label, () => gradeCard(2)],
    [GRADES[3].label, () => gradeCard(3)],
    isNew && [GRADES[4].label, () => gradeCard(4)],
    ['Skip this word', skipCurrent],
    // A double tap undoes with no time limit, so the screen reader does too: 6 seconds apply only to the hint on screen.
    !!undo && ['Undo last grade', undoGrade],
    ['End study', exitToHome],
  ]
    .filter(Boolean)
    .map(([text, action]) => ({ text, action }))
}

// Answer time as a signal (C): the card border changes color 0-3 s / 3-8 s / over 8 s. It counts from
// revealing, because only then the user really looks for the answer. No digits and no ticking.
function startPace() {
  stopPace()
  revealTime = performance.now()
  paceTimers = [
    setTimeout(() => {
      ui.card.paceMedium = true
    }, study.MEDIUM_PACE_SECONDS * 1000),
    setTimeout(() => {
      ui.card.paceSlow = true
    }, study.SLOW_PACE_SECONDS * 1000),
  ]
}

function stopPace() {
  for (const t of paceTimers) clearTimeout(t)
  paceTimers = []
  revealTime = 0
}

// Seconds from revealing to grading. A card graded without revealing ("Already know") has no answer time.
const answerSeconds = () => (revealTime ? (performance.now() - revealTime) / 1000 : 0)

export function reveal() {
  if (ui.screen !== 'card' || ui.card.revealed || busy) return
  ui.card.revealed = true
  vibrate('reveal')
  if (state.ustawienia.autowymowa) speak(byId.get(study.splitKey(study.currentCard(session)).id)?.w)
  refreshActions()
  startPace()
}

// The cross on the card and Escape end study and go back to the home screen. It always works, also before revealing.
export function exitToHome() {
  if (ui.screen !== 'card' || busy) return
  flyOut(null, 'down', () => {
    session = null
    showHome()
  })
}

export function gradeCard(grade) {
  if (ui.screen !== 'card' || busy || !session) return
  const key = study.currentCard(session)
  const before = state.karty[key]
  const firstExposure = study.isNew(before)
  // "Already know" makes sense only at the first exposure of a word. Other grades also work on a hidden card:
  // a swipe should finish the word at once, without a tap to reveal.
  if (grade === 4 && !firstExposure) return
  const now = new Date()
  // Answer time from revealing: over 8 s "Know" is saved as a weaker hit. A hint works the same way -
  // instead of blocking the grade, it lowers it quietly. The first exposure and training are left out:
  // there time says nothing about knowledge.
  const time = study.cardTime(answerSeconds())
  const afterTime = study.gradeAfterTime({ grade, seconds: time, isNew: firstExposure, training: session.training })
  const afterHint = hintUsed && !session.training && afterTime.grade === 3
  const finalGrade = afterHint ? 2 : afterTime.grade
  stopPace()
  // In training a grade counts to points, combo, the daily goal and the streak, but does not touch the card or due date.
  let card = null
  if (!session.training) {
    try {
      card = gradedCard(before || newFsrsCard(now.toISOString()), finalGrade, now, key)
    } catch (error) {
      // A card that cannot be graded stays unchanged, so no NaN goes into the save.
      toast(`Could not grade the card: ${errorText(error)}`, 'error')
      dropCurrent()
      return
    }
  }
  // A snapshot to undo with a double tap: everything this grade changes. State objects are immutable,
  // so keeping references is enough.
  const snapshot = takeSnapshot(key, before)

  if (card) state.karty[key] = card
  const seconds = study.cardTime((performance.now() - cardStart) / 1000)
  state.dzis = study.addTime(state.dzis, seconds, now)
  // The daily cap applies only to due cards, so new words and training do not use it up.
  if (!session.training && before?.stan === 'powtorka') {
    state.dzis = { ...state.dzis, powtorki: (state.dzis.powtorki || 0) + 1 }
  }
  // The streak needs one graded card; a missed day is covered by a freeze from the bank.
  const day = study.countDay(state.streak, now)
  state.streak = day.streak
  const previousSession = session
  // A card without an introduction date comes into study right now: this is "what was added" on the session end screen.
  const newWord = !session.training && !before?.wprowadzono ? 1 : 0
  session = study.afterGrade(session, finalGrade, newWord === 1)
  const earned = session.xp - previousSession.xp
  state.expRazem += earned
  state.historia = study.addToHistory(state.historia, { ratings: 1, newCards: newWord, xp: earned, seconds, answerTime: time }, now)
  saveState()
  undo = snapshot

  const done = study.sessionDone(session)
  if (done) vibrate('end')
  else if (session.bonus) vibrate('combo')
  else vibrate({ 1: 'dontKnow', 2: 'almost' }[finalGrade] || 'know')
  // Every fifth correct card in a row: a strong flash instead of a number of points (I). Otherwise every card change
  // gets a weak flash. The tone is always "yes": this is how the version without a framework worked (a reference to
  // a missing variable `status` always gave the default value).
  if (session.bonus) flash('yes')
  else flash('yes', false)
  refreshBar()
  const leech = card && study.needsLeechPanel(card) ? key : null
  flyOut(GRADES[finalGrade], GRADES[finalGrade].direction, () => {
    if (leech) showLeechPanel(leech)
    else if (done) showSessionEnd()
    else showCard()
    offerUndo()
  })
}

// Leeches (A7): after every 6 mistakes the card gets a panel with three choices. The card history stays,
// because FSRS learns from it; only the due date or the presence of the word in study changes.
function showLeechPanel(key) {
  const { id } = study.splitKey(key)
  const word = byId.get(id)
  showScreen('leech', { key, id, text: `${word?.w ?? id} - ${word?.pl ?? ''}` })
}

function afterLeechChoice() {
  saveState()
  refreshBar()
  if (study.sessionDone(session)) showSessionEnd()
  else showCard()
}

export function postponeLeech(key) {
  state.karty[key] = study.postponedCard(state.karty[key], key, new Date())
  session = sessionWithout(session, (k) => k === key)
  afterLeechChoice()
}

export function skipLeech(key) {
  const { id } = study.splitKey(key)
  state.karty[key] = study.afterLeech(state.karty[key])
  state.pominiete = { ...state.pominiete, [id]: study.localDate() }
  session = sessionWithoutWord(session, id)
  afterLeechChoice()
}

export function keepLeech(key) {
  state.karty[key] = study.afterLeech(state.karty[key])
  afterLeechChoice()
}

// "Skip": the word leaves study for good. Its cards stay untouched in memory, so "Restore" in the word list
// puts them back at the same place in the schedule. No grade, XP or daily goal entry - this is not study.
export function skipCurrent() {
  if (ui.screen !== 'card' || busy || !session) return
  const key = study.currentCard(session)
  const { id } = study.splitKey(key)
  const snapshot = { ...takeSnapshot(key, state.karty[key]), skippedId: id }
  state.pominiete = { ...state.pominiete, [id]: study.localDate() }
  session = sessionWithoutWord(session, id)
  saveState()
  undo = snapshot
  vibrate('discard')
  const done = study.sessionDone(session)
  refreshBar()
  // Skipping is not a grade, so the card leaves without a color and without a direction: only a fade.
  flyOut(null, '', () => {
    if (done) showSessionEnd()
    else showCard()
    offerUndo()
  })
}

// A snapshot to undo: everything a grade changes. State objects are immutable, so keeping references
// is enough. `revealed` comes back with the state, so undo does not reveal a card that was hidden.
// Skipped words are not in the snapshot: a skip from the word list or the leech panel after the grade
// must survive the undo, so a skip keeps only its own word in `skippedId`.
const takeSnapshot = (key, card) => ({
  key,
  card,
  session,
  revealed: ui.card.revealed,
  hintUsed,
  expRazem: state.expRazem,
  streak: state.streak,
  dzis: state.dzis,
  historia: state.historia,
})

function forgetUndo() {
  undo = null
  undoUntil = 0
  clearTimeout(undoTimer)
  touch()
  if (ui.screen === 'card') refreshActions()
}

// Undoing the last grade (a misclick). The snapshot is valid until the next grade, leaving the session or restarting
// the app (the menu keeps the item "Undo last grade").
function offerUndo() {
  clearTimeout(undoTimer)
  undoUntil = undo ? Date.now() + SECONDS_TO_UNDO * 1000 : 0
  if (undo) {
    undoTimer = setTimeout(() => {
      undoUntil = 0
      if (ui.screen === 'card') refreshActions()
    }, SECONDS_TO_UNDO * 1000)
  }
  if (ui.screen === 'card') refreshActions()
}

export function undoGrade() {
  // The same guard as for revealing and grading: during the card fly-out the next step is already planned,
  // so an undo in this window would cut the session and save the state from before the grade as the end.
  if (busy) return
  if (!undo) return
  const s = undo
  const wasSkip = !!s.skippedId
  forgetUndo()
  if (s.card === undefined) delete state.karty[s.key]
  else state.karty[s.key] = s.card
  state.expRazem = s.expRazem
  state.streak = s.streak
  state.dzis = s.dzis
  state.historia = s.historia
  if (wasSkip) {
    const rest = { ...state.pominiete }
    delete rest[s.skippedId]
    state.pominiete = rest
  }
  session = s.session
  saveState()
  closeMenu()
  revealAtOnce = s.revealed
  showCard()
  // showCard resets the hint use, so we bring it back after it: otherwise undo would remove
  // the lowering of "Know" after a hint.
  hintUsed = s.hintUsed
  refreshActions()
  toast(wasSkip ? 'Skip undone.' : 'Last grade undone.')
}

// The card fly-out carries the result: it flies in the swipe direction, with a rotation. It adds the border color
// and a sign in the middle of the card, so with reduced motion the information stays whole (I: color and opacity
// instead of motion, times up to 80 ms).
function flyOut(grade, direction, then) {
  busy = true
  if (ui.actions) ui.actions = []
  stopPace()
  if (ui.screen === 'card') {
    // We do not reset the transform: the fly-out animation must start from where the card is under the finger.
    ui.swipeDirection = ''
    const c = ui.card
    c.entering = false
    c.dragging = false
    c.threshold = false
    c.swipe = ''
    c.flyOut = direction || 'quiet'
    if (grade) c.result = { tone: grade.tone, icon: grade.icon }
  }
  setTimeout(() => {
    busy = false
    then()
  }, reducedMotion() ? FLY_OUT_NO_MOTION_MS : FLY_OUT_MS)
}

export const daySummary = (now = new Date()) => study.daySummary(pickOptions(now))

// The badge on the icon (D2): the only passive hint that works without a server (iOS 16.4+ in a home screen app).
// No support must not throw an error, so an optional call in try/catch.
function refreshAppBadge(n) {
  try {
    if (n > 0) navigator.setAppBadge?.(n)
    else navigator.clearAppBadge?.()
  } catch {
    // a browser without the badge just does not show it
  }
}

// The gesture tutorial (A): once after an update, again from the menu ("Gestures"). A tap anywhere on the overlay
// closes it, so the first swipe of the user reaches the card only after it closes.
export function showTutorial() {
  if (ui.tutorial) return
  closeMenu()
  ui.tutorial = true
}

// The overlay goes away already on touch, so the first swipe closes it too. The click from the same tap
// would then reach the card below and reveal it, so we swallow it for 400 ms.
export function closeTutorialByTap(e) {
  if (!ui.tutorial) return
  e.preventDefault()
  closeTutorial()
  const swallow = (click) => {
    click.stopPropagation()
    click.preventDefault()
  }
  document.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 400)
}

function closeTutorial() {
  if (!ui.tutorial) return
  ui.tutorial = false
  // After the tutorial the caption "Tap to reveal" comes back for three cards.
  cardsWithTip = 0
  if (!state.ustawienia.samouczekGestow) {
    state.ustawienia = { ...state.ustawienia, samouczekGestow: true }
    saveState()
  }
}

// The session end screen (D): at most three numbers and buttons. No paragraphs, percent or points.
// The buttons are already the home screen, so after a session the user sees at once what to do next (E).
function sessionSummary(now) {
  const added = session.newWords || session.cleared
  const addedLabel = session.newWords ? plural(session.newWords, 'new word', 'new words') : plural(session.cleared, 'reviewed card', 'reviewed cards')
  const today = study.gradedToday(state.historia, now)
  const tomorrow = study.tomorrowForecast({
    words,
    cards: state.karty,
    settings: state.ustawienia,
    now,
    skipped: state.pominiete,
    disabledDecks: state.ustawienia.wylaczoneTalie,
  })
  return {
    title: session.training ? 'Training done' : 'Session done',
    size: tomorrow.bearable ? 'three' : 'two',
    numbers: [
      [added, addedLabel, 'solid'],
      [today, plural(today, 'card today', 'cards today')],
      tomorrow.bearable && [tomorrow.count, plural(tomorrow.count, 'card tomorrow', 'cards tomorrow')],
    ].filter(Boolean),
  }
}

function showSessionEnd() {
  const now = new Date()
  // A session counts to recovering the streak: two sessions within 48 h after a break give back the days before it.
  state.streak = study.countSession(state.streak, now).streak
  saveState()
  const summary = sessionSummary(now)
  vibrate('end')
  showHome(summary)
  if (ui.screen !== 'home') return
  // Session end celebration: 1.0-1.5 s, can be skipped with a tap at any moment.
  ui.celebrating = true
  skipCelebration = () => {
    clearTimeout(celebrationTimer)
    ui.celebrating = false
  }
  celebrationTimer = setTimeout(endCelebration, END_CELEBRATION_MS)
}

export function hasNewToIntroduce() {
  const disabled = study.disabledSet(state.ustawienia.wylaczoneTalie)
  return words.some((w) => {
    if (study.isSkipped(state.pominiete, w.id)) return false
    if (disabled.has(study.deckOfWord(w))) return false
    const en = state.karty[study.cardKey(w.id, 'en')]
    if (study.isNew(en)) return true
    return state.ustawienia.mowienie && study.speakingUnlocked(en) && study.isNew(state.karty[study.cardKey(w.id, 'pl')])
  })
}

export function addNewToday() {
  closeMenu()
  const today = study.todayState(state.dzis)
  state.dzis = { ...today, dodatkoweNowe: today.dodatkoweNowe + study.EXTRA_NEW }
  saveState()
  startSession()
  if (ui.screen !== 'card') toast('No new words to introduce.')
}

// The home screen (E): the whole deck bar with one number, three big buttons and the menu in the corner. It shows
// after a session, after leaving study and when there is nothing to review.
export function showHome(summary = null) {
  forgetUndo()
  session = null
  if (!words.length) {
    showNoWords()
    return
  }
  const now = new Date()
  refreshCatchUp(now)
  const day = daySummary(now)
  refreshAppBadge(day.toDo)
  const p = deckProgress()
  showScreen('home', { summary, progress: p, hasCards: day.toDo > 0 })
}

function showNoWords() {
  session = null
  showScreen('no-words')
}

// Habit anchor (D1): a sentence saved in settings, changed only in the menu.
export function setAnchor(text) {
  state.ustawienia = { ...state.ustawienia, kotwica: text }
  saveState()
  refreshMenu()
  toast(text ? study.anchorSentence(text) : 'No anchor. You can set it in Menu > Settings.')
}

// Own anchor through a prompt: the same tool as for resetting a word's progress, so we do not add
// a separate text field.
export function ownAnchor() {
  const text = prompt('When do you study? Finish the sentence "You study ..."', state.ustawienia.kotwica || '')
  if (text === null) return
  setAnchor(text.trim().slice(0, study.MAX_ANCHOR_CHARS))
}

// Banners: only on the home screen and in the menu, never during a card.

export function backupNeeded() {
  if (!Object.keys(state.karty).length) return false
  if (!state.ostatniaKopia) return true
  return daysSince(state.ostatniaKopia) >= DAYS_TO_BACKUP_REMINDER
}

// Menu

export function changeSetting(field, value) {
  state.ustawienia = { ...state.ustawienia, [field]: value }
  saveState()
  refreshMenu()
}

// Decks (H): the switch "study this deck" and removing a whole deck with its progress. A turned off deck
// leaves study, but its cards stay untouched in the save, so coming back costs nothing.

const disabledDecks = () => state.ustawienia.wylaczoneTalie || []

export function toggleDeck(name, enabled) {
  const others = disabledDecks().filter((n) => n !== name)
  changeSetting('wylaczoneTalie', enabled ? others : [...others, name])
  refreshBar()
  if (ui.screen === 'home') showHome()
  if (!enabled && !study.deckList({ words, cards: state.karty, disabledDecks: disabledDecks() }).some((d) => d.enabled)) {
    toast('You are not studying any deck now.', 'important')
  }
}

export async function removeDeck(name) {
  const result = study.withoutDeck({ words, cards: state.karty, skipped: state.pominiete }, name)
  const wordCount = count(result.removedWords, 'word', 'words')
  const cardCount = count(result.removedCards, 'progress card', 'progress cards')
  if (!confirm(`Remove the deck "${name}"? You will lose ${wordCount} and ${cardCount}.`)) return
  if (!(await ensureLibrary())) {
    toast('The saved deck did not load, so removing could overwrite it. Close and open the app.', 'error')
    return
  }
  const library = { words: result.words, decks: decks.filter((d) => d.nazwa !== name) }
  try {
    await database.saveLibrary(library)
  } catch (error) {
    toast(`Could not remove the deck: ${errorText(error)}`, 'error')
    return
  }
  setLibrary(library)
  state.karty = result.cards
  state.pominiete = result.skipped
  state.ustawienia = { ...state.ustawienia, wylaczoneTalie: disabledDecks().filter((n) => n !== name) }
  saveState()
  refreshBar()
  refreshMenu()
  toast(`Deck "${name}" removed.`)
  if (!words.length) {
    closeMenu()
    showNoWords()
  } else if (ui.screen === 'home') {
    showHome()
  }
}

// The word list: actions on a single word.

export function knownFromList(word) {
  const key = study.cardKey(word.id, 'en')
  if (!study.isNew(state.karty[key])) return
  const now = new Date()
  try {
    state.karty[key] = gradedCard(newFsrsCard(now.toISOString()), 4, now, key)
  } catch (error) {
    toast(`Could not grade the card: ${errorText(error)}`, 'error')
    return
  }
  // A grade outside a session: the undo snapshot applies only to a session, so it is no longer valid.
  forgetUndo()
  const earned = study.XP_PER_GRADE[4]
  state.expRazem += earned
  state.streak = study.countDay(state.streak, now).streak
  state.historia = study.addToHistory(state.historia, { ratings: 1, newCards: 1, xp: earned }, now)
  saveState()
  refreshBar()
  refreshMenu()
  toast(`"${word.w}" marked as known.`)
}

export function resetWord(word) {
  if (!confirm(`Reset the progress of "${word.w}" in both directions?`)) return
  forgetUndo()
  const keys = [study.cardKey(word.id, 'en'), study.cardKey(word.id, 'pl')]
  state.historia = study.removeNew(
    state.historia,
    keys.map((k) => state.karty[k]?.wprowadzono),
  )
  for (const k of keys) delete state.karty[k]
  saveState()
  refreshBar()
  refreshMenu()
  toast(`Progress of "${word.w}" reset.`)
}

export function reportError(word) {
  if (state.zgloszenia.some((r) => r.id === word.id)) {
    toast(`"${word.w}" is already reported.`)
    return
  }
  state.zgloszenia = [...state.zgloszenia, { id: word.id, w: word.w, pl: word.pl, kiedy: new Date().toISOString() }]
  saveState()
  refreshMenu()
  toast(`Reported "${word.w}".`)
}

// "Skip" from the word list: the word leaves study, its cards stay untouched.
export function skipFromList(word) {
  if (study.isSkipped(state.pominiete, word.id)) return
  const first = !Object.keys(state.pominiete).length
  state.pominiete = { ...state.pominiete, [word.id]: study.localDate() }
  saveState()
  refreshBar()
  refreshMenu()
  toast(first ? SKIP_TIP : `"${word.w}" removed.`, first ? 'important' : '')
}

// A skipped word comes back to study exactly where it was: the cards were not touched, so it is enough to take it off the list.
export function restoreWord(word) {
  if (!study.isSkipped(state.pominiete, word.id)) return
  const rest = { ...state.pominiete }
  delete rest[word.id]
  state.pominiete = rest
  saveState()
  refreshBar()
  refreshMenu()
  toast(`"${word.w}" is back in study.`)
}

export async function copyReports() {
  const text = JSON.stringify(state.zgloszenia, null, 2)
  try {
    await navigator.clipboard.writeText(text)
    toast('List copied to the clipboard.')
  } catch (error) {
    // The clipboard is sometimes not available without HTTPS or without permission: then a text to copy by hand.
    ui.reportsText = text
    toast(`Clipboard not available (${errorText(error)}). Copy the selected text.`, 'important')
  }
}

export function clearReports() {
  if (!confirm(`Remove ${count(state.zgloszenia.length, 'report', 'reports')}?`)) return
  state.zgloszenia = []
  saveState()
  refreshMenu()
}

export function showGuide() {
  closeMenu()
  ui.guide = true
}

export function closeGuide() {
  ui.guide = false
}

export function openMenu() {
  ui.reportsText = ''
  ui.menu = true
  touch()
  checkOffline()
}

export function closeMenu() {
  ui.menu = false
}

// Offline and updates

function askWorker(worker, message) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timeout = setTimeout(() => reject(new Error('the service worker does not answer')), 4000)
    channel.port1.onmessage = (e) => {
      clearTimeout(timeout)
      resolve(e.data)
    }
    worker.postMessage(message, [channel.port2])
  })
}

async function checkOffline() {
  const controller = navigator.serviceWorker?.controller
  if (controller) {
    try {
      ui.offline = await askWorker(controller, 'status')
    } catch (error) {
      ui.offline = { error: errorText(error) }
    }
  } else {
    ui.offline = null
  }
  refreshBadge()
  touch()
}

function markNewVersion() {
  ui.newVersion = true
  refreshMenu()
}

export function applyUpdate() {
  const waiting = registration?.waiting
  if (!waiting) {
    location.reload()
    return
  }
  waitingForUpdate = true
  waiting.postMessage('update')
  // If controllerchange does not come, a reload loads the new version anyway or shows the banner again.
  setTimeout(() => location.reload(), 4000)
}

export async function checkForUpdate() {
  if (!registration) {
    toast('The service worker is not registered.', 'error')
    return
  }
  try {
    await registration.update()
    toast(registration.installing || registration.waiting ? 'Downloading the new version…' : 'You have the latest version.')
  } catch (error) {
    toast(`Could not check (no internet?): ${errorText(error)}`, 'error')
  }
}

// The service worker always lives at the app base address (/magic-mini-fiszki/sw.js), as in the version without
// a framework, so a phone with the installed app updates the same registration instead of making a new one.
export function registerWorker() {
  if (!('serviceWorker' in navigator)) {
    refreshBadge()
    return
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (waitingForUpdate) location.reload()
    else checkOffline()
  })
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .then((reg) => {
      registration = reg
      if (reg.waiting && navigator.serviceWorker.controller) markNewVersion()
      reg.addEventListener('updatefound', () => {
        const incoming = reg.installing
        incoming?.addEventListener('statechange', () => {
          if (incoming.state === 'installed' && navigator.serviceWorker.controller) markNewVersion()
          else if (incoming.state === 'activated') checkOffline()
        })
      })
      return checkOffline()
    })
    .catch((error) => {
      ui.offline = { error: errorText(error) }
      refreshBadge()
      touch()
      setMessage('worker', `Offline mode not available: ${errorText(error)}`)
    })
}

// Backup

// No await before saveBackup: iOS shows the share sheet only right after a tap.
export async function makeBackup() {
  if (!libraryLoaded) {
    toast('The word deck did not load, so the backup would be incomplete. Close and open the app.', 'error')
    return
  }
  try {
    const result = await storage.saveBackup(state, { words, decks })
    if (result === 'cancelled') return
    state.ostatniaKopia = new Date().toISOString()
    saveState()
    // The share sheet does not say if the file was really saved, so we ask to check.
    toast(result === 'shared' ? 'Check in Files that the backup was saved.' : 'Backup file downloaded. Check that it is in your downloads.', 'important')
  } catch (error) {
    toast(`Could not save the backup: ${errorText(error)}`, 'error')
  }
  refreshMenu()
}

export async function loadBackup(file) {
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    toast('This file is not a valid JSON file.', 'error')
    return
  }
  const result = storage.validateBackup(data)
  if (!result.ok) {
    toast(`Backup not loaded: ${result.error}`, 'error')
    return
  }
  if (!(await ensureLibrary())) return
  const describeState = (s, wordCount) => `${count(wordCount, 'word', 'words')}, ${Object.keys(s.karty).length} cards, ${s.expRazem} points`
  const broken = result.skipped ? `\n\n${skippedCardsText(result.skipped)} from the backup.` : ''
  const question =
    `Load the backup (${describeState(result.state, result.library.words.length)}) into the current state (${describeState(state, words.length)})?\n\n` +
    'Progress from the backup will be joined with the current one; newer reviews stay. Words not in the backup stay in the deck, ' +
    `and the current state is also kept as an emergency copy on the phone.${broken}`
  if (!confirm(question)) return
  try {
    storage.keepBeforeLoad()
  } catch (error) {
    if (!confirm(`Could not make an emergency copy of the current state (${errorText(error)}). Load the backup anyway?`)) return
  }
  // The deck from the backup in its order, words not in the backup stay at the end. First the deck, then progress:
  // if saving the deck fails, nothing changes.
  const ids = new Set(result.library.words.map((w) => w.id))
  const names = new Set(result.library.decks.map((d) => d.nazwa))
  const library = {
    words: [...result.library.words, ...words.filter((w) => !ids.has(w.id))],
    decks: [...result.library.decks, ...decks.filter((d) => !names.has(d.nazwa))],
  }
  try {
    await database.saveLibrary(library)
  } catch (error) {
    toast(`Could not save the deck: ${errorText(error)}. The backup was not loaded.`, 'error')
    return
  }
  setLibrary(library)
  state = storage.mergeStates(state, result.state)
  saveState()
  closeMenu()
  closeAddWords()
  session = null
  showHome()
  if (result.skipped) toast(`Backup joined with the current progress. ${skippedCardsText(result.skipped)}.`, 'error')
  else toast('Backup joined with the current progress.')
}

// Adding words

export function showAddWords() {
  closeMenu()
  importSource = null
  importResult = null
  deckNameByHand = false
  clearTimeout(previewTimer)
  ui.pasted = ''
  ui.deckName = ''
  ui.fileInfo = ''
  ui.preview = null
  ui.addDisabled = true
  ui.addLabel = 'Add'
  ui.addError = ''
  ui.addWordsNr += 1
  ui.addWords = true
}

export function closeAddWords() {
  clearTimeout(previewTimer)
  ui.addWords = false
  importSource = null
  importResult = null
  deckNameByHand = false
}

// Pasted text: the preview comes 350 ms after typing stops.
export function pastedChanged() {
  importSource = null
  ui.fileInfo = ''
  clearTimeout(previewTimer)
  previewTimer = setTimeout(previewImport, 350)
}

export function deckNameChanged() {
  deckNameByHand = true
}

// The name from the field, and when it is empty, the one found in the file or the paste.
export const importDeckName = () => ui.deckName.trim().slice(0, study.MAX_DECK_NAME_CHARS) || ui.preview?.name || ''

// A preview before saving: how many new, how many updated, which lines have errors.
function previewImport() {
  if (!ui.addWords) return
  const text = importSource ? importSource.text : ui.pasted
  importResult = null
  ui.addDisabled = true
  ui.addError = ''
  if (!text.trim()) {
    ui.preview = null
    return
  }
  const r = parsePasted(text)
  if (r.generalError) {
    ui.preview = { error: r.generalError }
    return
  }
  importResult = r
  if (!deckNameByHand) ui.deckName = r.name
  const name = ui.deckName.trim().slice(0, study.MAX_DECK_NAME_CHARS) || r.name || ''
  const m = merge(words, wordsForDeck(r, name))
  const numbers = [`${m.added} new`, `${m.updated} updated`, count(r.errors.length, 'error', 'errors')]
  ui.preview = {
    name: r.name,
    summary: numbers.join(', '),
    rest: m.unchanged ? ` · unchanged: ${m.unchanged}` : '',
    errors: r.errors.slice(0, MAX_ERRORS_IN_PREVIEW).map((e) => `${capitalize(r.unit)} ${e.nr}: ${e.error}`),
    more: Math.max(0, r.errors.length - MAX_ERRORS_IN_PREVIEW),
    nothingToAdd: !m.added && !m.updated,
  }
  ui.addDisabled = !(m.added || m.updated)
}

export async function loadWordsFile(file) {
  if (!ui.addWords) showAddWords()
  ui.fileInfo = `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`
  ui.preview = { loading: true }
  ui.addError = ''
  ui.addDisabled = true
  try {
    const text = await file.text()
    // One frame to draw the message, before a big file takes the thread for parsing.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    if (!ui.addWords) return
    importSource = { text, name: file.name }
    ui.pasted = ''
    previewImport()
  } catch (error) {
    ui.preview = { error: `Could not read the file: ${errorText(error)}` }
  }
}

export async function addWords() {
  if (!importResult || savingWords) return
  const r = importResult
  const showError = (text) => {
    ui.addDisabled = false
    ui.addLabel = 'Add'
    ui.addError = text
  }
  savingWords = true
  ui.addDisabled = true
  ui.addLabel = 'Saving…'
  try {
    if (!(await ensureLibrary())) {
      showError('The saved deck did not load, so adding could overwrite it. Close and open the app.')
      return
    }
    // Merging is counted again on the current deck, in case it changed since the preview.
    const name = importDeckName()
    const m = merge(words, wordsForDeck(r, name))
    const library = { words: m.words, decks: addDeck(decks, { name, source: r.source }) }
    try {
      await database.saveLibrary(library)
    } catch (error) {
      showError(`Could not save the words on the phone: ${errorText(error)}`)
      return
    }
    setLibrary(library)
    closeAddWords()
    toast(`Added: ${m.added} new, ${m.updated} updated.`)
    if (ui.screen === 'no-words' || ui.screen === 'home') showHome()
  } finally {
    savingWords = false
  }
}

// Global events

// Keyboard shortcuts copy the four swipes: arrows in four directions, space reveals, `z` is "Already know".
export function onKey(e) {
  if (e.target.closest?.('textarea, input')) return
  if (e.key === 'Escape') {
    const somethingOpen = ui.tutorial || ui.menu || ui.guide || ui.addWords
    endCelebrations()
    closeTutorial()
    closeMenu()
    closeGuide()
    if (ui.addWords) closeAddWords()
    // When nothing was open, Escape on the study screen ends study - the same as the cross on the card.
    if (!somethingOpen && ui.screen === 'card') exitToHome()
    return
  }
  if (ui.tutorial) {
    closeTutorial()
    return
  }
  if (ui.menu || ui.guide || ui.addWords || ui.screen !== 'card') return
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    reveal()
  } else if (e.key === 'ArrowRight') gradeCard(3)
  else if (e.key === 'ArrowLeft') gradeCard(1)
  else if (e.key === 'ArrowUp') gradeCard(2)
  // The down arrow does the same as a swipe down (trash), and Escape ends study - like the cross on the card.
  else if (e.key === 'ArrowDown') skipCurrent()
  else if (e.key === 'z' || e.key === 'Z') gradeCard(4)
}

export function onVisibilityChange() {
  if (document.visibilityState !== 'visible') {
    // The badge on the icon is set when leaving the app: the number of cards waiting for today.
    if (words.length) refreshAppBadge(daySummary().toDo)
    return
  }
  // A home screen app can hang in the background for days: a new day means a new day copy and a new session.
  storage.dailyCopy()
  refreshBar()
  registration?.update().catch(() => {})
  checkOffline()
}

// A one-time migration: cards graded in bulk ("Already know" after 8 days) would come back on one day in a big wave,
// so at the first start after the update their due dates get a stronger spread.
function spreadOldDueDates() {
  if (state.rozproszono === 1) return
  const { cards, moved } = study.spreadDueDates(state.karty)
  state.karty = cards
  state.rozproszono = 1
  saveState()
  if (moved) toast('Due dates spread over a few days, so they do not come back at once.', 'important')
}

async function run() {
  const { state: loaded, warning, skipped } = storage.load()
  state = loaded
  setMessage('load', warning)
  if (skipped) toast(`${skippedCardsText(skipped)}.`, 'error')
  storage.dailyCopy()
  spreadOldDueDates()
  storage.askForPersistence().then((result) => {
    ui.persistent = result
  })
  refreshBar()
  refreshBadge()
  // The deck loads before the first card is drawn.
  await ensureLibrary()
  // The collision index too, because the first session is built right after the start and without it would let in
  // new words that collide with freshly introduced ones. After the first count it lives in IndexedDB.
  await prepareCollisions().catch(() => {})
  document.documentElement.dataset.ready = '1'
  // The app opens at once on a card (E). The home screen shows only when there is nothing to review.
  if (words.length) {
    startSession()
    return
  }
  showNoWords()
  if (libraryLoaded) showAddWords()
}

export function start() {
  run().catch((error) => {
    document.documentElement.dataset.ready = '1'
    showScreen('start-error', { text: errorText(error) })
  })
}
