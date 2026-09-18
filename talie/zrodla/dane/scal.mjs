// Tlumaczenia (wyjscie-NN.json) + kolejnosc.json -> oxford3000.json, talia do wczytania w apce.
// Uruchomienie z katalogu scratchpad: node dane/scal.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const ZAPASOWY = 'C:/Users/mlewk/Desktop/stylmetdrew/magic-mini-english/.omc/tlumaczenia'
const POZIOMY = ['A1', 'A2', 'B1', 'B2']

// przygotuj.mjs sklejal slowa po malych literach, a w Oxford 3000 it/IT i may/May to rozne hasla
const RECZNE = [
  { w: 'it', poziom: 'A1', czesci: ['pronoun'], ipa: 'ɪt', pl: 'to, ono (o rzeczy lub zwierzęciu)', zdanie: "It's raining again.", zdaniePl: 'Znowu pada.' },
  { w: 'IT', poziom: 'B1', czesci: ['noun'], ipa: 'ˌaɪ ˈtiː', pl: 'informatyka, IT', zdanie: 'He works in IT at a bank.', zdaniePl: 'Pracuje w IT w banku.' },
  { w: 'may', poziom: 'A2', czesci: ['modal verb'], ipa: 'meɪ', pl: 'móc (możliwość, pozwolenie); może', zdanie: 'May I sit here?', zdaniePl: 'Czy mogę tu usiąść?' },
  { w: 'May', poziom: 'A1', czesci: ['noun'], ipa: 'meɪ', pl: 'maj', zdanie: 'My birthday is in May.', zdaniePl: 'Moje urodziny są w maju.' },
]
const reczneKlucze = new Set(RECZNE.map((s) => s.w.toLowerCase()))

// poprawki po przegladzie tlumaczen: Oxford to slownik brytyjski, a uczacy sie spotka oba znaczenia
const POPRAWKI = {
  pants: { pl: 'majtki (UK); spodnie (US)' },
  // "schludny" jest poprawny, ale rzadki, a tidy i neat mialy przez niego prawie to samo tlumaczenie
  tidy: { pl: 'posprzątany, uporządkowany; sprzątać' },
  neat: { pl: 'staranny, schludny; świetny (pot.)' },
  // ta sama litera i dlugosc, wiec podpowiedz na karcie mowienia ich nie rozroznia
  slightly: { pl: 'nieco, trochę, lekko' },
  somewhat: { pl: 'w pewnym stopniu, dość' },
  shade: { pl: 'cień (osłona od słońca); odcień' },
  shadow: { pl: 'cień (rzucany przez coś)' },
}
// poprawki z niezaleznego przegladu (poprawki-N.json): tylko pola tresci, "powod" zostaje w pliku
const POLA = ['pl', 'zdanie', 'zdaniePl']
let zPrzegladu = 0
for (let n = 1; n <= 3; n++) {
  const sciezka = `dane/poprawki-${n}.json`
  if (!existsSync(sciezka)) continue
  for (const [slowo, zmiana] of Object.entries(JSON.parse(readFileSync(sciezka, 'utf8')))) {
    const pola = Object.fromEntries(POLA.filter((p) => typeof zmiana[p] === 'string' && zmiana[p].trim()).map((p) => [p, zmiana[p].trim()]))
    if (!Object.keys(pola).length) continue
    POPRAWKI[slowo] = { ...POPRAWKI[slowo], ...pola }
    zPrzegladu += 1
  }
}

const kolejnosc = JSON.parse(readFileSync('dane/kolejnosc.json', 'utf8'))
const tlumaczenia = new Map()
const brakPlikow = []
for (let n = 1; n <= 10; n++) {
  const nazwa = `wyjscie-${String(n).padStart(2, '0')}.json`
  const sciezka = [`dane/${nazwa}`, `${ZAPASOWY}/${nazwa}`].find((p) => existsSync(p))
  if (!sciezka) {
    brakPlikow.push(nazwa)
    continue
  }
  for (const wpis of JSON.parse(readFileSync(sciezka, 'utf8'))) tlumaczenia.set(wpis.w, wpis)
}
if (brakPlikow.length) {
  console.error('brak plikow:', brakPlikow.join(', '))
  process.exit(1)
}

const bledy = []
const ostrzezenia = []
const slowa = []
for (const s of kolejnosc) {
  if (reczneKlucze.has(s.w.toLowerCase())) continue
  const t = tlumaczenia.get(s.w)
  if (!t) {
    bledy.push(`brak tlumaczenia: ${s.w}`)
    continue
  }
  slowa.push({ w: s.w, poziom: s.poziom, ipa: s.ipa, czesci: s.czesci, pl: t.pl, zdanie: t.zdanie, zdaniePl: t.zdaniePl, ...POPRAWKI[s.w] })
}
slowa.push(...RECZNE.map((s) => ({ ...s, ...POPRAWKI[s.w] })))

for (const s of slowa) {
  for (const pole of ['pl', 'zdanie', 'zdaniePl']) {
    if (typeof s[pole] !== 'string' || !s[pole].trim()) bledy.push(`${s.w}: puste ${pole}`)
    else if (/[—–]/.test(s[pole])) bledy.push(`${s.w}: dlugi myslnik w ${pole}`)
  }
  if (s.pl && s.pl.length > 80) ostrzezenia.push(`${s.w}: pl ma ${s.pl.length} znakow`)
}

// losowo w obrebie poziomu, powtarzalnie; mulberry32, bo zwykle LCG na liczbach JS traci precyzje
function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const los = mulberry32(20260915)
const wynik = []
for (const p of POZIOMY) {
  const grupa = slowa.filter((s) => s.poziom === p).sort((a, b) => a.w.localeCompare(b.w))
  for (let i = grupa.length - 1; i > 0; i--) {
    const j = Math.floor(los() * (i + 1))
    ;[grupa[i], grupa[j]] = [grupa[j], grupa[i]]
  }
  wynik.push(...grupa)
}

for (const slowo of Object.keys(POPRAWKI)) {
  if (!slowa.some((s) => s.w === slowo)) bledy.push(`poprawka do nieistniejacego slowa: ${slowo}`)
}

const idy = new Set()
for (const s of wynik) {
  if (idy.has(s.w)) bledy.push(`powtorzone id: ${s.w}`)
  idy.add(s.w)
}

if (bledy.length) {
  console.error(`BLEDY (${bledy.length}):\n${bledy.slice(0, 50).join('\n')}`)
  process.exit(1)
}

const talia = {
  wersja: 1,
  nazwa: 'Oxford 3000',
  zrodlo: 'Lista słów i poziomy CEFR: Oxford 3000 (Oxford University Press). Tłumaczenia i zdania przykładowe: własne.',
  slowa: wynik.map((s) => ({ id: s.w, ...s })),
}
writeFileSync('dane/oxford3000.json', `${JSON.stringify(talia)}\n`, 'utf8')

const naPoziom = Object.fromEntries(POZIOMY.map((p) => [p, wynik.filter((s) => s.poziom === p).length]))
console.log(`zapisano dane/oxford3000.json: ${wynik.length} slow`, naPoziom)
console.log(`poprawki z przegladu: ${zPrzegladu}`)
console.log(`rozmiar:${Math.round(readFileSync('dane/oxford3000.json').length / 1024)} KB`)
console.log(`pierwsze 12: ${wynik.slice(0, 12).map((s) => s.w).join(', ')}`)
console.log(`ostrzezenia (${ostrzezenia.length}): ${ostrzezenia.slice(0, 10).join(' | ')}`)
