// Splits the word list into chunks for writing the content (deck/chunks/NN.tsv), and checks a written part
// (deck/parts/NN.json) against its chunk.
// Run: node deck/chunks.mjs split        - writes the chunks of the first 5000 words
//      node deck/chunks.mjs check NN     - checks deck/parts/NN.json, prints problems, exit code 1 on errors

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DECK_SIZE, buildDeck, readList } from './build.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CHUNKS = join(HERE, 'chunks')
const PARTS = join(HERE, 'parts')
export const CHUNK_SIZE = 250

const name = (n) => String(n).padStart(2, '0')

function split() {
  const list = readList().slice(0, DECK_SIZE)
  mkdirSync(CHUNKS, { recursive: true })
  let n = 0
  for (let i = 0; i < list.length; i += CHUNK_SIZE) {
    n += 1
    const lines = list.slice(i, i + CHUNK_SIZE).map((w) => `${w.w}\t${w.poziom}\t${w.czesci.join(', ')}`)
    writeFileSync(join(CHUNKS, `${name(n)}.tsv`), lines.join('\n') + '\n')
  }
  console.log(`${list.length} words in ${n} chunks`)
}

function check(n) {
  const chunk = readFileSync(join(CHUNKS, `${name(n)}.tsv`), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [w, poziom, parts] = line.split('\t')
      return { w, poziom, czesci: parts.split(', ') }
    })
  const file = join(PARTS, `${name(n)}.json`)
  if (!existsSync(file)) {
    console.log(`no file ${file}`)
    process.exit(1)
  }
  let part
  try {
    part = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    console.log(`broken JSON: ${error.message}`)
    process.exit(1)
  }
  const content = new Map(part.map((w) => [w.w, w]))
  const { words, errors, warnings } = buildDeck(chunk, content, Infinity)
  const listed = new Set(chunk.map((w) => w.w))
  for (const w of part) if (!listed.has(w.w)) errors.push(`${w.w}: not in the chunk`)
  for (const w of words) {
    // `pl` is the short form of the meanings, so the card and the word list say the same.
    if (w.znaczenia && w.pl !== w.znaczenia.map((m) => m.pl).join('; ')) errors.push(`${w.w}: pl is not the meanings joined with "; "`)
    if (!w.znaczenia && w.pl.includes(';')) errors.push(`${w.w}: pl has ";" but no znaczenia`)
    if (w.znaczenia && w.zdanie !== w.znaczenia[0].zdanie) errors.push(`${w.w}: zdanie is not the sentence of the first meaning`)
    if (w.znaczenia?.length > 4) errors.push(`${w.w}: more than 4 meanings`)
  }
  console.log(`chunk ${name(n)}: ${chunk.length} words, part ${part.length}, ok ${words.length}, with meanings ${words.filter((w) => w.znaczenia).length}`)
  if (warnings.length) console.log(`sentences where the word is not found (fine for irregular forms, otherwise use the word):\n  ${warnings.join('\n  ')}`)
  if (errors.length) {
    console.log(`${errors.length} errors:\n  ${errors.join('\n  ')}`)
    process.exit(1)
  }
}

const [command, arg] = process.argv.slice(2)
if (command === 'split') split()
else if (command === 'check') check(Number(arg))
else console.log('use: split | check NN')
