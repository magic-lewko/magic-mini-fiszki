// Opening IndexedDB with a timeout: WebKit can hang open without any event. Run: node --test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NO_RESPONSE, OPEN_TIMEOUT_MS, loadLibrary } from './src/database.js'

// A fake indexedDB.open: the behavior gets the request object only after the event handlers are set.
function fakeDatabase(t, behavior) {
  const requests = []
  globalThis.indexedDB = {
    open() {
      const request = {}
      requests.push(request)
      queueMicrotask(() => behavior(request))
      return request
    },
  }
  t.after(() => {
    delete globalThis.indexedDB
  })
  return requests
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test('a hanging database open ends with a message after the timeout, without a second try', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const requests = fakeDatabase(t, () => {})
  let error = null
  const result = loadLibrary().catch((e) => {
    error = e
  })
  t.mock.timers.tick(OPEN_TIMEOUT_MS - 1)
  await flush()
  assert.equal(error, null)
  t.mock.timers.tick(1)
  await result
  assert.equal(error?.message, NO_RESPONSE)
  assert.equal(requests.length, 1)
})

test('a blocked open ends at once with the same message', async (t) => {
  const requests = fakeDatabase(t, (request) => request.onblocked())
  await assert.rejects(loadLibrary(), { message: NO_RESPONSE })
  assert.equal(requests.length, 1)
})

test('a connection opened after the timeout is closed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const requests = fakeDatabase(t, () => {})
  const result = loadLibrary()
  t.mock.timers.tick(OPEN_TIMEOUT_MS)
  await assert.rejects(result, { message: NO_RESPONSE })
  let closed = 0
  requests[0].result = {
    close: () => {
      closed += 1
    },
  }
  requests[0].onsuccess()
  assert.equal(closed, 1)
})

test('a normal open error has one retry', async (t) => {
  const requests = fakeDatabase(t, (request) => {
    request.error = new Error('disk not available')
    request.onerror()
  })
  await assert.rejects(loadLibrary(), { message: 'disk not available' })
  assert.equal(requests.length, 2)
})

// A fake database that keeps records in a Map, to check the saved record format.
function memoryDatabase(t) {
  const records = new Map()
  const store = {
    get: (key) => {
      const request = {}
      queueMicrotask(() => {
        request.result = records.get(key)
        tx.oncomplete()
      })
      return request
    },
    put: (value, key) => {
      records.set(key, structuredClone(value))
      const request = {}
      queueMicrotask(() => tx.oncomplete())
      return request
    },
  }
  const tx = { objectStore: () => store }
  const database = { transaction: () => tx, close: () => {}, createObjectStore: () => {} }
  globalThis.indexedDB = {
    open() {
      const request = { result: database }
      queueMicrotask(() => request.onsuccess())
      return request
    },
  }
  t.after(() => {
    delete globalThis.indexedDB
  })
  return records
}

test('the library record keeps the format of the Polish version', async (t) => {
  const records = memoryDatabase(t)
  const { saveLibrary, loadCollisions, saveCollisions } = await import('./src/database.js')
  const words = [{ id: 'apple', w: 'apple', pl: 'jabłko', talia: 'Oxford 3000' }]
  const decks = [{ nazwa: 'Oxford 3000', zrodlo: 'Oxford', dodano: '2026-09-15T08:00:00.000Z' }]
  await saveLibrary({ words, decks })
  assert.deepEqual(records.get('talia'), { wersja: 1, slowa: words, talie: decks })
  assert.deepEqual(await loadLibrary(), { words, decks })

  // A record saved by the Polish version reads the same way.
  records.set('talia', { wersja: 1, slowa: words })
  assert.deepEqual(await loadLibrary(), { words, decks: [] })

  assert.equal(await saveCollisions('3-abc', { apple: ['apply'] }), true)
  assert.deepEqual(records.get('kolizje'), { klucz: '3-abc', kolizje: { apple: ['apply'] } })
  assert.deepEqual(await loadCollisions('3-abc'), { apple: ['apply'] })
  assert.equal(await loadCollisions('4-xyz'), null, 'an index for another deck is not used')
})
