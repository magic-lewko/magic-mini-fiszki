// Words from pasted text or a file, and merging them into the deck. No DOM, tested in Node.
// Formats: a JSON object { nazwa?, zrodlo?, slowa: [...] } (deck name, source, words), a plain JSON array of words,
// or text line by line "english ; polish" (or a tab), with optional columns: sentence and Polish sentence.
// The id is `w` by default and is case sensitive: "May" (the month) and "may" (the verb) are different words.
//
// A word keeps the saved field names: id, w (English), pl (Polish), poziom (level), ipa, czesci (parts of speech),
// zdanie (sentence), zdaniePl (Polish sentence), talia (deck). This is the deck file and backup format.

import { localDate } from './study.js'

export const CONTENT_FIELDS = ['w', 'pl', 'poziom', 'ipa', 'czesci', 'zdanie', 'zdaniePl']

const isObject = (x) => typeof x === 'object' && x !== null && !Array.isArray(x)
const text = (x) => (typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : '')

// Returns { word } or { error }. Empty optional fields are not saved, so the deck takes less space.
export function normalizeWord(raw, deck = '') {
  if (!isObject(raw)) return { error: 'this is not a word object' }
  const w = text(raw.w)
  const pl = text(raw.pl)
  if (!w) return { error: 'no English word (field "w")' }
  if (!pl) return { error: 'no translation (field "pl")' }
  const id = text(raw.id) || w
  if (id.includes('|')) return { error: 'the sign "|" is not allowed in the id' }

  const word = { id, w, pl }
  const level = text(raw.poziom).toUpperCase()
  if (level) word.poziom = level
  // The transcription is sometimes written in slashes, and the UI adds them by itself.
  const ipa = text(raw.ipa).replace(/^[/[\s]+|[/\]\s]+$/g, '')
  if (ipa) word.ipa = ipa
  const parts = (Array.isArray(raw.czesci) ? raw.czesci.map(text) : text(raw.czesci).split(','))
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length) word.czesci = parts
  const sentence = text(raw.zdanie)
  if (sentence) word.zdanie = sentence
  const sentencePl = text(raw.zdaniePl)
  if (sentencePl) word.zdaniePl = sentencePl
  const deckName = text(deck)
  if (deckName) word.talia = deckName
  return { word }
}

function emptyResult(format, name, source) {
  return { format, name, source, unit: format === 'text' ? 'line' : 'item', words: [], errors: [], generalError: '' }
}

// A repeated id in one import is almost always a mistake, so we report it instead of quietly overwriting.
function add(result, nr, raw) {
  const { word, error } = normalizeWord(raw, result.name)
  if (error) {
    result.errors.push({ nr, error })
    return
  }
  const first = result.numbers.get(word.id)
  if (first !== undefined) {
    result.errors.push({ nr, error: `repeated word "${word.id}" (first time: ${result.unit} ${first})` })
    return
  }
  result.numbers.set(word.id, nr)
  result.words.push(word)
}

function fromArray(array, format, name, source) {
  const result = { ...emptyResult(format, name, source), numbers: new Map() }
  array.forEach((raw, i) => add(result, i + 1, raw))
  delete result.numbers
  return result
}

function fromText(whole, name) {
  const result = { ...emptyResult('text', name, ''), numbers: new Map() }
  whole.split(/\r\n|\r|\n/).forEach((line, i) => {
    if (!line.trim() || line.trimStart().startsWith('#')) return
    const separator = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ''
    if (!separator) {
      result.errors.push({ nr: i + 1, error: 'no semicolon or tab between the word and the translation' })
      return
    }
    const [english, pl, sentence, sentencePl] = line.split(separator)
    add(result, i + 1, { w: english, pl, zdanie: sentence, zdaniePl: sentencePl })
  })
  delete result.numbers
  return result
}

export function parsePasted(input, now = new Date()) {
  const whole = String(input ?? '').replace(/^﻿/, '')
  const defaultName = `Pasted ${localDate(now)}`
  const start = whole.trimStart()[0]
  if (start !== '{' && start !== '[') return fromText(whole, defaultName)

  let data
  try {
    data = JSON.parse(whole)
  } catch (error) {
    return { ...emptyResult('json', defaultName, ''), generalError: `Invalid JSON: ${error.message}` }
  }
  if (Array.isArray(data)) return fromArray(data, 'array', defaultName, '')
  if (!isObject(data) || !Array.isArray(data.slowa)) {
    return { ...emptyResult('json', defaultName, ''), generalError: 'The JSON file has no "slowa" array.' }
  }
  return fromArray(data.slowa, 'json', text(data.nazwa) || defaultName, text(data.zrodlo))
}

const content = (word, field) => (Array.isArray(word[field]) ? word[field].join('\u0000') : word[field] ?? '')

// New words go to the end of the study order, existing ones get new content. A field missing in the import stays old,
// so pasting "apple ; jablko" does not delete the transcription and sentences from the full list. An existing word stays
// in its deck. Progress is kept separately by id, so merging does not touch it.
export function merge(current, incoming) {
  const positions = new Map(current.map((w, i) => [w.id, i]))
  const words = [...current]
  let added = 0
  let updated = 0
  let unchanged = 0
  for (const w of incoming) {
    const i = positions.get(w.id)
    if (i === undefined) {
      positions.set(w.id, words.length)
      words.push(w)
      added += 1
      continue
    }
    const old = words[i]
    const joined = { ...old }
    for (const field of CONTENT_FIELDS) {
      if (w[field] !== undefined) joined[field] = w[field]
    }
    if (CONTENT_FIELDS.some((field) => content(joined, field) !== content(old, field))) {
      words[i] = joined
      updated += 1
    } else {
      unchanged += 1
    }
  }
  return { words, added, updated, unchanged }
}

// Deck list for the menu (sources and licenses). Importing the same name again updates the entry.
// Entries keep the saved field names: nazwa (name), zrodlo (source), dodano (added at).
export function addDeck(decks, { name, source }, now = new Date()) {
  const others = (decks || []).filter((d) => d.nazwa !== name)
  return [...others, { nazwa: name, zrodlo: source || '', dodano: now.toISOString() }]
}
