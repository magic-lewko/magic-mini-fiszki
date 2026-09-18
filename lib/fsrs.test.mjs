// Wektory testowe z opublikowanego ts-fsrs 5.4.2 (FSRS-6.0), domyslne parametry, bez fuzz.
// Uruchomienie: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nowaKarta, ocen, podglad, przypomnienie } from './fsrs.mjs'

const blisko = (a, b, opis) => assert.ok(Math.abs(a - b) < 1e-6, `${opis}: ${a} != ${b}`)
const minuty = (od, termin) => Math.round((new Date(termin) - od) / 60000)
const dni = (od, termin) => Math.round((new Date(termin) - od) / 86400000)

test('przebieg karty jak w ts-fsrs', () => {
  const kroki = [
    ['2026-01-01T08:00:00Z', 3, 'nauka', 2.3065, 2.11810397, { minuty: 10 }],
    ['2026-01-01T08:10:00Z', 3, 'powtorka', 2.3065, 2.11121424, { dni: 2 }],
    ['2026-01-03T08:10:00Z', 3, 'powtorka', 10.97104786, 2.1043314, { dni: 11 }],
    ['2026-01-14T08:10:00Z', 3, 'powtorka', 46.31685657, 2.09745544, { dni: 46 }],
    ['2026-03-01T08:10:00Z', 1, 'ponowna', 2.93384526, 7.38771571, { minuty: 10 }],
    ['2026-03-01T08:20:00Z', 3, 'powtorka', 2.93384526, 7.37555636, { dni: 3 }],
    ['2026-03-04T08:20:00Z', 3, 'powtorka', 7.79910198, 7.36340917, { dni: 8 }],
  ]
  let karta = { ...nowaKarta('2026-01-01T08:00:00Z') }
  for (const [kiedy, ocena, stan, s, d, za] of kroki) {
    const teraz = new Date(kiedy)
    karta = { ...karta, ...ocen(karta, ocena, teraz) }
    assert.equal(karta.stan, stan, `${kiedy} stan`)
    blisko(karta.stabilnosc, s, `${kiedy} stabilnosc`)
    blisko(karta.trudnosc, d, `${kiedy} trudnosc`)
    if (za.minuty !== undefined) assert.equal(minuty(teraz, karta.termin), za.minuty, `${kiedy} minuty`)
    else assert.equal(dni(teraz, karta.termin), za.dni, `${kiedy} dni`)
  }
  assert.equal(karta.powtorki, 7)
  assert.equal(karta.pomylki, 1)
})

test('pierwsza ocena nowej karty', () => {
  const teraz = new Date('2026-01-01T08:00:00Z')
  const oczekiwane = {
    1: ['nauka', 0.212, 6.4133, { minuty: 1 }],
    2: ['nauka', 1.2931, 5.11217071, { minuty: 6 }],
    3: ['nauka', 2.3065, 2.11810397, { minuty: 10 }],
    4: ['powtorka', 8.2956, 1, { dni: 8 }],
  }
  for (const [ocena, [stan, s, d, za]] of Object.entries(oczekiwane)) {
    const wynik = ocen(nowaKarta(teraz.toISOString()), Number(ocena), teraz)
    assert.equal(wynik.stan, stan, `ocena ${ocena}`)
    blisko(wynik.stabilnosc, s, `ocena ${ocena} stabilnosc`)
    blisko(wynik.trudnosc, d, `ocena ${ocena} trudnosc`)
    if (za.minuty !== undefined) assert.equal(minuty(teraz, wynik.termin), za.minuty)
    else assert.equal(dni(teraz, wynik.termin), za.dni)
  }
})

test('krzywa zapominania przy S = 10', () => {
  for (const [t, r] of [[1, 0.98568241], [5, 0.94034429], [10, 0.9], [20, 0.84588465], [50, 0.76052756]]) {
    blisko(przypomnienie(t, 10), r, `t=${t}`)
  }
})

test('w powtorce wyzsza ocena nigdy nie daje krotszego terminu', () => {
  const teraz = new Date('2026-02-01T08:00:00Z')
  const karta = {
    ...nowaKarta(),
    stan: 'powtorka',
    stabilnosc: 3,
    trudnosc: 5,
    powtorki: 3,
    ostatnio: '2026-01-29T08:00:00Z',
  }
  const terminy = podglad(karta, teraz)
  assert.ok(new Date(terminy[2]) < new Date(terminy[3]))
  assert.ok(new Date(terminy[3]) < new Date(terminy[4]))
  assert.equal(minuty(teraz, terminy[1]), 10)
})
