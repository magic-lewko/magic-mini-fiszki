// View state (Svelte 5 runes). Components only draw it, only app.svelte.js and games.svelte.js change it.
// Domain data (progress, deck) lives outside this state as plain objects: storage keeps packed cards in a WeakMap
// by the card object, and a $state proxy would change object identity and slow down going through 6000 cards.
// A change of domain data is visible through the `version` counter, which every save raises.
// Screens are a snapshot (`data`) counted at the moment they are shown, like the old drawing with replaceChildren.

import { FLASH_MS, NOTE_MS } from './text.js'

const freshCard = () => ({
  revealed: false,
  entering: true,
  dragging: false,
  threshold: false,
  swipe: '',
  paceMedium: false,
  paceSlow: false,
  flyOut: '',
  result: null,
  transform: '',
  transition: '',
  hint: '',
  hintButton: false,
})

class ViewState {
  // Counter of domain data changes (progress, deck, collisions). Every save raises it.
  version = $state(0)

  // The screen on the stage. Every show draws it again (screenNr), like the old replaceChildren.
  screen = $state('start')
  screenNr = $state(0)
  data = $state.raw(null)
  celebrating = $state(false)

  // Top bar and the offline badge.
  bar = $state.raw(null)
  badgeOk = $state(false)
  badgeHidden = $state(false)
  menuButtonHidden = $state(true)

  // Hidden buttons for the screen reader under the card: null is a hidden footer.
  actions = $state.raw(null)

  // The card on the study screen and its visual state (classes, movement under the finger).
  card = $state(freshCard())
  swipeDirection = $state('')

  note = $state('')
  noteVisible = $state(false)
  flash = $state.raw({ nr: 0, tone: 'yes', strong: true })
  flashVisible = $state(false)
  messages = $state.raw([])
  toast = $state.raw({ text: '', kind: '', nr: 0 })
  toastVisible = $state(false)

  // Overlays.
  menu = $state(false)
  guide = $state(false)
  tutorial = $state(false)
  addWords = $state(false)
  addWordsNr = $state(0)

  // Menu: the searched word stays between openings, as before.
  search = $state('')
  offline = $state.raw(null)
  persistent = $state(null)
  newVersion = $state(false)
  // Reports to copy by hand when the clipboard is not available.
  reportsText = $state('')

  // Adding words.
  pasted = $state('')
  deckName = $state('')
  fileInfo = $state('')
  preview = $state.raw(null)
  addDisabled = $state(true)
  addLabel = $state('Add')
  addError = $state('')

  // The game on the stage: a snapshot after every move.
  game = $state.raw(null)
  shake = $state(0)

  newCard() {
    this.card = freshCard()
  }
}

export const ui = new ViewState()

let toastTimer = 0
let noteTimer = 0
let flashTimer = 0

export function toast(text, kind = '') {
  ui.toast = { text, kind, nr: ui.toast.nr + 1 }
  ui.toastVisible = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    ui.toastVisible = false
  }, kind ? 7000 : 3500)
}

// A short note by the card: one sentence for 900 ms, without buttons and without blocking the swipe (C).
export function note(text) {
  ui.note = text
  ui.noteVisible = true
  clearTimeout(noteTimer)
  noteTimer = setTimeout(() => {
    ui.noteVisible = false
  }, NOTE_MS)
}

// A flash on the screen edge: strong at every fifth correct card in a row (I), weaker and in the grade color
// at every card change. On iPhone a swipe cannot vibrate, so the card change is confirmed by color.
// App.svelte starts the animation again (nr), because it needs a style recalculation of the element.
export function flash(tone = 'yes', strong = true) {
  ui.flash = { nr: ui.flash.nr + 1, tone, strong }
  ui.flashVisible = true
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    ui.flashVisible = false
  }, FLASH_MS)
}

const messages = new Map()

export function setMessage(key, text, closable = true) {
  if (text) messages.set(key, { text, closable })
  else messages.delete(key)
  ui.messages = [...messages].map(([k, m]) => ({ key: k, ...m }))
}

export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
