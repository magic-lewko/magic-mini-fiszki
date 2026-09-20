// Gra "Literki": rozsypane litery, stan ukladania, podpowiedzi i seria slow. Uruchomienie: node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as li from './zrodlo/literki.js'

const KORZEN = dirname(fileURLToPath(import.meta.url))
const TALIA = JSON.parse(readFileSync(join(KORZEN, 'talie', 'oxford3000.json'), 'utf8')).slowa

const posortowane = (tekst) => [...tekst.toUpperCase()].sort().join('')

const liczLitery = (tekst) => {
  const mapa = new Map()
  for (const znak of tekst.toLowerCase()) mapa.set(znak, (mapa.get(znak) || 0) + 1)
  return mapa
}

const daSieUlozyc = (zapas, slowo) => {
  for (const [litera, ile] of liczLitery(slowo)) if ((zapas.get(litera) || 0) < ile) return false
  return true
}

// Zadne inne slowo z talii nie moze dac sie ulozyc z rozsypanych liter, chyba ze powstaje juz z samego
// slowa zadania (np. "eat" z "date") - tego zadna dodatkowa litera nie cofnie.
function zadnegoObcegoSlowa(litery, poprawne, talia) {
  const zapas = liczLitery(litery.join(''))
  const zSamegoSlowa = liczLitery(poprawne)
  for (const pozycja of talia) {
    const slowo = String(pozycja?.w ?? pozycja).toLowerCase()
    if (slowo === poprawne.toLowerCase() || slowo.length < li.MIN_DLUGOSC) continue
    if (!daSieUlozyc(zapas, slowo)) continue
    assert.ok(daSieUlozyc(zSamegoSlowa, slowo), `z liter ${litery.join('')} dla "${poprawne}" da sie ulozyc "${slowo}"`)
  }
}

// Ukladanie slowa krok po kroku, jak przy tapaniu kafelkow.
function ulozRecznie(stan, tekst) {
  let biezacy = stan
  for (const znak of tekst.toUpperCase()) {
    const uzyte = new Set(biezacy.wybrane)
    const indeks = biezacy.litery.findIndex((z, i) => !uzyte.has(i) && z === znak)
    biezacy = li.dopiszLitere(biezacy, indeks)
  }
  return biezacy
}

test('przygotujLiterki daje wszystkie litery slowa plus dodatkowe', () => {
  const kot = li.przygotujLiterki('cat', { ziarno: 1 })
  assert.equal(kot.poprawne, 'cat')
  assert.ok(kot.dodane.length >= li.DODATKOWE_MIN && kot.dodane.length <= li.DODATKOWE_MAKS)
  assert.equal(kot.litery.length, 3 + kot.dodane.length)
  assert.equal(posortowane(kot.litery.join('')), posortowane('cat' + kot.dodane.join('')))
  // Litera zbedna nie moze byc litera ze slowa, bo nie dalo by sie jej odroznic.
  for (const litera of kot.dodane) assert.ok(!'CAT'.includes(litera), litera)

  // Slowa dluzsze niz 6 znakow graja bez dodatkowych liter.
  const dlugie = li.przygotujLiterki('beautiful', { ziarno: 1 })
  assert.deepEqual(dlugie.dodane, [])
  assert.equal(posortowane(dlugie.litery.join('')), posortowane('beautiful'))
  assert.equal(li.przygotujLiterki('orange', { ziarno: 1 }).dodane.length >= li.DODATKOWE_MIN, true, '6 znakow to jeszcze krotkie slowo')
  assert.deepEqual(li.przygotujLiterki('oranges', { ziarno: 1 }).dodane, [], '7 znakow to juz dlugie slowo')
})

test('powtarzajace sie litery dostaja osobne kafelki', () => {
  const stan = { ...li.przygotujLiterki('letter', { ziarno: 3 }), wybrane: [] }
  const litery = stan.litery.join('')
  assert.equal([...litery].filter((z) => z === 'T').length, 2)
  assert.equal([...litery].filter((z) => z === 'E').length, 2)
  assert.equal(li.czyPoprawne(ulozRecznie(stan, 'letter')), true)
  // Te same litery w zlej kolejnosci to nie jest to slowo.
  assert.equal(li.czyPoprawne(ulozRecznie(stan, 'lettre')), false)
})

test('wielkosc liter: kafelki sa wielkimi literami, odpowiedz zachowuje oryginal', () => {
  const maj = li.przygotujLiterki({ id: 'May', w: 'May', pl: 'maj' }, { ziarno: 2 })
  assert.equal(maj.poprawne, 'May', 'oryginalna pisownia zostaje do pokazania i wymowy')
  assert.equal(maj.litery.join(''), maj.litery.join('').toUpperCase())
  const stan = { ...maj, wybrane: [] }
  assert.equal(li.czyPoprawne(ulozRecznie(stan, 'MAY')), true)
  assert.equal(li.ulozone(ulozRecznie(stan, 'MAY')), 'MAY')
})

test('dodatkowe litery nie ukladaja sie w inne slowo z talii', () => {
  const talia = ['cat', 'cart', 'chat', 'cast', 'coat', 'scat', 'cats', 'mat', 'bat', 'rat', 'tab', 'act']
  for (let ziarno = 0; ziarno < 20; ziarno++) {
    const wynik = li.przygotujLiterki('cat', { ziarno, talia })
    zadnegoObcegoSlowa(wynik.litery, 'cat', talia)
    for (const litera of wynik.dodane) assert.ok(!'RHSOMB'.includes(litera), `litera ${litera} tworzy inne slowo`)
  }
  // Bez podanej talii nie ma czego pilnowac, wiec litery moga byc dowolne spoza slowa.
  const bezTalii = li.przygotujLiterki('cat', { ziarno: 0 })
  assert.equal(bezTalii.dodane.length >= li.DODATKOWE_MIN, true)
})

test('opcja dodatkowe wymusza liczbe zbednych liter', () => {
  assert.deepEqual(li.przygotujLiterki('cat', { ziarno: 1, dodatkowe: 0 }).dodane, [])
  assert.equal(li.przygotujLiterki('cat', { ziarno: 1, dodatkowe: 0 }).litery.length, 3)
  assert.equal(li.przygotujLiterki('cat', { ziarno: 1, dodatkowe: 5 }).dodane.length, 5)
  assert.equal(li.przygotujLiterki('beautiful', { ziarno: 1, dodatkowe: 2 }).dodane.length, 2, 'dlugie slowo tez przyjmuje wymuszenie')
})

test('slowa nie do gry zwracaja pusty zestaw liter', () => {
  for (const zle of ['go', 'at', '', "don't", 'ice cream', 'and/or', '   ']) {
    const wynik = li.przygotujLiterki(zle, { ziarno: 1 })
    assert.deepEqual(wynik.litery, [], zle)
    assert.deepEqual(wynik.dodane, [], zle)
  }
  assert.deepEqual(li.przygotujLiterki(undefined, { ziarno: 1 }).litery, [])
})

test('to samo ziarno daje ten sam zestaw, rozne ziarna rozne', () => {
  assert.deepEqual(li.przygotujLiterki('orange', { ziarno: 9 }), li.przygotujLiterki('orange', { ziarno: 9 }))
  assert.deepEqual(li.przygotujLiterki('orange', { ziarno: 'abc' }), li.przygotujLiterki('orange', { ziarno: 'abc' }))
  const zestawy = new Set()
  for (let ziarno = 0; ziarno < 10; ziarno++) zestawy.add(li.przygotujLiterki('orange', { ziarno }).litery.join(''))
  assert.ok(zestawy.size >= 8, `10 ziaren dalo tylko ${zestawy.size} roznych zestawow`)
})

test('dopiszLitere i cofnijLitere nie zmieniaja stanu w miejscu', () => {
  const stan = { litery: ['C', 'A', 'T', 'Q'], poprawne: 'cat', wybrane: [], podpowiedzi: 0 }
  const zamrozony = JSON.parse(JSON.stringify(stan))

  const po = li.dopiszLitere(stan, 0)
  assert.deepEqual(po.wybrane, [0])
  assert.deepEqual(stan, zamrozony, 'wejscie nietkniete')
  assert.notEqual(po, stan)

  assert.deepEqual(li.cofnijLitere(po).wybrane, [])
  assert.deepEqual(po.wybrane, [0])
})

test('dopiszLitere odrzuca ruchy niemozliwe', () => {
  const stan = { litery: ['C', 'A', 'T', 'Q'], poprawne: 'cat', wybrane: [0], podpowiedzi: 0 }
  assert.equal(li.dopiszLitere(stan, 0), stan, 'ten sam kafelek drugi raz')
  assert.equal(li.dopiszLitere(stan, 4), stan, 'indeks poza zakresem')
  assert.equal(li.dopiszLitere(stan, -1), stan, 'indeks ujemny')
  assert.equal(li.dopiszLitere(stan, 1.5), stan, 'indeks ulamkowy')
  const pelny = { ...stan, wybrane: [0, 1, 2] }
  assert.equal(li.dopiszLitere(pelny, 3), pelny, 'odpowiedz nie moze byc dluzsza niz slowo')
  const pusty = { litery: ['C'], poprawne: 'cat', wybrane: [] }
  assert.equal(li.cofnijLitere(pusty), pusty, 'nie ma czego cofac')
})

test('czyPoprawne porownuje cale slowo', () => {
  const stan = { litery: ['C', 'A', 'T', 'Q'], poprawne: 'cat', wybrane: [] }
  assert.equal(li.czyPoprawne(stan), false, 'pusta odpowiedz')
  assert.equal(li.czyPoprawne({ ...stan, wybrane: [0, 1] }), false, 'za krotka odpowiedz')
  assert.equal(li.czyPoprawne({ ...stan, wybrane: [0, 1, 2] }), true)
  assert.equal(li.czyPoprawne({ ...stan, wybrane: [2, 1, 0] }), false)
  assert.equal(li.czyPoprawne({ litery: ['C'], poprawne: '', wybrane: [0] }), false, 'brak slowa to nie sukces')
  assert.equal(li.czyPoprawne(undefined), false)
})

test('podpowiedzKolejnaLitere doklada litery az do calego slowa', () => {
  let stan = { ...li.przygotujLiterki('letter', { ziarno: 3 }), wybrane: [], podpowiedzi: 0 }
  for (let i = 0; i < 'letter'.length; i++) {
    const krok = li.podpowiedzKolejnaLitere(stan)
    assert.ok(krok.indeks !== null, `krok ${i}`)
    assert.equal(krok.usuniete, 0)
    assert.equal(krok.stan.podpowiedzi, i + 1)
    stan = krok.stan
    assert.equal(li.ulozone(stan).toLowerCase(), 'letter'.slice(0, i + 1))
  }
  assert.equal(li.czyPoprawne(stan), true)

  const koniec = li.podpowiedzKolejnaLitere(stan)
  assert.equal(koniec.indeks, null, 'przy pelnym slowie nie ma czego podpowiadac')
  assert.equal(koniec.stan, stan)
})

test('podpowiedzKolejnaLitere zdejmuje bledny ogon', () => {
  const przygotowane = li.przygotujLiterki('cat', { ziarno: 1, dodatkowe: 0 })
  const zle = ulozRecznie({ ...przygotowane, wybrane: [], podpowiedzi: 0 }, 'cta')
  assert.equal(li.ulozone(zle), 'CTA')

  const krok = li.podpowiedzKolejnaLitere(zle)
  assert.equal(krok.usuniete, 2, 'C zostaje, TA leci')
  assert.equal(li.ulozone(krok.stan), 'CA')
  assert.equal(krok.znak, 'A')
  assert.equal(krok.stan.podpowiedzi, 1)
  assert.deepEqual(zle.wybrane.length, 3, 'wejscie nietkniete')
})

test('nowaRunda przygotowuje serie gotowych stanow', () => {
  const runda = li.nowaRunda(TALIA, { ziarno: 11 })
  assert.equal(runda.zadania.length, li.DLUGOSC_RUNDY)
  assert.equal(runda.pozycja, 0)
  assert.equal(runda.dlugosc, li.DLUGOSC_RUNDY)
  const idki = runda.zadania.map((z) => z.id)
  assert.equal(new Set(idki).size, idki.length, 'slowa w serii sie nie powtarzaja')

  for (const zadanie of runda.zadania) {
    assert.deepEqual(zadanie.wybrane, [])
    assert.equal(zadanie.podpowiedzi, 0)
    assert.ok(zadanie.pl.length > 0, 'polskie znaczenie jest haslem gry')
    assert.equal(zadanie.litery.length, zadanie.poprawne.length + zadanie.dodane.length)
    assert.equal(li.czyPoprawne(ulozRecznie(zadanie, zadanie.poprawne)), true, zadanie.poprawne)
    zadnegoObcegoSlowa(zadanie.litery, zadanie.poprawne, TALIA)
  }
})

test('nowaRunda: powtarzalnosc, krotsze listy i puste wejscie', () => {
  assert.deepEqual(li.nowaRunda(TALIA, { ziarno: 5 }), li.nowaRunda(TALIA, { ziarno: 5 }))
  const inne = li.nowaRunda(TALIA, { ziarno: 6 }).zadania.map((z) => z.id)
  assert.notDeepEqual(li.nowaRunda(TALIA, { ziarno: 5 }).zadania.map((z) => z.id), inne)

  assert.deepEqual(li.nowaRunda([], { ziarno: 1 }).zadania, [])
  assert.deepEqual(li.nowaRunda(undefined, { ziarno: 1 }).zadania, [])
  const male = li.nowaRunda([{ id: 'cat', w: 'cat', pl: 'kot' }, { id: 'go', w: 'go', pl: 'iść' }], { ziarno: 1 })
  assert.equal(male.zadania.length, 1, 'za krotkie slowa odpadaja, seria jest krotsza')
  assert.equal(male.zadania[0].poprawne, 'cat')
  assert.equal(li.nowaRunda(TALIA, { ziarno: 1, dlugosc: 3 }).zadania.length, 3)
  assert.deepEqual(li.nowaRunda(TALIA, { ziarno: 1, dlugosc: 0 }).zadania, [])

  // Ziarno zadania bierze sie z id slowa, a nie z pozycji w serii, wiec krotsza seria to poczatek dluzszej.
  const dluga = li.nowaRunda(TALIA, { ziarno: 5 })
  assert.deepEqual(li.nowaRunda(TALIA, { ziarno: 5, dlugosc: 3 }).zadania, dluga.zadania.slice(0, 3))
  const jedno = dluga.zadania[0]
  const osobno = li.przygotujLiterki(TALIA.find((s) => s.id === jedno.id), { ziarno: `5|${jedno.id}`, talia: TALIA })
  assert.deepEqual(osobno.litery, jedno.litery)
})

test('przygotowanie serii z pelnej talii miesci sie w jednej klatce', () => {
  const czasy = []
  for (let ziarno = 0; ziarno < 10; ziarno++) {
    const start = performance.now()
    const runda = li.nowaRunda(TALIA, { ziarno })
    czasy.push(performance.now() - start)
    assert.equal(runda.zadania.length, li.DLUGOSC_RUNDY)
  }
  czasy.sort((a, b) => a - b)
  const mediana = czasy[Math.floor(czasy.length / 2)]
  const najgorszy = czasy[czasy.length - 1]
  console.log(
    `literki: seria 10 slow z talii ${TALIA.length} slow - mediana ${mediana.toFixed(1)} ms, najgorszy ${najgorszy.toFixed(1)} ms`
  )
  assert.ok(najgorszy < 50, `przygotowanie serii zajelo ${najgorszy.toFixed(1)} ms`)
})
