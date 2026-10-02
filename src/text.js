// UI constants and pure text helpers: plural forms, date and time formats, grade labels, the tutorial and
// the study guide text. No DOM, so they can be tested in Node (text.test.mjs).

export const DAYS_TO_BACKUP_REMINDER = 7
export const MAX_ERRORS_IN_PREVIEW = 30
export const SECONDS_TO_UNDO = 6
export const SKIP_TIP = 'Removed words do not come back. You can restore them in Menu > Words > Removed.'
export const FREEZE_TEXT = 'Yesterday was a day off, the streak stays.'
// The caption "Tap to reveal" is only on the first cards after install and after the tutorial.
export const CARDS_WITH_TIP = 3
// Session end celebration: 1.0-1.5 s, can be skipped with a tap.
export const END_CELEBRATION_MS = 1200
// The card fly-out time must match --time-fly-out in styles.css (220 ms plus a spare frame).
export const FLY_OUT_MS = 240
export const FLY_OUT_NO_MOTION_MS = 80
// A short note after a grade lowered by time, and a flash on the edge at every fifth correct card.
export const NOTE_MS = 900
export const FLASH_MS = 300

// Three status channels: color (class), sign and fly-out direction of the card. Color alone is not enough (WCAG 1.4.1,
// about 8% of men have a color vision deficiency).
export const GRADES = {
  1: { tone: 'no', icon: '✗', label: "Don't know", direction: 'left' },
  2: { tone: 'almost', icon: '~', label: 'Almost', direction: 'up' },
  3: { tone: 'yes', icon: '✓', label: 'Know', direction: 'right' },
  // "Already know" on a new card is also a success, so the card flies to the right like "Know".
  4: { tone: 'yes', icon: '✓', label: 'Already know', direction: 'right' },
}

// The direction highlight during a swipe (A): the color and icon of the status show before the user
// lets go. A swipe down is not a grade, so it has its own neutral channel.
export const SWIPES = {
  right: { tone: 'yes', icon: '✓', label: 'Know' },
  left: { tone: 'no', icon: '✗', label: "Don't know" },
  up: { tone: 'almost', icon: '~', label: 'Almost' },
  down: { tone: 'discard', icon: '🗑', label: 'Discard' },
}

// Four arrows of the gesture tutorial (A).
export const TUTORIAL_SWIPES = [
  ['→', 'Know'],
  ['←', "Don't know"],
  ['↑', 'Almost'],
  ['↓', 'Discard word'],
]

// Heatmap of the last 30 days: columns are weekdays.
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// The "How to learn" screen (D3): a short guide, each rule from research. The text is fixed and lives here,
// because the app does not download anything from the network.
export const STUDY_RULES = [
  [
    'Every day for 15 minutes, not two hours on Sunday.',
    'Study spread over time gives three times more than the same in one sitting. The limit is 30 minutes, after that you hurt yourself, not your progress.',
  ],
  [
    'New words in the evening, due words in the morning.',
    'Sleep right after meeting a new word doubles how much of it stays after half a year. So add new words 1-3 hours before sleep, and in the morning catch up on what is waiting.',
  ],
  [
    'On the speaking card say the word out loud, not in your head.',
    'Saying a word is remembered measurably better than reading it in your head. You also train your speech, which is the whole point of this app.',
  ],
  [
    'First try to recall, even when you do not know.',
    'A failed try plus the correct answer teaches more than just looking at the answer. That is why the app never shows the translation by itself. A word you surely know, grade with a swipe at once - but at any doubt reveal and check first.',
  ],
  [
    '"Almost" is a success, not a failure.',
    'If the word came back after a moment of doubt, it is "Almost". A false "Know" hurts the schedule more than an honest "Don\'t know": the app will show you the word in three weeks, when it is no longer in your head.',
  ],
  [
    'Words you know one hundred percent, throw out with "Skip".',
    'This is not cheating. Each such word would take a dozen reviews a year. You can always restore it in Menu > Words.',
  ],
  [
    'After a break do not catch up on everything at once.',
    'The app itself pauses new words and gives due words in portions, starting with the ones closest to being forgotten. A break breaks nothing, as long as you come back.',
  ],
]

export const errorText = (error) => (error && (error.message || error.name)) || String(error)

export const daysSince = (iso, now = Date.now()) => Math.floor((now - Date.parse(iso)) / 86400000)

// English plural: 1 card, 2 cards.
export const plural = (n, one, many) => (n === 1 ? one : many)

export const count = (n, one, many) => `${n} ${plural(n, one, many)}`

export const skippedCardsText = (n) => `Skipped ${count(n, 'broken card', 'broken cards')}`

// Time on the result screen: m:ss, without a sentence.
export function formatTime(seconds) {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

// A YYYY-MM-DD date as "28 September 2026".
export const formatDate = (yyyyMmDd) => {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Caption under the heatmap, so the grid says something even when the history has just started.
export function heatmapCaption({ today, best, studyDays }) {
  if (!studyDays) return 'Study history starts today.'
  const parts = [`today ${count(today, 'card', 'cards')}`]
  if (best > today) parts.push(`best day: ${best}`)
  parts.push(`study days: ${studyDays}`)
  return parts.join(' · ')
}

export const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// Forms of a short word: "run" -> runs, runned, running, ran is not here (irregular).
const shortForms = (w) => {
  const doubled = w + w.at(-1)
  return [w, `${w}s`, `${w}es`, `${w}ed`, `${w}d`, `${w}ing`, `${doubled}ed`, `${doubled}ing`, `${w}er`, `${doubled}er`]
}

// Splits a sentence around the studied word, so the card can mark it: { before, match, after }. A form with an ending
// counts too ("make" finds "making", "study" finds "studied"). An irregular form ("get" -> "got") is not found, then
// `match` is empty and the sentence shows without a mark.
export function markWord(sentence, word) {
  const s = String(sentence ?? '')
  const target = String(word ?? '').toLowerCase()
  const none = { before: s, match: '', after: '' }
  if (!target) return none
  if (target.includes(' ')) {
    const i = s.toLowerCase().indexOf(target)
    return i < 0 ? none : { before: s.slice(0, i), match: s.slice(i, i + target.length), after: s.slice(i + target.length) }
  }
  const stem = target.length > 3 ? target.replace(/[ey]$/, '') : target
  for (const m of s.matchAll(/[\p{L}'-]+/gu)) {
    const token = m[0].toLowerCase()
    const fits = target.length > 3 ? token.startsWith(stem) && token.length <= target.length + 4 : shortForms(target).includes(token)
    if (fits) return { before: s.slice(0, m.index), match: m[0], after: s.slice(m.index + m[0].length) }
  }
  return none
}

// Parts of speech as they are in the deck, in deck order.
export const partsOfSpeech = (word) => (word.czesci || []).join(', ')

// Import words with the deck name chosen by the user. A word that already exists stays in its deck,
// because merge() works that way - the change applies only to new items.
export const wordsForDeck = (result, name) => (name ? result.words.map((w) => (w.talia === name ? w : { ...w, talia: name })) : result.words)
