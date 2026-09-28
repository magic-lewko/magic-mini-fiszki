// Oxford 3000 (ox3000.csv) -> unique words in study order -> packs to translate.
// Run from talie/zrodla: node dane/prepare.mjs
// The data files keep their Polish names and fields (dane/kolejnosc.json = study order, dane/wejscie-NN.json =
// input packs with the fields w, poziom, czesci, znaczenia), because the translation files and merge.mjs use them.
import { readFileSync, writeFileSync } from 'node:fs'

function csv(t) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field.replace(/\r$/, ''))
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const LEVELS = ['a1', 'a2', 'b1', 'b2']
const lines = csv(readFileSync('ox3000.csv', 'utf8'))
  .slice(1)
  .filter((x) => x[1])
const words = new Map()
for (const [, word, type, cefr, phonBr, , definition] of lines) {
  const w = word.trim()
  const key = w.toLowerCase()
  const entry = words.get(key) ?? { w, poziom: cefr, czesci: [], ipa: phonBr.replace(/^\/|\/$/g, ''), znaczenia: [] }
  if (LEVELS.indexOf(cefr) < LEVELS.indexOf(entry.poziom)) entry.poziom = cefr
  for (const t of type
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean))
    if (!entry.czesci.includes(t)) entry.czesci.push(t)
  if (definition && entry.znaczenia.length < 4) entry.znaczenia.push(`${type}: ${definition}`)
  words.set(key, entry)
}

// random within a level, but repeatable (a fixed seed)
let seed = 20260915
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const list = []
for (const level of LEVELS) {
  const group = [...words.values()].filter((e) => e.poziom === level).sort((a, b) => a.w.localeCompare(b.w))
  for (let i = group.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[group[i], group[j]] = [group[j], group[i]]
  }
  list.push(...group)
}
list.forEach((e) => {
  e.poziom = e.poziom.toUpperCase()
})
writeFileSync('dane/kolejnosc.json', JSON.stringify(list, null, 1))

const PACKS = 10
const size = Math.ceil(list.length / PACKS)
for (let n = 0; n < PACKS; n++) {
  const pack = list.slice(n * size, (n + 1) * size).map(({ w, poziom, czesci, znaczenia }) => ({ w, poziom, czesci, znaczenia }))
  writeFileSync(`dane/wejscie-${String(n + 1).padStart(2, '0')}.json`, JSON.stringify(pack, null, 1))
  console.log(`pack ${n + 1}: ${pack.length} words, ${pack[0].w} .. ${pack.at(-1).w}`)
}
console.log('total', list.length)
console.log(
  'unusual:',
  list
    .filter((e) => !/^[a-z]+$/.test(e.w))
    .map((e) => e.w)
    .join(' | '),
)
console.log('without ipa:', list.filter((e) => !e.ipa).length, 'without meanings:', list.filter((e) => !e.znaczenia.length).length)
