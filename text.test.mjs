// UI text helpers: plural forms, time and date formats. Run: node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as t from './src/text.js'

test('English plural', () => {
  assert.equal(t.count(0, 'card', 'cards'), '0 cards')
  assert.equal(t.count(1, 'card', 'cards'), '1 card')
  assert.equal(t.count(2, 'card', 'cards'), '2 cards')
  assert.equal(t.skippedCardsText(1), 'Skipped 1 broken card')
})

test('time as m:ss and dates in English', () => {
  assert.equal(t.formatTime(0), '0:00')
  assert.equal(t.formatTime(65.4), '1:05')
  assert.equal(t.formatTime(-3), '0:00')
  assert.equal(t.formatDate('2026-09-28'), '28 September 2026')
})

test('heatmap caption', () => {
  assert.equal(t.heatmapCaption({ today: 0, best: 0, studyDays: 0 }), 'Study history starts today.')
  assert.equal(t.heatmapCaption({ today: 1, best: 12, studyDays: 5 }), 'today 1 card · best day: 12 · study days: 5')
  assert.equal(t.heatmapCaption({ today: 12, best: 12, studyDays: 5 }), 'today 12 cards · study days: 5')
})

test('words for a chosen deck', () => {
  const result = { words: [{ id: 'a', talia: 'Mine' }, { id: 'b', talia: 'Old' }] }
  assert.deepEqual(t.wordsForDeck(result, 'Mine'), [{ id: 'a', talia: 'Mine' }, { id: 'b', talia: 'Mine' }])
  assert.equal(t.wordsForDeck(result, ''), result.words)
})

test('grade labels and swipes have a tone, icon and direction', () => {
  for (const g of Object.values(t.GRADES)) assert.ok(g.tone && g.icon && g.label && g.direction)
  assert.deepEqual(Object.keys(t.SWIPES), ['right', 'left', 'up', 'down'])
  assert.equal(t.STUDY_RULES.length, 7)
})

test('markWord finds the studied word with an ending, irregular forms stay unmarked', () => {
  const match = (sentence, word) => t.markWord(sentence, word).match
  assert.equal(match('Where did you get that bag?', 'get'), 'get')
  assert.equal(match('We are making dinner.', 'make'), 'making')
  assert.equal(match('She studied hard.', 'study'), 'studied')
  assert.equal(match('I was running late.', 'run'), 'running')
  assert.equal(match('Sets of cups.', 'set'), 'Sets')
  assert.equal(match('I love ice cream!', 'ice cream'), 'ice cream')
  assert.deepEqual(t.markWord('I got it.', 'get'), { before: 'I got it.', match: '', after: '' })
  assert.equal(match('The asset is big.', 'set'), '')
  const parts = t.markWord('We are making dinner.', 'make')
  assert.equal(parts.before + parts.match + parts.after, 'We are making dinner.')
})
