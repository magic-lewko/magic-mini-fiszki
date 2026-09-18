// Czytanie na glos przez Web Speech API, jak w src/lib/mowa.ts, z wyborem glosu dopasowanym do iOS.
// Glosy lokalne dzialaja bez internetu. iOS mowi tylko w reakcji na gest uzytkownika, wiec powiedz() wolamy
// wylacznie z obslugi tapniecia.

// Glosy "novelty" z iOS i macOS (efekty, spiew, szept) brzmia jak zart, a bywaja wysoko na liscie en-US.
const NOWOSCI = new Set([
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'good news', 'jester', 'organ',
  'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox', 'junior', 'ralph', 'fred', 'kathy',
])

let glosy = []

const dostepna = typeof window !== 'undefined' && 'speechSynthesis' in window

const jezyk = (g) => String(g.lang || '').replace('_', '-').toLowerCase()
// "Daniel (Enhanced)" i "Daniel" to ten sam glos w dwoch jakosciach, wiec dopisek w nawiasie nie liczy sie do nazwy.
const nazwa = (g) => String(g.name || '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase()
const lepszaJakosc = (g) => /\((enhanced|premium|rozszerzon|ulepszon)/i.test(String(g.name || ''))

// Kolejnosc grup: lokalny Daniel (en-GB), dowolny lokalny en-GB, lokalna Samantha (en-US), dowolny lokalny en-US,
// dowolny lokalny angielski, dowolny angielski. W grupie najpierw wersja rozszerzona.
export function wybierzGlos(lista) {
  const angielskie = lista.filter((g) => jezyk(g).startsWith('en') && !NOWOSCI.has(nazwa(g)))
  const lokalne = angielskie.filter((g) => g.localService)
  const gb = lokalne.filter((g) => jezyk(g) === 'en-gb')
  const us = lokalne.filter((g) => jezyk(g) === 'en-us')
  const grupy = [gb.filter((g) => nazwa(g) === 'daniel'), gb, us.filter((g) => nazwa(g) === 'samantha'), us, lokalne, angielskie]
  const grupa = grupy.find((g) => g.length)
  return grupa && (grupa.find(lepszaJakosc) ?? grupa[0])
}

function wczytajGlosy() {
  glosy = speechSynthesis.getVoices()
}

if (dostepna) {
  wczytajGlosy()
  speechSynthesis.addEventListener?.('voiceschanged', wczytajGlosy)
}

// false, gdy przegladarka nie ma syntezy mowy albo tekst jest pusty.
export function powiedz(tekst, tempo = 0.95) {
  if (!dostepna || !String(tekst || '').trim()) return false
  try {
    speechSynthesis.cancel()
    if (!glosy.length) wczytajGlosy()
    const wypowiedz = new SpeechSynthesisUtterance(tekst)
    const wybrany = wybierzGlos(glosy)
    if (wybrany) wypowiedz.voice = wybrany
    wypowiedz.lang = wybrany?.lang ?? 'en-GB'
    wypowiedz.rate = tempo
    speechSynthesis.speak(wypowiedz)
    return true
  } catch {
    return false
  }
}

export function ucisz() {
  if (dostepna) speechSynthesis.cancel()
}
