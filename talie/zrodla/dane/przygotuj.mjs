// Oxford 3000 (ox3000.csv) -> unikalne slowa w kolejnosci nauki -> paczki do tlumaczenia.
import { readFileSync, writeFileSync } from 'node:fs'

function csv(t) {
  const rows = []; let row = [], f = '', q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = '' }
    else f += c
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  return rows
}

const POZ = ['a1', 'a2', 'b1', 'b2']
const wiersze = csv(readFileSync('ox3000.csv', 'utf8')).slice(1).filter((x) => x[1])
const slowa = new Map()
for (const [, word, type, cefr, phonBr, , definition] of wiersze) {
  const w = word.trim()
  const klucz = w.toLowerCase()
  const s = slowa.get(klucz) ?? { w, poziom: cefr, czesci: [], ipa: phonBr.replace(/^\/|\/$/g, ''), znaczenia: [] }
  if (POZ.indexOf(cefr) < POZ.indexOf(s.poziom)) s.poziom = cefr
  for (const t of type.split(',').map((x) => x.trim()).filter(Boolean)) if (!s.czesci.includes(t)) s.czesci.push(t)
  if (definition && s.znaczenia.length < 4) s.znaczenia.push(`${type}: ${definition}`)
  slowa.set(klucz, s)
}

// losowo w obrebie poziomu, ale powtarzalnie (staly zarodek)
let ziarno = 20260915
const los = () => ((ziarno = (ziarno * 1103515245 + 12345) % 2147483648) / 2147483648)
const lista = []
for (const p of POZ) {
  const grupa = [...slowa.values()].filter((s) => s.poziom === p).sort((a, b) => a.w.localeCompare(b.w))
  for (let i = grupa.length - 1; i > 0; i--) { const j = Math.floor(los() * (i + 1)); [grupa[i], grupa[j]] = [grupa[j], grupa[i]] }
  lista.push(...grupa)
}
lista.forEach((s) => { s.poziom = s.poziom.toUpperCase() })
writeFileSync('dane/kolejnosc.json', JSON.stringify(lista, null, 1))

const PACZEK = 10
const rozmiar = Math.ceil(lista.length / PACZEK)
for (let n = 0; n < PACZEK; n++) {
  const paczka = lista.slice(n * rozmiar, (n + 1) * rozmiar).map(({ w, poziom, czesci, znaczenia }) => ({ w, poziom, czesci, znaczenia }))
  writeFileSync(`dane/wejscie-${String(n + 1).padStart(2, '0')}.json`, JSON.stringify(paczka, null, 1))
  console.log(`paczka ${n + 1}: ${paczka.length} slow, ${paczka[0].w} .. ${paczka.at(-1).w}`)
}
console.log('razem', lista.length)
console.log('nietypowe:', lista.filter((s) => !/^[a-z]+$/.test(s.w)).map((s) => s.w).join(' | '))
console.log('bez ipa:', lista.filter((s) => !s.ipa).length, 'bez znaczen:', lista.filter((s) => !s.znaczenia.length).length)
