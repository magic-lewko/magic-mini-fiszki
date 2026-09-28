// The deck (up to about 6000 words, about 1.5 MB) in IndexedDB, as one record { wersja, slowa, talie }.
// The collision index (about 50 KB with 3000 words) is in a separate record, so saving the deck does not rewrite it.
// localStorage in WebKit has about 5 MB counted in UTF-16 and stays only for progress.
//
// The database name, store, keys and record fields stay as the Polish version saved them (the phone keeps
// the real data): database 'mmf', store 'dane', keys 'talia' and 'kolizje'. In memory the library is { words, decks }.

const DATABASE_NAME = 'mmf'
const STORE = 'dane'
const LIBRARY_KEY = 'talia'
const COLLISIONS_KEY = 'kolizje'
export const OPEN_TIMEOUT_MS = 5000
export const NO_RESPONSE = 'The word database does not respond. Close the app in the app switcher and open it again.'

const noResponseError = () => Object.assign(new Error(NO_RESPONSE), { name: 'DatabaseNotResponding' })

// WebKit can hang indexedDB.open without any event (for example after the app sleeps), and the start would stop.
// After a timeout or a block the opening ends with an error, and a connection opened after that is closed.
function open() {
  let timer
  let abandoned = false
  const opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('This browser has no IndexedDB'))
      return
    }
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => {
      if (abandoned) request.result.close()
      else resolve(request.result)
    }
    request.onerror = () => reject(request.error || new Error('Could not open the database'))
    request.onblocked = () => {
      abandoned = true
      reject(noResponseError())
    }
  })
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      abandoned = true
      reject(noResponseError())
    }, OPEN_TIMEOUT_MS)
  })
  return Promise.race([opening, timeout]).finally(() => clearTimeout(timer))
}

async function inTransaction(mode, action) {
  const database = await open()
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, mode)
      const request = action(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error || new Error('Transaction error'))
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
    })
  } finally {
    database.close()
  }
}

// iOS can drop the database connection after the app sleeps, so every operation opens the database again
// and has one retry. put is idempotent, so repeating a save is safe.
// After a timeout a second try would only make the wait for the message longer.
async function withRetry(operation) {
  try {
    return await operation()
  } catch (error) {
    if (error?.name === 'DatabaseNotResponding') throw error
    return await operation()
  }
}

export async function loadLibrary() {
  const record = await withRetry(() => inTransaction('readonly', (store) => store.get(LIBRARY_KEY)))
  if (record === undefined) return { words: [], decks: [] }
  if (!record || !Array.isArray(record.slowa)) throw new Error('The saved deck has an unknown format')
  return { words: record.slowa, decks: Array.isArray(record.talie) ? record.talie : [] }
}

export function saveLibrary({ words, decks }) {
  return withRetry(() => inTransaction('readwrite', (store) => store.put({ wersja: 1, slowa: words, talie: decks }, LIBRARY_KEY)))
}

// The collision index under a key that depends on the deck: after the deck changes, the old entry does not match
// and is counted again. A missing index must not stop the app, so reading and saving do not throw,
// they return null / false.
export async function loadCollisions(key) {
  try {
    const record = await withRetry(() => inTransaction('readonly', (store) => store.get(COLLISIONS_KEY)))
    if (!record || record.klucz !== key || typeof record.kolizje !== 'object') return null
    return record.kolizje
  } catch {
    return null
  }
}

export async function saveCollisions(key, collisions) {
  try {
    await withRetry(() => inTransaction('readwrite', (store) => store.put({ klucz: key, kolizje: collisions }, COLLISIONS_KEY)))
    return true
  } catch {
    return false
  }
}
