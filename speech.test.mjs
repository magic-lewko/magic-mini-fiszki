// Choosing the voice for pronunciation. Run: node --test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickVoice } from './src/speech.js'

const v = (name, lang, localService = true) => ({ name, lang, localService })

test('first Daniel en-GB (enhanced version), then any local en-GB', () => {
  const list = [v('Albert', 'en-US'), v('Samantha', 'en-US'), v('Karen', 'en-AU'), v('Arthur', 'en-GB'), v('Daniel', 'en-GB'), v('Daniel (Enhanced)', 'en-GB'), v('Zosia', 'pl-PL')]
  assert.equal(pickVoice(list).name, 'Daniel (Enhanced)')
  assert.equal(pickVoice(list.filter((x) => !x.name.startsWith('Daniel'))).name, 'Arthur')
  assert.equal(pickVoice([v('Daniel', 'en-GB', false), v('Arthur (Premium)', 'en-GB'), v('Kate', 'en-GB')]).name, 'Arthur (Premium)')
})

test('without en-GB: Samantha, then any local en-US, without novelty voices', () => {
  const list = [v('Fred', 'en-US'), v('Whisper', 'en-US'), v('Bad News', 'en-US'), v('Alex', 'en-US'), v('Samantha', 'en-US'), v('Samantha (Premium)', 'en-US')]
  assert.equal(pickVoice(list).name, 'Samantha (Premium)')
  assert.equal(pickVoice(list.filter((x) => !x.name.startsWith('Samantha'))).name, 'Alex')
  assert.equal(pickVoice([v('Zarvox', 'en-US'), v('Good News', 'en-US'), v('Junior', 'en-US')]), undefined)
})

test('then any local English, at the end any English', () => {
  assert.equal(pickVoice([v('Good News', 'en-US'), v('Moira', 'en-IE', false), v('Karen', 'en_AU')]).name, 'Karen')
  assert.equal(pickVoice([v('Zarvox', 'en-US'), v('Google UK English Female', 'en-GB', false), v('Zosia', 'pl-PL')]).name, 'Google UK English Female')
  assert.equal(pickVoice([v('Zosia', 'pl-PL')]), undefined)
  assert.equal(pickVoice([]), undefined)
})
