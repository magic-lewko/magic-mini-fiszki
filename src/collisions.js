// Index of collisions between words: pairs that should not be introduced next to each other (interference).
// Research: semantic grouping hurts (a 2026 meta-analysis), and similar words cause interference errors
// (Nakata and Suzuki 2019). We catch two kinds of collisions:
//   1) synonyms: the same main Polish meaning,
//   2) close in spelling: one edit OR swapping two neighboring letters (quiet/quite),
//      with a length of at least 4 chars.
// Distance 2 is too loose: it catches room/soon and covers 79% of the deck.
// The module is pure (no DOM), counted once after the deck loads; the app keeps the result in IndexedDB.

export const MAX_COLLISIONS = 8
export const MIN_SPELLING_LENGTH = 4
export const MIN_MEANING_LENGTH = 3
export const MAX_MEANING_GROUP = 5

const POLISH_LETTERS = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' }

export const withoutPolishLetters = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => POLISH_LETTERS[c])

// Damerau-Levenshtein with a limit of 1: one substitution, insertion, deletion or swap of neighbors.
export function close(a, b) {
  if (a === b) return false
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const different = []
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) different.push(i)
    if (different.length === 1) return true
    // swap of neighboring letters: quiet / quite
    if (different.length === 2 && different[1] === different[0] + 1) {
      return a[different[0]] === b[different[0] + 1] && a[different[0] + 1] === b[different[0]]
    }
    return false
  }
  // one insertion or deletion
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  let j = 0
  let skipped = false
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1
      j += 1
      continue
    }
    if (skipped) return false
    skipped = true
    j += 1
  }
  return true
}

// Main meanings: the first part before ";", split by commas, without brackets, without Polish letters,
// only parts longer than 2 chars ("byc", "miec" stay, "on" is dropped).
export const mainMeanings = (pl) =>
  withoutPolishLetters(pl)
    .split(';')[0]
    .split(',')
    .map((m) => m.replace(/\(.*?\)/g, '').trim())
    .filter((m) => m.length >= MIN_MEANING_LENGTH)

// Returns { [id]: [ids of similar words] } only for words that have any collision.
// The list is cut to `max` items: with 8 collisions more of them change nothing anyway.
export function buildCollisions(words, max = MAX_COLLISIONS) {
  const collisions = new Map(words.map((w) => [w.id, new Set()]))
  const add = (a, b) => {
    collisions.get(a).add(b)
    collisions.get(b).add(a)
  }

  // 1) synonyms: the same main Polish meaning. Groups over MAX_MEANING_GROUP are catch-all words
  // ("robic", "rzecz"), where a collision says nothing.
  const byMeaning = new Map()
  for (const w of words) {
    // A set, not a list: a repeated meaning in one field ("kot, kot") would put the id twice
    // and the word would collide with itself.
    for (const m of mainMeanings(w.pl)) {
      if (!byMeaning.has(m)) byMeaning.set(m, new Set())
      byMeaning.get(m).add(w.id)
    }
  }
  for (const set of byMeaning.values()) {
    const list = [...set]
    if (list.length < 2 || list.length > MAX_MEANING_GROUP) continue
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) add(list[i], list[j])
    }
  }

  // 2) close in spelling. We compare only words of the same length and one longer, because with
  // a bigger difference one edit is not enough.
  const byLength = new Map()
  for (const w of words) {
    const spelling = String(w.w ?? '').toLowerCase()
    if (spelling.length < MIN_SPELLING_LENGTH || spelling.includes(' ')) continue
    if (!byLength.has(spelling.length)) byLength.set(spelling.length, [])
    byLength.get(spelling.length).push({ id: w.id, w: spelling })
  }
  for (const [length, list] of byLength) {
    const candidates = [...list, ...(byLength.get(length + 1) || [])]
    for (const a of list) {
      for (const b of candidates) {
        if (a.id >= b.id) continue
        if (close(a.w, b.w)) add(a.id, b.id)
      }
    }
  }

  const result = Object.create(null)
  for (const [id, set] of collisions) {
    if (set.size) result[id] = [...set].slice(0, max)
  }
  return result
}

// FNV-1a 32 bit over the words: the key of the saved index must change after every deck change,
// not only after a change of the word count (a spelling fix keeps the old count).
export function checksum(words) {
  let h = 2166136261
  for (const w of words) {
    // Content, not only the id: a fix of spelling or translation changes collisions, so the index must be counted again.
    const entry = `${w.id ?? ''}|${w.w ?? ''}|${w.pl ?? ''}`
    for (let i = 0; i < entry.length; i++) h = Math.imul(h ^ entry.charCodeAt(i), 16777619)
    h = Math.imul(h ^ 124, 16777619)
  }
  return (h >>> 0).toString(36)
}

export const indexKey = (words) => `${words.length}-${checksum(words)}`
