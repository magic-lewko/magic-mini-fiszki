// FSRS-6: algorytm powtorek z open-spaced-repetition (ten sam co w Anki od 23.10).
// Wzory, domyslne parametry i kroki nauki przepisane z ts-fsrs 5.4.2 (FSRS-6.0), bez zaleznosci.
// Test na wektorach z opublikowanej biblioteki: lib/fsrs.test.mjs.
//
// Oceny: 1 znowu, 2 trudne, 3 dobrze, 4 latwe.
// Stany: nowa, nauka (kroki w pierwszym dniu), powtorka, ponowna (kroki po pomylce).
// S (stabilnosc) to liczba dni, po ktorej szansa przypomnienia spada do 90%. D (trudnosc) od 1 do 10.

export const STANY = ['nowa', 'nauka', 'powtorka', 'ponowna']

// Domyslne parametry FSRS-6 (w0-w20), identyczne w ts-fsrs, py-fsrs i na wiki algorytmu.
export const W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
  1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]

// Retencja 0.9 to domyslna wartosc Anki; powyzej 0.9 liczba powtorek szybko rosnie.
// Kroki w minutach jak w ts-fsrs: nauka 1 i 10 min, po pomylce 10 min. Bez losowania interwalow
// (fuzz), zeby wynik byl przewidywalny i testowalny.
export const USTAWIENIA = {
  retencja: 0.9,
  maksInterwal: 36500,
  krokiNauki: [1, 10],
  krokiPonownej: [10],
}

const S_MIN = 0.001
const S_MAX = 36500
const MINUT_W_DNIU = 1440

const zaokragl = (n, miejsc = 8) => Math.round(n * 10 ** miejsc) / 10 ** miejsc
const przytnij = (n, min, max) => Math.min(Math.max(n, min), max)

const DECAY = -W[20]
const FACTOR = zaokragl(Math.exp(Math.log(0.9) / DECAY) - 1)

// Szansa przypomnienia po t dniach przy stabilnosci S. R(S, S) = 0.9.
export function przypomnienie(t, s) {
  return zaokragl(Math.pow(1 + (FACTOR * t) / s, DECAY))
}

function interwal(s, retencja = USTAWIENIA.retencja) {
  const modyfikator = zaokragl((Math.pow(retencja, 1 / DECAY) - 1) / FACTOR)
  return Math.min(Math.max(1, Math.round(s * modyfikator)), USTAWIENIA.maksInterwal)
}

const poczatkowaStabilnosc = (g) => Math.max(W[g - 1], 0.1)
const poczatkowaTrudnosc = (g) => zaokragl(W[4] - Math.exp((g - 1) * W[5]) + 1)

function nastepnaTrudnosc(d, g) {
  const zmiana = -W[6] * (g - 3)
  const poTlumieniu = d + zaokragl((zmiana * (10 - d)) / 9)
  // powrot do sredniej liczony od nieprzycietej trudnosci karty "latwe"
  const powrot = zaokragl(W[7] * poczatkowaTrudnosc(4) + (1 - W[7]) * poTlumieniu)
  return przytnij(powrot, 1, 10)
}

function stabilnoscPoPrzypomnieniu(d, s, r, g) {
  const kara = g === 2 ? W[15] : 1
  const premia = g === 4 ? W[16] : 1
  const wzrost = Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * kara * premia
  return zaokragl(przytnij(s * (1 + wzrost), S_MIN, S_MAX))
}

function stabilnoscPoPomylce(d, s, r) {
  const poPomylce = zaokragl(
    przytnij(W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]), S_MIN, S_MAX),
  )
  return przytnij(zaokragl(s / Math.exp(W[17] * W[18])), S_MIN, poPomylce)
}

function stabilnoscTegoSamegoDnia(s, g) {
  let wzrost = Math.pow(s, -W[19]) * Math.exp(W[17] * (g - 3 + W[18]))
  if (g >= 2) wzrost = Math.max(wzrost, 1)
  return zaokragl(przytnij(s * wzrost, S_MIN, S_MAX))
}

// Nowa pamiec po ocenie g po t dniach. Nowa karta (S = D = 0) dostaje wartosci poczatkowe.
export function nastepnaPamiec({ stabilnosc: s, trudnosc: d }, t, g) {
  if (!s && !d) return { stabilnosc: poczatkowaStabilnosc(g), trudnosc: przytnij(poczatkowaTrudnosc(g), 1, 10) }
  const r = przypomnienie(t, s)
  let noweS
  if (t === 0) noweS = stabilnoscTegoSamegoDnia(s, g)
  else if (g === 1) noweS = stabilnoscPoPomylce(d, s, r)
  else noweS = stabilnoscPoPrzypomnieniu(d, s, r, g)
  return { stabilnosc: noweS, trudnosc: nastepnaTrudnosc(d, g) }
}

// Dni miedzy datami liczone po kalendarzu lokalnym: powtorka o 23:50 i o 00:10 to dwa rozne dni.
// ts-fsrs liczy po dacie UTC, co w Polsce przesuwaloby granice dnia na 1:00 albo 2:00.
export function dniMiedzy(od, dO) {
  const poczatek = (data) => new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime()
  return Math.round((poczatek(dO) - poczatek(od)) / 86400000)
}

// Krok nauki dla oceny: { minuty, krok } albo null, gdy karta przechodzi do powtorek.
function krokNauki(stan, krok, g) {
  const kroki = stan === 'powtorka' || stan === 'ponowna' ? USTAWIENIA.krokiPonownej : USTAWIENIA.krokiNauki
  if (!kroki.length || krok >= kroki.length) return null
  if (g === 1) return { minuty: kroki[0], krok: 0 }
  if (stan === 'powtorka') return null
  if (g === 2) {
    const minuty = kroki.length === 1 ? Math.round(kroki[0] * 1.5) : Math.round((kroki[0] + kroki[1]) / 2)
    return { minuty, krok }
  }
  if (g === 3 && kroki[krok + 1] !== undefined) return { minuty: kroki[krok + 1], krok: krok + 1 }
  return null
}

const poMinutach = (teraz, minuty) => new Date(teraz.getTime() + minuty * 60000)
const poDniach = (teraz, dni) => new Date(teraz.getTime() + dni * 86400000)

// Karta w stanie nowa/nauka/ponowna: krok nauki albo przejscie do powtorek z interwalem z FSRS.
function zKrokami(karta, pamiec, g, doStanu, teraz) {
  const krok = krokNauki(karta.stan, karta.krok, g)
  if (krok && krok.minuty < MINUT_W_DNIU) {
    return { ...pamiec, stan: doStanu, krok: krok.krok, termin: poMinutach(teraz, krok.minuty) }
  }
  if (krok) return { ...pamiec, stan: 'powtorka', krok: 0, termin: poMinutach(teraz, krok.minuty) }
  return { ...pamiec, stan: 'powtorka', krok: 0, termin: poDniach(teraz, interwal(pamiec.stabilnosc)) }
}

// Stan karty po ocenie. Zwraca tylko pola, ktore sie zmieniaja (daty jako ISO).
export function ocen(karta, g, teraz = new Date()) {
  if (![1, 2, 3, 4].includes(g)) throw new Error('Ocena to 1, 2, 3 albo 4')
  // Cofniety zegar albo zmiana strefy na zachod dalyby t < 0, a wtedy przypomnienie() zwraca NaN.
  const t = karta.stan === 'nowa' || !karta.ostatnio ? 0 : Math.max(0, dniMiedzy(new Date(karta.ostatnio), teraz))
  const wspolne = {
    powtorki: (karta.powtorki || 0) + 1,
    pomylki: karta.pomylki || 0,
    ostatnio: teraz.toISOString(),
    wprowadzono: karta.wprowadzono || teraz.toISOString(),
  }

  let wynik
  if (karta.stan === 'nowa') {
    wynik = zKrokami({ ...karta, krok: 0 }, nastepnaPamiec({ stabilnosc: 0, trudnosc: 0 }, 0, g), g, 'nauka', teraz)
  } else if (karta.stan === 'nauka' || karta.stan === 'ponowna') {
    wynik = zKrokami(karta, nastepnaPamiec(karta, t, g), g, karta.stan, teraz)
  } else {
    // Powtorka: trudne < dobrze < latwe, zeby wyzsza ocena nigdy nie dala krotszego terminu.
    const pamiec = (ocena) => nastepnaPamiec(karta, t, ocena)
    if (g === 1) {
      wspolne.pomylki += 1
      wynik = zKrokami(karta, pamiec(1), 1, 'ponowna', teraz)
    } else {
      let trudne = interwal(pamiec(2).stabilnosc)
      let dobrze = interwal(pamiec(3).stabilnosc)
      trudne = Math.min(trudne, dobrze)
      dobrze = Math.max(dobrze, trudne + 1)
      const latwe = Math.max(interwal(pamiec(4).stabilnosc), dobrze + 1)
      const dni = { 2: trudne, 3: dobrze, 4: latwe }[g]
      wynik = { ...pamiec(g), stan: 'powtorka', krok: 0, termin: poDniach(teraz, dni) }
    }
  }
  return { ...wspolne, ...wynik, termin: wynik.termin.toISOString() }
}

// Termin po kazdej ocenie, do podpisow przyciskow ("10 min", "3 d").
export function podglad(karta, teraz = new Date()) {
  return Object.fromEntries([1, 2, 3, 4].map((g) => [g, ocen(karta, g, teraz).termin]))
}

export function nowaKarta(teraz = terazISO()) {
  return { stan: 'nowa', termin: teraz, stabilnosc: 0, trudnosc: 0, powtorki: 0, pomylki: 0, krok: 0, ostatnio: '', wprowadzono: '' }
}

function terazISO() {
  return new Date().toISOString()
}
