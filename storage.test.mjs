// Saving progress, recovery after damage and the backup with the deck. Run: node --test
process.env.TZ = 'Europe/Warsaw'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nowaKarta as newFsrsCard, ocen as gradeFsrs } from './lib/fsrs.mjs'
import * as st from './src/storage.js'
import { EMPTY_CATCH_UP, EMPTY_STREAK, localDate } from './src/study.js'

class Storage {
  constructor(charLimit = Infinity) {
    this.data = new Map()
    this.limit = charLimit
  }
  getItem(k) {
    return this.data.has(k) ? this.data.get(k) : null
  }
  setItem(k, v) {
    const others = [...this.data].filter(([key]) => key !== k).reduce((sum, [key, value]) => sum + key.length + value.length, 0)
    if (others + k.length + v.length > this.limit) {
      const error = new Error('no space')
      error.name = 'QuotaExceededError'
      throw error
    }
    this.data.set(k, String(v))
  }
  removeItem(k) {
    this.data.delete(k)
  }
}

function sampleState() {
  const state = st.defaultState()
  const now = new Date('2026-09-15T08:00:00.000Z')
  let apple = { ...newFsrsCard(), ...gradeFsrs(newFsrsCard(), 4, now) }
  apple = { ...apple, ...gradeFsrs(apple, 3, new Date('2026-09-24T08:00:00.000Z')) }
  state.karty['apple|en'] = apple
  state.karty['apple|pl'] = { ...newFsrsCard(), ...gradeFsrs(newFsrsCard(), 1, now) }
  state.karty['May|en'] = { ...newFsrsCard(), ...gradeFsrs(newFsrsCard(), 3, now) }
  state.expRazem = 130
  state.streak = { ...EMPTY_STREAK, dni: 3, ostatniDzien: '2026-09-15', zamrozenia: 1, doZamrozenia: 3 }
  state.dzis = { data: '2026-09-15', sekundy: 75.5, dodatkoweNowe: 10, powtorki: 4 }
  state.ustawienia = {
    noweDziennie: 30,
    maksPowtorekDziennie: 100,
    dlugoscSerii: 10,
    autowymowa: false,
    mowienie: true,
    celDzienny: 100,
    podpowiedzMowienie: 'litera',
    kotwica: '',
    samouczekGestow: true,
    wylaczoneTalie: [],
  }
  state.ostatniaKopia = '2026-09-10T08:00:00.000Z'
  return state
}

// The save keeps the due date in minutes, last review and introduction as a local day, FSRS memory with 3 decimals.
function compareCards(a, b) {
  const day = (iso) => (iso ? localDate(new Date(iso)) : '')
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort())
  for (const k of Object.keys(a)) {
    for (const field of ['stan', 'powtorki', 'pomylki', 'krok']) assert.equal(a[k][field], b[k][field], `${k}.${field}`)
    for (const field of ['stabilnosc', 'trudnosc']) assert.ok(Math.abs(a[k][field] - b[k][field]) <= 0.0005, `${k}.${field}`)
    assert.ok(Math.abs(Date.parse(a[k].termin) - Date.parse(b[k].termin)) <= 30000, `${k}.termin`)
    for (const field of ['ostatnio', 'wprowadzono']) assert.equal(day(a[k][field]), day(b[k][field]), `${k}.${field}`)
  }
}

test('saving and reading progress in compact form', () => {
  const storage = new Storage()
  const state = sampleState()
  assert.deepEqual(st.save(state, storage), { ok: true })
  const raw = JSON.parse(storage.getItem(st.KEY))
  assert.equal(raw.wersja, 1)
  assert.equal(raw.karty.apple.length, 2)
  assert.deepEqual(Object.keys(raw.karty).sort(), ['May', 'apple'])

  const { state: loaded, warning } = st.load(storage)
  assert.equal(warning, '')
  compareCards(loaded.karty, state.karty)
  const { karty: _a, ...rest } = loaded
  const { karty: _b, ...expected } = state
  assert.deepEqual(rest, expected)

  // saving the loaded state again gives the same text (no drift between starts)
  const second = new Storage()
  st.save(loaded, second)
  assert.equal(second.getItem(st.KEY), storage.getItem(st.KEY))
})

test('the storage keys are the same as in the Polish version', () => {
  assert.equal(st.KEY, 'mmf-v1')
  assert.equal(st.KEY_PREVIOUS, 'mmf-v1-poprzedni')
  assert.equal(st.KEY_PREVIOUS_DAY, 'mmf-v1-poprzedni-dzien')
  assert.equal(st.KEY_BEFORE_LOAD, 'mmf-v1-przed-wczytaniem')
  assert.equal(st.KEY_BROKEN, 'mmf-v1-uszkodzony')
  assert.equal(st.BACKUP_FORMAT, 'mmf-kopia')
  assert.equal(st.SAVE_VERSION, 1)
  assert.equal(st.BACKUP_VERSION, 2)
})

test('empty storage gives the default state', () => {
  const { state, warning } = st.load(new Storage())
  assert.deepEqual(state, st.defaultState())
  assert.equal(warning, '')
})

test('a save from an old phone (without history and reports) loads with no change', () => {
  const storage = new Storage()
  st.save(sampleState(), storage)
  const old = JSON.parse(storage.getItem(st.KEY))
  // This is how mmf-v1 looked before this version: SAVE_VERSION 1 and only the old fields.
  delete old.historia
  delete old.zgloszenia
  delete old.ustawienia.celDzienny
  delete old.ustawienia.podpowiedzMowienie
  assert.equal(old.wersja, st.SAVE_VERSION)
  storage.setItem(st.KEY, JSON.stringify(old))

  const { state, warning, skipped } = st.load(storage)
  assert.equal(warning, '')
  assert.equal(skipped, 0)
  assert.equal(state.expRazem, 130)
  assert.deepEqual(Object.keys(state.karty).sort(), ['May|en', 'apple|en', 'apple|pl'])
  assert.deepEqual(state.streak, { ...EMPTY_STREAK, dni: 3, ostatniDzien: '2026-09-15', zamrozenia: 1, doZamrozenia: 3 })
  assert.deepEqual(state.historia, {})
  assert.deepEqual(state.zgloszenia, [])
  assert.equal(state.ustawienia.celDzienny, 60)
  assert.equal(state.ustawienia.podpowiedzMowienie, 'brak')
  assert.equal(state.ustawienia.noweDziennie, 30)

  // an old backup (the same fields as the old save) loads too
  const backup = JSON.parse(JSON.stringify(st.backupFile(sampleState(), { words: [{ id: 'apple', w: 'apple', pl: 'jabłko' }] })))
  delete backup.postep.historia
  delete backup.postep.zgloszenia
  const result = st.validateBackup(backup)
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(result.state.historia, {})
  assert.deepEqual(result.state.zgloszenia, [])

  // broken new fields do not make progress invalid
  const bad = JSON.parse(storage.getItem(st.KEY))
  bad.historia = { 'not a date': { oceny: 1 }, '2026-09-15': { oceny: 3, nowe: 'x', exp: -2, sekundy: 9 } }
  bad.zgloszenia = ['not an object', { w: 'no id' }, { id: 'a', w: 'a', pl: 'b', kiedy: 5 }, { id: 'a', w: 'duplicate' }]
  storage.setItem(st.KEY, JSON.stringify(bad))
  const second = st.load(storage).state
  assert.deepEqual(second.historia, { '2026-09-15': { oceny: 3, nowe: 0, exp: 0, sekundy: 9 } })
  assert.deepEqual(second.zgloszenia, [{ id: 'a', w: 'a', pl: 'b', kiedy: '' }])
  assert.equal(second.expRazem, 130)
})

test('history and reports in the save: trimming to 180 days and merging a backup', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const state = sampleState()
  state.historia = {
    '2026-09-15': { oceny: 10, nowe: 2, exp: 300, sekundy: 120 },
    '2026-01-01': { oceny: 5, nowe: 1, exp: 100, sekundy: 60 },
  }
  state.zgloszenia = [{ id: 'apple', w: 'apple', pl: 'jabłko', kiedy: '2026-09-15T08:00:00.000Z' }]
  const packed = st.packState(state, now)
  assert.deepEqual(Object.keys(packed.historia), ['2026-09-15'], 'a day older than 180 days is dropped')
  assert.equal(packed.zgloszenia.length, 1)

  const storage = new Storage()
  st.save(state, storage)
  const loaded = st.load(storage).state
  assert.equal(loaded.historia['2026-09-15'].exp, 300)
  assert.deepEqual(loaded.zgloszenia, state.zgloszenia)

  const fromBackup = {
    ...st.defaultState(),
    historia: {
      '2026-09-15': { oceny: 4, nowe: 0, exp: 40, sekundy: 20 },
      '2026-09-14': { oceny: 7, nowe: 3, exp: 200, sekundy: 90 },
    },
    zgloszenia: [
      { id: 'apple', w: 'apple', pl: 'old', kiedy: '' },
      { id: 'May', w: 'May', pl: 'maj', kiedy: '' },
    ],
  }
  const merged = st.mergeStates(loaded, fromBackup)
  assert.equal(merged.historia['2026-09-15'].oceny, 10, 'the day with more grades wins')
  assert.equal(merged.historia['2026-09-14'].oceny, 7, 'a day only in the backup is added')
  assert.deepEqual(
    merged.zgloszenia.map((r) => r.id),
    ['apple', 'May'],
  )
  assert.equal(merged.zgloszenia[0].pl, 'jabłko', 'a report from the phone is not overwritten')
})

test('a broken save: restoring the day copy and keeping the raw data', () => {
  const storage = new Storage()
  st.save(sampleState(), storage)
  assert.equal(st.dailyCopy(storage, new Date(2026, 8, 15, 7, 0)), true)
  assert.equal(st.dailyCopy(storage, new Date(2026, 8, 15, 22, 0)), false)

  storage.setItem(st.KEY, '{"wersja":1,"karty":{"x":[[1,0,1,1,1,0,0,null,null]]},"exp":"bad"}')
  const { state, warning } = st.load(storage)
  assert.match(warning, /copy from the start of the day was restored/)
  assert.equal(state.expRazem, 130)
  assert.match(storage.getItem(st.KEY_BROKEN), /"x"/)

  // a broken state does not overwrite the day copy on the next day
  assert.equal(st.dailyCopy(storage, new Date(2026, 8, 16, 7, 0)), false)
  assert.equal(JSON.parse(storage.getItem(st.KEY_PREVIOUS)).exp, 130)

  const noCopy = new Storage()
  noCopy.setItem(st.KEY, 'this is not json')
  const result = st.load(noCopy)
  assert.deepEqual(result.state, st.defaultState())
  assert.match(result.warning, /no day copy/)
  assert.equal(noCopy.getItem(st.KEY_BROKEN), 'this is not json')
})

test('no space: backup copies give way to the current progress', () => {
  const state = sampleState()
  const size = JSON.stringify(st.packState(state)).length
  // space for two copies of the current state and the key names, but not for a state with one more card
  const storage = new Storage(size * 2 + 40)
  st.save(state, storage)
  storage.setItem(st.KEY_BEFORE_LOAD, storage.getItem(st.KEY))
  state.karty = { ...state.karty, 'book|en': { ...newFsrsCard(), ...gradeFsrs(newFsrsCard(), 3, new Date()) } }
  const result = st.save(state, storage)
  assert.equal(result.ok, true)
  assert.equal(result.freed, st.KEY_BEFORE_LOAD)
  assert.ok(st.load(storage).state.karty['book|en'])

  const tooSmall = new Storage(10)
  assert.equal(st.save(state, tooSmall).ok, false)
})

test('the backup has the deck and progress, validation of a good backup', () => {
  const state = sampleState()
  const library = {
    words: [
      { id: 'apple', w: 'apple', pl: 'jabłko', ipa: 'ˈæpl', poziom: 'A1', talia: 'Oxford 3000' },
      { id: 'May', w: 'May', pl: 'maj', talia: 'Pasted 2026-09-15' },
      { id: 'may', w: 'may', pl: 'móc', talia: 'Pasted 2026-09-15' },
    ],
    decks: [{ nazwa: 'Oxford 3000', zrodlo: 'Oxford', dodano: '2026-09-15T08:00:00.000Z' }],
  }
  const file = JSON.stringify(st.backupFile(state, library, new Date(2026, 8, 15, 9, 0)))
  // The file keeps the format of the Polish version, so both versions read each other's backups.
  const raw = JSON.parse(file)
  assert.deepEqual(Object.keys(raw), ['format', 'wersja', 'utworzono', 'talia', 'postep'])
  assert.deepEqual(raw.talia, { slowa: library.words, talie: library.decks })
  const result = st.validateBackup(raw)
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(result.library, library)
  compareCards(result.state.karty, state.karty)
  assert.equal(result.state.expRazem, 130)
  assert.equal(st.fileName(new Date(2026, 8, 15, 23, 50)), 'flashcards-backup-2026-09-15.json')
})

test('validation of bad backups', () => {
  const good = () => JSON.parse(JSON.stringify(st.backupFile(sampleState(), { words: [{ id: 'apple', w: 'apple', pl: 'jabłko' }] })))
  const cases = [
    [null, /not a flashcards backup/],
    [[], /not a flashcards backup/],
    [{ karty: {} }, /not a flashcards backup/],
    [{ ...good(), wersja: 1 }, /backup version/],
    [{ ...good(), talia: undefined }, /no word deck/],
    [
      (() => {
        const b = good()
        b.talia.slowa.push({ id: 'apple', w: 'apple', pl: 'x' })
        return b
      })(),
      /twice/,
    ],
    [
      (() => {
        const b = good()
        b.talia.slowa.push({ w: 'no translation' })
        return b
      })(),
      /Word no. 2/,
    ],
    [
      (() => {
        const b = good()
        b.postep.exp = -5
        return b
      })(),
      /exp/,
    ],
    [
      (() => {
        const b = good()
        b.postep.karty = []
        return b
      })(),
      /karty/,
    ],
    [
      (() => {
        const b = good()
        b.postep.streak = { dni: 1.5, ostatniDzien: '' }
        return b
      })(),
      /streak/,
    ],
    [
      (() => {
        const b = good()
        delete b.postep.wersja
        return b
      })(),
      /save version/,
    ],
  ]
  for (const [data, error] of cases) {
    const result = st.validateBackup(data)
    assert.equal(result.ok, false, `expected error ${error}`)
    assert.match(result.error, error)
  }
})

test('a broken card is skipped, the rest of the progress stays', () => {
  const storage = new Storage()
  st.save(sampleState(), storage)
  const raw = JSON.parse(storage.getItem(st.KEY))
  raw.karty.apple[1] = [2, 'bad due date', 1, 5, 1, 0, 0, null, null]
  raw.karty.broken = 'not an array'
  raw.karty['a|b'] = [null]
  raw.karty.nan = [[2, 1000, null, 5, 3, 0, 0, 250, 240]] // NaN from JSON.stringify is saved as null
  raw.karty.zero = [[2, 1000, 0, 5, 3, 0, 0, 250, 240]] // stability 0 in review would give NaN at a grade
  storage.setItem(st.KEY, JSON.stringify(raw))

  const { state, warning, skipped } = st.load(storage)
  assert.equal(warning, '')
  assert.equal(skipped, 5)
  assert.deepEqual(Object.keys(state.karty).sort(), ['May|en', 'apple|en'])
  assert.equal(state.expRazem, 130)
  assert.match(storage.getItem(st.KEY_BROKEN), /broken/, 'the raw save with skipped cards is kept')

  const backup = JSON.parse(JSON.stringify(st.backupFile(sampleState(), { words: [] })))
  backup.postep.karty.apple[0][0] = 7
  const result = st.validateBackup(backup)
  assert.equal(result.ok, true)
  assert.equal(result.skipped, 1)
  assert.deepEqual(Object.keys(result.state.karty).sort(), ['May|en', 'apple|pl'])
})

test('merging a backup with the current state does not undo newer progress', () => {
  const card = (reps, last, stability) => ({
    ...newFsrsCard(),
    stan: 'powtorka',
    termin: '2026-09-20T10:00:00.000Z',
    stabilnosc: stability,
    trudnosc: 5,
    powtorki: reps,
    ostatnio: last,
    wprowadzono: '2026-09-01T10:00:00.000Z',
  })
  const current = {
    ...st.defaultState(),
    karty: {
      'a|en': card(5, '2026-09-14T10:00:00.000Z', 1),
      'b|en': card(2, '2026-09-14T10:00:00.000Z', 1),
      'c|en': card(3, '2026-09-10T10:00:00.000Z', 1),
      'onlyHere|en': card(1, '2026-09-14T10:00:00.000Z', 1),
    },
    expRazem: 500,
    streak: { ...EMPTY_STREAK, dni: 4, ostatniDzien: '2026-09-15' },
    dzis: { data: '2026-09-15', sekundy: 30, dodatkoweNowe: 0, powtorki: 0 },
    ustawienia: { noweDziennie: 30, dlugoscSerii: 10, autowymowa: false, mowienie: false },
    ostatniaKopia: '2026-09-15T08:00:00.000Z',
  }
  const fromBackup = {
    ...st.defaultState(),
    karty: {
      'a|en': card(3, '2026-09-15T10:00:00.000Z', 2),
      'b|en': card(4, '2026-09-01T10:00:00.000Z', 2),
      'c|en': card(3, '2026-09-12T10:00:00.000Z', 2),
      'onlyInBackup|pl': card(1, '2026-09-01T10:00:00.000Z', 2),
    },
    expRazem: 900,
    streak: { ...EMPTY_STREAK, dni: 9, ostatniDzien: '2026-09-12' },
    dzis: { data: '2026-09-12', sekundy: 99, dodatkoweNowe: 10, powtorki: 0 },
    ostatniaKopia: '2026-09-01T08:00:00.000Z',
  }

  const m = st.mergeStates(current, fromBackup)
  assert.equal(m.karty['a|en'].stabilnosc, 1, 'more reviews on the phone win despite a later date in the backup')
  assert.equal(m.karty['b|en'].stabilnosc, 2, 'more reviews in the backup win')
  assert.equal(m.karty['c|en'].stabilnosc, 2, 'a tie of reviews: the later grade')
  assert.ok(m.karty['onlyHere|en'] && m.karty['onlyInBackup|pl'], 'the sum of keys')
  assert.equal(Object.keys(m.karty).length, 5)
  assert.equal(m.expRazem, 900)
  assert.deepEqual(m.streak, current.streak)
  assert.deepEqual(m.dzis, current.dzis)
  assert.deepEqual(m.ustawienia, current.ustawienia)
  assert.equal(m.ostatniaKopia, current.ostatniaKopia)
  assert.equal(Object.keys(current.karty).length, 4, 'the current state is not changed')

  const laterBackup = st.mergeStates(current, {
    ...fromBackup,
    streak: { ...EMPTY_STREAK, dni: 1, ostatniDzien: '2026-09-16' },
    dzis: { data: '2026-09-16', sekundy: 5, dodatkoweNowe: 0, powtorki: 0 },
  })
  assert.deepEqual(laterBackup.streak, { ...EMPTY_STREAK, dni: 1, ostatniDzien: '2026-09-16' })
  assert.equal(laterBackup.dzis.data, '2026-09-16')
  assert.equal(st.mergeStates(current, { ...fromBackup, streak: { dni: 7, ostatniDzien: '2026-09-15' } }).streak.dni, 7)
  assert.equal(st.mergeStates(current, { ...fromBackup, streak: { dni: 2, ostatniDzien: '2026-09-15' } }).streak.dni, 4)

  const storage = new Storage()
  assert.equal(st.save(m, storage).ok, true)
  assert.equal(Object.keys(st.load(storage).state.karty).length, 5)
})

test('a card with the last grade tomorrow (clock moved back, time zone to the west) graded today: finite numbers and a correct due date', () => {
  const now = new Date(2026, 8, 15, 9, 0)
  const card = {
    ...newFsrsCard(),
    stan: 'powtorka',
    termin: new Date(2026, 8, 20, 12, 0).toISOString(),
    stabilnosc: 10,
    trudnosc: 5,
    powtorki: 4,
    ostatnio: new Date(2026, 8, 16, 12, 0).toISOString(),
    wprowadzono: '2026-09-01T10:00:00.000Z',
  }
  for (const grade of [1, 3, 4]) {
    const result = { ...card, ...gradeFsrs(card, grade, now) }
    assert.ok(Number.isFinite(result.stabilnosc) && result.stabilnosc > 0, `grade ${grade}: stability ${result.stabilnosc}`)
    assert.ok(Number.isFinite(result.trudnosc) && result.trudnosc >= 1 && result.trudnosc <= 10, `grade ${grade}: difficulty ${result.trudnosc}`)
    const due = Date.parse(result.termin)
    assert.ok(due > now.getTime(), `grade ${grade}: due ${result.termin}`)
    if (grade === 1) assert.equal(result.stan, 'ponowna')
    else assert.ok(due - now.getTime() >= 86400000, `grade ${grade}: due at least one day later`)

    const storage = new Storage()
    assert.equal(st.save({ ...st.defaultState(), karty: { 'x|en': result } }, storage).ok, true)
    const loaded = st.load(storage)
    assert.equal(loaded.skipped, 0, `grade ${grade}: the card passes through the save`)
    assert.ok(loaded.state.karty['x|en'])
  }
})

test('settings outside the allowed values go back to defaults', () => {
  const b = JSON.parse(JSON.stringify(st.backupFile(sampleState(), { words: [] })))
  b.postep.ustawienia = { noweDziennie: 999, dlugoscSerii: 15, autowymowa: 'yes' }
  b.postep.dzis = 'bad'
  const result = st.validateBackup(b)
  assert.equal(result.ok, true)
  assert.deepEqual(result.state.ustawienia, {
    noweDziennie: 10,
    maksPowtorekDziennie: 60,
    dlugoscSerii: 15,
    autowymowa: true,
    mowienie: true,
    celDzienny: 60,
    podpowiedzMowienie: 'brak',
    kotwica: '',
    samouczekGestow: false,
    wylaczoneTalie: [],
  })
  assert.deepEqual(result.state.dzis, { data: '', sekundy: 0, dodatkoweNowe: 0, powtorki: 0 })
  // 40 new per day dropped out of the options list, but the saved setting stays.
  const old = JSON.parse(JSON.stringify(st.backupFile(sampleState(), { words: [] })))
  old.postep.ustawienia.noweDziennie = 40
  assert.equal(st.validateBackup(old).state.ustawienia.noweDziennie, 40)
})

test('progress size: 6000 words in both directions', () => {
  let seed = 42
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const state = st.defaultState()
  const start = Date.UTC(2026, 8, 1)
  const date = (fromDays, toDays) => new Date(start + (fromDays + random() * (toDays - fromDays)) * 86400000).toISOString()
  for (let i = 0; i < 6000; i++) {
    const length = 4 + Math.floor(random() * 8)
    let id = Array.from({ length }, () => letters[Math.floor(random() * 26)]).join('')
    if (i % 25 === 0) id += ' up'
    id += i
    for (const direction of ['en', 'pl']) {
      state.karty[`${id}|${direction}`] = {
        stan: 'powtorka',
        termin: date(30, 700),
        stabilnosc: 0.1 + random() * 900,
        trudnosc: 1 + random() * 9,
        powtorki: 1 + Math.floor(random() * 40),
        pomylki: Math.floor(random() * 8),
        krok: 0,
        ostatnio: date(0, 30),
        wprowadzono: date(-300, 0),
      }
    }
  }
  const compact = JSON.stringify(st.packState(state)).length
  const objects = JSON.stringify(state).length
  console.log(`progress 6000 words x 2 directions: ${compact} chars (as objects with ISO dates: ${objects})`)
  assert.ok(compact < 1_000_000)

  // As in the app: after a grade one card object changes, the rest has its packed form in the cache.
  const storage = new Storage()
  st.save(state, storage)
  let time = 0
  for (let i = 0; i < 20; i++) {
    state.karty[`x${i}|en`] = { ...newFsrsCard(), ...gradeFsrs(newFsrsCard(), 3, new Date()) }
    const t0 = performance.now()
    assert.equal(st.save(state, storage).ok, true)
    time += performance.now() - t0
  }
  console.log(`save after a grade with 12 000 cards: ${(time / 20).toFixed(1)} ms`)
  assert.equal(Object.keys(st.load(storage).state.karty).length, 12020)
})

// Skipped words and the one-time due date spread

test('skipped words and the spread flag pass through the save', () => {
  const storage = new Storage()
  const state = { ...sampleState(), pominiete: { apple: '2026-09-15', May: '2026-09-16' }, rozproszono: 1 }
  assert.equal(st.save(state, storage).ok, true)
  const loaded = st.load(storage).state
  assert.deepEqual(loaded.pominiete, { apple: '2026-09-15', May: '2026-09-16' })
  assert.equal(loaded.rozproszono, 1)
  assert.ok(loaded.karty['apple|en'], 'cards of a skipped word stay in the save')
})

test('a save without new fields loads with no change (old phone)', () => {
  const storage = new Storage()
  const packed = st.packState(sampleState())
  delete packed.pominiete
  delete packed.rozproszono
  delete packed.historia
  delete packed.zgloszenia
  storage.setItem(st.KEY, JSON.stringify(packed))
  const { state, warning, skipped } = st.load(storage)
  assert.equal(warning, '')
  assert.equal(skipped, 0, 'no card is broken')
  assert.deepEqual(state.pominiete, {})
  assert.equal(state.rozproszono, 0, 'an old save gets the one-time spread')
  assert.equal(state.expRazem, 130)
  assert.equal(Object.keys(state.karty).length, 3)
})

test('a broken "pominiete" field does not make progress invalid', () => {
  const good = st.packState(sampleState())
  for (const bad of [null, 'yes', 7, []]) {
    const result = st.validateState({ ...good, pominiete: bad })
    assert.equal(result.ok, true, JSON.stringify(bad))
    assert.deepEqual(result.state.pominiete, {})
  }
  const mixed = st.validateState({ ...good, pominiete: { apple: 'sometime', 'bad|key': '2026-09-15', May: '2026-09-15' } })
  assert.deepEqual(mixed.state.pominiete, { apple: '', May: '2026-09-15' })
  assert.equal(st.validateState({ ...good, rozproszono: 'yes' }).state.rozproszono, 0)
})

test('the backup has skipped words, and merging adds up both sides', () => {
  const state = { ...sampleState(), pominiete: { apple: '2026-09-15' }, rozproszono: 1 }
  const backup = JSON.parse(JSON.stringify(st.backupFile(state, { words: [{ id: 'apple', w: 'apple', pl: 'jabłko' }] })))
  assert.deepEqual(backup.postep.pominiete, { apple: '2026-09-15' })
  const result = st.validateBackup(backup)
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(result.state.pominiete, { apple: '2026-09-15' })

  const current = { ...st.defaultState(), pominiete: { May: '2026-09-17' }, rozproszono: 1 }
  const merged = st.mergeStates(current, result.state)
  assert.deepEqual(merged.pominiete, { May: '2026-09-17', apple: '2026-09-15' })
  assert.equal(merged.rozproszono, 1, 'the spread flag stays from the phone')
  assert.deepEqual(current.pominiete, { May: '2026-09-17' }, 'input untouched')
})

// Migration of a save from before the rank (the user's phone: about 380 words, a week of study, XP about 25 000)

test('an mmf-v1 save from before the rank: cards, XP and streak with no loss', () => {
  // This is how a save from the phone looks: only old fields, cards of 9 numbers, exp as the total player counter.
  const cards = {}
  for (let i = 0; i < 380; i++) {
    cards[`w${i}`] = [[2, 100000 + i, 8.5, 5.5, 3, i % 7 === 0 ? 1 : 0, 0, 250, 240]]
    if (i % 3 === 0) cards[`w${i}`].push([1, 100500 + i, 1.2, 6, 1, 0, 1, 250, 250])
  }
  const fromPhone = {
    wersja: 1,
    karty: cards,
    pominiete: { w7: '2026-09-10' },
    exp: 25140,
    streak: { dni: 7, ostatniDzien: '2026-09-15' },
    dzis: { data: '2026-09-15', sekundy: 240, dodatkoweNowe: 0 },
    historia: { '2026-09-14': { oceny: 60, nowe: 10, exp: 2400, sekundy: 300 }, '2026-09-15': { oceny: 42, nowe: 8, exp: 1800, sekundy: 210 } },
    zgloszenia: [],
    ustawienia: { noweDziennie: 20, dlugoscSerii: 15, autowymowa: true, mowienie: true, celDzienny: 60, podpowiedzMowienie: 'brak' },
    ostatniaKopia: '2026-09-12T08:00:00.000Z',
    rozproszono: 1,
  }
  const storage = new Storage()
  storage.setItem(st.KEY, JSON.stringify(fromPhone))
  const now = new Date(2026, 8, 16, 9, 0)
  const { state, warning, skipped } = st.load(storage, now)

  assert.equal(warning, '')
  assert.equal(skipped, 0, 'no card is rejected')
  assert.equal(Object.keys(state.karty).length, 380 + Math.ceil(380 / 3), 'all cards of both directions')
  assert.equal(state.expRazem, 25140, 'expRazem stays in the save for compatibility, though the app does not show it')
  assert.equal(state.streak.dni, 7)
  assert.equal(state.streak.ostatniDzien, '2026-09-15')
  assert.equal(state.streak.zamrozenia, 0, 'a missing field gives an empty bank, not an error')
  assert.deepEqual(state.nadrabianie, EMPTY_CATCH_UP)
  assert.deepEqual(state.historia, fromPhone.historia, 'day history is not lost')
  assert.deepEqual(state.pominiete, { w7: '2026-09-10' })
  assert.equal(state.dzis.powtorki, 0, 'the new review counter starts from zero')
  assert.equal(state.ustawienia.noweDziennie, 20)
  assert.equal(state.ustawienia.maksPowtorekDziennie, 60, 'a missing cap gives the default value')
  assert.equal(state.ustawienia.kotwica, '', 'a missing anchor gives an empty anchor, not an error')
  assert.equal(state.ustawienia.samouczekGestow, false, 'a save from before gestures may see the tutorial once')
  assert.equal(state.karty['w0|en'].kolejneUmiem, 0)
  assert.equal(state.karty['w0|en'].leech, 0)

  // Saving and reading again loses nothing.
  assert.equal(st.save(state, storage).ok, true)
  const second = st.load(storage, now)
  assert.equal(second.state.expRazem, 25140)
  assert.equal(Object.keys(second.state.karty).length, Object.keys(state.karty).length)
})

test('new card fields are saved only when they hold something', () => {
  const state = st.defaultState()
  state.karty['a|en'] = { ...newFsrsCard(), ...gradeFsrs(newFsrsCard(), 3, new Date(2026, 8, 15, 9, 0)) }
  state.karty['b|en'] = { ...newFsrsCard(), ...gradeFsrs(newFsrsCard(), 3, new Date(2026, 8, 15, 9, 0)), kolejneUmiem: 2, leech: 6 }
  const packed = st.packState(state)
  assert.equal(packed.karty.a[0].length, 9, 'a card without new fields is saved as before')
  assert.equal(packed.karty.b[0].length, 11)
  assert.deepEqual(packed.karty.b[0].slice(9), [2, 6])

  const result = st.validateState(packed)
  assert.equal(result.ok, true)
  assert.equal(result.state.karty['a|en'].kolejneUmiem, 0)
  assert.equal(result.state.karty['b|en'].kolejneUmiem, 2)
  assert.equal(result.state.karty['b|en'].leech, 6)
  // A card with only kolejneUmiem has 10 fields, and negative counters are rejected like any other.
  const ten = st.validateState({ ...packed, karty: { c: [[2, 1000, 1, 5, 1, 0, 0, 250, 240, 1]] } })
  assert.equal(ten.state.karty['c|en'].kolejneUmiem, 1)
  assert.equal(st.validateState({ ...packed, karty: { c: [[2, 1000, 1, 5, 1, 0, 0, 250, 240, -1]] } }).skipped, 1)
  assert.equal(st.validateState({ ...packed, karty: { c: [[2, 1000, 1, 5, 1, 0, 0, 250, 240, 1, 2, 3]] } }).skipped, 1)
})

test('answer time in history: the median and raw times are optional', () => {
  const now = new Date(2026, 8, 16, 9, 0)
  const state = sampleState()
  state.historia = {
    '2026-09-16': { oceny: 3, nowe: 1, exp: 90, sekundy: 12, tempo: 2.5, czasy: [1.5, 2.5, 6] },
    '2026-09-15': { oceny: 2, nowe: 0, exp: 60, sekundy: 8, tempo: 4 },
    '2026-09-14': { oceny: 1, nowe: 0, exp: 30, sekundy: 3 },
  }
  const packed = st.packState(state, now)
  const loaded = st.validateState(packed, now).state
  assert.deepEqual(loaded.historia['2026-09-16'].czasy, [1.5, 2.5, 6], 'the current day keeps raw times')
  assert.equal(loaded.historia['2026-09-16'].tempo, 2.5)
  assert.equal(loaded.historia['2026-09-15'].tempo, 4, 'a closed day stays with only the median')
  assert.equal(loaded.historia['2026-09-15'].czasy, undefined)
  assert.equal(loaded.historia['2026-09-14'].tempo, undefined, 'a save from before this version has no pace')

  // Nonsense in new fields must not make the whole history or progress invalid.
  const broken = JSON.parse(JSON.stringify(packed))
  broken.historia['2026-09-16'].tempo = 'fast'
  broken.historia['2026-09-16'].czasy = { a: 1 }
  const second = st.validateState(broken, now)
  assert.equal(second.ok, true)
  assert.equal(second.state.historia['2026-09-16'].oceny, 3)
  assert.equal(second.state.historia['2026-09-16'].tempo, undefined)
  assert.equal(second.state.historia['2026-09-16'].czasy, undefined)
  assert.equal(Object.keys(second.state.karty).length, Object.keys(state.karty).length)
})

// --- D1: habit anchor in the save ---

test('the habit anchor is saved and comes back trimmed, and bad values give defaults', () => {
  const storage = new Storage()
  const state = sampleState()
  state.ustawienia = { ...state.ustawienia, kotwica: '  my own time  ', samouczekGestow: true }
  assert.equal(st.save(state, storage).ok, true)
  const loaded = st.load(storage).state
  assert.equal(loaded.ustawienia.kotwica, 'my own time', 'spaces at the edges are dropped')
  assert.equal(loaded.ustawienia.samouczekGestow, true)

  // A save with nonsense in these fields must not make the whole progress invalid.
  const broken = JSON.parse(storage.getItem(st.KEY))
  broken.ustawienia.kotwica = { a: 1 }
  broken.ustawienia.samouczekGestow = 'yes'
  storage.setItem(st.KEY, JSON.stringify(broken))
  const second = st.load(storage).state
  assert.equal(second.ustawienia.kotwica, '')
  assert.equal(second.ustawienia.samouczekGestow, false)
  assert.equal(Object.keys(second.karty).length, Object.keys(state.karty).length, 'cards stay untouched')

  // A very long anchor is cut, not rejected.
  const long = JSON.parse(storage.getItem(st.KEY))
  long.ustawienia.kotwica = 'x'.repeat(200)
  storage.setItem(st.KEY, JSON.stringify(long))
  assert.equal(st.load(storage).state.ustawienia.kotwica.length, 40)
})

test('an anchor from the Polish version reads as the English one', () => {
  const storage = new Storage()
  const packed = st.packState(sampleState())
  for (const [polish, english] of [
    ['po kawie', 'after coffee'],
    ['  przed snem ', 'before sleep'],
    ['po umyciu zębów', 'after brushing teeth'],
    ['w drodze', 'on the way'],
    ['po obiedzie', 'po obiedzie'],
  ]) {
    storage.setItem(st.KEY, JSON.stringify({ ...packed, ustawienia: { ...packed.ustawienia, kotwica: polish } }))
    assert.equal(st.load(storage).state.ustawienia.kotwica, english, polish)
  }
})

test('turned off decks are an optional field: an old save gives an empty list, a new one comes back unchanged', () => {
  const storage = new Storage()
  const state = sampleState()
  state.ustawienia = { ...state.ustawienia, wylaczoneTalie: ['  My deck  ', 'Oxford 3000', 'My deck', '', 7] }
  st.save(state, storage)
  const saved = JSON.parse(storage.getItem(st.KEY))
  assert.equal(saved.wersja, st.SAVE_VERSION, 'SAVE_VERSION stays 1')
  // Trimmed, without repeats and without values that are not texts.
  assert.deepEqual(st.load(storage).state.ustawienia.wylaczoneTalie, ['My deck', 'Oxford 3000'])

  // A save from before this version has no field at all: all decks must stay on.
  delete saved.ustawienia.wylaczoneTalie
  storage.setItem(st.KEY, JSON.stringify(saved))
  const old = st.load(storage)
  assert.equal(old.warning, '')
  assert.deepEqual(old.state.ustawienia.wylaczoneTalie, [])
  assert.equal(old.state.expRazem, 130, 'the rest of the progress with no loss')

  // A broken field does not make progress invalid either.
  saved.ustawienia.wylaczoneTalie = 'My deck'
  storage.setItem(st.KEY, JSON.stringify(saved))
  assert.deepEqual(st.load(storage).state.ustawienia.wylaczoneTalie, [])

  // The deck for words without a deck was "Bez nazwy" in the Polish version and is "Untitled" now.
  saved.ustawienia.wylaczoneTalie = ['Bez nazwy', 'Oxford 3000']
  storage.setItem(st.KEY, JSON.stringify(saved))
  assert.deepEqual(st.load(storage).state.ustawienia.wylaczoneTalie, ['Untitled', 'Oxford 3000'])
})
