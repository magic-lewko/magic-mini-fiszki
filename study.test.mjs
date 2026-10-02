// Session logic, limits, streak and hints. Run: node --test
// The time zone is set to Poland, so the local day boundary differs from UTC and the test catches counting by UTC.
process.env.TZ = 'Europe/Warsaw'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STANY as FSRS_STATES, nowaKarta as newFsrsCard, ocen as gradeFsrs, przypomnienie as recall } from './lib/fsrs.mjs'
import * as s from './src/study.js'

const words = (...ids) => ids.map((id) => ({ id, w: id, pl: `pl-${id}` }))
const minutes = (date, m) => new Date(date.getTime() + m * 60000)
const card = (state, due, other = {}) => ({
  ...newFsrsCard(),
  stan: state,
  termin: due.toISOString(),
  stabilnosc: 3,
  trudnosc: 5,
  powtorki: 2,
  ostatnio: '2026-09-01T10:00:00.000Z',
  wprowadzono: '2026-09-01T10:00:00.000Z',
  ...other,
})

test('states match lib/fsrs.mjs', () => {
  assert.deepEqual(s.CARD_STATES, FSRS_STATES)
})

test('the test time zone differs from UTC', () => {
  assert.notEqual(new Date(2026, 8, 15, 0, 10).getTimezoneOffset(), 0)
})

test('session priority order', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const cards = {
    'a|en': card('powtorka', minutes(now, -2 * 1440), { stabilnosc: 5.5 }),
    'a|pl': card('powtorka', minutes(now, -180)),
    'b|en': card('powtorka', minutes(now, -60), { stabilnosc: 10 }),
    'c|en': card('nauka', minutes(now, -5)),
    'd|en': card('ponowna', minutes(now, -10)),
    'e|en': card('powtorka', minutes(now, 1440), { stabilnosc: 6 }),
    'g|en': card('nauka', minutes(now, 5)),
  }
  const list = words('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h')
  const session = s.buildSession({ words: list, cards, settings: {}, today: null, now })
  // 1) overdue learning/relearning, 2) reviews from the oldest, 3) new speaking, 4) new EN in list order
  assert.deepEqual(session, ['d|en', 'c|en', 'a|en', 'a|pl', 'b|en', 'b|pl', 'e|pl', 'f|en', 'h|en'])

  const short = s.buildSession({ words: list, cards, settings: { dlugoscSerii: 10 }, today: null, now, length: 3 })
  assert.deepEqual(short, ['d|en', 'c|en', 'a|en'])

  const noSpeaking = s.buildSession({ words: list, cards, settings: { mowienie: false }, today: null, now })
  assert.deepEqual(noSpeaking, ['d|en', 'c|en', 'a|en', 'b|en', 'f|en', 'h|en'])
})

test('cards of words outside the list stay in memory, but do not go into the session', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const cards = { 'removed|en': card('nauka', minutes(now, -5)) }
  assert.deepEqual(s.buildSession({ words: words('x'), cards, settings: {}, today: null, now }), ['x|en'])
})

test('daily new limit counted by local date, separately for EN and PL', () => {
  const list = words(...Array.from({ length: 40 }, (_, i) => `s${i}`))
  const evening = new Date(2026, 8, 14, 23, 50)
  const cards = {}
  for (let i = 0; i < 10; i++) {
    cards[`s${i}|en`] = card('nauka', minutes(evening, 7 * 1440), { wprowadzono: evening.toISOString() })
  }
  // 23:50 and 00:10 in Poland are the same UTC day, but two different local days.
  assert.equal(evening.toISOString().slice(0, 10), new Date(2026, 8, 15, 0, 10).toISOString().slice(0, 10))

  const settings = { noweDziennie: 10, dlugoscSerii: 20 }
  const sameDay = s.buildSession({ words: list, cards, settings, today: null, now: new Date(2026, 8, 14, 23, 55) })
  assert.deepEqual(sameDay, [])

  const afterMidnight = s.buildSession({ words: list, cards, settings, today: null, now: new Date(2026, 8, 15, 0, 10) })
  assert.equal(afterMidnight.length, 10)
  assert.equal(afterMidnight[0], 's10|en')

  const today = { data: '2026-09-14', sekundy: 0, dodatkoweNowe: 10 }
  const withExtra = s.buildSession({ words: list, cards, settings, today, now: new Date(2026, 8, 14, 23, 55) })
  assert.equal(withExtra.length, 10)
  // extra new cards from yesterday do not move to the new day
  const nextDay = s.buildSession({ words: list, cards, settings, today, now: new Date(2026, 8, 15, 0, 10) })
  assert.equal(nextDay.length, 10)

  assert.deepEqual(s.newToday(cards, new Date(2026, 8, 14, 23, 59)), { en: 10, pl: 0 })
  assert.deepEqual(s.newToday(cards, new Date(2026, 8, 15, 0, 1)), { en: 0, pl: 0 })
})

test('the speaking limit is separate from the EN limit', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const list = words('a', 'b', 'c', 'd')
  const cards = {
    'a|en': card('powtorka', minutes(now, 3000), { stabilnosc: 9 }),
    'b|en': card('powtorka', minutes(now, 3000), { stabilnosc: 9 }),
    'a|pl': card('nauka', minutes(now, 3000), { wprowadzono: now.toISOString() }),
  }
  const session = s.buildSession({ words: list, cards, settings: { noweDziennie: 1 }, today: null, now })
  // the PL limit (1) is used up by a|pl, the EN limit (1) is free
  assert.deepEqual(session, ['c|en'])
})

test("don't know puts the card back as the fourth, and with no room for the gap the card leaves the session", () => {
  let session = s.newSession(['a', 'b', 'c', 'd', 'e', 'f'])
  session = s.afterGrade(session, 1)
  assert.deepEqual(session.queue, ['b', 'c', 'd', 'a', 'e', 'f'])
  assert.equal(session.dontKnow, 1)
  assert.equal(s.sessionProgress(session), 0)

  for (const expected of ['b', 'c', 'd']) {
    assert.equal(s.currentCard(session), expected)
    session = s.afterGrade(session, 3)
  }
  assert.equal(s.currentCard(session), 'a')
  assert.equal(s.sessionProgress(session), 0.5)

  // Two cards stay further in the queue, so the mistake does not have three other cards before it: instead of
  // coming back at once (copying the answer from short-term memory), the card leaves the session.
  session = s.afterGrade(session, 4)
  assert.deepEqual(session.queue, ['e', 'f'])
  const totalBefore = session.total
  session = s.afterGrade(session, 1)
  assert.deepEqual(session.queue, ['f'], 'the card does not come back as the next one')
  assert.equal(session.total, totalBefore - 1, 'the progress bar stops waiting for it')

  session = s.afterGrade(session, 3)
  assert.equal(s.sessionDone(session), true)
  assert.equal(s.sessionProgress(session), 1)
  assert.equal(session.dontKnow, 2)
})

test('the progress bar speeds up in the second half', () => {
  assert.equal(s.progressBar(0), 0)
  assert.equal(s.progressBar(1), 1)
  assert.equal(s.progressBar(0.25), 0.125)
  const gain = (a, b) => s.progressBar(b) - s.progressBar(a)
  assert.ok(gain(0.8, 0.9) > gain(0.1, 0.2))
})

test('unlocking the speaking card: stability 4 or two Know grades in a row', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  assert.equal(s.SPEAKING_STABILITY_MIN, 4)
  assert.equal(s.speakingUnlocked(undefined), false)
  assert.equal(s.speakingUnlocked(card('nowa', now, { stabilnosc: 20 })), false)
  assert.equal(s.speakingUnlocked(card('nauka', now, { stabilnosc: 20 })), false, 'stability counts only in review')
  assert.equal(s.speakingUnlocked(card('powtorka', now, { stabilnosc: 3.99 })), false)
  assert.equal(s.speakingUnlocked(card('powtorka', now, { stabilnosc: 4 })), true)
  // The second way: two "Know" grades in a row, no matter the stability.
  assert.equal(s.speakingUnlocked(card('nauka', now, { stabilnosc: 0.5, kolejneUmiem: 1 })), false)
  assert.equal(s.speakingUnlocked(card('nauka', now, { stabilnosc: 0.5, kolejneUmiem: 2 })), true)

  // Counter of "Know" in a row: grade 3 and 4 raise it, any other resets it.
  assert.equal(s.knowStreak(undefined, 3), 1)
  assert.equal(s.knowStreak({ kolejneUmiem: 1 }, 3), 2)
  assert.equal(s.knowStreak({ kolejneUmiem: 1 }, 4), 2)
  assert.equal(s.knowStreak({ kolejneUmiem: 3 }, 2), 0)
  assert.equal(s.knowStreak({ kolejneUmiem: 3 }, 1), 0)

  // With real FSRS: "Already know" on a new card gives a review with S = 8.3, and "Know" twice only S = 2.3,
  // but two "Know" grades in a row unlock speaking anyway.
  const alreadyKnow = { ...newFsrsCard(), ...gradeFsrs(newFsrsCard(), 4, now), kolejneUmiem: 1 }
  assert.equal(s.speakingUnlocked(alreadyKnow), true)
  let know = { ...newFsrsCard(), ...gradeFsrs(newFsrsCard(), 3, now), kolejneUmiem: 1 }
  know = { ...know, ...gradeFsrs(know, 3, minutes(now, 10)), kolejneUmiem: 2 }
  assert.equal(know.stan, 'powtorka')
  assert.ok(know.stabilnosc < s.SPEAKING_STABILITY_MIN, `stability ${know.stabilnosc}`)
  assert.equal(s.speakingUnlocked(know), true)

  const list = words('x', 'y')
  const later = minutes(now, 20)
  assert.deepEqual(s.buildSession({ words: list, cards: { 'x|en': alreadyKnow }, settings: {}, today: null, now: later }), ['x|pl', 'y|en'])
  assert.deepEqual(s.buildSession({ words: list, cards: { 'x|en': know }, settings: {}, today: null, now: later }), ['x|pl', 'y|en'])
})

test('limit of speaking unlocks: 12 per day, separate from the new words limit', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const list = words(...Array.from({ length: 40 }, (_, i) => `s${i}`))
  const cards = {}
  for (const w of list) cards[`${w.id}|en`] = card('powtorka', minutes(now, 5000), { stabilnosc: 9 })
  const session = s.buildSession({ words: list, cards, settings: { noweDziennie: 30 }, today: null, now, length: Infinity })
  assert.equal(s.MAX_UNLOCKS_PER_DAY, 12)
  assert.equal(session.filter((k) => k.endsWith('|pl')).length, s.MAX_UNLOCKS_PER_DAY)
  assert.equal(session.length, s.MAX_UNLOCKS_PER_DAY, 'all EN cards are already in review, so there are no new EN cards')

  // Unlocks from today use up the limit.
  for (let i = 0; i < 10; i++) cards[`s${i}|pl`] = card('nauka', minutes(now, 30), { wprowadzono: now.toISOString() })
  const rest = s.buildSession({ words: list, cards, settings: { noweDziennie: 30 }, today: null, now, length: Infinity })
  assert.equal(rest.filter((k) => k.endsWith('|pl') && !cards[k]).length, 2)
})

test('study time is only a stat and does not move to the next day', () => {
  let today = s.addTime(null, 20, new Date(2026, 8, 14, 12, 0))
  today = s.addTime(today, 100, new Date(2026, 8, 14, 12, 1)) // one card counts at most 20 s
  assert.equal(today.sekundy, 40)
  assert.equal(today.powtorki, 0)

  let night = s.addTime(null, 20, new Date(2026, 8, 20, 23, 59))
  night = s.addTime(night, 20, new Date(2026, 8, 20, 23, 59))
  night = s.addTime(night, 20, new Date(2026, 8, 21, 0, 1))
  assert.equal(night.sekundy, 20)
  assert.equal(night.data, '2026-09-21')

  // the end of a month and the change to winter time do not break continuity
  assert.equal(s.dayBefore('2026-03-01'), '2026-02-28')
  assert.equal(s.dayBefore('2026-10-26'), '2026-10-25')
  assert.equal(s.daysBetween('2026-10-25', '2026-10-26'), 1)
  assert.equal(s.daysBetween('2026-02-28', '2026-03-01'), 1)
  assert.equal(s.daysBetween('2026-09-14', '2026-09-21'), 7)
})

test('streak: one graded card, continuity and a break without punishment', () => {
  const day = (d, h = 12) => new Date(2026, 8, d, h, 0)
  assert.equal(s.STREAK_MIN_CARDS, 1)

  // One card counts the day; more cards on the same day change nothing.
  let r = s.countDay(s.EMPTY_STREAK, day(14))
  assert.equal(r.counted, true)
  assert.deepEqual([r.streak.dni, r.streak.ostatniDzien], [1, '2026-09-14'])
  const secondTime = s.countDay(r.streak, day(14, 20))
  assert.equal(secondTime.counted, false)
  assert.equal(secondTime.streak.dni, 1)

  r = s.countDay(r.streak, day(15))
  assert.equal(r.streak.dni, 2)
  assert.equal(s.currentStreak(r.streak, day(15)), 2)
  assert.equal(s.currentStreak(r.streak, day(16)), 2, 'yesterday counted, today there is still time')
  assert.equal(s.currentStreak(r.streak, day(17)), 0, 'a break without a freeze')

  // A break without a freeze: the streak starts again, but there is no message about a loss anywhere.
  const afterBreak = s.countDay(r.streak, day(17))
  assert.equal(afterBreak.broken, true)
  assert.equal(afterBreak.frozen, false)
  assert.equal(afterBreak.streak.dni, 1)
  assert.equal(afterBreak.streak.zerwane.dni, 2, 'the value from before the break waits to be recovered')
  assert.equal(Date.parse(afterBreak.streak.zerwane.do) - day(17).getTime(), s.RECOVERY_HOURS * 3600000)

  // The input is untouched (the undo snapshot keeps a reference).
  assert.deepEqual(r.streak.zerwane, s.EMPTY_BREAK)
})

test('streak freezes: one every 7 study days, bank of 2, used on a day without study', () => {
  const day = (d) => new Date(2026, 8, d, 12, 0)
  let streak = s.EMPTY_STREAK
  for (let d = 1; d <= 6; d++) streak = s.countDay(streak, day(d)).streak
  assert.equal(streak.zamrozenia, 0, 'nothing yet after 6 days')
  streak = s.countDay(streak, day(7)).streak
  assert.equal(streak.zamrozenia, 1, 'the seventh study day gives a freeze')
  assert.equal(streak.doZamrozenia, 0)
  for (let d = 8; d <= 14; d++) streak = s.countDay(streak, day(d)).streak
  assert.equal(streak.zamrozenia, 2)
  for (let d = 15; d <= 21; d++) streak = s.countDay(streak, day(d)).streak
  assert.equal(streak.zamrozenia, s.MAX_FREEZES, 'the bank does not grow over 2')
  assert.equal(streak.dni, 21)

  // One day off: a freeze covers the break, the streak goes on.
  const afterDayOff = s.countDay(streak, day(23))
  assert.equal(afterDayOff.frozen, true)
  assert.equal(afterDayOff.broken, false)
  assert.equal(afterDayOff.streak.dni, 22)
  assert.equal(afterDayOff.streak.zamrozenia, 1)

  // A freeze keeps the counter also before the user opens the app again.
  assert.equal(s.currentStreak(streak, day(23)), 21)
  assert.equal(s.currentStreak(streak, day(24)), 21, 'a bank of 2 covers two days off')
  assert.equal(s.currentStreak(streak, day(25)), 0, 'on the third day there is nothing left to cover it')

  // Three days off with a bank of 2: the streak starts again, the bank stays untouched.
  const broken = s.countDay(streak, day(25))
  assert.equal(broken.broken, true)
  assert.equal(broken.streak.zamrozenia, 2)
})

test('recovering the streak: two sessions within 48 h, once in 30 days', () => {
  const day = (d, h = 12) => new Date(2026, 8, d, h, 0)
  let streak = { ...s.EMPTY_STREAK, dni: 12, ostatniDzien: '2026-09-10' }
  const broken = s.countDay(streak, day(14))
  assert.equal(broken.broken, true)
  streak = broken.streak
  assert.equal(streak.dni, 1)

  const first = s.countSession(streak, day(14, 13))
  assert.equal(first.recovered, false)
  assert.equal(first.streak.sesje, 1)
  const second = s.countSession(first.streak, day(15, 9))
  assert.equal(second.recovered, true)
  assert.equal(second.streak.dni, 13, 'days from before the break plus days collected after it')
  assert.deepEqual(second.streak.zerwane, s.EMPTY_BREAK)
  assert.equal(second.streak.ostatnieOdzyskanie, '2026-09-15')

  // After 48 h the window closes.
  const late = s.countSession(s.countSession(streak, day(14, 13)).streak, day(17))
  assert.equal(late.recovered, false)
  assert.deepEqual(late.streak.zerwane, s.EMPTY_BREAK)

  // A second recovery within 30 days does not pass, after 30 days it does.
  const brokenAgain = s.countDay({ ...second.streak, dni: 5, ostatniDzien: '2026-09-16' }, day(20)).streak
  const attempt = s.countSession(s.countSession(brokenAgain, day(20, 13)).streak, day(20, 14))
  assert.equal(attempt.recovered, false, '5 days passed since the last recovery')
  const later = { ...brokenAgain, ostatnieOdzyskanie: '2026-08-01' }
  assert.equal(s.countSession(s.countSession(later, day(20, 13)).streak, day(20, 14)).recovered, true)
  assert.equal(s.DAYS_BETWEEN_RECOVERIES, 30)

  // Without a break sessions change nothing.
  const noBreak = s.countSession({ ...s.EMPTY_STREAK, dni: 3, ostatniDzien: '2026-09-15' }, day(15))
  assert.equal(noBreak.recovered, false)
  assert.equal(noBreak.streak.dni, 3)
})

test('study days in the last 30: a counter that never resets', () => {
  const now = new Date(2026, 8, 30, 12, 0)
  const history = {}
  for (const d of [1, 2, 3, 10, 15, 16, 17, 28, 29, 30]) {
    history[`2026-09-${String(d).padStart(2, '0')}`] = { oceny: 5, nowe: 0, exp: 0, sekundy: 0 }
  }
  history['2026-09-20'] = { oceny: 0, nowe: 0, exp: 0, sekundy: 0 }
  history['2026-08-20'] = { oceny: 40, nowe: 0, exp: 0, sekundy: 0 }
  assert.equal(s.studyDays(history, 30, now), 10, 'days outside the period and days without grades do not count')
  assert.equal(s.studyDays(history, 7, now), 3)
  assert.equal(s.studyDays({}, 30, now), 0)
  assert.equal(s.RECENT_DAYS, 30)
})

test('speaking hint', () => {
  assert.equal(s.hint('lunch'), 'l _ _ _ _')
  assert.equal(s.hint('look after'), 'l _ _ _   _ _ _ _ _')
  assert.equal(s.hint('ice cream'), 'i _ _   _ _ _ _ _')
  assert.equal(s.hint("o'clock"), "o ' _ _ _ _ _")
  assert.equal(s.hint('  well-known '), 'w _ _ _ - _ _ _ _ _')
})

test('stats per deck and level, day summary', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const list = [
    { id: 'a', w: 'a', pl: 'a', poziom: 'B1', talia: 'Oxford' },
    { id: 'b', w: 'b', pl: 'b', poziom: 'A1', talia: 'Oxford' },
    { id: 'c', w: 'c', pl: 'c', talia: 'Pasted' },
  ]
  const cards = {
    'a|en': card('powtorka', minutes(now, -1), { stabilnosc: 7 }),
    'c|en': card('nauka', minutes(now, 30)),
  }
  const stats = s.statistics({ words: list, cards })
  assert.deepEqual(stats.decks, [
    { name: 'Oxford', known: 1, total: 2 },
    { name: 'Pasted', known: 1, total: 1 },
  ])
  assert.deepEqual(
    stats.levels.map((l) => l.name),
    ['A1', 'B1'],
  )
  assert.equal(stats.reviewPercent, 33.3)
  assert.equal(stats.speakingUnlocked, 1)

  const day = s.daySummary({ words: list, cards, settings: {}, today: null, now })
  assert.deepEqual(day, { due: 1, laterToday: 1, newAvailable: 2, toDo: 3, catchUp: false })
})

test('whole deck bar: known, solid and fractions to draw', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  assert.equal(s.SOLID_DAYS, 30)
  const list = words('a', 'b', 'c', 'd', 'e')
  const cards = {
    'a|en': card('powtorka', now, { stabilnosc: 30 }),
    'b|en': card('powtorka', now, { stabilnosc: 29.9 }),
    'c|en': card('powtorka', now, { stabilnosc: 200 }),
    // a speaking card does not count to the bar, a new card neither
    'c|pl': card('powtorka', now, { stabilnosc: 200 }),
    'd|en': card('nowa', now, { stabilnosc: 90 }),
    'e|en': card('powtorka', now, { stabilnosc: 45 }),
  }
  const p = s.deckProgress({ words: list, cards })
  assert.equal(p.total, 5)
  assert.equal(p.known, 4, 'known are EN cards that are not new any more')
  assert.equal(p.solid, 3, 'solid is stability of at least 30 days')
  assert.equal(p.knownRatio, 4 / 5)
  assert.equal(p.solidRatio, 3 / 5)
  assert.equal(s.statistics({ words: list, cards }).solid, 3)
  // An empty deck must not give NaN in the bar transform.
  assert.deepEqual(s.deckProgress({ words: [], cards: {} }), {
    known: 0,
    solid: 0,
    total: 0,
    knownRatio: 0,
    solidRatio: 0,
  })

  // A card after "Already know" has stability of about 8 days, so it does not raise the solid bar.
  const known = s.knownCard({ ...newFsrsCard(), ...gradeFsrs(newFsrsCard(), 4, now) }, 'x|en', now)
  assert.ok(known.stabilnosc < s.SOLID_DAYS, `stability after "Already know": ${known.stabilnosc}`)
  assert.equal(s.deckProgress({ words: words('x'), cards: { 'x|en': known } }).solid, 0)
})

// --- C: answer time as a signal ---

test('answer time thresholds: 0-3 s, 3-8 s, over 8 s', () => {
  assert.equal(s.MEDIUM_PACE_SECONDS, 3)
  assert.equal(s.SLOW_PACE_SECONDS, 8)
  assert.deepEqual([0, 1.5, 2.999].map(s.answerPace), ['fast', 'fast', 'fast'])
  assert.deepEqual([3, 5, 7.9].map(s.answerPace), ['medium', 'medium', 'medium'])
  assert.deepEqual([8, 12, 99].map(s.answerPace), ['slow', 'slow', 'slow'])
  // Garbage must not give undefined: the card border always has some color.
  assert.equal(s.answerPace(undefined), 'fast')
  assert.equal(s.answerPace(-5), 'fast')
  assert.equal(s.answerPace('x'), 'fast')
})

test('over 8 s "Know" drops to "Almost", but not on a new card and not in training', () => {
  assert.deepEqual(s.gradeAfterTime({ grade: 3, seconds: 2 }), { grade: 3, lowered: false })
  assert.deepEqual(s.gradeAfterTime({ grade: 3, seconds: 7.9 }), { grade: 3, lowered: false })
  assert.deepEqual(s.gradeAfterTime({ grade: 3, seconds: 8 }), { grade: 2, lowered: true })
  assert.deepEqual(s.gradeAfterTime({ grade: 3, seconds: 30 }), { grade: 2, lowered: true })
  // The first exposure of a word: the user does not know it yet, so time says nothing.
  assert.deepEqual(s.gradeAfterTime({ grade: 3, seconds: 30, isNew: true }), { grade: 3, lowered: false })
  assert.deepEqual(s.gradeAfterTime({ grade: 3, seconds: 30, training: true }), { grade: 3, lowered: false })
  // Other grades stay as they are, also "Already know".
  for (const grade of [1, 2, 4]) {
    assert.deepEqual(s.gradeAfterTime({ grade, seconds: 30 }), { grade, lowered: false })
  }
})

test('median of answer times', () => {
  assert.equal(s.median([]), 0)
  assert.equal(s.median(undefined), 0)
  assert.equal(s.median([5]), 5)
  assert.equal(s.median([9, 1, 5]), 5, 'order does not matter')
  assert.equal(s.median([1, 2, 3, 10]), 2.5)
  assert.equal(s.median([1, 'x', 3, null]), 2, 'garbage is dropped')
  assert.equal(s.median([1.234, 1.234]), 1.2, 'result rounded to tenths')
})

// --- A: swipes in four directions ---

test('swipe thresholds: 90 px horizontally, 80 px vertically or a flick', () => {
  assert.equal(s.SWIPE_X, 90)
  assert.equal(s.SWIPE_Y, 80)
  assert.equal(s.DOUBLE_TAP_MS, 280)

  // below the threshold the card goes back to the center
  assert.equal(s.swipeDirection({ dx: 89, dy: 0 }), '')
  assert.equal(s.swipeDirection({ dx: 0, dy: 79 }), '')
  assert.equal(s.swipeDirection({}), '')

  assert.equal(s.swipeDirection({ dx: 90, dy: 0 }), 'right')
  assert.equal(s.swipeDirection({ dx: -90, dy: 0 }), 'left')
  assert.equal(s.swipeDirection({ dx: 0, dy: -80 }), 'up')
  assert.equal(s.swipeDirection({ dx: 0, dy: 80 }), 'down')

  // flick: a short but fast move counts as crossing the threshold
  assert.equal(s.swipeDirection({ dx: 40, dy: 0, vx: 1.2 }), 'right')
  assert.equal(s.swipeDirection({ dx: 0, dy: -40, vy: -1.2 }), 'up')
  assert.equal(s.swipeDirection({ dx: 29, dy: 0, vx: 5 }), '', 'speed alone without distance is not a swipe')
  assert.equal(s.swipeDirection({ dx: 40, dy: 0, vx: 0.5 }), '', 'too slow for a flick')

  // a diagonal move: the axis that crossed its threshold more wins
  assert.equal(s.swipeDirection({ dx: 200, dy: 85 }), 'right')
  assert.equal(s.swipeDirection({ dx: 95, dy: 200 }), 'down')
})

test('grades from swipes; every swipe works also on a hidden card', () => {
  assert.equal(s.gradeFromSwipe('right'), 3)
  assert.equal(s.gradeFromSwipe('left'), 1)
  assert.equal(s.gradeFromSwipe('up'), 2)
  assert.equal(s.gradeFromSwipe('down'), null, 'a swipe down is the trash, not a grade')
  assert.equal(s.gradeFromSwipe(''), null)

  // every direction works at once, also on a hidden card
  for (const direction of ['right', 'left', 'up', 'down']) {
    assert.equal(s.swipeAllowed(direction), true)
  }
  assert.equal(s.swipeAllowed(''), false, 'a move below the threshold is not a grade')
  assert.equal(s.TRASH_SWIPE, 'down')
})

test('grade "Almost" takes the card off like "Know" and gives 30 XP', () => {
  assert.deepEqual(s.XP_PER_GRADE, { 1: 10, 2: 30, 3: 50, 4: 20 })
  let session = s.newSession(['a', 'b', 'c'])
  session = s.afterGrade(session, 2)
  assert.deepEqual(session.queue, ['b', 'c'])
  assert.equal(session.almost, 1)
  assert.equal(session.know, 0)
  assert.equal(session.cleared, 1)
  assert.equal(session.xp, 30)
  // "Don't know" goes back to the queue only when a gap of three cards fits before it
  session = s.afterGrade(session, 1)
  assert.deepEqual(session.queue, ['c'])
})

test('combo: reset by "Don\'t know", a bonus every fifth', () => {
  assert.equal(s.comboBonus(0), 0)
  assert.equal(s.comboBonus(4), 0)
  assert.equal(s.comboBonus(5), s.XP_PER_COMBO)
  assert.equal(s.comboBonus(10), s.XP_PER_COMBO)

  let session = s.newSession(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  assert.equal(session.combo, 0)
  for (let i = 1; i <= 4; i++) {
    session = s.afterGrade(session, 3)
    assert.equal(session.combo, i)
    assert.equal(session.bonus, 0)
  }
  session = s.afterGrade(session, 2)
  assert.equal(session.combo, 5)
  assert.equal(session.bonus, s.XP_PER_COMBO)
  assert.equal(session.xp, 4 * 50 + 30 + 10)
  session = s.afterGrade(session, 1)
  assert.equal(session.combo, 0)
  assert.equal(session.bonus, 0)
  session = s.afterGrade(session, 3)
  assert.equal(session.combo, 1)
})

test('day history and the daily goal', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  let history = {}
  history = s.addToHistory(history, { ratings: 1, newCards: 1, xp: 50, seconds: 4.2, answerTime: 4.2 }, now)
  history = s.addToHistory(history, { ratings: 1, newCards: 0, xp: 30, seconds: 3.1, answerTime: 2 }, now)
  assert.deepEqual(history['2026-09-15'], { oceny: 2, nowe: 1, exp: 80, sekundy: 7.3, tempo: 3.1, czasy: [4.2, 2] })
  assert.equal(s.gradedToday(history, now), 2)
  assert.equal(s.gradedToday(history, new Date(2026, 8, 16, 12, 0)), 0)
  assert.equal(s.gradedToday(undefined, now), 0)

  // adding does not change the previous object (needed to undo a grade)
  const next = s.addToHistory(history, { ratings: 1 }, now)
  assert.equal(history['2026-09-15'].oceny, 2)
  assert.equal(next['2026-09-15'].oceny, 3)

  // local day boundary, not UTC
  const night = s.addToHistory({}, { ratings: 1 }, new Date(2026, 8, 20, 23, 50))
  assert.deepEqual(Object.keys(night), ['2026-09-20'])

  assert.deepEqual([0, 1, 9, 10, 25, 500].map(s.dayLevel), [0, 1, 1, 2, 3, 4])

  const days = s.historyDays({ '2026-09-15': { oceny: 30, nowe: 3, exp: 0, sekundy: 0, tempo: 2.5 } }, 30, now)
  assert.equal(days.length, 30)
  assert.deepEqual(days.at(-1), { date: '2026-09-15', ratings: 30, newCards: 3, pace: 2.5, level: 3 })
  assert.deepEqual(days[0], { date: '2026-08-17', ratings: 0, newCards: 0, pace: 0, level: 0 })
  // new year
  assert.equal(s.historyDays({}, 3, new Date(2027, 0, 2, 12, 0))[0].date, '2026-12-31')
})

test('stats in sentences: cards this week, the longest run of days and pace', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const history = {
    '2026-09-15': { oceny: 12, nowe: 2, exp: 0, sekundy: 0, tempo: 2 },
    '2026-09-14': { oceny: 30, nowe: 0, exp: 0, sekundy: 0, tempo: 4 },
    '2026-09-13': { oceny: 18, nowe: 0, exp: 0, sekundy: 0 },
    // a break on 12 September
    '2026-09-11': { oceny: 5, nowe: 0, exp: 0, sekundy: 0 },
    '2026-09-10': { oceny: 7, nowe: 0, exp: 0, sekundy: 0 },
    // a day without a single grade does not extend the run
    '2026-09-09': { oceny: 0, nowe: 0, exp: 0, sekundy: 0 },
    '2026-09-01': { oceny: 9, nowe: 0, exp: 0, sekundy: 0, tempo: 9 },
  }
  assert.equal(s.WEEK_DAYS, 7)
  assert.equal(s.cardsThisWeek(history, now), 12 + 30 + 18 + 5 + 7, 'seven days ending today')
  assert.equal(s.cardsThisWeek({}, now), 0)
  assert.equal(s.longestRun(history), 3, '13-15 September')
  assert.equal(s.longestRun({}), 0)
  assert.equal(s.longestRun(undefined), 0)
  // Median of the medians of days that have a pace; a day before the period does not count.
  assert.equal(s.recentPace(history, 14, now), 3)
  assert.equal(s.recentPace(history, 30, now), 4, 'with three days the median is the middle value')
  assert.equal(s.recentPace({}, 14, now), 0, 'no data is zero, not null')
})

test('trimming history to 180 days', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const empty = { oceny: 1, nowe: 0, exp: 0, sekundy: 0 }
  const history = {
    '2026-09-15': empty,
    '2026-03-20': empty, // 179 days back, stays
    '2026-03-19': empty, // 180 days back, dropped
    '2025-01-01': empty,
  }
  assert.deepEqual(Object.keys(s.trimHistory(history, now)).sort(), ['2026-03-20', '2026-09-15'])
  assert.deepEqual(s.trimHistory(undefined, now), {})

  // Raw answer times stay only for today: the median is already counted.
  const withTimes = {
    '2026-09-15': { ...empty, tempo: 3, czasy: [2, 3, 4] },
    '2026-09-14': { ...empty, tempo: 5, czasy: [4, 5, 6] },
  }
  const trimmed = s.trimHistory(withTimes, now)
  assert.deepEqual(trimmed['2026-09-15'].czasy, [2, 3, 4])
  assert.equal(trimmed['2026-09-14'].czasy, undefined)
  assert.equal(trimmed['2026-09-14'].tempo, 5, 'the median of a closed day stays')

  // The save must not grow without end: a day keeps at most MAX_DAY_TIMES times.
  let long = {}
  for (let i = 0; i < s.MAX_DAY_TIMES + 20; i++) long = s.addToHistory(long, { ratings: 1, answerTime: 3 }, now)
  assert.equal(long['2026-09-15'].czasy.length, s.MAX_DAY_TIMES)
  assert.equal(long['2026-09-15'].oceny, s.MAX_DAY_TIMES + 20)
})

test('deck finish forecast', () => {
  const day = (history, date, newCards) => ({ ...history, [date]: { oceny: newCards, nowe: newCards, exp: 0, sekundy: 0 } })
  const december = new Date(2026, 11, 20, 12, 0)
  let history = day({}, '2026-12-19', 7)
  history = day(history, '2026-12-18', 7)
  // 14 new in 14 days = 1 per day, 20 words to go: over the new year
  const year = s.finishForecast({ remaining: 20, history, settings: {}, now: december })
  assert.equal(year.pace, 1)
  assert.equal(year.days, 20)
  assert.equal(year.date, '2027-01-09')

  // over a month end
  let january = day({}, '2026-01-19', 7)
  january = day(january, '2026-01-18', 7)
  const month = s.finishForecast({ remaining: 20, history: january, settings: {}, now: new Date(2026, 0, 20, 12, 0) })
  assert.equal(month.days, 20)
  assert.equal(month.date, '2026-02-09')

  // no entries in the period: pace from settings
  const fromSettings = s.finishForecast({ remaining: 100, history: {}, settings: { noweDziennie: 10 }, now: december })
  assert.equal(fromSettings.pace, 10)
  assert.equal(fromSettings.days, 10)
  assert.equal(fromSettings.date, '2026-12-30')

  // entries exist, but nothing new: no pace data
  const zero = s.finishForecast({ remaining: 100, history: day({}, '2026-12-19', 0), settings: {}, now: december })
  assert.deepEqual(zero, { pace: 0, days: null, date: '' })

  // old entries do not count to the pace of the last 14 days
  assert.equal(s.averageNew(day({}, '2026-11-01', 100), s.PACE_DAYS, december), null)
})

test('hard words: both directions, more mistakes first', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const cards = {
    'b|en': card('powtorka', now, { pomylki: 1, ostatnio: '2026-09-14T10:00:00.000Z' }),
    'a|en': card('powtorka', now, { pomylki: 3, ostatnio: '2026-09-10T10:00:00.000Z' }),
    'b|pl': card('powtorka', now, { pomylki: 1, ostatnio: '2026-09-12T10:00:00.000Z' }),
    'c|en': card('powtorka', now, { pomylki: 0 }),
    'removed|en': card('powtorka', now, { pomylki: 9 }),
  }
  const list = words('a', 'b', 'c')
  assert.equal(s.hardCount({ words: list, cards }), 3)
  assert.deepEqual(s.hardCards({ words: list, cards, settings: {} }), ['a|en', 'b|en', 'b|pl'])
  assert.deepEqual(s.hardCards({ words: list, cards, settings: {}, length: 2 }), ['a|en', 'b|en'])
  assert.deepEqual(s.hardCards({ words: list, cards: {}, settings: {} }), [])
  assert.equal(s.hardCount({ words: [], cards }), 0)

  // a training session is marked, a normal one is not
  assert.equal(s.newSession(['a|en'], true).training, true)
  assert.equal(s.newSession(['a|en']).training, false)
})

test('undoing a grade: functions do not change the previous state', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const sessionBefore = s.newSession(['a|en', 'b|en', 'c|en'])
  const stateBefore = {
    expRazem: 500,
    streak: { ...s.EMPTY_STREAK, dni: 2, ostatniDzien: '2026-09-14' },
    dzis: { data: '2026-09-15', sekundy: 55, dodatkoweNowe: 0, powtorki: 3 },
    historia: { '2026-09-15': { oceny: 4, nowe: 1, exp: 200, sekundy: 55 } },
  }
  const snapshot = { session: sessionBefore, ...stateBefore }
  const toCompare = structuredClone(stateBefore)

  const sessionAfter = s.afterGrade(sessionBefore, 3)
  const todayAfter = s.addTime(stateBefore.dzis, 8, now)
  const streakAfter = s.countDay(stateBefore.streak, now)
  const historyAfter = s.addToHistory(stateBefore.historia, { ratings: 1, newCards: 0, xp: 50, seconds: 8 }, now)

  // the state after the grade really changed
  assert.equal(sessionAfter.xp, 50)
  assert.equal(todayAfter.sekundy, 63)
  assert.equal(streakAfter.streak.dni, 3)
  assert.equal(historyAfter['2026-09-15'].oceny, 5)

  // and the snapshot still shows the state from before the grade
  assert.deepEqual(snapshot.session, s.newSession(['a|en', 'b|en', 'c|en']))
  assert.deepEqual(
    {
      expRazem: snapshot.expRazem,
      streak: snapshot.streak,
      dzis: snapshot.dzis,
      historia: snapshot.historia,
    },
    toCompare,
  )
})

test('hint in three levels', () => {
  assert.equal(s.hint('lunch', 'brak'), '')
  assert.equal(s.hint('lunch', 'dlugosc'), '_ _ _ _ _')
  assert.equal(s.hint('lunch', 'litera'), 'l _ _ _ _')
  assert.equal(s.hint('ice cream', 'dlugosc'), '_ _ _   _ _ _ _ _')
  assert.equal(s.hint("o'clock", 'dlugosc'), "_ ' _ _ _ _ _")
  assert.equal(s.hint('  well-known ', 'dlugosc'), '_ _ _ _ - _ _ _ _ _')
  // without a level it works as before
  assert.equal(s.hint('lunch'), s.hint('lunch', 'litera'))

  assert.equal(s.nextHint('brak'), 'dlugosc')
  assert.equal(s.nextHint('dlugosc'), 'litera')
  assert.equal(s.nextHint('litera'), 'litera')
  assert.equal(s.nextHint('unknown'), 'dlugosc')
})

test('word search: case and Polish letters do not matter', () => {
  const list = [
    { id: 'apple', w: 'apple', pl: 'jabłko' },
    { id: 'lake', w: 'lake', pl: 'jezioro' },
    { id: 'spoon', w: 'spoon', pl: 'łyżka' },
  ]
  const index = s.buildIndex(list)
  const ids = (phrase) => s.searchWords(index, phrase).words.map((w) => w.id)

  assert.equal(s.plainText('ŁYŻKA Zażółć'), 'lyzka zazolc')
  assert.deepEqual(ids('APP'), ['apple'])
  assert.deepEqual(ids('jab'), ['apple'])
  assert.deepEqual(ids('lyz'), ['spoon'])
  assert.deepEqual(ids('łyż'), ['spoon'])
  assert.deepEqual(ids('ake'), ['lake'])
  assert.deepEqual(ids(''), ['apple', 'lake', 'spoon'])
  assert.deepEqual(ids('   '), ['apple', 'lake', 'spoon'])
  assert.deepEqual(s.searchWords(index, 'zzz'), { words: [], total: 0 })

  // the counter "showing 50 of 312" counts all hits, the list is cut
  const big = s.buildIndex(Array.from({ length: 312 }, (_, i) => ({ id: `s${i}`, w: `word${i}`, pl: 'słowo' })))
  const result = s.searchWords(big, 'word')
  assert.equal(result.total, 312)
  assert.equal(result.words.length, s.MAX_RESULTS)
  assert.equal(s.searchWords(big, '').words.length, s.MAX_RESULTS)
})

test('EN card status and the mastered counter', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  assert.equal(s.cardStatus(undefined, now), 'new')
  assert.equal(s.cardStatus(card('nauka', minutes(now, 10)), now), 'learning')
  assert.equal(s.cardStatus(card('ponowna', minutes(now, 10)), now), 'learning')
  assert.equal(s.cardStatus(card('powtorka', minutes(now, -60)), now), 'review now')
  assert.equal(s.cardStatus(card('powtorka', minutes(now, 1440)), now), 'review in 1 day')
  assert.equal(s.cardStatus(card('powtorka', minutes(now, 5 * 1440)), now), 'review in 5 days')
  assert.equal(s.cardStatus(card('powtorka', minutes(now, 1440), { stabilnosc: s.MASTERED_DAYS }), now), 'mastered')

  const list = words('a', 'b', 'c')
  const cards = {
    'a|en': card('powtorka', now, { stabilnosc: 25 }),
    'b|en': card('powtorka', now, { stabilnosc: 20.9 }),
  }
  assert.equal(s.statistics({ words: list, cards }).mastered, 1)
})

// Fixes after a code review

test('removeNew gives back a new word from the day it was introduced, not from the day of the reset', () => {
  const history = { '2026-09-14': { oceny: 20, nowe: 5, exp: 700 }, '2026-09-18': { oceny: 30, nowe: 2, exp: 900 } }
  const result = s.removeNew(history, [new Date(2026, 8, 14, 9, 30).toISOString(), ''])
  assert.equal(result['2026-09-14'].nowe, 4)
  assert.equal(result['2026-09-14'].oceny, 20, 'the rest of the day unchanged')
  assert.equal(result['2026-09-18'].nowe, 2, 'other days unchanged')
  assert.equal(history['2026-09-14'].nowe, 5, 'input untouched')
})

test('removeNew does not go below zero and handles missing days', () => {
  const history = { '2026-09-18': { oceny: 3, nowe: 0, exp: 90 } }
  const iso = new Date(2026, 8, 18, 12, 0).toISOString()
  assert.equal(s.removeNew(history, [iso, iso])['2026-09-18'].nowe, 0)
  assert.deepEqual(s.removeNew(history, [null, undefined]), history)
  assert.deepEqual(s.removeNew(history, [new Date(2020, 0, 1).toISOString()]), history)
})

test('trimHistory drops days from the future after the clock moved back', () => {
  const now = new Date(2026, 8, 18, 10, 0)
  const history = { '2026-09-18': { oceny: 1 }, '2026-09-19': { oceny: 9 }, '2099-01-01': { oceny: 9 }, '2026-09-17': { oceny: 2 } }
  const result = s.trimHistory(history, now)
  assert.deepEqual(Object.keys(result).sort(), ['2026-09-17', '2026-09-18'])
})

// "Skip": the word leaves study, its cards stay untouched

test('a skipped word does not go into the session, and its cards stay in memory', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const cards = {
    'a|en': card('powtorka', minutes(now, -1440)),
    'b|en': card('powtorka', minutes(now, -60)),
  }
  const list = words('a', 'b', 'c', 'd')
  const skipped = { a: '2026-09-15', c: '2026-09-15' }
  assert.deepEqual(s.buildSession({ words: list, cards, settings: {}, today: null, now }), ['a|en', 'b|en', 'c|en', 'd|en'])
  assert.deepEqual(s.buildSession({ words: list, cards, settings: {}, today: null, now, skipped }), ['b|en', 'd|en'])
  assert.ok(cards['a|en'], 'the card of the skipped word stays')
})

test('a skipped word leaves the new, due and hard counts', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const cards = {
    'a|en': card('powtorka', minutes(now, -1440), { pomylki: 3 }),
    'b|en': card('powtorka', minutes(now, 120)),
  }
  const list = words('a', 'b', 'c')
  const skipped = { a: '2026-09-15' }
  const without = s.daySummary({ words: list, cards, settings: {}, today: null, now })
  const with_ = s.daySummary({ words: list, cards, settings: {}, today: null, now, skipped })
  assert.equal(without.due, 1)
  assert.equal(with_.due, 0, 'a skipped word is not due')
  assert.equal(without.newAvailable, 1)
  assert.equal(with_.newAvailable, 1, 'c is still new')
  assert.equal(with_.laterToday, 1, 'b unchanged')
  assert.equal(s.hardCount({ words: list, cards }), 1)
  assert.equal(s.hardCount({ words: list, cards, skipped }), 0)
  assert.deepEqual(s.hardCards({ words: list, cards, settings: {}, skipped }), [])
})

test('stats: skipped words separately, words known before skipping still count', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const list = words('a', 'b', 'c', 'd')
  const cards = { 'a|en': card('powtorka', now), 'b|en': card('powtorka', now) }
  // a was studied and then skipped, c was skipped as new
  const stats = s.statistics({ words: list, cards, skipped: { a: '2026-09-15', c: '2026-09-15' } })
  assert.equal(stats.known, 2, 'a word skipped after study still counts as known')
  assert.equal(stats.skipped, 2)
  assert.equal(stats.toIntroduce, 1, 'only d is left to introduce')
  assert.equal(s.statistics({ words: list, cards }).toIntroduce, 2)
})

test('status "skipped" in the word list', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  assert.equal(s.cardStatus(undefined, now, true), 'skipped')
  assert.equal(s.cardStatus(card('powtorka', minutes(now, 5 * 1440)), now, true), 'skipped')
  assert.equal(s.cardStatus(card('powtorka', minutes(now, 5 * 1440)), now, false), 'review in 5 days')
  assert.equal(s.isSkipped({ a: '2026-09-15' }, 'a'), true)
  assert.equal(s.isSkipped({ a: '2026-09-15' }, 'b'), false)
  assert.equal(s.isSkipped(undefined, 'a'), false)
  // A save with a broken date keeps the entry as '' (fixedSkipped), the word must stay out of study.
  assert.equal(s.isSkipped({ a: '' }, 'a'), true)
})

// Due date fuzz

const daysTo = (iso, now) => (Date.parse(iso) - now.getTime()) / 86400000
const inDays = (now, days) => new Date(now.getTime() + days * 86400000).toISOString()

test('fuzzDue is deterministic', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const due = inDays(now, 10)
  const a = s.fuzzDue('apple|en', due, now)
  assert.equal(a, s.fuzzDue('apple|en', due, now))
  assert.notEqual(a, s.fuzzDue('book|en', due, now), 'another key gives another shift')
  assert.notEqual(a, s.fuzzDue('apple|en', inDays(now, 10.5), now), 'another due date gives another shift')
})

test('fuzzDue leaves short due dates and stays in range', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  for (const days of [0, 0.007, 1, 2, 2.99]) {
    const due = inDays(now, days)
    assert.equal(s.fuzzDue('apple|en', due, now), due, `${days} days unchanged`)
  }
  assert.equal(s.fuzzDue('apple|en', inDays(now, -5), now), inDays(now, -5), 'overdue unchanged')
  for (const key of ['a|en', 'b|en', 'c|pl', 'long word|en']) {
    const days = daysTo(s.fuzzDue(key, inDays(now, 10), now), now)
    assert.ok(days >= 9.2 && days <= 10.8, `${key}: ${days} days out of range 9.2-10.8`)
  }
})

test('fuzzDue does not move a due date before now + 1 day and gives whole minutes', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  for (let i = 0; i < 300; i++) {
    const iso = s.fuzzDue(`s${i}|en`, inDays(now, 3), now, 1)
    const days = daysTo(iso, now)
    assert.ok(days >= 1, `s${i}: ${days} days`)
    assert.equal(Date.parse(iso) % 60000, 0, 'due date rounded to whole minutes')
  }
  // The largest shift is 21 days, also with a very far due date.
  const days = daysTo(s.fuzzDue('x|en', inDays(now, 400), now, 1), now)
  assert.ok(days >= 400 - s.MAX_FUZZ_DAYS && days <= 400 + s.MAX_FUZZ_DAYS, `${days} days`)
})

test('400 cards with the same due date spread over a few days', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const due = inDays(now, s.KNOWN_DAYS)
  const days = new Set()
  for (let i = 0; i < 400; i++) days.add(s.localDate(new Date(s.fuzzDue(`s${i}|en`, due, now))))
  assert.ok(days.size >= 3, `only ${days.size} different days`)
})

test('spreadDueDates moves only future due dates of cards in review', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const cards = {}
  for (let i = 0; i < 400; i++) cards[`s${i}|en`] = card('powtorka', minutes(now, 8 * 1440))
  cards['overdue|en'] = card('powtorka', minutes(now, -1440))
  cards['tomorrow|en'] = card('powtorka', minutes(now, 1440))
  cards['learning|en'] = card('nauka', minutes(now, 10))
  cards['new|en'] = card('nowa', minutes(now, 30 * 1440))
  const result = s.spreadDueDates(cards, now)
  assert.equal(result.moved, 400)
  for (const key of ['overdue|en', 'tomorrow|en', 'learning|en', 'new|en']) {
    assert.equal(result.cards[key].termin, cards[key].termin, `${key} untouched`)
    assert.equal(result.cards[key], cards[key], `${key} is the same object`)
  }
  const days = new Set()
  for (let i = 0; i < 400; i++) days.add(s.localDate(new Date(result.cards[`s${i}|en`].termin)))
  assert.ok(days.size >= 3, `only ${days.size} different days`)
  assert.equal(cards['s0|en'].termin, minutes(now, 8 * 1440).toISOString(), 'input untouched')
})

test('"Already know" gives one check in about 45 days', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const fresh = newFsrsCard(now.toISOString())
  const afterFsrs = { ...fresh, ...gradeFsrs(fresh, 4, now) }
  assert.ok(daysTo(afterFsrs.termin, now) < 20, `FSRS alone gives ${daysTo(afterFsrs.termin, now)} days`)
  const known = s.knownCard(afterFsrs, 'apple|en', now)
  assert.equal(known.stan, 'powtorka')
  assert.equal(known.krok, 0)
  assert.equal(known.stabilnosc, afterFsrs.stabilnosc, 'stability unchanged: the word has not passed a review yet')
  const days = daysTo(known.termin, now)
  assert.ok(Math.abs(days - s.KNOWN_DAYS) <= s.KNOWN_DAYS * 0.08 + 0.001, `${days} days`)
  assert.equal(known.trudnosc, afterFsrs.trudnosc, 'the rest of the FSRS memory unchanged')
  assert.equal(known.powtorki, afterFsrs.powtorki)
  assert.equal(known.wprowadzono, afterFsrs.wprowadzono)
  // A card with higher stability does not lose it through "Already know".
  assert.equal(s.knownCard({ ...afterFsrs, stabilnosc: 90 }, 'apple|en', now).stabilnosc, 90)
})

// Review cap, order by urgency and catch-up mode (A1, A2)

test('daily review cap: the rest moves to the next days, new words are not affected', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const list = words(...Array.from({ length: 200 }, (_, i) => `s${i}`))
  const cards = {}
  for (let i = 0; i < 150; i++) {
    cards[`s${i}|en`] = card('powtorka', minutes(now, -60 - i), { stabilnosc: 10 + i })
  }
  const settings = { noweDziennie: 10, maksPowtorekDziennie: 40, mowienie: false }
  const all = s.buildSession({ words: list, cards, settings, today: null, now, length: Infinity, recall })
  assert.equal(all.filter((k) => cards[k]).length, 40, 'due cards cut to the cap')
  assert.equal(all.filter((k) => !cards[k]).length, 10, 'new words have their own limit')

  // Cards done today use up the budget.
  const today = { data: '2026-09-15', sekundy: 0, dodatkoweNowe: 0, powtorki: 35 }
  assert.equal(s.reviewBudget({ settings, today, now }), 5)
  const rest = s.buildSession({ words: list, cards, settings, today, now, length: Infinity, recall })
  assert.equal(rest.filter((k) => cards[k]).length, 5)
  assert.equal(rest.filter((k) => !cards[k]).length, 10, 'the cap does not apply to new words')

  // After the cap is used up only new cards stay, and the rest waits for tomorrow.
  const usedUp = { data: '2026-09-15', sekundy: 0, dodatkoweNowe: 0, powtorki: 100 }
  assert.equal(s.reviewBudget({ settings, today: usedUp, now }), 0)
  assert.equal(s.buildSession({ words: list, cards, settings, today: usedUp, now, length: Infinity, recall }).length, 10)

  // "no limit" (0) removes the cap.
  const noLimit = { ...settings, maksPowtorekDziennie: 0 }
  assert.equal(s.reviewBudget({ settings: noLimit, today: usedUp, now }), Infinity)
  assert.equal(s.buildSession({ words: list, cards, settings: noLimit, today: usedUp, now, length: Infinity, recall }).length, 160)
})

test('due cards in order of urgency, not due date', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const list = words('old', 'fresh', 'learning')
  // "old" has a very old due date, but a huge stability: memory holds. "fresh" is weaker and more urgent.
  const cards = {
    'old|en': card('powtorka', minutes(now, -60 * 24 * 20), { stabilnosc: 400, ostatnio: new Date(2026, 6, 1, 12, 0).toISOString() }),
    'fresh|en': card('powtorka', minutes(now, -10), { stabilnosc: 3, ostatnio: new Date(2026, 8, 11, 12, 0).toISOString() }),
    'learning|en': card('nauka', minutes(now, -5), { stabilnosc: 0.5, ostatnio: new Date(2026, 8, 15, 11, 0).toISOString() }),
  }
  assert.ok(s.urgency(cards['fresh|en'], now, recall) < s.urgency(cards['old|en'], now, recall), 'a lower recall chance = a more urgent card')
  const settings = { mowienie: false, noweDziennie: 5 }
  const session = s.buildSession({ words: list, cards, settings, today: null, now, recall })
  assert.deepEqual(session, ['learning|en', 'fresh|en', 'old|en'])

  // Without the `recall` function the order is by due date (as before the cap).
  const byDue = s.buildSession({ words: list, cards, settings, today: null, now })
  assert.deepEqual(byDue, ['learning|en', 'old|en', 'fresh|en'])
  assert.equal(s.urgency(cards['old|en'], now, null), null)
  assert.equal(s.urgency({ stabilnosc: 0, ostatnio: '' }, now, recall), 0, 'a card without history is the most urgent')
})

test('catch-up mode: start, end and 50% new cards for 3 days', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const settings = { noweDziennie: 10, maksPowtorekDziennie: 60, mowienie: false }
  assert.equal(s.CATCH_UP_FACTOR, 2)

  // 121 due cards with a cap of 60 is over 2x the cap: catch-up mode starts.
  let c = s.nextCatchUp(s.EMPTY_CATCH_UP, 121, settings, now)
  assert.equal(c.aktywne, 1)
  assert.equal(s.nextCatchUp(s.EMPTY_CATCH_UP, 120, settings, now).aktywne, 0, 'exactly 2x the cap does not start it yet')

  // In catch-up mode there are no new cards, and the review limit grows to 1.5x the cap.
  assert.equal(s.newCardFactor(c, now), 0)
  assert.equal(s.reviewBudget({ settings, today: null, now, catchUp: c }), 90)

  // Between the cap and 2x the cap the mode stays on (hysteresis).
  c = s.nextCatchUp(c, 80, settings, now)
  assert.equal(c.aktywne, 1)

  // Below the cap the mode ends and for 3 days (counting the day it ends) new cards are half.
  c = s.nextCatchUp(c, 59, settings, now)
  assert.equal(c.aktywne, 0)
  assert.equal(c.polowaDo, '2026-09-17')
  assert.equal(s.reviewBudget({ settings, today: null, now, catchUp: c }), 60)
  for (const d of [15, 16, 17]) assert.equal(s.newCardFactor(c, new Date(2026, 8, d, 9, 0)), 0.5, `day ${d}`)
  assert.equal(s.newCardFactor(c, new Date(2026, 8, 18, 9, 0)), 1, 'full limit on the fourth day')
  assert.equal(s.HALF_NEW_DAYS, 3)

  // The new limit really drops by half, and "+10 new today" works despite the mode.
  const list = words(...Array.from({ length: 40 }, (_, i) => `s${i}`))
  const half = s.buildSession({ words: list, cards: {}, settings, today: null, now, length: Infinity, catchUp: c })
  assert.equal(half.length, 5)
  const inMode = { aktywne: 1, polowaDo: '' }
  assert.equal(s.buildSession({ words: list, cards: {}, settings, today: null, now, length: Infinity, catchUp: inMode }).length, 0)
  const withExtra = { data: '2026-09-15', sekundy: 0, dodatkoweNowe: 10, powtorki: 0 }
  assert.equal(
    s.buildSession({ words: list, cards: {}, settings, today: withExtra, now, length: Infinity, catchUp: inMode }).length,
    10,
    'a deliberate "+10 new" works also in catch-up',
  )

  // Without a cap catch-up mode does not start.
  const noCap = { ...settings, maksPowtorekDziennie: 0 }
  assert.equal(s.nextCatchUp(s.EMPTY_CATCH_UP, 5000, noCap, now).aktywne, 0)
  assert.equal(s.nextCatchUp({ aktywne: 1, polowaDo: '' }, 5000, noCap, now).aktywne, 0)
})

test('day summary in catch-up: one number to do, no debt number on the return screen', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const list = words(...Array.from({ length: 300 }, (_, i) => `s${i}`))
  const cards = {}
  for (let i = 0; i < 250; i++) cards[`s${i}|en`] = card('powtorka', minutes(now, -60 - i), { stabilnosc: 10 })
  const settings = { noweDziennie: 10, maksPowtorekDziennie: 60, mowienie: false }
  const catchUp = s.nextCatchUp(s.EMPTY_CATCH_UP, 250, settings, now)
  const d = s.daySummary({ words: list, cards, settings, today: null, now, catchUp, recall })
  assert.equal(d.catchUp, true)
  assert.equal(d.due, 250)
  assert.equal(d.toDo, 90, '1.5x the cap, no new words')
  assert.equal(d.newAvailable, 0)
})

// Interference between words (A6)

test('interference block: a new word waits when a similar word is fresh or being learned', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const list = words('quiet', 'quite', 'silent', 'apple', 'text')
  const collisions = { quiet: ['quite', 'silent'], quite: ['quiet'], silent: ['quiet'], text: ['apple'], apple: ['text'] }
  const settings = { noweDziennie: 10, mowienie: false }

  // "quite" introduced yesterday blocks "quiet", "apple" from 8 days ago does not block "text" any more.
  const cards = {
    'quite|en': card('powtorka', minutes(now, 5000), { stabilnosc: 9, wprowadzono: minutes(now, -1440).toISOString() }),
    'apple|en': card('powtorka', minutes(now, 5000), { stabilnosc: 9, wprowadzono: minutes(now, -8 * 1440).toISOString() }),
  }
  assert.equal(s.collidesNow({ collisions, id: 'quiet', cards, now }), true)
  assert.equal(s.collidesNow({ collisions, id: 'text', cards, now }), false)
  assert.equal(s.collidesNow({ collisions: {}, id: 'quiet', cards, now }), false, 'without the index nothing blocks')
  assert.equal(s.collidesNow({ collisions, id: 'silent', cards, now }), false, 'the collision of "silent" is only the new "quiet"')
  assert.equal(s.INTERFERENCE_DAYS, 7)

  // A similar word in the learning or relearning state blocks no matter the introduction date.
  for (const state of ['nauka', 'ponowna']) {
    const learning = { 'quite|en': card(state, minutes(now, 5), { wprowadzono: minutes(now, -30 * 1440).toISOString() }) }
    assert.equal(s.collidesNow({ collisions, id: 'quiet', cards: learning, now }), true, state)
  }

  // When picking the session the similar word is skipped, and the app takes the next one from the list.
  const session = s.buildSession({ words: list, cards, settings, today: null, now, length: Infinity, collisions, recall })
  assert.deepEqual(session, ['silent|en', 'text|en'], 'quiet waits, the rest comes in normally')
  const noIndex = s.buildSession({ words: list, cards, settings, today: null, now, length: Infinity, recall })
  assert.deepEqual(noIndex, ['quiet|en', 'silent|en', 'text|en'])
})

// Leeches (A7)

test('leech panel after 6 mistakes, putting away for 3 weeks and the offer counter', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  assert.equal(s.LEECH_MISTAKES, 6)
  assert.equal(s.needsLeechPanel(undefined), false)
  assert.equal(s.needsLeechPanel(card('powtorka', now, { pomylki: 5 })), false)
  const hard = card('powtorka', now, { pomylki: 6 })
  assert.equal(s.needsLeechPanel(hard), true)

  // After a decision the panel does not come back until 6 more mistakes add up.
  const afterDecision = s.afterLeech(hard)
  assert.equal(afterDecision.leech, 6)
  assert.equal(s.needsLeechPanel(afterDecision), false)
  assert.equal(s.needsLeechPanel({ ...afterDecision, pomylki: 11 }), false)
  assert.equal(s.needsLeechPanel({ ...afterDecision, pomylki: 12 }), true)

  // "Put away for 3 weeks": due date today + 21 days, the card history untouched.
  const postponed = s.postponedCard(hard, 'x|en', now)
  const days = (Date.parse(postponed.termin) - now.getTime()) / 86400000
  assert.ok(Math.abs(days - s.LEECH_POSTPONE_DAYS) <= 1.8, `due in ${days} days`)
  assert.equal(postponed.stan, 'powtorka')
  assert.equal(postponed.krok, 0)
  assert.equal(postponed.leech, 6)
  assert.equal(postponed.pomylki, 6, 'the mistake history stays, FSRS learns from it')
  assert.equal(postponed.powtorki, hard.powtorki)
  assert.equal(postponed.stabilnosc, hard.stabilnosc)
  assert.equal(s.needsLeechPanel(postponed), false)
  assert.equal(hard.leech, undefined, 'input untouched')
})

// Hint as a desirable difficulty (A5)

test('default settings after the engine rebuild', () => {
  assert.deepEqual(s.DEFAULT_SETTINGS, {
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
  assert.deepEqual(s.NEW_PER_DAY_OPTIONS, [5, 8, 10, 15, 20, 30])
  assert.deepEqual(s.REVIEW_CAP_OPTIONS, [40, 60, 100, 0])
})

// --- D1: habit anchor (implementation intention) ---

test('the anchor sentence is made only from a non-empty cue', () => {
  assert.equal(s.anchorSentence('after coffee'), 'You study after coffee.')
  assert.equal(s.anchorSentence('  before sleep  '), 'You study before sleep.')
  assert.equal(s.anchorSentence(''), '')
  assert.equal(s.anchorSentence('   '), '')
  assert.equal(s.anchorSentence(undefined), '')
  assert.equal(s.anchorSentence(null), '')
})

test('ready anchors are event cues, not clock times', () => {
  assert.deepEqual(s.HABIT_ANCHORS, ['after coffee', 'after brushing teeth', 'on the way', 'before sleep'])
  assert.ok(s.HABIT_ANCHORS.every((a) => !/\d/.test(a)))
  assert.equal(s.MAX_ANCHOR_CHARS, 40)
  // Every anchor from the Polish version has an English one.
  assert.deepEqual(Object.values(s.OLD_HABIT_ANCHORS), s.HABIT_ANCHORS)
})

// --- C5: "what next" forecast on the session end screen ---

test('the tomorrow forecast counts cards until the end of tomorrow', () => {
  const now = new Date(2026, 8, 15, 20, 0)
  const tomorrow = new Date(2026, 8, 16, 9, 0)
  const dayAfter = new Date(2026, 8, 17, 9, 0)
  const cards = {
    'a|en': card('powtorka', now),
    'b|en': card('powtorka', tomorrow),
    'c|en': card('powtorka', dayAfter),
    'd|en': { ...newFsrsCard(), stan: 'nowa' },
  }
  const result = s.tomorrowForecast({ words: words('a', 'b', 'c', 'd'), cards, settings: {}, now, skipped: {} })
  assert.equal(result.count, 2)
  assert.equal(result.bearable, true)
})

test('the tomorrow forecast leaves out skipped words and speaking cards when speaking is off', () => {
  const now = new Date(2026, 8, 15, 20, 0)
  const cards = {
    'a|en': card('powtorka', now),
    'a|pl': card('powtorka', now),
    'b|en': card('powtorka', now),
  }
  const options = { words: words('a', 'b'), cards, now, skipped: {} }
  assert.equal(s.tomorrowForecast({ ...options, settings: {} }).count, 3)
  assert.equal(s.tomorrowForecast({ ...options, settings: { mowienie: false } }).count, 2)
  assert.equal(s.tomorrowForecast({ ...options, settings: {}, skipped: { a: '2026-09-15' } }).count, 1)
})

test('we do not show the tomorrow forecast when the number stops being bearable', () => {
  const now = new Date(2026, 8, 15, 20, 0)
  const list = Array.from({ length: 80 }, (_, i) => `s${i}`)
  const cards = Object.fromEntries(list.map((id) => [s.cardKey(id, 'en'), card('powtorka', now)]))
  const options = { words: words(...list), cards, now, skipped: {} }
  // Cap 60: 80 cards is already debt, so we do not show the number.
  assert.equal(s.tomorrowForecast({ ...options, settings: { maksPowtorekDziennie: 60 } }).bearable, false)
  assert.equal(s.tomorrowForecast({ ...options, settings: { maksPowtorekDziennie: 100 } }).bearable, true)
  // "No limit" (0) uses the bearable threshold, not the lack of a threshold.
  assert.equal(s.tomorrowForecast({ ...options, settings: { maksPowtorekDziennie: 0 } }).bearable, false)
  // Zero cards is not "what next" information, just no content.
  assert.equal(s.tomorrowForecast({ words: [], cards: {}, settings: {}, now, skipped: {} }).bearable, false)
})

// --- C5: new words counter in the session ("what was added") ---

test('the session counts new words introduced during it', () => {
  let session = s.newSession(['a|en', 'b|en', 'c|en'])
  assert.equal(session.newWords, 0)
  session = s.afterGrade(session, 3, true)
  assert.equal(session.newWords, 1)
  session = s.afterGrade(session, 2, true)
  assert.equal(session.newWords, 2)
  session = s.afterGrade(session, 3, false)
  assert.equal(session.newWords, 2)
})

test('a new word after "Don\'t know" counts once, even though the card comes back to the queue', () => {
  // Four cards, so after the mistake the gap fits and the card really comes back to the queue.
  let session = s.newSession(['a|en', 'b|en', 'c|en', 'd|en'])
  session = s.afterGrade(session, 1, true)
  assert.equal(session.newWords, 1)
  assert.equal(session.queue.includes('a|en'), true)
  // The second try at the same card is not new any more (it has an introduction date).
  session = s.afterGrade(session, 3, false)
  assert.equal(session.newWords, 1)
})

test('no third argument does not change the new counter', () => {
  const session = s.afterGrade(s.newSession(['a|en']), 3)
  assert.equal(session.newWords, 0)
  assert.equal(session.cleared, 1)
})

// Fixes after the v3 engine review

test('K1: a card started today goes into the session also when the review cap is used up', () => {
  const now = new Date(2026, 8, 19, 20, 0)
  const minute = (n) => new Date(now.getTime() + n * 60000)
  const list = words('a', 'b', 'c', 'd')
  const cards = {
    'a|en': card('nauka', minute(-5), { stabilnosc: 0.5 }),
    'b|en': card('ponowna', minute(-3), { stabilnosc: 0.5 }),
    'c|en': card('powtorka', minute(-10), { stabilnosc: 10 }),
  }
  const today = { data: s.localDate(now), sekundy: 0, dodatkoweNowe: 0, powtorki: 999 }
  const session = s.buildSession({ words: list, cards, settings: { dlugoscSerii: 15 }, today, now })
  assert.ok(session.includes('a|en'), 'a card in learning must be finishable today')
  assert.ok(session.includes('b|en'), 'a card after a mistake too')
  assert.ok(!session.includes('c|en'), 'a normal review not any more: the cap is used up')
  const p = s.daySummary({ words: list, cards, settings: { dlugoscSerii: 15 }, today, now })
  assert.ok(p.toDo >= 2, `toDo: ${p.toDo}`)
  assert.ok(p.newAvailable >= 0, `newAvailable must not be negative: ${p.newAvailable}`)
})

test('W2: two similar new words do not go into one session', () => {
  const now = new Date(2026, 8, 19, 20, 0)
  const list = words('test', 'text', 'cold')
  const collisions = { test: ['text'], text: ['test'] }
  const session = s.buildSession({ words: list, cards: {}, settings: { dlugoscSerii: 15 }, today: null, now, collisions })
  assert.ok(session.includes('test|en'))
  assert.ok(!session.includes('text|en'), 'the collision partner waits for another day')
  assert.ok(session.includes('cold|en'), 'a word without a collision comes in normally')
})

test('W3: a skipped word does not block its partners through interference', () => {
  const now = new Date(2026, 8, 19, 20, 0)
  const cards = { 'test|en': card('nauka', new Date(2025, 0, 1), { stabilnosc: 0.5 }) }
  const collisions = { text: ['test'] }
  assert.equal(s.collidesNow({ collisions, id: 'text', cards, now }), true, 'blocks without skipping')
  assert.equal(s.collidesNow({ collisions, id: 'text', cards, now, skipped: { test: '2026-09-18' } }), false)
})

test('W5: a clock moved back neither moves back nor breaks the streak', () => {
  const streak = { dni: 50, ostatniDzien: '2026-09-19', zamrozenia: 0, doZamrozenia: 0 }
  const yesterday = s.countDay(streak, new Date(2026, 8, 17, 10, 0))
  assert.equal(yesterday.counted, false, 'a date in the past does not count the day')
  assert.equal(yesterday.streak.ostatniDzien, '2026-09-19', 'the last day stays')
  assert.equal(yesterday.streak.dni, 50)
  const back = s.countDay(yesterday.streak, new Date(2026, 8, 20, 10, 0))
  assert.equal(back.streak.dni, 51, 'going back to the right date extends the streak')
  assert.equal(back.broken, false)
})

// --- H: decks (turning on, turning off, removing) ---

// Words with a deck. A word without the `talia` field goes to the "Untitled" deck.
const inDeck = (name, ...ids) => ids.map((id) => ({ id, w: id, pl: `pl-${id}`, talia: name }))

test('a turned off deck leaves the session, due cards, forecast and hard words, and progress stays', () => {
  const now = new Date(2026, 8, 15, 12, 0)
  const list = [...inDeck('Oxford', 'a', 'b'), ...inDeck('Mine', 'c', 'd')]
  const cards = {
    'a|en': card('powtorka', minutes(now, -120), { stabilnosc: 40 }),
    'c|en': card('powtorka', minutes(now, -60), { stabilnosc: 40, pomylki: 2 }),
  }
  const options = { words: list, cards, settings: { mowienie: false }, today: null, now }
  assert.deepEqual(s.buildSession(options), ['a|en', 'c|en', 'b|en', 'd|en'])
  assert.deepEqual(s.buildSession({ ...options, disabledDecks: ['Mine'] }), ['a|en', 'b|en'])
  assert.equal(s.dueCount({ ...options, disabledDecks: ['Mine'] }), 1)
  assert.equal(s.daySummary({ ...options, disabledDecks: ['Mine'] }).toDo, 2)
  assert.equal(s.tomorrowForecast({ ...options, disabledDecks: ['Mine'] }).count, 1)
  assert.equal(s.hardCount({ words: list, cards }), 1)
  assert.equal(s.hardCount({ words: list, cards, disabledDecks: ['Mine'] }), 0)
  assert.deepEqual(s.hardCards({ words: list, cards, settings: {}, disabledDecks: ['Mine'] }), [])
  // The progress of a turned off deck stays in the save: the cards are untouched, so coming back costs nothing.
  assert.ok(cards['c|en'])
  assert.deepEqual(s.buildSession(options), ['a|en', 'c|en', 'b|en', 'd|en'])
})

test('the progress bar and the deck list count only turned on decks', () => {
  const list = [...inDeck('Oxford', 'a', 'b'), ...inDeck('Mine', 'c'), { id: 'd', w: 'd', pl: 'pl-d' }]
  const cards = {
    'a|en': card('powtorka', new Date(2026, 8, 20), { stabilnosc: 40 }),
    'c|en': card('powtorka', new Date(2026, 8, 20), { stabilnosc: 40 }),
  }
  assert.deepEqual(s.deckProgress({ words: list, cards }), {
    known: 2,
    solid: 2,
    total: 4,
    knownRatio: 0.5,
    solidRatio: 0.5,
  })
  const after = s.deckProgress({ words: list, cards, disabledDecks: ['Mine'] })
  assert.deepEqual([after.known, after.solid, after.total], [1, 1, 3])
  assert.deepEqual(s.deckList({ words: list, cards, disabledDecks: ['Mine'] }), [
    { name: 'Oxford', total: 2, known: 1, enabled: true },
    { name: 'Mine', total: 1, known: 1, enabled: false },
    { name: s.UNTITLED_DECK, total: 1, known: 0, enabled: true },
  ])
})

test('removing a deck deletes its words, cards and skips, the rest stays', () => {
  const list = [...inDeck('Oxford', 'a'), ...inDeck('Mine', 'c', 'd')]
  const cards = {
    'a|en': card('powtorka', new Date(2026, 8, 20)),
    'c|en': card('powtorka', new Date(2026, 8, 20)),
    'c|pl': card('nauka', new Date(2026, 8, 20)),
  }
  const skipped = { d: '2026-09-10', a: '2026-09-11' }
  const result = s.withoutDeck({ words: list, cards, skipped }, 'Mine')
  assert.deepEqual(
    result.words.map((w) => w.id),
    ['a'],
  )
  assert.deepEqual(Object.keys(result.cards), ['a|en'])
  assert.deepEqual(result.skipped, { a: '2026-09-11' })
  assert.deepEqual([result.removedWords, result.removedCards], [2, 2])
  // The input stays untouched: the UI saves only after the confirmation.
  assert.equal(list.length, 3)
  assert.equal(Object.keys(cards).length, 3)
})

test('a collision with a word from a turned off deck does not block a new word', () => {
  const now = new Date(2026, 8, 19, 20, 0)
  const list = [...inDeck('Oxford', 'text'), ...inDeck('Mine', 'test')]
  const cards = { 'test|en': card('nauka', new Date(2025, 0, 1), { stabilnosc: 0.5 }) }
  const collisions = { text: ['test'], test: ['text'] }
  const before = s.buildSession({ words: list, cards, settings: { mowienie: false }, today: null, now, collisions })
  assert.ok(!before.includes('text|en'), 'without turning off the partner blocks')
  const after = s.buildSession({ words: list, cards, settings: { mowienie: false }, today: null, now, collisions, disabledDecks: ['Mine'] })
  assert.deepEqual(after, ['text|en'])
})
