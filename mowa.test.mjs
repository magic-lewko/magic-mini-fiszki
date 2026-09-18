// Wybor glosu do wymowy. Uruchomienie: node --test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wybierzGlos } from './zrodlo/mowa.js'

const g = (name, lang, localService = true) => ({ name, lang, localService })

test('najpierw Daniel en-GB (wersja rozszerzona), potem dowolny lokalny en-GB', () => {
  const lista = [
    g('Albert', 'en-US'),
    g('Samantha', 'en-US'),
    g('Karen', 'en-AU'),
    g('Arthur', 'en-GB'),
    g('Daniel', 'en-GB'),
    g('Daniel (Enhanced)', 'en-GB'),
    g('Zosia', 'pl-PL'),
  ]
  assert.equal(wybierzGlos(lista).name, 'Daniel (Enhanced)')
  assert.equal(wybierzGlos(lista.filter((x) => !x.name.startsWith('Daniel'))).name, 'Arthur')
  assert.equal(wybierzGlos([g('Daniel', 'en-GB', false), g('Arthur (Premium)', 'en-GB'), g('Kate', 'en-GB')]).name, 'Arthur (Premium)')
})

test('bez en-GB: Samantha, potem dowolny lokalny en-US, bez glosow novelty', () => {
  const lista = [g('Fred', 'en-US'), g('Whisper', 'en-US'), g('Bad News', 'en-US'), g('Alex', 'en-US'), g('Samantha', 'en-US'), g('Samantha (Premium)', 'en-US')]
  assert.equal(wybierzGlos(lista).name, 'Samantha (Premium)')
  assert.equal(wybierzGlos(lista.filter((x) => !x.name.startsWith('Samantha'))).name, 'Alex')
  assert.equal(wybierzGlos([g('Zarvox', 'en-US'), g('Good News', 'en-US'), g('Junior', 'en-US')]), undefined)
})

test('potem dowolny lokalny angielski, na koncu dowolny angielski', () => {
  assert.equal(wybierzGlos([g('Good News', 'en-US'), g('Moira', 'en-IE', false), g('Karen', 'en_AU')]).name, 'Karen')
  assert.equal(wybierzGlos([g('Zarvox', 'en-US'), g('Google UK English Female', 'en-GB', false), g('Zosia', 'pl-PL')]).name, 'Google UK English Female')
  assert.equal(wybierzGlos([g('Zosia', 'pl-PL')]), undefined)
  assert.equal(wybierzGlos([]), undefined)
})
