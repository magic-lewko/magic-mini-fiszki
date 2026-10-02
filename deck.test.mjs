// The built-in deck src/public/deck.json: what the app downloads on "Reload words". It is built by deck/build.mjs,
// so this checks the result the user gets, not the scripts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parsePasted } from './src/words.js'

const deck = JSON.parse(readFileSync(new URL('./src/public/deck.json', import.meta.url), 'utf8'))
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1']

test('built-in deck: 5000 words that load with no errors, level by level', () => {
  assert.equal(deck.nazwa, 'English 5000')
  assert.equal(deck.slowa.length, 5000)
  const parsed = parsePasted(JSON.stringify(deck))
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors.slice(0, 5)))
  assert.equal(parsed.words.length, 5000)
  const levels = deck.slowa.map((w) => LEVELS.indexOf(w.poziom))
  assert.ok(levels.every((l) => l >= 0), 'every word has a level A1-C1')
  assert.ok(levels.every((l, i) => i === 0 || l >= levels[i - 1]), 'the order goes level by level')
})

test('built-in deck: every word has a sentence, meanings are complete and match pl', () => {
  for (const w of deck.slowa) {
    assert.ok(w.zdanie && w.zdaniePl, `${w.w}: no sentence`)
    if (!w.znaczenia) continue
    assert.ok(w.znaczenia.length >= 2 && w.znaczenia.length <= 4, `${w.w}: ${w.znaczenia.length} meanings`)
    assert.equal(w.pl, w.znaczenia.map((m) => m.pl).join('; '), w.w)
    for (const m of w.znaczenia) assert.ok(m.zdanie && m.zdaniePl, `${w.w}: the meaning "${m.pl}" has no sentence`)
  }
  assert.ok(deck.slowa.filter((w) => w.znaczenia).length > 500, 'many words have meanings')
})
