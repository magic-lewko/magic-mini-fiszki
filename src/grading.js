// Pure study steps used by the UI: grading a card with a fuzzed due date and taking cards off the session.
// No DOM and no clock (now comes from outside), tested in grading.test.mjs.

import { ocen as gradeFsrs } from '../lib/fsrs.mjs'
import * as study from './study.js'

// A new card object instead of a change in place: storage keeps the packed form next to the card object.
// The due date from FSRS also gets a fuzz, so cards graded on the same day do not come back in one wave.
// "Already know" on a new card is a separate case: one check in about 45 days instead of the study cycle.
export function gradedCard(previous, grade, now, key) {
  const card = { ...previous, ...gradeFsrs(previous, grade, now), kolejneUmiem: study.knowStreak(previous, grade) }
  if (!Number.isFinite(card.stabilnosc) || !Number.isFinite(card.trudnosc) || Number.isNaN(Date.parse(card.termin))) {
    throw new Error('wrong result of the review algorithm')
  }
  if (grade === 4 && study.isNew(previous)) return study.knownCard(card, key, now)
  return { ...card, termin: study.fuzzDue(key, card.termin, now) }
}

// The session without the cards that match the condition. The "total" counter drops by the removed cards,
// but not below the number of cards already cleared.
export function sessionWithout(session, remove) {
  const queue = session.queue.filter((k) => !remove(k))
  return { ...session, queue, total: Math.max(session.total - (session.queue.length - queue.length), session.cleared) }
}

// Both directions of a word leave the session at once, so the speaking card does not come back in a moment.
export const sessionWithoutWord = (session, id) => sessionWithout(session, (k) => study.splitKey(k).id === id)

// The card leaves the session without a grade and without a save.
export const sessionWithoutCurrent = (session) => ({
  ...session,
  queue: session.queue.slice(1),
  total: Math.max(session.total - 1, session.cleared),
})
