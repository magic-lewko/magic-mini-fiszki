// Otwieranie IndexedDB z limitem czasu: WebKit potrafi zawiesic open bez zadnego zdarzenia. Uruchomienie: node --test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BRAK_ODPOWIEDZI, LIMIT_OTWARCIA_MS, wczytajTalie } from './zrodlo/baza.js'

// Udawane indexedDB.open: zachowanie dostaje obiekt zadania dopiero po podpieciu obslugi zdarzen.
function udawanaBaza(t, zachowanie) {
  const zadania = []
  globalThis.indexedDB = {
    open() {
      const zadanie = {}
      zadania.push(zadanie)
      queueMicrotask(() => zachowanie(zadanie))
      return zadanie
    },
  }
  t.after(() => {
    delete globalThis.indexedDB
  })
  return zadania
}

const przeplyw = () => new Promise((ok) => setImmediate(ok))

test('zawieszone otwarcie bazy konczy sie komunikatem po limicie, bez drugiej proby', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const zadania = udawanaBaza(t, () => {})
  let blad = null
  const wynik = wczytajTalie().catch((e) => {
    blad = e
  })
  t.mock.timers.tick(LIMIT_OTWARCIA_MS - 1)
  await przeplyw()
  assert.equal(blad, null)
  t.mock.timers.tick(1)
  await wynik
  assert.equal(blad?.message, BRAK_ODPOWIEDZI)
  assert.equal(zadania.length, 1)
})

test('zablokowane otwarcie od razu konczy sie tym samym komunikatem', async (t) => {
  const zadania = udawanaBaza(t, (zadanie) => zadanie.onblocked())
  await assert.rejects(wczytajTalie(), { message: BRAK_ODPOWIEDZI })
  assert.equal(zadania.length, 1)
})

test('polaczenie otwarte juz po limicie jest zamykane', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const zadania = udawanaBaza(t, () => {})
  const wynik = wczytajTalie()
  t.mock.timers.tick(LIMIT_OTWARCIA_MS)
  await assert.rejects(wynik, { message: BRAK_ODPOWIEDZI })
  let zamkniete = 0
  zadania[0].result = {
    close: () => {
      zamkniete += 1
    },
  }
  zadania[0].onsuccess()
  assert.equal(zamkniete, 1)
})

test('zwykly blad otwarcia ma jedna ponowna probe', async (t) => {
  const zadania = udawanaBaza(t, (zadanie) => {
    zadanie.error = new Error('dysk niedostepny')
    zadanie.onerror()
  })
  await assert.rejects(wczytajTalie(), { message: 'dysk niedostepny' })
  assert.equal(zadania.length, 2)
})
