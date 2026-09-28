// Translations (wyjscie-NN.json) + kolejnosc.json -> oxford3000.json, the deck to load in the app.
// Run from talie/zrodla: node dane/merge.mjs
// The data files keep their Polish names (wyjscie = output of translation, kolejnosc = study order,
// poprawki = fixes), and the deck keeps the saved field names (nazwa, zrodlo, slowa, pl, zdanie, zdaniePl...).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const BACKUP_FOLDER = 'C:/Users/mlewk/Desktop/stylmetdrew/magic-mini-english/.omc/tlumaczenia'
const LEVELS = ['A1', 'A2', 'B1', 'B2']

// prepare.mjs joined words by lowercase, and in Oxford 3000 it/IT and may/May are different entries
const BY_HAND = [
  { w: 'it', poziom: 'A1', czesci: ['pronoun'], ipa: 'ɪt', pl: 'to, ono (o rzeczy lub zwierzęciu)', zdanie: "It's raining again.", zdaniePl: 'Znowu pada.' },
  { w: 'IT', poziom: 'B1', czesci: ['noun'], ipa: 'ˌaɪ ˈtiː', pl: 'informatyka, IT', zdanie: 'He works in IT at a bank.', zdaniePl: 'Pracuje w IT w banku.' },
  { w: 'may', poziom: 'A2', czesci: ['modal verb'], ipa: 'meɪ', pl: 'móc (możliwość, pozwolenie); może', zdanie: 'May I sit here?', zdaniePl: 'Czy mogę tu usiąść?' },
  { w: 'May', poziom: 'A1', czesci: ['noun'], ipa: 'meɪ', pl: 'maj', zdanie: 'My birthday is in May.', zdaniePl: 'Moje urodziny są w maju.' },
]
const byHandKeys = new Set(BY_HAND.map((e) => e.w.toLowerCase()))

// fixes after reviewing the translations: Oxford is a British dictionary, and the learner meets both meanings
const FIXES = {
  pants: { pl: 'majtki (UK); spodnie (US)' },
  // "schludny" is correct, but rare, and tidy and neat had almost the same translation because of it
  tidy: { pl: 'posprzątany, uporządkowany; sprzątać' },
  neat: { pl: 'staranny, schludny; świetny (pot.)' },
  // the same letter and length, so the hint on the speaking card does not tell them apart
  slightly: { pl: 'nieco, trochę, lekko' },
  somewhat: { pl: 'w pewnym stopniu, dość' },
  shade: { pl: 'cień (osłona od słońca); odcień' },
  shadow: { pl: 'cień (rzucany przez coś)' },
}
// fixes from an independent review (poprawki-N.json): only content fields, the "powod" (reason) stays in the file
const FIELDS = ['pl', 'zdanie', 'zdaniePl']
let fromReview = 0
for (let n = 1; n <= 3; n++) {
  const path = `dane/poprawki-${n}.json`
  if (!existsSync(path)) continue
  for (const [word, change] of Object.entries(JSON.parse(readFileSync(path, 'utf8')))) {
    const fields = Object.fromEntries(FIELDS.filter((f) => typeof change[f] === 'string' && change[f].trim()).map((f) => [f, change[f].trim()]))
    if (!Object.keys(fields).length) continue
    FIXES[word] = { ...FIXES[word], ...fields }
    fromReview += 1
  }
}

const order = JSON.parse(readFileSync('dane/kolejnosc.json', 'utf8'))
const translations = new Map()
const missingFiles = []
for (let n = 1; n <= 10; n++) {
  const name = `wyjscie-${String(n).padStart(2, '0')}.json`
  const path = [`dane/${name}`, `${BACKUP_FOLDER}/${name}`].find((p) => existsSync(p))
  if (!path) {
    missingFiles.push(name)
    continue
  }
  for (const entry of JSON.parse(readFileSync(path, 'utf8'))) translations.set(entry.w, entry)
}
if (missingFiles.length) {
  console.error('missing files:', missingFiles.join(', '))
  process.exit(1)
}

const errors = []
const warnings = []
const words = []
for (const e of order) {
  if (byHandKeys.has(e.w.toLowerCase())) continue
  const t = translations.get(e.w)
  if (!t) {
    errors.push(`no translation: ${e.w}`)
    continue
  }
  words.push({ w: e.w, poziom: e.poziom, ipa: e.ipa, czesci: e.czesci, pl: t.pl, zdanie: t.zdanie, zdaniePl: t.zdaniePl, ...FIXES[e.w] })
}
words.push(...BY_HAND.map((e) => ({ ...e, ...FIXES[e.w] })))

for (const e of words) {
  for (const field of ['pl', 'zdanie', 'zdaniePl']) {
    if (typeof e[field] !== 'string' || !e[field].trim()) errors.push(`${e.w}: empty ${field}`)
    // em dash (U+2014) or en dash (U+2013): the app uses only the plain hyphen
    else if (/[\u2014\u2013]/.test(e[field])) errors.push(`${e.w}: long dash in ${field}`)
  }
  if (e.pl && e.pl.length > 80) warnings.push(`${e.w}: pl has ${e.pl.length} chars`)
}

// random within a level, repeatable; mulberry32, because a plain LCG on JS numbers loses precision
function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const random = mulberry32(20260915)
const result = []
for (const level of LEVELS) {
  const group = words.filter((e) => e.poziom === level).sort((a, b) => a.w.localeCompare(b.w))
  for (let i = group.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[group[i], group[j]] = [group[j], group[i]]
  }
  result.push(...group)
}

for (const word of Object.keys(FIXES)) {
  if (!words.some((e) => e.w === word)) errors.push(`fix for a word that does not exist: ${word}`)
}

const ids = new Set()
for (const e of result) {
  if (ids.has(e.w)) errors.push(`repeated id: ${e.w}`)
  ids.add(e.w)
}

if (errors.length) {
  console.error(`ERRORS (${errors.length}):\n${errors.slice(0, 50).join('\n')}`)
  process.exit(1)
}

const deck = {
  wersja: 1,
  nazwa: 'Oxford 3000',
  zrodlo: 'Word list and CEFR levels: Oxford 3000 (Oxford University Press). Translations and example sentences: own.',
  slowa: result.map((e) => ({ id: e.w, ...e })),
}
writeFileSync('dane/oxford3000.json', `${JSON.stringify(deck)}\n`, 'utf8')

const perLevel = Object.fromEntries(LEVELS.map((l) => [l, result.filter((e) => e.poziom === l).length]))
console.log(`saved dane/oxford3000.json: ${result.length} words`, perLevel)
console.log(`fixes from the review: ${fromReview}`)
console.log(`size: ${Math.round(readFileSync('dane/oxford3000.json').length / 1024)} KB`)
console.log(`first 12: ${result.slice(0, 12).map((e) => e.w).join(', ')}`)
console.log(`warnings (${warnings.length}): ${warnings.slice(0, 10).join(' | ')}`)
