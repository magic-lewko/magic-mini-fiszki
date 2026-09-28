// Study logic without DOM: building a session, daily limits, review cap, catch-up mode, streak, history and stats.
// It does not import fsrs.mjs: the caller passes the `recall` function (used for card urgency).
// A card key is `${id}|en` (you see EN, recall PL) or `${id}|pl` (you see PL, say EN).
//
// Saved data keeps its Polish field names (cards, settings, streak, history, words), because this is the format
// stored on the phone and the format of lib/fsrs.mjs, which is shared with another app. Only names in code are English.

// The same states as STANY in lib/fsrs.mjs. A test checks that they stay in sync.
export const CARD_STATES = ['nowa', 'nauka', 'powtorka', 'ponowna']

// The speaking card unlocks when the EN card stability is >= 4 days OR after two "Know" grades in a row.
// Production (PL -> EN) is the main direction for the goal "to speak", so there is no point in delaying it.
export const SPEAKING_STABILITY_MIN = 4
export const SPEAKING_STREAK_MIN = 2
// Unlocked speaking cards have their own daily limit, separate from the new words limit.
export const MAX_UNLOCKS_PER_DAY = 12
export const GAP_AFTER_MISTAKE = 4
// Grades: 1 "Don't know", 2 "Almost", 3 "Know", 4 "Already know" (only for a new card).
export const XP_PER_GRADE = { 1: 10, 2: 30, 3: 50, 4: 20 }
// "Already know" on a new card is a single check in about 45 days. Plain FSRS would give about 8 days after
// grade 4, so a hundred A1 words marked in three days would come back in one wave.
export const KNOWN_DAYS = 45
export const MAX_CARD_SECONDS = 20
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
// One word is two cards here, and the target is 7-10 reviews per day: 20 new words is already about 200 reviews.
export const NEW_PER_DAY_OPTIONS = [5, 8, 10, 15, 20, 30]
// Daily review cap. 0 means "no limit". It applies to due cards, new cards have their own limit.
export const REVIEW_CAP_OPTIONS = [40, 60, 100, 0]
export const SESSION_LENGTH_OPTIONS = [10, 15, 20]
export const DAILY_GOAL_OPTIONS = [30, 60, 100, 150]
export const EXTRA_NEW = 10
// Saved setting values, kept as they are stored on the phone: none, length, first letter.
export const HINT_LEVELS = ['brak', 'dlugosc', 'litera']
// An EN card with stability of at least 21 days counts as mastered (a separate stat).
export const MASTERED_DAYS = 21
// A word is solid when its EN card has stability of at least 30 days. You cannot click your way there:
// stability grows only with time and correct answers. A card after "Already know" has about 8 days.
export const SOLID_DAYS = 30
export const HISTORY_DAYS = 180
export const HEATMAP_DAYS = 30
export const RECENT_DAYS = 30
export const PACE_DAYS = 14
export const MAX_RESULTS = 50

// Catch-up mode after a break: it starts when the backlog is over 2x the cap and ends below the cap.
export const CATCH_UP_FACTOR = 2
export const CATCH_UP_MULTIPLIER = 1.5
export const HALF_NEW_DAYS = 3

// Streak: one graded card keeps the day (the daily goal is separate and optional).
export const STREAK_MIN_CARDS = 1
export const DAYS_PER_FREEZE = 7
export const MAX_FREEZES = 2
export const RECOVERY_HOURS = 48
export const RECOVERY_SESSIONS = 2
export const DAYS_BETWEEN_RECOVERIES = 30

// A hint on the speaking card as a desirable difficulty: the button shows up only after 7 seconds,
// and using the hint lowers a "Know" grade.
export const HINT_DELAY_SECONDS = 7

// Interference: a new word waits when a similar word is fresh or still being learned.
export const INTERFERENCE_DAYS = 7

// Leeches (hard words): after 6 mistakes the card gets a one-time panel with three choices.
export const LEECH_MISTAKES = 6
export const LEECH_POSTPONE_DAYS = 21

// Combo: grades other than "Don't know" in a row within a session. Every fifth one flashes the screen edge.
export const COMBO_EVERY = 5
export const XP_PER_COMBO = 10

// Habit anchor (implementation intention): an event cue, not a clock time.
// Gollwitzer and Sheeran 2006 (d = 0.65 in 94 tests), Stawarz et al. 2015 (an event builds a habit
// better than a time reminder). An empty text means "off".
export const HABIT_ANCHORS = ['after coffee', 'after brushing teeth', 'on the way', 'before sleep']
// Anchors saved by the Polish version of the app: they read as the English ones above.
export const OLD_HABIT_ANCHORS = { 'po kawie': 'after coffee', 'po umyciu zębów': 'after brushing teeth', 'w drodze': 'on the way', 'przed snem': 'before sleep' }
export const MAX_ANCHOR_CHARS = 40

// A deck name (H) is text from the user, so it has the same limit as the habit anchor.
export const MAX_DECK_NAME_CHARS = 40

// "What next" forecast on the session end screen. We show the number only when it is bearable: otherwise
// it turns into debt, and that is the most common reason to give up reviews.
export const BEARABLE_TOMORROW = 60

export const DEFAULT_SETTINGS = {
  noweDziennie: 10,
  maksPowtorekDziennie: 60,
  dlugoscSerii: 15,
  autowymowa: true,
  mowienie: true,
  celDzienny: 60,
  podpowiedzMowienie: 'brak',
  kotwica: '',
  // The gesture tutorial shows once after an update; it can be opened again from the menu ("Gestures").
  samouczekGestow: false,
  // Names of decks turned off for study (H). Empty list by default, so nothing changes.
  wylaczoneTalie: [],
}

// Anchor sentence. An empty anchor (or only spaces) gives an empty text, so the screen just does not draw it.
export function anchorSentence(anchor) {
  const text = String(anchor ?? '').trim()
  if (!text) return ''
  return `You study ${text}.`
}

const twoDigits = (n) => String(n).padStart(2, '0')

// The day boundary follows the phone clock, not UTC: in Poland UTC would move midnight to 1:00 or 2:00.
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`
}

export function dayBefore(date) {
  const [y, m, d] = date.split('-').map(Number)
  return localDate(new Date(y, m - 1, d - 1))
}

export const cardKey = (id, direction) => `${id}|${direction}`

export function splitKey(key) {
  const i = key.lastIndexOf('|')
  return { id: key.slice(0, i), direction: key.slice(i + 1) }
}

// Whichever comes first: EN card stability >= 4 days or two "Know" grades (3 or 4) in a row.
export function speakingUnlocked(enCard) {
  if (!enCard || enCard.stan === 'nowa') return false
  if (enCard.stan === 'powtorka' && enCard.stabilnosc >= SPEAKING_STABILITY_MIN) return true
  return (enCard.kolejneUmiem || 0) >= SPEAKING_STREAK_MIN
}

// Count of "Know" grades in a row on a card: any other grade resets it. It is kept in the card, because
// only this number shows progress towards unlocking speaking.
export const knowStreak = (card, grade) => (grade >= 3 ? (card?.kolejneUmiem || 0) + 1 : 0)

export const isNew = (card) => !card || card.stan === 'nowa'

export function withDefaultSettings(settings) {
  return { ...DEFAULT_SETTINGS, ...settings }
}

// Skipped words ("Skip"): a map { id: 'YYYY-MM-DD' }. The word leaves study, but its cards stay in memory,
// so "Restore" puts them back at exactly the same place in the schedule.
export const isSkipped = (skipped, id) => !!skipped?.[id]

// Decks (H): a word without the `talia` field belongs to the deck with this name, so every word has a switch.
export const UNTITLED_DECK = 'Untitled'
// The name the Polish version used for such a deck. It can be saved in the list of turned off decks.
export const OLD_UNTITLED_DECK = 'Bez nazwy'
export const deckOfWord = (word) => word?.talia || UNTITLED_DECK
export const disabledSet = (disabledDecks) => new Set(Array.isArray(disabledDecks) ? disabledDecks : [])
export const isDisabled = (disabledDecks, name) => disabledSet(disabledDecks).has(name)

// Set of word ids that can go into a session: everything except skipped words and turned off decks.
// This is the only place where both blocks are checked, so no card picking path can skip them.
function availableIds(words, skipped, disabledDecks) {
  const disabled = disabledSet(disabledDecks)
  const ids = new Set()
  for (const w of words) {
    if (isSkipped(skipped, w.id)) continue
    if (disabled.size && disabled.has(deckOfWord(w))) continue
    ids.add(w.id)
  }
  return ids
}

// Due date fuzz

export const MIN_FUZZ_DAYS = 3
export const MAX_FUZZ_DAYS = 21
export const SPREAD_STRENGTH = 0.25
const DAY = 86400000

// FNV-1a 32 bit: the same key and the same due date always give the same shift, so a grade result is
// repeatable and testable (no Math.random).
function hash32(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

// Moves the due date by +/- `strength` of the interval (at most 21 days), so cards graded on the same day
// do not come back in a pile. Due dates closer than 3 days stay as they are: fuzz there would break short learning steps.
export function fuzzDue(key, dueIso, now = new Date(), strength = 0.08) {
  const due = Date.parse(dueIso)
  if (!Number.isFinite(due)) return dueIso
  const time = now.getTime()
  const interval = due - time
  if (interval < MIN_FUZZ_DAYS * DAY) return dueIso
  // A fraction -1..1 from the hash of the key and due date; the due date in the hash gives the same word
  // a different fuzz after each grade.
  const fraction = (hash32(`${key}|${dueIso}`) / 4294967295) * 2 - 1
  const max = Math.min(interval * strength, MAX_FUZZ_DAYS * DAY)
  const moved = Math.max(due + fraction * max, time + DAY)
  return new Date(Math.round(moved / 60000) * 60000).toISOString()
}

// One-time spread of due dates that are already saved. New cards, due cards and cards closer than 3 days
// stay untouched. Returns the new cards and the number of cards that really moved.
export function spreadDueDates(cards, now = new Date()) {
  const result = {}
  let moved = 0
  for (const [key, card] of Object.entries(cards)) {
    const due = card.stan === 'nowa' ? card.termin : fuzzDue(key, card.termin, now, SPREAD_STRENGTH)
    if (due === card.termin) {
      result[key] = card
      continue
    }
    result[key] = { ...card, termin: due }
    moved += 1
  }
  return { cards: result, moved }
}

// Card after "Already know": one check in about KNOWN_DAYS days instead of the normal study cycle.
// Stability stays as FSRS gave it: the word has not passed any review yet, so it must not count
// as solid. After this check the card goes back to the normal cycle with a real history.
export function knownCard(card, key, now = new Date()) {
  const due = new Date(now.getTime() + KNOWN_DAYS * DAY).toISOString()
  return { ...card, stan: 'powtorka', krok: 0, termin: fuzzDue(key, due, now) }
}

// Progress of the whole deck: the only progress indicator in the app.
// The bar fill is known words (the EN card is not new), the lighter part inside is solid words
// (stability of at least SOLID_DAYS days). Skipped words count too: knowledge stays knowledge,
// and "Skip" only says there is no point in reviewing them.
export function deckProgress({ words, cards, disabledDecks }) {
  const disabled = disabledSet(disabledDecks)
  let known = 0
  let solid = 0
  let total = 0
  for (const w of words) {
    if (disabled.size && disabled.has(deckOfWord(w))) continue
    total += 1
    const en = cards[cardKey(w.id, 'en')]
    if (isNew(en)) continue
    known += 1
    if (en.stabilnosc >= SOLID_DAYS) solid += 1
  }
  return {
    known,
    solid,
    total,
    knownRatio: total ? known / total : 0,
    solidRatio: total ? solid / total : 0,
  }
}

// Answer time as a signal (C). Counted from revealing the card to the grade: 0-3 s fast, 3-8 s medium,
// over 8 s slow. The card border changes color in this rhythm, with no numbers and no ticking.
export const MEDIUM_PACE_SECONDS = 3
export const SLOW_PACE_SECONDS = 8
export const PACES = ['fast', 'medium', 'slow']

export function answerPace(seconds) {
  const s = Math.max(Number(seconds) || 0, 0)
  if (s >= SLOW_PACE_SECONDS) return 'slow'
  if (s >= MEDIUM_PACE_SECONDS) return 'medium'
  return 'fast'
}

// Over 8 s a "Know" is saved as a weaker hit (grade 2 in FSRS): an answer after such a long search is not
// knowledge ready to use. This happens quietly - the user only sees the border color.
// It does not apply to the first exposure of a word (new card) or to training, because time means nothing there.
export function gradeAfterTime({ grade, seconds = 0, isNew = false, training = false }) {
  if (grade !== 3 || isNew || training) return { grade, lowered: false }
  if (answerPace(seconds) !== 'slow') return { grade, lowered: false }
  return { grade: 2, lowered: true }
}

// Median of answer times from a day. An empty list gives 0, so stats do not have to check for null.
export function median(numbers) {
  const list = [...(numbers || [])].filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (!list.length) return 0
  const middle = Math.floor(list.length / 2)
  const result = list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2
  return Math.round(result * 10) / 10
}

// Swipes in four directions (A). The card follows the finger on both axes, and the direction is set only when
// a threshold is crossed: 90 px horizontally, 80 px vertically, or a fast flick (a move over 30 px with a speed
// over FLICK_SPEED px/ms). The axis that crossed its threshold "more" wins, so a diagonal move does not flicker.
export const SWIPE_X = 90
export const SWIPE_Y = 80
export const FLICK_SPEED = 0.6
export const FLICK_MIN_DISTANCE = 30
// Below this move, lifting the finger counts as a tap, so a small hand shake still reveals the card.
export const MOVE_THRESHOLD = 14
// A second tap in this window undoes the grade. The first tap works at once and waits for nothing.
export const DOUBLE_TAP_MS = 280

export const DIRECTIONS = ['right', 'left', 'up', 'down']
// Right "Know", left "Don't know", up "Almost" (the word came back, but with doubt). Down is the trash -
// a word you surely know leaves study. Grade 2 also comes quietly: after an answer over 8 s
// and after using a hint.
export const SWIPE_GRADES = { right: 3, left: 1, up: 2 }
export const TRASH_SWIPE = 'down'

export const gradeFromSwipe = (direction) => SWIPE_GRADES[direction] ?? null

export function swipeDirection({ dx = 0, dy = 0, vx = 0, vy = 0 } = {}) {
  const distX = Math.abs(dx)
  const distY = Math.abs(dy)
  const flickX = distX > FLICK_MIN_DISTANCE && Math.abs(vx) > FLICK_SPEED
  const flickY = distY > FLICK_MIN_DISTANCE && Math.abs(vy) > FLICK_SPEED
  const powerX = flickX ? Math.max(distX / SWIPE_X, 1) : distX / SWIPE_X
  const powerY = flickY ? Math.max(distY / SWIPE_Y, 1) : distY / SWIPE_Y
  if (powerX < 1 && powerY < 1) return ''
  if (powerX >= powerY) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

// Every swipe works at once, also on a hidden card: a word you know ends with one move,
// without a tap to reveal.
export function swipeAllowed(direction) {
  return !!direction
}

// The day state (study seconds, extra new cards, reviews done) resets at local midnight.
export function todayState(today, now = new Date()) {
  const date = localDate(now)
  if (today?.data === date) return { powtorki: 0, ...today }
  return { data: date, sekundy: 0, dodatkoweNowe: 0, powtorki: 0 }
}

// How many cards were introduced today (first grade), separately for both directions.
export function newToday(cards, now = new Date()) {
  const date = localDate(now)
  const result = { en: 0, pl: 0 }
  for (const [key, card] of Object.entries(cards)) {
    if (!card.wprowadzono) continue
    if (localDate(new Date(card.wprowadzono)) !== date) continue
    if (key.endsWith('|pl')) result.pl += 1
    else result.en += 1
  }
  return result
}

// Catch-up mode after a break (A2). It starts by itself when the backlog is over 2x the cap: then new words stop
// and the review limit grows to 1.5x the cap. It ends when the backlog drops below the cap, and for three days
// (counting the day it ends) lets in half of the new words. Without a cap the mode makes no sense and does not start.
export const EMPTY_CATCH_UP = { aktywne: 0, polowaDo: '' }

export const withDefaultCatchUp = (c) => ({
  aktywne: c?.aktywne === 1 ? 1 : 0,
  polowaDo: typeof c?.polowaDo === 'string' ? c.polowaDo : '',
})

export function nextCatchUp(previous, dueCount, settings, now = new Date()) {
  const c = withDefaultCatchUp(previous)
  const cap = withDefaultSettings(settings).maksPowtorekDziennie
  if (!(cap > 0)) return c.aktywne ? { ...c, aktywne: 0 } : c
  if (dueCount > CATCH_UP_FACTOR * cap) return c.aktywne ? c : { ...c, aktywne: 1 }
  if (!c.aktywne) return c
  if (dueCount >= cap) return c
  return { aktywne: 0, polowaDo: shiftDay(now, HALF_NEW_DAYS - 1) }
}

// 0 in catch-up mode, 0.5 for three days after it ends, 1 otherwise.
export function newCardFactor(catchUp, now = new Date()) {
  const c = withDefaultCatchUp(catchUp)
  if (c.aktywne) return 0
  if (c.polowaDo && localDate(now) <= c.polowaDo) return 0.5
  return 1
}

// How many due cards can still be shown today. Cards over the cap move to the next days by themselves:
// FSRS handles overdue cards, so nothing has to be recalculated.
export function reviewBudget({ settings, today, now = new Date(), catchUp }) {
  const cap = withDefaultSettings(settings).maksPowtorekDziennie
  if (!(cap > 0)) return Infinity
  const factor = withDefaultCatchUp(catchUp).aktywne ? CATCH_UP_MULTIPLIER : 1
  return Math.max(0, Math.round(cap * factor) - (todayState(today, now).powtorki || 0))
}

function newCardLimits({ cards, settings, today, now, catchUp }) {
  const s = withDefaultSettings(settings)
  const day = todayState(today, now)
  // "+10 new today" is a deliberate choice of the user, so the catch-up factor does not apply to it.
  const limit = Math.round(s.noweDziennie * newCardFactor(catchUp, now)) + (day.dodatkoweNowe || 0)
  const introduced = newToday(cards, now)
  return {
    en: Math.max(0, limit - introduced.en),
    pl: s.mowienie ? Math.min(Math.max(0, limit - introduced.pl), Math.max(0, MAX_UNLOCKS_PER_DAY - introduced.pl)) : 0,
  }
}

// A due date that cannot be read counts as overdue, so the card never gets stuck.
const dueTime = (card) => Date.parse(card.termin) || 0

// Card urgency is the recall chance R(t, S) from lib/fsrs.mjs: the lower, the closer to forgetting.
// The caller passes the `recall` function. Without it the order is by due date, as before the review cap.
export function urgency(card, now = new Date(), recall) {
  if (typeof recall !== 'function') return null
  const stability = Number(card?.stabilnosc)
  const last = Date.parse(card?.ostatnio)
  if (!(stability > 0) || !Number.isFinite(last)) return 0
  const days = Math.max(0, (now.getTime() - last) / 86400000)
  const r = recall(days, stability)
  return Number.isFinite(r) ? r : 0
}

// Learning steps and cards after a mistake go before reviews (their due dates count in minutes), and inside both
// groups urgency rules: first the ones closest to forgetting. This is like "relative overdueness" in Anki.
function dueCards({ words, cards, settings, now, skipped, disabledDecks, recall }) {
  const s = withDefaultSettings(settings)
  const ids = availableIds(words, skipped, disabledDecks)
  const time = now.getTime()
  const learning = []
  const reviews = []
  for (const [key, card] of Object.entries(cards)) {
    if (card.stan === 'nowa') continue
    const { id, direction } = splitKey(key)
    // Cards of words removed from the list stay in memory, but they cannot be shown.
    if (!ids.has(id)) continue
    if (direction === 'pl' && !s.mowienie) continue
    const due = dueTime(card)
    if (due > time) continue
    const item = { key, due, urgency: urgency(card, now, recall) }
    if (card.stan === 'powtorka') reviews.push(item)
    else learning.push(item)
  }
  const byUrgency = (a, b) => (a.urgency === null ? 0 : a.urgency - b.urgency) || a.due - b.due
  return { learning: learning.sort(byUrgency), reviews: reviews.sort(byUrgency) }
}

export function dueCount({ words, cards, settings, now = new Date(), skipped, disabledDecks }) {
  const { learning, reviews } = dueCards({ words, cards, settings, now, skipped, disabledDecks })
  return learning.length + reviews.length
}

// Should a new word be skipped for now because of interference: a similar word is being learned or came in
// within the last INTERFERENCE_DAYS days. `collisions` is { id: [ids of similar words] } from collisions.js.
export function collidesNow({ collisions, id, cards, now = new Date(), days = INTERFERENCE_DAYS, skipped, available }) {
  const list = collisions?.[id]
  if (!list?.length) return false
  const limit = now.getTime() - days * 86400000
  for (const other of list) {
    // A skipped word or a word from a turned off deck will never be graded again, so its card would stay
    // in "learning" forever and block its partners with no end.
    if (available ? !available.has(other) : isSkipped(skipped, other)) continue
    const card = cards[cardKey(other, 'en')]
    if (!card || card.stan === 'nowa') continue
    if (card.stan === 'nauka' || card.stan === 'ponowna') return true
    const introduced = Date.parse(card.wprowadzono)
    if (Number.isFinite(introduced) && introduced >= limit) return true
  }
  return false
}

// Order: due learning and relearning, due reviews (most urgent first), new speaking cards, new EN cards.
// Due cards are cut to the daily review budget, new cards to the new words limit.
export function buildSession({
  words,
  cards,
  settings,
  today,
  now = new Date(),
  length,
  skipped,
  disabledDecks,
  catchUp,
  collisions,
  recall,
}) {
  const s = withDefaultSettings(settings)
  const max = length ?? s.dlugoscSerii
  const available = availableIds(words, skipped, disabledDecks)
  const { learning, reviews } = dueCards({ words, cards, settings: s, now, skipped, disabledDecks, recall })
  const budget = reviewBudget({ settings: s, today, now, catchUp })
  // The budget applies only to reviews. A card started today (learning or relearning) must be finishable today:
  // otherwise the app says "all done for today" while it has overdue cards, and FSRS counts them tomorrow as a review
  // after a day off instead of a step on the same day.
  const result = [...learning, ...reviews.slice(0, Math.max(0, budget))].slice(0, max).map((item) => item.key)
  const limits = newCardLimits({ cards, settings: s, today, now, catchUp })
  const addedNew = new Set()

  for (const w of words) {
    if (result.length >= max || limits.pl <= 0) break
    if (!available.has(w.id)) continue
    const plKey = cardKey(w.id, 'pl')
    if (speakingUnlocked(cards[cardKey(w.id, 'en')]) && isNew(cards[plKey])) {
      result.push(plKey)
      limits.pl -= 1
    }
  }
  for (const w of words) {
    if (result.length >= max || limits.en <= 0) break
    if (!available.has(w.id)) continue
    const enKey = cardKey(w.id, 'en')
    if (!isNew(cards[enKey])) continue
    // A similar word waits for another day: we take the next one from the list instead of blocking the whole queue.
    if (collidesNow({ collisions, id: w.id, cards, now, skipped, available })) continue
    // The same for a partner that joined this same session a moment ago.
    if (collisions?.[w.id]?.some((other) => addedNew.has(other))) continue
    result.push(enKey)
    addedNew.add(w.id)
    limits.en -= 1
  }
  return result
}

// For the choice screen, the session end screen and the menu. `toDo` is one number of cards for now (no split
// into debt), `due` and the rest stay for the stats in the menu.
export function daySummary({ words, cards, settings, today, now = new Date(), skipped, disabledDecks, catchUp, collisions, recall }) {
  const s = withDefaultSettings(settings)
  const { learning, reviews } = dueCards({ words, cards, settings: s, now, skipped, disabledDecks })
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  const ids = availableIds(words, skipped, disabledDecks)
  let laterToday = 0
  for (const [key, card] of Object.entries(cards)) {
    if (card.stan === 'nowa') continue
    const { id, direction } = splitKey(key)
    if (!ids.has(id) || (direction === 'pl' && !s.mowienie)) continue
    const due = dueTime(card)
    if (due > now.getTime() && due < midnight) laterToday += 1
  }
  const due = learning.length + reviews.length
  const toDo = buildSession({
    words,
    cards,
    settings: s,
    today,
    now,
    length: Infinity,
    skipped,
    disabledDecks,
    catchUp,
    collisions,
    recall,
  }).length
  // As in buildSession: the session has all learning cards and only as many reviews as fit in the budget.
  const inSession = learning.length + Math.min(reviews.length, reviewBudget({ settings: s, today, now, catchUp }))
  return {
    due,
    laterToday,
    newAvailable: toDo - inSession,
    toDo,
    catchUp: withDefaultCatchUp(catchUp).aktywne === 1,
  }
}

// "What next" on the session end screen (C5): how many cards wait until the end of tomorrow. New words are not here,
// because the daily limit decides about them, not the schedule. `bearable` tells the UI if it may show the number:
// over the review cap it becomes debt, and we do not show debt.
export function tomorrowForecast({ words, cards, settings, now = new Date(), skipped, disabledDecks }) {
  const s = withDefaultSettings(settings)
  const ids = availableIds(words, skipped, disabledDecks)
  const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).getTime()
  let count = 0
  for (const [key, card] of Object.entries(cards)) {
    if (card.stan === 'nowa') continue
    const { id, direction } = splitKey(key)
    if (!ids.has(id) || (direction === 'pl' && !s.mowienie)) continue
    if (dueTime(card) < endOfTomorrow) count += 1
  }
  const cap = s.maksPowtorekDziennie > 0 ? s.maksPowtorekDziennie : BEARABLE_TOMORROW
  return { count, bearable: count > 0 && count <= cap }
}

// "Hard words" training: cards of both directions where the user made a mistake before. A grade in this mode
// does not change the card state or due dates, so the order comes only from what is already in memory.
const withMistake = (card) => card.pomylki > 0

export function hardCount({ words, cards, skipped, disabledDecks }) {
  const ids = availableIds(words, skipped, disabledDecks)
  let count = 0
  for (const [key, card] of Object.entries(cards)) {
    if (withMistake(card) && ids.has(splitKey(key).id)) count += 1
  }
  return count
}

// More mistakes first, on a tie the later last grade.
export function hardCards({ words, cards, settings, length, skipped, disabledDecks }) {
  const max = length ?? withDefaultSettings(settings).dlugoscSerii
  const ids = availableIds(words, skipped, disabledDecks)
  const list = []
  for (const [key, card] of Object.entries(cards)) {
    if (!withMistake(card) || !ids.has(splitKey(key).id)) continue
    list.push({ key, mistakes: card.pomylki, last: Date.parse(card.ostatnio) || 0 })
  }
  list.sort((a, b) => b.mistakes - a.mistakes || b.last - a.last)
  return list.slice(0, max).map((item) => item.key)
}

// Games (G): words come from cards due for review today, and when there are too few, from recently studied ones.
// Grades in games do not change the schedule, so we need only words, not card keys.
export const MIN_GAME_WORDS = 6
// The crossword generator fits about 83% of the given words on average, so it gets a few more than needed.
export const CROSSWORD_WORDS = 12
export const CROSSWORD_SPARE = 3

// Words already studied, the most recent first: a reserve for games on a day without reviews.
export function recentlyStudied({ words, cards, skipped, disabledDecks, count = MAX_RESULTS }) {
  const ids = availableIds(words, skipped, disabledDecks)
  const list = []
  for (const w of words) {
    if (!ids.has(w.id)) continue
    const en = cards[cardKey(w.id, 'en')]
    if (isNew(en)) continue
    list.push({ id: w.id, last: Date.parse(en.ostatnio) || 0 })
  }
  list.sort((a, b) => b.last - a.last)
  return list.slice(0, count).map((item) => item.id)
}

// New words do not go into games: the player has never seen them, so there is nothing to guess. So we take due
// cards of both directions, and only with fewer than `minimum` words we add recently studied ones.
export function gameWords({
  words,
  cards,
  settings,
  now = new Date(),
  skipped,
  disabledDecks,
  recall,
  count = CROSSWORD_WORDS,
  minimum = MIN_GAME_WORDS,
}) {
  const s = withDefaultSettings(settings)
  const { learning, reviews } = dueCards({ words, cards, settings: s, now, skipped, disabledDecks, recall })
  const seen = new Set()
  const picked = []
  const add = (id) => {
    if (seen.has(id) || picked.length >= count) return
    seen.add(id)
    picked.push(id)
  }
  for (const item of [...learning, ...reviews]) add(splitKey(item.key).id)
  if (picked.length >= minimum) return picked
  for (const id of recentlyStudied({ words, cards, skipped, disabledDecks, count })) add(id)
  return picked
}

// Deck list for the menu (H): order of adding, word count, known count and whether the deck is in study.
// A turned off deck stays on the list together with its progress, so the switch can be undone.
export function deckList({ words, cards, disabledDecks }) {
  const disabled = disabledSet(disabledDecks)
  const map = new Map()
  for (const w of words) {
    const name = deckOfWord(w)
    const entry = map.get(name) || { name, total: 0, known: 0, enabled: !disabled.has(name) }
    entry.total += 1
    if (!isNew(cards[cardKey(w.id, 'en')])) entry.known += 1
    map.set(name, entry)
  }
  return [...map.values()]
}

// Removing a deck (H): its words go away together with all progress. Returns a full set of new objects and numbers
// to confirm, so the UI can ask before saving.
export function withoutDeck({ words, cards, skipped }, name) {
  const removed = new Set()
  const kept = []
  for (const w of words) {
    if (deckOfWord(w) === name) removed.add(w.id)
    else kept.push(w)
  }
  const newCards = {}
  let removedCards = 0
  for (const [key, card] of Object.entries(cards || {})) {
    if (removed.has(splitKey(key).id)) removedCards += 1
    else newCards[key] = card
  }
  const newSkipped = {}
  for (const [id, date] of Object.entries(skipped || {})) {
    if (!removed.has(id)) newSkipped[id] = date
  }
  return { words: kept, cards: newCards, skipped: newSkipped, removedWords: removed.size, removedCards }
}

function addUp(map, name, known) {
  const entry = map.get(name) || { name, known: 0, total: 0 }
  entry.total += 1
  entry.known += known
  map.set(name, entry)
}

const levelOrder = (level) => (LEVELS.includes(level) ? LEVELS.indexOf(level) : LEVELS.length)

// Known = the EN card is not new any more (also for words skipped after study). Skipped words are counted
// separately, and the forecast gets `toIntroduce`: words that can still come into study.
// Decks in the order of adding, levels only those that appear in the words.
export function statistics({ words, cards, skipped, disabledDecks }) {
  // Without this filter the menu would show progress of a deck the user does not study, next to the bar
  // that already leaves it out: two different numbers on one screen.
  const disabled = disabledSet(disabledDecks)
  const decks = new Map()
  const levels = new Map()
  let knownTotal = 0
  let inReview = 0
  let unlocked = 0
  let mastered = 0
  let solid = 0
  let skippedCount = 0
  let toIntroduce = 0
  for (const w of words) {
    if (disabled.size && disabled.has(deckOfWord(w))) continue
    const en = cards[cardKey(w.id, 'en')]
    const known = isNew(en) ? 0 : 1
    knownTotal += known
    addUp(decks, w.talia || UNTITLED_DECK, known)
    if (w.poziom) addUp(levels, w.poziom, known)
    if (en?.stan === 'powtorka') inReview += 1
    if (speakingUnlocked(en)) unlocked += 1
    if (en && en.stabilnosc >= MASTERED_DAYS) mastered += 1
    if (known && en.stabilnosc >= SOLID_DAYS) solid += 1
    if (isSkipped(skipped, w.id)) skippedCount += 1
    else if (!known) toIntroduce += 1
  }
  return {
    total: words.length,
    known: knownTotal,
    skipped: skippedCount,
    toIntroduce,
    mastered,
    solid,
    decks: [...decks.values()],
    levels: [...levels.values()].sort((a, b) => levelOrder(a.name) - levelOrder(b.name) || a.name.localeCompare(b.name)),
    reviewPercent: words.length ? Math.round((inReview / words.length) * 1000) / 10 : 0,
    speakingUnlocked: unlocked,
  }
}

// `training` marks a "Hard words" session: grades count to XP, combo and the daily goal, but do not change cards.
export function newSession(keys, training = false) {
  return {
    queue: [...keys],
    total: keys.length,
    cleared: 0,
    know: 0,
    almost: 0,
    dontKnow: 0,
    newWords: 0,
    xp: 0,
    combo: 0,
    bonus: 0,
    training,
  }
}

export const comboBonus = (combo) => (combo > 0 && combo % COMBO_EVERY === 0 ? XP_PER_COMBO : 0)

export const currentCard = (session) => session.queue[0]

export const sessionDone = (session) => session.queue.length === 0

// "Don't know" puts the card back so that it returns as the fourth one, and resets the combo. When the session
// does not have that many cards before it, the word leaves the session instead of coming back at once: the same word
// right after a mistake is not a review, just copying the answer from short-term memory. FSRS gives it a due date in
// a few minutes, so it comes back in the next reviews. Any other grade takes the card off the session and raises the
// combo. `bonus` is the XP added for the combo at this very grade, so the UI knows when to flash.
// `isNewWord` says this card comes into study for the first time: the `newWords` counter feeds the session end
// screen ("what was added"). A card without an introduction date is new only at its first grade, so "Don't know"
// will not count it twice.
export function afterGrade(session, grade, isNewWord = false) {
  const [card, ...rest] = session.queue
  if (card === undefined) return session
  const newWords = (session.newWords || 0) + (isNewWord ? 1 : 0)
  if (grade === 1) {
    const gap = GAP_AFTER_MISTAKE - 1
    const comesBack = rest.length >= gap
    if (comesBack) rest.splice(gap, 0, card)
    return {
      ...session,
      queue: rest,
      // A card that left the session is not cleared - it also leaves the progress bar total.
      total: comesBack ? session.total : Math.max(session.total - 1, session.cleared),
      dontKnow: session.dontKnow + 1,
      newWords,
      xp: session.xp + XP_PER_GRADE[1],
      combo: 0,
      bonus: 0,
    }
  }
  const combo = session.combo + 1
  const bonus = comboBonus(combo)
  return {
    ...session,
    queue: rest,
    cleared: session.cleared + 1,
    know: grade === 2 ? session.know : session.know + 1,
    almost: grade === 2 ? session.almost + 1 : session.almost,
    newWords,
    xp: session.xp + (XP_PER_GRADE[grade] ?? 0) + bonus,
    combo,
    bonus,
  }
}

export const sessionProgress = (session) => (session.total ? session.cleared / session.total : 1)

// Exponent 1.5: the bar starts slowly and speeds up near the end (goal gradient), so you want to finish.
export const progressBar = (progress) => Math.pow(Math.min(Math.max(progress, 0), 1), 1.5)

// One card counts at most MAX_CARD_SECONDS, so a phone put aside does not add study time.
// Rounded to 0.1 s: raw values from performance.now() took four times more space in the save.
export const cardTime = (seconds) => Math.round(Math.min(Math.max(Number(seconds) || 0, 0), MAX_CARD_SECONDS) * 10) / 10

// Study time is only a stat now: one graded card decides about the streak, not 60 seconds.
export function addTime(today, seconds, now = new Date()) {
  const day = todayState(today, now)
  return { ...day, sekundy: Math.round((day.sekundy + cardTime(seconds)) * 10) / 10 }
}

// A game lasts longer than one card, so the time is added once at the end and with its own cap: a phone
// put aside in the middle of a crossword must not be saved as an hour of study.
export const MAX_GAME_SECONDS = 900
export const gameTime = (seconds) => Math.min(Math.max(Number(seconds) || 0, 0), MAX_GAME_SECONDS)

export function addGameTime(today, seconds, now = new Date()) {
  const day = todayState(today, now)
  return { ...day, sekundy: Math.round((day.sekundy + gameTime(seconds)) * 10) / 10 }
}

// Streak without punishment (A3)

export const EMPTY_BREAK = { dni: 0, do: '' }

export const EMPTY_STREAK = {
  dni: 0,
  ostatniDzien: '',
  zamrozenia: 0,
  doZamrozenia: 0,
  zerwane: EMPTY_BREAK,
  sesje: 0,
  ostatnieOdzyskanie: '',
}

const wholeNumber = (x, max) => Math.min(Math.max(Math.trunc(Number(x) || 0), 0), max)
const dayOrEmpty = (x) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : '')

export function withDefaultStreak(streak) {
  const b = streak?.zerwane
  return {
    dni: wholeNumber(streak?.dni, 1e6),
    ostatniDzien: dayOrEmpty(streak?.ostatniDzien),
    zamrozenia: wholeNumber(streak?.zamrozenia, MAX_FREEZES),
    doZamrozenia: wholeNumber(streak?.doZamrozenia, DAYS_PER_FREEZE),
    zerwane: { dni: wholeNumber(b?.dni, 1e6), do: typeof b?.do === 'string' && Date.parse(b.do) ? b.do : '' },
    sesje: wholeNumber(streak?.sesje, 1e6),
    ostatnieOdzyskanie: dayOrEmpty(streak?.ostatnieOdzyskanie),
  }
}

// Number of days between YYYY-MM-DD dates, counted by the local calendar (a clock change does not break it).
export function daysBetween(from, to) {
  const toTime = (date) => {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  return Math.round((toTime(to) - toTime(from)) / 86400000)
}

// One graded card counts the day. A missed day is covered by a freeze from the bank (max 2), and if there is nothing
// to cover it with, the streak starts again and a 48 h window to recover it is saved.
// Returns { streak, frozen, broken, counted }; there is never a message about losing anything.
export function countDay(streak, now = new Date()) {
  const s = withDefaultStreak(streak)
  const date = localDate(now)
  if (s.ostatniDzien === date) return { streak: s, frozen: false, broken: false, counted: false }
  // A date earlier than the last counted day (clock moved back, time zone to the west): we do not move the streak
  // back, because going back to the right date would look like a break and the streak would be lost.
  if (s.ostatniDzien && daysBetween(s.ostatniDzien, date) < 0) {
    return { streak: s, frozen: false, broken: false, counted: false }
  }

  const missed = s.ostatniDzien ? Math.max(0, daysBetween(s.ostatniDzien, date) - 1) : 0
  let days = s.dni + 1
  let freezes = s.zamrozenia
  let broken = s.zerwane
  let sessions = s.sesje
  let frozen = false
  let wasBroken = false
  if (!s.ostatniDzien) {
    days = 1
  } else if (missed > 0 && missed <= freezes) {
    freezes -= missed
    frozen = true
  } else if (missed > 0) {
    broken = { dni: s.dni, do: new Date(now.getTime() + RECOVERY_HOURS * 3600000).toISOString() }
    sessions = 0
    days = 1
    wasBroken = true
  }

  // A freeze is earned every DAYS_PER_FREEZE study days, the bank holds at most MAX_FREEZES.
  let toFreeze = s.doZamrozenia + 1
  if (toFreeze >= DAYS_PER_FREEZE) {
    toFreeze = 0
    if (freezes < MAX_FREEZES) freezes += 1
  }
  return {
    streak: { ...s, dni: days, ostatniDzien: date, zamrozenia: freezes, doZamrozenia: toFreeze, zerwane: broken, sesje: sessions },
    frozen,
    broken: wasBroken,
    counted: true,
  }
}

// Recovering the streak: two sessions within 48 h after the break give back the days from before it. Once in 30 days.
export function countSession(streak, now = new Date()) {
  const s = withDefaultStreak(streak)
  if (!s.zerwane.do) return { streak: s, recovered: false }
  if (now.getTime() > Date.parse(s.zerwane.do)) {
    return { streak: { ...s, zerwane: EMPTY_BREAK, sesje: 0 }, recovered: false }
  }
  const sessions = s.sesje + 1
  if (sessions < RECOVERY_SESSIONS) return { streak: { ...s, sesje: sessions }, recovered: false }
  const date = localDate(now)
  if (s.ostatnieOdzyskanie && daysBetween(s.ostatnieOdzyskanie, date) < DAYS_BETWEEN_RECOVERIES) {
    return { streak: { ...s, sesje: sessions }, recovered: false }
  }
  // Days collected after the break are added, so the streak looks as if there was no break.
  return {
    streak: { ...s, dni: s.dni + s.zerwane.dni, zerwane: EMPTY_BREAK, sesje: 0, ostatnieOdzyskanie: date },
    recovered: true,
  }
}

// A break that a freeze can no longer cover shows 0. Freezes in the bank keep the counter.
export function currentStreak(streak, now = new Date()) {
  const s = withDefaultStreak(streak)
  if (!s.ostatniDzien) return 0
  const missed = Math.max(0, daysBetween(s.ostatniDzien, localDate(now)) - 1)
  return missed <= s.zamrozenia ? s.dni : 0
}

// A counter that never resets: how many of the last 30 days had at least one graded card.
export function studyDays(history, days = RECENT_DAYS, now = new Date()) {
  return historyDays(history, days, now).filter((d) => d.ratings > 0).length
}

// Speaking hint in three levels: 'brak' (nothing), 'dlugosc' (only underscores and word boundaries),
// 'litera' (first letter plus underscores). Words are split by a triple space, so word boundaries are visible,
// and signs other than letters (apostrophe, hyphen) stay.
export function hint(text, level = 'litera') {
  if (level === 'brak') return ''
  let first = level !== 'dlugosc'
  return String(text)
    .trim()
    .split(/\s+/)
    .map((word) =>
      [...word]
        .map((char) => {
          if (!/[\p{L}\p{N}]/u.test(char)) return char
          if (first) {
            first = false
            return char
          }
          return '_'
        })
        .join(' '),
    )
    .join('   ')
}

// The "Hint" button on the card raises the level by one, up to 'litera'. After the card changes, the setting comes back.
export function nextHint(level) {
  const i = HINT_LEVELS.indexOf(level)
  return HINT_LEVELS[Math.min(Math.max(i, 0) + 1, HINT_LEVELS.length - 1)]
}

// Leeches (A7). The panel shows after every LEECH_MISTAKES mistakes since it was last shown: the `leech` field
// keeps the number of mistakes from the moment the user last decided about it.
export const needsLeechPanel = (card) => !!card && (card.pomylki || 0) - (card.leech || 0) >= LEECH_MISTAKES

export const afterLeech = (card) => ({ ...card, leech: card.pomylki || 0 })

// "Put away for 3 weeks": due date today + 21 days and the panel counter reset.
// The card history stays untouched, because FSRS learns from it.
export function postponedCard(card, key, now = new Date()) {
  const due = new Date(now.getTime() + LEECH_POSTPONE_DAYS * DAY).toISOString()
  return { ...afterLeech(card), stan: 'powtorka', krok: 0, termin: fuzzDue(key, due, now) }
}

// Day history: { 'YYYY-MM-DD': { oceny, nowe, exp, sekundy, tempo, czasy } } (saved names: grades, new cards, XP,
// seconds, median answer time, raw answer times). Updated at every grade, also in training. `tempo` is the median
// of the day's answer times (from reveal to grade), and `czasy` are the raw times it comes from.

const EMPTY_DAY = { oceny: 0, nowe: 0, exp: 0, sekundy: 0, tempo: 0, czasy: [] }

// We keep at most this many raw times: a median of two hundred answers is already stable, and the save must
// stay small. Outside the current day `trimHistory` keeps only the median anyway.
export const MAX_DAY_TIMES = 200

export function addToHistory(history, { ratings = 0, newCards = 0, xp = 0, seconds = 0, answerTime = 0 }, now = new Date()) {
  const date = localDate(now)
  const old = history?.[date] || EMPTY_DAY
  const previousTimes = Array.isArray(old.czasy) ? old.czasy : []
  const newTime = cardTime(answerTime)
  const times = newTime > 0 && previousTimes.length < MAX_DAY_TIMES ? [...previousTimes, newTime] : previousTimes
  return {
    ...history,
    [date]: {
      oceny: old.oceny + ratings,
      nowe: old.nowe + newCards,
      exp: old.exp + xp,
      sekundy: Math.round((old.sekundy + seconds) * 10) / 10,
      tempo: times.length ? median(times) : Number(old.tempo) || 0,
      czasy: times,
    },
  }
}

const shiftDay = (now, by) => localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + by))

export function trimHistory(history, now = new Date()) {
  if (!history) return {}
  const limit = shiftDay(now, -(HISTORY_DAYS - 1))
  const today = localDate(now)
  const result = {}
  // YYYY-MM-DD dates compare correctly as text. Days in the future (clock moved back) are dropped too.
  for (const [date, entry] of Object.entries(history)) {
    if (date < limit || date > today) continue
    if (date === today || !Array.isArray(entry.czasy)) {
      result[date] = entry
      continue
    }
    // A closed day already has its median, so the raw times do not need space in the save.
    const { czasy, ...rest } = entry
    result[date] = rest
  }
  return result
}

// A word reset gives back its "new" count from the day it was introduced: otherwise studying it again would count
// it twice, and the deck finish forecast would show a too high pace.
export function removeNew(history, dates) {
  const result = { ...history }
  for (const iso of dates) {
    if (!iso) continue
    const date = localDate(new Date(iso))
    const entry = result[date]
    if (!entry?.nowe) continue
    result[date] = { ...entry, nowe: Math.max(0, entry.nowe - 1) }
  }
  return result
}

export const gradedToday = (history, now = new Date()) => history?.[localDate(now)]?.oceny || 0

// Five heatmap intensity levels: 0 for empty days, then by the number of grades.
export const HEATMAP_LEVELS = [1, 10, 25, 50]

export const dayLevel = (ratings) => HEATMAP_LEVELS.filter((min) => ratings >= min).length

// The last `days` days ending today, from the oldest.
export function historyDays(history, days = HEATMAP_DAYS, now = new Date()) {
  const result = []
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDay(now, -i)
    const entry = history?.[date] || EMPTY_DAY
    result.push({ date, ratings: entry.oceny, newCards: entry.nowe, pace: Number(entry.tempo) || 0, level: dayLevel(entry.oceny) })
  }
  return result
}

// Stats in short sentences (D): how many cards in the last week and the longest run of study days.
export const WEEK_DAYS = 7

export const cardsThisWeek = (history, now = new Date()) => historyDays(history, WEEK_DAYS, now).reduce((sum, d) => sum + d.ratings, 0)

// The longest run of days with at least one grade in the whole saved history (180 days). Days follow the calendar,
// so a break is any day with no entry or with zero grades.
export function longestRun(history) {
  const days = Object.entries(history || {})
    .filter(([, entry]) => (entry?.oceny || 0) > 0)
    .map(([date]) => date)
    .sort()
  let longest = 0
  let current = 0
  let previous = ''
  for (const date of days) {
    current = previous && daysBetween(previous, date) === 1 ? current + 1 : 1
    previous = date
    if (current > longest) longest = current
  }
  return longest
}

// Median answer time from the last days, counted from the medians of days that have any. 0 means "no data".
export const recentPace = (history, days = PACE_DAYS, now = new Date()) =>
  median(historyDays(history, days, now).filter((d) => d.pace > 0).map((d) => d.pace))

// Heatmap grid in columns by weekday (Monday first): before the oldest day we add empty cells, so every column
// is the same weekday. It also returns numbers for the caption under the grid.
export function heatmapGrid(history, days = HEATMAP_DAYS, now = new Date()) {
  const cells = historyDays(history, days, now)
  const [y, m, d] = cells[0].date.split('-').map(Number)
  // getDay(): 0 is Sunday, and we want Monday as the first column
  const empty = (new Date(y, m - 1, d).getDay() + 6) % 7
  const withStudy = cells.filter((c) => c.ratings > 0)
  return {
    empty,
    cells,
    today: cells.at(-1).ratings,
    best: cells.reduce((max, c) => Math.max(max, c.ratings), 0),
    firstDay: withStudy[0]?.date || '',
    studyDays: withStudy.length,
  }
}

// Average new cards per day from the last days. null when this period has no history entry at all.
export function averageNew(history, days = PACE_DAYS, now = new Date()) {
  const period = historyDays(history, days, now)
  if (!period.some((d) => history?.[d.date])) return null
  return period.reduce((sum, d) => sum + d.newCards, 0) / days
}

// When new words run out at the current pace. `days: null` means "no pace data".
export function finishForecast({ remaining, history, settings, now = new Date() }) {
  const average = averageNew(history, PACE_DAYS, now)
  const pace = average === null ? withDefaultSettings(settings).noweDziennie : average
  if (!(pace > 0)) return { pace: 0, days: null, date: '' }
  const days = Math.max(0, Math.ceil(remaining / pace))
  return { pace, days, date: shiftDay(now, days) }
}

// Word list search

const POLISH_LETTERS = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' }

export const plainText = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => POLISH_LETTERS[c])

// Index built once when the deck loads: with 3000 words, filtering after each key is one pass over an array.
export const buildIndex = (words) => words.map((w) => ({ word: w, search: plainText(`${w.w} ${w.pl}`) }))

export function searchWords(index, phrase, max = MAX_RESULTS) {
  const query = plainText(phrase).trim()
  if (!query) return { words: index.slice(0, max).map((item) => item.word), total: index.length }
  const words = []
  let total = 0
  for (const item of index) {
    if (!item.search.includes(query)) continue
    total += 1
    if (words.length < max) words.push(item.word)
  }
  return { words, total }
}

// State of the EN card for the word list. A skipped word has its own state, because its card stays untouched.
export function cardStatus(card, now = new Date(), skipped = false) {
  if (skipped) return 'skipped'
  if (isNew(card)) return 'new'
  if (card.stabilnosc >= MASTERED_DAYS) return 'mastered'
  if (card.stan !== 'powtorka') return 'learning'
  const days = Math.round((Date.parse(card.termin) - now.getTime()) / 86400000)
  if (days <= 0) return 'review now'
  return `review in ${days} ${days === 1 ? 'day' : 'days'}`
}
