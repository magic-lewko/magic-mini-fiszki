// The "Letters" game: building an English word from scattered letters. A pure module: no DOM, no timers,
// no Math.random. The building state is passed in and returned, never changed in place.
// Each word gets a few extra letters (without them the game was too easy, and words over 6 chars
// came only from their own letters). An extra letter can only be one that, with the rest, would not build
// another word from the deck - otherwise the player would build a correct word and get an error. There are never
// more tiles than MAX_TILES, so they fit on a phone screen as 44 px touch targets.

export const MIN_LENGTH = 3
export const MAX_TILES = 14
export const EXTRA_MIN = 4
export const EXTRA_MAX = 6
export const ROUND_LENGTH = 10

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'
// Only Latin letters: words with a space, apostrophe or slash do not work as tiles.
const ONLY_LETTERS = /^[A-Za-z]+$/

// FNV-1a 32 bit, the same as in study.js: turns any seed (a number or text) into the generator state.
function hash32(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

// Mulberry32: a short pseudo-random generator with a repeatable sequence. The copy from crossword.js is on purpose -
// both games are meant to be independent, so the UI could load only one of them.
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

const english = (item) => (typeof item === 'string' ? item : String(item?.w ?? '')).trim()

const fits = (w) => ONLY_LETTERS.test(w) && w.length >= MIN_LENGTH

// How many times each letter is in the word. Key "letter": two Ts and two Es must be two tiles.
function countLetters(text) {
  const map = new Map()
  for (const char of text) map.set(char, (map.get(char) || 0) + 1)
  return map
}

const canBuild = (stock, word) => {
  for (const [letter, count] of word) if ((stock.get(letter) || 0) < count) return false
  return true
}

// Words from the deck that can be built only after adding 1..`count` letters. The ones that already come from
// the letters of the task alone (for example "cat" from "cats") we skip: no extra letter would undo them.
function riskyFromDeck(deck, lower, stock, count) {
  const result = []
  const max = lower.length + count
  for (const item of deck) {
    const word = english(item).toLowerCase()
    if (word === lower || word.length < MIN_LENGTH || word.length > max) continue
    if (!ONLY_LETTERS.test(word)) continue
    const map = countLetters(word)
    let missing = 0
    for (const [letter, need] of map) missing += Math.max(0, need - (stock.get(letter) || 0))
    if (missing > 0 && missing <= count) result.push(map)
  }
  return result
}

// Extra letters: from the alphabet, always from outside the word (otherwise they could not be told apart from
// the needed ones) and such that with the stock they do not build another word from the deck.
function pickExtra(lower, count, deck, random) {
  if (count <= 0) return []
  const stock = countLetters(lower)
  const risky = riskyFromDeck(Array.isArray(deck) ? deck : [], lower, stock, count)
  const added = []
  for (const letter of shuffle(
    [...ALPHABET].filter((c) => !stock.has(c)),
    random,
  )) {
    if (added.length >= count) break
    stock.set(letter, 1)
    if (risky.some((r) => canBuild(stock, r))) {
      stock.delete(letter)
      continue
    }
    added.push(letter.toUpperCase())
  }
  return added
}

// The longer the word, the fewer extra letters fit: the tile limit covers both parts.
const extraCount = (length, extra, random) => {
  if (typeof extra === 'number') return Math.max(0, Math.trunc(extra))
  const count = EXTRA_MIN + Math.floor(random() * (EXTRA_MAX - EXTRA_MIN + 1))
  return Math.max(0, Math.min(count, MAX_TILES - length))
}

// Prepares the tiles for one word. `word` is a text or a deck item, `deck` is the list of words
// that must not be buildable from the extra letters. Tiles are capital letters, so the case
// in the word ("May") does not hint which letter is first.
export function prepareLetters(word, { seed = 0, extra, deck = [] } = {}) {
  const w = english(word)
  if (!fits(w)) return { letters: [], answer: w, added: [] }
  const random = generator(`${seed}|${w}`)
  const lower = w.toLowerCase()
  const added = pickExtra(lower, extraCount(w.length, extra, random), deck, random)
  return { letters: shuffle([...w.toUpperCase(), ...added], random), answer: w, added }
}

// The word built from the chosen tiles.
export const built = (state) => (state?.picked ?? []).map((i) => state.letters[i]).join('')

// Adds the tile with the given index. The same tile cannot be used twice, and the word length cannot be passed.
// When the move is not possible, we return the same state - the UI knows from this that nothing happened.
export function addLetter(state, index) {
  const letters = state?.letters ?? []
  const picked = state?.picked ?? []
  if (!Number.isInteger(index) || index < 0 || index >= letters.length) return state
  if (picked.includes(index)) return state
  if (picked.length >= String(state?.answer ?? '').length) return state
  return { ...state, picked: [...picked, index] }
}

// Takes off the last tile. With an empty answer it returns the same state.
export function removeLetter(state) {
  const picked = state?.picked ?? []
  if (!picked.length) return state
  return { ...state, picked: picked.slice(0, -1) }
}

// Is the word built correctly? Case does not matter, because tiles are capital letters.
export function isCorrect(state) {
  const answer = String(state?.answer ?? '')
  if (!answer) return false
  return built(state).toLowerCase() === answer.toLowerCase()
}

// Hint: first takes off letters from the first mistake, then adds the next correct one.
// Returns { state, index, char, removed }; `index` is null when there is nothing left to hint.
export function hintNextLetter(state) {
  const answer = String(state?.answer ?? '')
  const letters = state?.letters ?? []
  const picked = state?.picked ?? []
  let good = 0
  while (good < picked.length && good < answer.length && String(letters[picked[good]] ?? '').toLowerCase() === answer[good].toLowerCase()) {
    good += 1
  }
  const kept = picked.slice(0, good)
  const removed = picked.length - good
  const trimmed = removed ? { ...state, picked: kept } : state

  if (good >= answer.length) return { state: trimmed, index: null, char: '', removed }
  const wanted = answer[good].toLowerCase()
  const used = new Set(kept)
  const index = letters.findIndex((char, i) => !used.has(i) && String(char).toLowerCase() === wanted)
  if (index < 0) return { state: trimmed, index: null, char: '', removed }

  return {
    state: { ...state, picked: [...kept, index], hints: (state?.hints ?? 0) + 1 },
    index,
    char: letters[index],
    removed,
  }
}

// A series of words for the game. Each task is a ready building state, so addLetter and the rest work on it
// directly. The seed of each task comes from the word id, so the order in the series does not change it.
export function newRound(words, { length = ROUND_LENGTH, seed = 0 } = {}) {
  const list = Array.isArray(words) ? words : []
  const good = list.filter((item) => fits(english(item)))
  const drawn = shuffle(good, generator(seed)).slice(0, Math.max(0, Math.trunc(length)))
  const tasks = drawn.map((item) => {
    const w = english(item)
    const id = String(item?.id ?? w)
    const { letters, answer, added } = prepareLetters(w, { seed: `${seed}|${id}`, deck: list })
    return { id, pl: String(item?.pl ?? ''), answer, letters, added, picked: [], hints: 0 }
  })
  return { seed, length, position: 0, tasks }
}
