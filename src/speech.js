// Reading aloud with the Web Speech API, with a voice choice tuned for iOS.
// Local voices work without the internet. iOS speaks only in reaction to a user gesture, so speak() is called
// only from a tap handler.

// "Novelty" voices from iOS and macOS (effects, singing, whisper) sound like a joke, and are often high on the en-US list.
const NOVELTY = new Set([
  'albert',
  'bad news',
  'bahh',
  'bells',
  'boing',
  'bubbles',
  'cellos',
  'good news',
  'jester',
  'organ',
  'superstar',
  'trinoids',
  'whisper',
  'wobble',
  'zarvox',
  'junior',
  'ralph',
  'fred',
  'kathy',
])

let voices = []

const available = typeof window !== 'undefined' && 'speechSynthesis' in window

const language = (v) => String(v.lang || '').replace('_', '-').toLowerCase()
// "Daniel (Enhanced)" and "Daniel" are the same voice in two qualities, so the note in brackets does not count to the name.
const name = (v) =>
  String(v.name || '')
    .replace(/\s*\(.*\)\s*$/, '')
    .trim()
    .toLowerCase()
const betterQuality = (v) => /\((enhanced|premium|rozszerzon|ulepszon)/i.test(String(v.name || ''))

// Group order: local Daniel (en-GB), any local en-GB, local Samantha (en-US), any local en-US,
// any local English, any English. In a group the enhanced version first.
export function pickVoice(list) {
  const english = list.filter((v) => language(v).startsWith('en') && !NOVELTY.has(name(v)))
  const local = english.filter((v) => v.localService)
  const gb = local.filter((v) => language(v) === 'en-gb')
  const us = local.filter((v) => language(v) === 'en-us')
  const groups = [gb.filter((v) => name(v) === 'daniel'), gb, us.filter((v) => name(v) === 'samantha'), us, local, english]
  const group = groups.find((g) => g.length)
  return group && (group.find(betterQuality) ?? group[0])
}

function loadVoices() {
  voices = speechSynthesis.getVoices()
}

if (available) {
  loadVoices()
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
}

// false when the browser has no speech synthesis or the text is empty.
export function speak(text, rate = 0.95) {
  if (!available || !String(text || '').trim()) return false
  try {
    speechSynthesis.cancel()
    if (!voices.length) loadVoices()
    const utterance = new SpeechSynthesisUtterance(text)
    const chosen = pickVoice(voices)
    if (chosen) utterance.voice = chosen
    utterance.lang = chosen?.lang ?? 'en-GB'
    utterance.rate = rate
    speechSynthesis.speak(utterance)
    return true
  } catch {
    return false
  }
}

export function silence() {
  if (available) speechSynthesis.cancel()
}
