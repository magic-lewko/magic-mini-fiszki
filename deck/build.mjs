// Builds the built-in deck src/public/deck.json from deck/list (the words in study order, by level) and deck/parts
// (the content: translation, meanings, sentences). The list and the content are made for this app, nothing comes from
// a published word list. Run: node deck/build.mjs (it prints problems and stops on errors).
// The deck keeps the saved field names of words (w, pl, poziom, czesci, ipa, zdanie, zdaniePl, znaczenia).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeWord } from '../src/words.js'
import { markWord } from '../src/text.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'src', 'public', 'deck.json')
export const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1']
export const DECK_NAME = 'English 5000'
export const DECK_SIZE = 5000

// The words in study order: level by level, inside a level as in the list file. A word is in its lowest level only.
export function readList(dir = join(HERE, 'list')) {
  const seen = new Set()
  const list = []
  for (const level of LEVELS) {
    const lines = readFileSync(join(dir, `${level}.tsv`), 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const [w, parts = ''] = line.split('\t').map((x) => x.trim())
      if (!w || seen.has(w.toLowerCase())) continue
      seen.add(w.toLowerCase())
      list.push({ w, poziom: level.toUpperCase(), czesci: parts.split(',').map((p) => p.trim()).filter(Boolean) })
    }
  }
  return list
}

export function readParts(dir = join(HERE, 'parts')) {
  const content = new Map()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    for (const raw of JSON.parse(readFileSync(join(dir, file), 'utf8'))) content.set(raw.w, raw)
  }
  return content
}

// Joins the list with the content. Returns { words, errors, warnings }: an error is a word without content or a word
// the app would not load, a warning is a sentence where the card cannot mark the word (an irregular form is fine).
export function buildDeck(list, content, size = DECK_SIZE) {
  const words = []
  const errors = []
  const warnings = []
  for (const item of list) {
    if (words.length >= size) break
    const raw = content.get(item.w)
    if (!raw) {
      errors.push(`${item.w}: no content`)
      continue
    }
    const { word, error } = normalizeWord({ ...raw, w: item.w, poziom: item.poziom, czesci: raw.czesci?.length ? raw.czesci : item.czesci })
    if (error) {
      errors.push(`${item.w}: ${error}`)
      continue
    }
    if (!word.zdanie) errors.push(`${item.w}: no sentence`)
    for (const m of word.znaczenia || []) {
      if (!m.zdanie) errors.push(`${item.w}: the meaning "${m.pl}" has no sentence`)
      else if (!markWord(m.zdanie, item.w).match) warnings.push(`${item.w}: "${m.zdanie}"`)
    }
    words.push(word)
  }
  return { words, errors, warnings }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const list = readList()
  const { words, errors, warnings } = buildDeck(list, readParts())
  const meanings = words.filter((w) => w.znaczenia).length
  console.log(`list ${list.length}, deck ${words.length}, with meanings ${meanings}, sentences without a mark ${warnings.length}`)
  for (const level of LEVELS) console.log(`  ${level.toUpperCase()}: ${words.filter((w) => w.poziom === level.toUpperCase()).length}`)
  if (errors.length) {
    console.log(`${errors.length} errors:\n  ${errors.slice(0, 50).join('\n  ')}`)
    process.exit(1)
  }
  const deck = { nazwa: DECK_NAME, zrodlo: 'magic-mini-fiszki', slowa: words }
  writeFileSync(OUT, JSON.stringify(deck))
  console.log(`saved ${OUT}`)
}
