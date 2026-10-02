// Progress in localStorage and the backup file (deck + progress). Saved synchronously after every grade.
// The save is compact: WebKit gives about 5 MB counted in UTF-16 (about 2.5 million chars), and 6000 words in two
// directions as objects with ISO dates would take about 2.5 million chars. Arrays and minutes fit in a fraction of it.
// Functions take the storage (localStorage by default), so they can be tested in Node.
//
// The saved format must not change: the real progress lives on the phone. Keys (mmf-v1...), field names
// (karty, pominiete, exp, streak, nadrabianie, dzis, historia, zgloszenia, ustawienia, ostatniaKopia, rozproszono)
// and the packed card arrays stay exactly as the Polish version wrote them. The state in memory keeps the same field
// names (only `exp` is `expRazem` in memory, as before).

import {
  CARD_STATES,
  DAILY_GOAL_OPTIONS,
  DEFAULT_SETTINGS,
  EMPTY_CATCH_UP,
  EMPTY_STREAK,
  HINT_LEVELS,
  MAX_ANCHOR_CHARS,
  MAX_DAY_TIMES,
  NEW_PER_DAY_OPTIONS,
  OLD_HABIT_ANCHORS,
  OLD_UNTITLED_DECK,
  REVIEW_CAP_OPTIONS,
  SESSION_LENGTH_OPTIONS,
  UNTITLED_DECK,
  cardKey,
  localDate,
  trimHistory,
  withDefaultCatchUp,
  withDefaultStreak,
} from './study.js'
import { normalizeWord } from './words.js'

export const KEY = 'mmf-v1'
export const KEY_PREVIOUS = 'mmf-v1-poprzedni'
export const KEY_PREVIOUS_DAY = 'mmf-v1-poprzedni-dzien'
export const KEY_BEFORE_LOAD = 'mmf-v1-przed-wczytaniem'
export const KEY_BROKEN = 'mmf-v1-uszkodzony'
export const BACKUP_FORMAT = 'mmf-kopia'
export const SAVE_VERSION = 1
export const BACKUP_VERSION = 2

// Due date as minutes since 2026-01-01 UTC: 6-7 digits instead of 24 ISO chars. The fields ostatnio (last review)
// and wprowadzono (introduced) are needed only to the local day (FSRS counts days by the calendar, the new limit goes
// by date), so we save the day number and restore noon of that day.
export const BASE_MINUTES = Date.UTC(2026, 0, 1) / 60000
const BASE_DAYS = Date.UTC(2026, 0, 1) / 86400000

const defaultStorage = () => globalThis.localStorage

export function defaultState(now = new Date()) {
  return {
    karty: {},
    pominiete: {},
    // expRazem stays in the save for compatibility with an older phone; the app does not show it any more.
    expRazem: 0,
    streak: { ...EMPTY_STREAK },
    nadrabianie: { ...EMPTY_CATCH_UP },
    dzis: { data: '', sekundy: 0, dodatkoweNowe: 0, powtorki: 0 },
    historia: {},
    zgloszenia: [],
    ustawienia: { ...DEFAULT_SETTINGS },
    ostatniaKopia: '',
    rozproszono: 0,
  }
}

const isObject = (x) => typeof x === 'object' && x !== null && !Array.isArray(x)
const nonNegative = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0
const wholeNonNegative = (x) => Number.isInteger(x) && x >= 0
const minuteInRange = (x) => Number.isInteger(x) && Math.abs(x) < 1e9
const dayInRange = (x) => Number.isInteger(x) && Math.abs(x) < 1e6
const dateOrEmpty = (x) => x === '' || (typeof x === 'string' && !Number.isNaN(Date.parse(x)))
const isDay = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const text = (x) => (typeof x === 'string' ? x.trim() : '')
const fail = (error) => ({ ok: false, error })

const toMinutes = (iso) => (iso ? Math.round(Date.parse(iso) / 60000) - BASE_MINUTES : null)
const fromMinutes = (m) => (m === null ? '' : new Date((m + BASE_MINUTES) * 60000).toISOString())

function toDay(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 - BASE_DAYS
}

function fromDay(n) {
  if (n === null) return ''
  const d = new Date((n + BASE_DAYS) * 86400000)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12).toISOString()
}

// Three decimal places: stability (in days) to about 1.5 minutes, difficulty 1-10. FSRS rounds the interval to
// whole days anyway.
const threePlaces = (x) => Math.round(x * 1000) / 1000

// Cards in memory are immutable (a grade makes a new object), so the packed form can be kept next to the object.
// A save after a grade then packs only the one changed card, not all 12 000.
const packed = new WeakMap()

// Fields 10 and 11 ("Know" in a row and the leech panel counter) came in a later version. They are optional and zero
// for almost every card, so we save them only when they really hold something: a save from an old phone has
// 9 fields and loads with no change.
export function packCard(card) {
  let t = packed.get(card)
  if (!t) {
    t = [
      CARD_STATES.indexOf(card.stan),
      toMinutes(card.termin) ?? 0,
      threePlaces(card.stabilnosc),
      threePlaces(card.trudnosc),
      card.powtorki,
      card.pomylki,
      card.krok,
      toDay(card.ostatnio),
      toDay(card.wprowadzono),
      card.kolejneUmiem || 0,
      card.leech || 0,
    ]
    while (t.length > 9 && t.at(-1) === 0) t.pop()
    packed.set(card, t)
  }
  return t
}

function unpackCard(t) {
  if (!Array.isArray(t) || t.length < 9 || t.length > 11) return { error: 'wrong card format' }
  const [state, due, stability, difficulty, reps, lapses, step, last, introduced] = t
  const knowStreak = t[9] ?? 0
  const leech = t[10] ?? 0
  if (!wholeNonNegative(state) || state >= CARD_STATES.length) return { error: 'unknown state' }
  if (!minuteInRange(due)) return { error: 'wrong due date' }
  if (!nonNegative(stability) || !nonNegative(difficulty)) return { error: 'wrong FSRS memory' }
  // A graded card has positive stability and difficulty 1-10. Other values give NaN in FSRS at the next grade.
  if (state > 0 && !(stability > 0 && difficulty >= 1 && difficulty <= 10)) return { error: 'wrong FSRS memory' }
  if (![reps, lapses, step, knowStreak, leech].every(wholeNonNegative)) return { error: 'wrong counters' }
  if (![last, introduced].every((d) => d === null || dayInRange(d))) return { error: 'wrong date' }
  const card = {
    stan: CARD_STATES[state],
    termin: fromMinutes(due),
    stabilnosc: stability,
    trudnosc: difficulty,
    powtorki: reps,
    pomylki: lapses,
    krok: step,
    ostatnio: fromDay(last),
    wprowadzono: fromDay(introduced),
    kolejneUmiem: knowStreak,
    leech,
  }
  packed.set(card, t)
  return { card }
}

// The save form: cards grouped by word id, [en] or [en, pl] (null when a direction was never touched).
// History is trimmed at every save, so it does not grow forever.
export function packState(state, now = new Date()) {
  const cards = Object.create(null)
  for (const [key, card] of Object.entries(state.karty)) {
    const i = key.lastIndexOf('|')
    const id = key.slice(0, i)
    if (!cards[id]) cards[id] = [null]
    cards[id][key.slice(i + 1) === 'pl' ? 1 : 0] = packCard(card)
  }
  return {
    wersja: SAVE_VERSION,
    karty: cards,
    pominiete: state.pominiete || {},
    // The field "exp" keeps its name in the save (compatibility with an older phone). The app does not show it.
    exp: state.expRazem || 0,
    streak: state.streak,
    nadrabianie: withDefaultCatchUp(state.nadrabianie),
    dzis: state.dzis,
    historia: trimHistory(state.historia, now),
    zgloszenia: state.zgloszenia || [],
    ustawienia: state.ustawienia,
    ostatniaKopia: state.ostatniaKopia,
    rozproszono: state.rozproszono || 0,
  }
}

// 40 new per day dropped out of the options list, but a save with this setting may stay: we do not delete
// anything quietly, the user can change it.
const OLD_NEW_PER_DAY_OPTIONS = [40]

// A habit anchor from the Polish version reads as the English one; own text stays as it is.
const anchorInEnglish = (anchor) => OLD_HABIT_ANCHORS[anchor] ?? anchor

function fixedSettings(s) {
  const result = { ...DEFAULT_SETTINGS }
  if (!isObject(s)) return result
  if (NEW_PER_DAY_OPTIONS.includes(s.noweDziennie) || OLD_NEW_PER_DAY_OPTIONS.includes(s.noweDziennie)) {
    result.noweDziennie = s.noweDziennie
  }
  if (REVIEW_CAP_OPTIONS.includes(s.maksPowtorekDziennie)) result.maksPowtorekDziennie = s.maksPowtorekDziennie
  if (SESSION_LENGTH_OPTIONS.includes(s.dlugoscSerii)) result.dlugoscSerii = s.dlugoscSerii
  if (DAILY_GOAL_OPTIONS.includes(s.celDzienny)) result.celDzienny = s.celDzienny
  if (HINT_LEVELS.includes(s.podpowiedzMowienie)) result.podpowiedzMowienie = s.podpowiedzMowienie
  if (typeof s.autowymowa === 'boolean') result.autowymowa = s.autowymowa
  if (typeof s.mowienie === 'boolean') result.mowienie = s.mowienie
  // The habit anchor is text from the user, so we trim spaces and length. A save without these fields
  // (every phone from before this version) gets defaults: an empty anchor and the tutorial not shown.
  if (typeof s.kotwica === 'string') result.kotwica = anchorInEnglish(s.kotwica.trim()).slice(0, MAX_ANCHOR_CHARS)
  if (typeof s.samouczekGestow === 'boolean') result.samouczekGestow = s.samouczekGestow
  // Turned off decks (H) are names from the user: we take only non-empty texts, without repeats. A save without
  // this field (every phone from before this version) gets an empty list, so all decks are on. The name of the deck
  // for words without a deck changed with the English version, so the old name points to the new one.
  if (Array.isArray(s.wylaczoneTalie)) {
    result.wylaczoneTalie = [
      ...new Set(
        s.wylaczoneTalie
          .filter((n) => typeof n === 'string' && n.trim())
          .map((n) => n.trim())
          .map((n) => (n === OLD_UNTITLED_DECK ? UNTITLED_DECK : n)),
      ),
    ]
  } else {
    result.wylaczoneTalie = []
  }
  return result
}

// New save fields are optional: a save from an old phone (without history and reports) loads with no change,
// and a missing or broken field gives a default value instead of making all progress invalid.
function fixedHistory(h) {
  if (!isObject(h)) return {}
  const result = {}
  const number = (x) => (nonNegative(x) ? x : 0)
  for (const [date, entry] of Object.entries(h)) {
    if (!isDay(date) || !isObject(entry)) continue
    const day = { oceny: number(entry.oceny), nowe: number(entry.nowe), exp: number(entry.exp), sekundy: number(entry.sekundy) }
    // The median answer time and raw times are optional: a save from before this version does not have them.
    const pace = number(entry.tempo)
    if (pace) day.tempo = pace
    if (Array.isArray(entry.czasy)) {
      const times = entry.czasy.filter(nonNegative).slice(0, MAX_DAY_TIMES)
      if (times.length) day.czasy = times
    }
    result[date] = day
  }
  return result
}

// Skipped words: { id: 'YYYY-MM-DD' }. The date is only information, so a wrong format gives an empty text,
// and the word itself stays out of study.
function fixedSkipped(p) {
  if (!isObject(p)) return {}
  const result = {}
  for (const [id, date] of Object.entries(p)) {
    if (!id || id.includes('|')) continue
    result[id] = isDay(date) ? date : ''
  }
  return result
}

function fixedReports(r) {
  if (!Array.isArray(r)) return []
  const result = []
  const seen = new Set()
  for (const item of r) {
    if (!isObject(item)) continue
    const id = text(item.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({ id, w: text(item.w), pl: text(item.pl), kiedy: dateOrEmpty(item.kiedy) ? item.kiedy : '' })
  }
  return result
}

// From the save form to the state in memory. A card with wrong data is skipped and counted in `skipped` in the result
// (this is different from `state.pominiete`, the words taken out of study with the "Skip" button), so one broken card
// does not make all progress invalid. XP must be correct, settings and the day counter can safely be replaced with
// defaults.
export function validateState(data, now = new Date()) {
  if (!isObject(data)) return fail('This is not a JSON object.')
  if (data.wersja !== SAVE_VERSION) return fail(`Unknown progress save version: ${data.wersja}.`)
  if (!isObject(data.karty)) return fail('No "karty" field.')
  const cards = {}
  let skipped = 0
  for (const [id, pair] of Object.entries(data.karty)) {
    if (!id || id.includes('|') || !Array.isArray(pair) || pair.length < 1 || pair.length > 2) {
      skipped += 1
      continue
    }
    for (const [i, direction] of ['en', 'pl'].entries()) {
      if (pair[i] === null || pair[i] === undefined) continue
      const { card } = unpackCard(pair[i])
      if (card) cards[cardKey(id, direction)] = card
      else skipped += 1
    }
  }
  if (!nonNegative(data.exp)) return fail('Wrong "exp" field.')

  let streak = { ...EMPTY_STREAK }
  if (data.streak !== undefined) {
    const s = data.streak
    if (!isObject(s) || !wholeNonNegative(s.dni)) return fail('Wrong "streak" field.')
    if (s.ostatniDzien !== '' && !isDay(s.ostatniDzien)) return fail('Wrong date in "streak".')
    // Other streak fields (freezes, recovery window) are optional: a save from an old phone does not have them.
    streak = withDefaultStreak(s)
  }

  const d = data.dzis
  const today =
    isObject(d) && isDay(d.data) && nonNegative(d.sekundy) && nonNegative(d.dodatkoweNowe)
      ? { data: d.data, sekundy: d.sekundy, dodatkoweNowe: d.dodatkoweNowe, powtorki: nonNegative(d.powtorki) ? d.powtorki : 0 }
      : defaultState(now).dzis

  return {
    ok: true,
    skipped,
    state: {
      karty: cards,
      pominiete: fixedSkipped(data.pominiete),
      expRazem: data.exp,
      streak,
      nadrabianie: withDefaultCatchUp(data.nadrabianie),
      dzis: today,
      historia: fixedHistory(data.historia),
      zgloszenia: fixedReports(data.zgloszenia),
      ustawienia: fixedSettings(data.ustawienia),
      ostatniaKopia: dateOrEmpty(data.ostatniaKopia) ? data.ostatniaKopia : '',
      rozproszono: data.rozproszono === 1 ? 1 : 0,
    },
  }
}

// A backup has the deck and the progress, so a new phone restores everything from one file.
// The library in memory is { words, decks }, in the file it is talia: { slowa, talie } as before.
export function backupFile(state, library, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    wersja: BACKUP_VERSION,
    utworzono: now.toISOString(),
    talia: { slowa: library.words, talie: library.decks || [] },
    postep: packState(state, now),
  }
}

// Returns { ok, library: { words, decks }, state, skipped } or { ok: false, error }. The deck is taken whole
// or not at all, broken progress cards are skipped.
export function validateBackup(data) {
  if (!isObject(data) || data.format !== BACKUP_FORMAT) return fail('This is not a flashcards backup file.')
  if (data.wersja !== BACKUP_VERSION) return fail(`Unknown backup version: ${data.wersja}.`)
  if (!isObject(data.talia) || !Array.isArray(data.talia.slowa)) return fail('The backup has no word deck.')
  const words = []
  const ids = new Set()
  for (const [i, raw] of data.talia.slowa.entries()) {
    const { word, error } = normalizeWord(raw, isObject(raw) ? raw.talia : '')
    if (error) return fail(`Word no. ${i + 1} in the backup: ${error}.`)
    if (ids.has(word.id)) return fail(`The word "${word.id}" is in the backup twice.`)
    ids.add(word.id)
    words.push(word)
  }
  const decks = (Array.isArray(data.talia.talie) ? data.talia.talie : [])
    .filter(isObject)
    .map((d) => ({ nazwa: text(d.nazwa), zrodlo: text(d.zrodlo), dodano: text(d.dodano) }))
    .filter((d) => d.nazwa)
  const progress = validateState(data.postep)
  if (!progress.ok) return fail(`Progress in the backup: ${progress.error}`)
  return { ok: true, library: { words, decks }, state: progress.state, skipped: progress.skipped }
}

const gradeTime = (card) => Date.parse(card.ostatnio) || 0

// A card from the backup replaces the current one only when it has more reviews, and on a tie a later grade.
function backupCardNewer(fromBackup, current) {
  if (fromBackup.powtorki !== current.powtorki) return fromBackup.powtorki > current.powtorki
  return gradeTime(fromBackup) > gradeTime(current)
}

// Loading a backup joins it with the current progress instead of replacing it, so an older file does not delete
// newer reviews. Settings and the last backup date stay from the phone. Day dates (YYYY-MM-DD) compare as text.
export function mergeStates(current, fromBackup) {
  const cards = { ...current.karty }
  for (const [key, card] of Object.entries(fromBackup.karty)) {
    if (!cards[key] || backupCardNewer(card, cards[key])) cards[key] = card
  }
  const a = withDefaultStreak(current.streak)
  const b = withDefaultStreak(fromBackup.streak)
  const streakFromBackup = b.ostatniDzien > a.ostatniDzien || (b.ostatniDzien === a.ostatniDzien && b.dni > a.dni)
  // History: for each day the entry with more grades wins. Reports are added up by id.
  const history = { ...current.historia }
  for (const [date, entry] of Object.entries(fromBackup.historia || {})) {
    if (!history[date] || entry.oceny > history[date].oceny) history[date] = entry
  }
  const reports = [...(current.zgloszenia || [])]
  const known = new Set(reports.map((r) => r.id))
  for (const r of fromBackup.zgloszenia || []) {
    if (known.has(r.id)) continue
    known.add(r.id)
    reports.push(r)
  }
  return {
    karty: cards,
    // Skipped words are the sum of both sides: if a word left study on either phone, it stays out.
    pominiete: { ...(current.pominiete || {}), ...(fromBackup.pominiete || {}) },
    expRazem: Math.max(current.expRazem, fromBackup.expRazem),
    streak: streakFromBackup ? b : a,
    // Catch-up mode comes from the backlog on this phone, so the backup file does not apply to it.
    nadrabianie: withDefaultCatchUp(current.nadrabianie),
    dzis: fromBackup.dzis.data > current.dzis.data ? fromBackup.dzis : current.dzis,
    historia: history,
    zgloszenia: reports,
    ustawienia: current.ustawienia,
    ostatniaKopia: current.ostatniaKopia,
    // The one-time due date spread is about this phone, not about the backup file.
    rozproszono: current.rozproszono || 0,
  }
}

// "Reload words": a fresh start on the built-in deck, asked for by the user. Cards, history, points, the streak and
// reports go; settings and removed words stay (a removed word is kept by its id, so it stays out of the new deck too).
// The due date spread is a migration of old cards, and there are none now, so it is marked as done.
export function resetProgress(state, now = new Date()) {
  const { wylaczoneTalie, ...settings } = state.ustawienia || {}
  return {
    ...defaultState(now),
    pominiete: state.pominiete || {},
    ustawienia: { ...DEFAULT_SETTINGS, ...settings },
    ostatniaKopia: state.ostatniaKopia || '',
    rozproszono: 1,
  }
}

export const fileName = (now = new Date()) => `flashcards-backup-${localDate(now)}.json`

function parse(raw, now = new Date()) {
  if (typeof raw !== 'string') return fail('No data.')
  try {
    return validateState(JSON.parse(raw), now)
  } catch {
    return fail('Broken JSON.')
  }
}

const describeError = (error) => (error && (error.name || error.message)) || String(error)

function keepBroken(storage, raw) {
  try {
    storage.setItem(KEY_BROKEN, raw)
  } catch {
    // no space to keep the broken text must not block the start
  }
}

// A broken save is not overwritten blindly: the raw text goes under a separate key, and the state comes back from the
// day copy. `skipped` is the number of broken cards skipped while reading.
export function load(storage = defaultStorage(), now = new Date()) {
  let raw
  try {
    raw = storage.getItem(KEY)
  } catch (error) {
    return {
      state: defaultState(now),
      warning: `No access to the phone storage (${describeError(error)}). Progress will not be saved.`,
      skipped: 0,
    }
  }
  if (raw === null) return { state: defaultState(now), warning: '', skipped: 0 }
  const result = parse(raw, now)
  if (result.ok) {
    // Skipped cards disappear at the next save, so the raw text stays under a separate key.
    if (result.skipped) keepBroken(storage, raw)
    return { state: result.state, warning: '', skipped: result.skipped }
  }

  keepBroken(storage, raw)
  let backup
  try {
    backup = parse(storage.getItem(KEY_PREVIOUS), now)
  } catch {
    backup = fail('')
  }
  if (backup.ok) {
    return {
      state: backup.state,
      warning: `The saved progress was broken (${result.error}). The copy from the start of the day was restored.`,
      skipped: backup.skipped,
    }
  }
  return {
    state: defaultState(now),
    warning: `The saved progress was broken (${result.error}) and there is no day copy. The raw data was kept under the key ${KEY_BROKEN}.`,
    skipped: 0,
  }
}

const outOfSpace = (error) => error && (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014)

export function save(state, storage = defaultStorage()) {
  let saveText
  try {
    saveText = JSON.stringify(packState(state))
    storage.setItem(KEY, saveText)
    return { ok: true }
  } catch (error) {
    if (!saveText || !outOfSpace(error)) return { ok: false, error: describeError(error) }
    // When space runs out, the current progress matters more than older backup copies.
    for (const key of [KEY_BEFORE_LOAD, KEY_BROKEN, KEY_PREVIOUS]) {
      try {
        storage.removeItem(key)
        storage.setItem(KEY, saveText)
        return { ok: true, freed: key }
      } catch {
        // we try to free the next copy
      }
    }
    return { ok: false, error: describeError(error) }
  }
}

// Once a day a copy of the state in case of a bug in the code. Only a state that passes validation is copied.
export function dailyCopy(storage = defaultStorage(), now = new Date()) {
  const day = localDate(now)
  try {
    if (storage.getItem(KEY_PREVIOUS_DAY) === day) return false
    const raw = storage.getItem(KEY)
    if (raw === null || !parse(raw).ok) return false
    storage.setItem(KEY_PREVIOUS, raw)
    storage.setItem(KEY_PREVIOUS_DAY, day)
    return true
  } catch {
    return false
  }
}

export function keepBeforeLoad(storage = defaultStorage()) {
  const raw = storage.getItem(KEY)
  if (raw !== null) storage.setItem(KEY_BEFORE_LOAD, raw)
}

export async function askForPersistence() {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) === true
  } catch {
    return false
  }
}

// iOS does not save a file through <a download> in a home screen app, so first the share sheet.
// Not every system shares the application/json type, so the second try is text/plain with the same name.
// Call it without an earlier await in the tap handler, otherwise iOS decides it is not a user gesture.
// Returns 'shared', 'downloaded' or 'cancelled'.
export async function saveBackup(state, library, now = new Date()) {
  const name = fileName(now)
  const content = JSON.stringify(backupFile(state, library, now))
  for (const type of ['application/json', 'text/plain']) {
    const file = new File([content], name, { type })
    if (!navigator.canShare?.({ files: [file] })) continue
    try {
      await navigator.share({ files: [file], title: name })
      return 'shared'
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'
      throw error
    }
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  return 'downloaded'
}
