// Logika nauki bez DOM: budowa serii, dzienne limity nowych, kolejka w serii, EXP i streak.
// Nie importuje fsrs.mjs, bo w zrodle lezy on w lib/, a w dist obok. Algorytm podaje app.js.
// Klucz karty to `${id}|en` (widzisz EN, przypominasz PL) albo `${id}|pl` (widzisz PL, mowisz EN).

// Te same stany co STANY w lib/fsrs.mjs. Test pilnuje, zeby sie nie rozjechaly.
export const STANY = ['nowa', 'nauka', 'powtorka', 'ponowna']

export const PROG_STABILNOSCI_MOWIENIA = 5
export const ODSTEP_PO_POMYLCE = 4
// Oceny: 1 "Nie umiem", 2 "Prawie", 3 "Umiem", 4 "Znam juz" (tylko dla nowej karty).
export const EXP_ZA_OCENE = { 1: 10, 2: 30, 3: 50, 4: 20 }
export const SEKUNDY_DNIA = 60
export const MAKS_SEKUND_KARTY = 20
export const POZIOMY = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
export const OPCJE_NOWYCH = [10, 15, 20, 30, 40]
export const OPCJE_DLUGOSCI = [10, 15, 20]
export const OPCJE_CELU = [30, 60, 100, 150]
export const DODATKOWE_NOWE = 10
export const POZIOMY_PODPOWIEDZI = ['brak', 'dlugosc', 'litera']
// Karta EN o stabilnosci co najmniej 21 dni jest uznawana za opanowana.
export const PROG_OPANOWANIA = 21
export const DNI_HISTORII = 180
export const DNI_HEATMAPY = 30
export const DNI_TEMPA = 14
export const MAKS_WYNIKOW = 50

// Combo: kolejne oceny inne niz "Nie umiem" w obrebie serii. Pokazywane od 3, bonus co 5.
export const PROG_POKAZANIA_COMBO = 3
export const CO_ILE_COMBO = 5
export const EXP_ZA_COMBO = 10

export const DOMYSLNE_USTAWIENIA = {
  noweDziennie: 20,
  dlugoscSerii: 15,
  autowymowa: true,
  mowienie: true,
  celDzienny: 60,
  podpowiedzMowienie: 'brak',
}

const dwie = (n) => String(n).padStart(2, '0')

// Granica dnia wedlug zegara telefonu, nie UTC: w Polsce UTC przesuwaloby polnoc na 1:00 albo 2:00.
export function dataLokalna(teraz = new Date()) {
  return `${teraz.getFullYear()}-${dwie(teraz.getMonth() + 1)}-${dwie(teraz.getDate())}`
}

export function dzienPrzed(data) {
  const [r, m, d] = data.split('-').map(Number)
  return dataLokalna(new Date(r, m - 1, d - 1))
}

export const klucz = (id, kierunek) => `${id}|${kierunek}`

export function rozbierzKlucz(k) {
  const i = k.lastIndexOf('|')
  return { id: k.slice(0, i), kierunek: k.slice(i + 1) }
}

export function mowienieOdblokowane(kartaEn) {
  return !!kartaEn && kartaEn.stan === 'powtorka' && kartaEn.stabilnosc >= PROG_STABILNOSCI_MOWIENIA
}

export const jestNowa = (karta) => !karta || karta.stan === 'nowa'

export function ustawieniaZDomyslnymi(ustawienia) {
  return { ...DOMYSLNE_USTAWIENIA, ...ustawienia }
}

// Poziomy gracza

export const BAZOWY_KOSZT_POZIOMU = 200
export const WZROST_KOSZTU = 1.15
export const MAKS_POZIOM = 99

// PROGI[n - 1] to laczne EXP, od ktorego zaczyna sie poziom n. Awans na poziom 2 kosztuje 200 EXP, kazdy kolejny
// koszt jest o 15% wiekszy i zaokraglony do 10 EXP. 15% z 200 to 30, wiec zaokraglenie nigdy nie zepsuje wzrostu.
export const PROGI = (() => {
  const progi = [0]
  let koszt = BAZOWY_KOSZT_POZIOMU
  for (let poziom = 2; poziom <= MAKS_POZIOM; poziom++) {
    progi.push(progi[poziom - 2] + koszt)
    koszt = Math.round((koszt * WZROST_KOSZTU) / 10) * 10
  }
  return progi
})()

export const progPoziomu = (poziom) => PROGI[Math.min(Math.max(Math.trunc(poziom) || 1, 1), MAKS_POZIOM) - 1]

// Tytul zmienia sie co 5 poziomow do 20, dalej co 10. Sprawdzane od najwyzszego progu.
const TYTULY = [
  [30, 'Native wannabe'],
  [20, 'Biegły'],
  [15, 'Swobodny'],
  [10, 'Rozmówca'],
  [5, 'Turysta'],
  [1, 'Początkujący'],
]

export const tytulPoziomu = (poziom) => TYTULY.find(([od]) => poziom >= od)[1]

// Progow jest 99, wiec zwykla petla jest szybsza od wyszukiwania binarnego i czytelniejsza.
export function poziomZExp(exp) {
  const punkty = Math.max(Number(exp) || 0, 0)
  let poziom = 1
  while (poziom < MAKS_POZIOM && PROGI[poziom] <= punkty) poziom += 1
  const od = PROGI[poziom - 1]
  const ostatni = poziom >= MAKS_POZIOM
  const zakres = ostatni ? 1 : PROGI[poziom] - od
  return {
    poziom,
    tytul: tytulPoziomu(poziom),
    wPoziomie: punkty - od,
    doNastepnego: ostatni ? 0 : PROGI[poziom] - punkty,
    procent: ostatni ? 100 : Math.min(99, Math.floor(((punkty - od) / zakres) * 100)),
  }
}

// Stan dnia (sekundy nauki, dodatkowe nowe) zeruje sie o lokalnej polnocy.
export function dzisiejszy(dzis, teraz = new Date()) {
  const data = dataLokalna(teraz)
  if (dzis?.data === data) return dzis
  return { data, sekundy: 0, dodatkoweNowe: 0 }
}

// Ile kart wprowadzono dzisiaj (pierwsza ocena), osobno dla obu kierunkow.
export function noweDzis(karty, teraz = new Date()) {
  const data = dataLokalna(teraz)
  const wynik = { en: 0, pl: 0 }
  for (const [k, karta] of Object.entries(karty)) {
    if (!karta.wprowadzono) continue
    if (dataLokalna(new Date(karta.wprowadzono)) !== data) continue
    if (k.endsWith('|pl')) wynik.pl += 1
    else wynik.en += 1
  }
  return wynik
}

function limityNowych({ karty, ustawienia, dzis, teraz }) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const dodatkowe = dzisiejszy(dzis, teraz).dodatkoweNowe || 0
  const wprowadzone = noweDzis(karty, teraz)
  return {
    en: Math.max(0, u.noweDziennie + dodatkowe - wprowadzone.en),
    pl: u.mowienie ? Math.max(0, u.noweDziennie + dodatkowe - wprowadzone.pl) : 0,
  }
}

// Termin, ktorego nie da sie odczytac, traktujemy jako zalegly, zeby karta nie utknela na zawsze.
const czasTerminu = (karta) => Date.parse(karta.termin) || 0

function zalegle({ slowa, karty, ustawienia, teraz }) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const ids = new Set(slowa.map((s) => s.id))
  const czas = teraz.getTime()
  const nauka = []
  const powtorki = []
  for (const [k, karta] of Object.entries(karty)) {
    if (karta.stan === 'nowa') continue
    const { id, kierunek } = rozbierzKlucz(k)
    // Karty slow usunietych z listy zostaja w pamieci, ale nie da sie ich pokazac.
    if (!ids.has(id)) continue
    if (kierunek === 'pl' && !u.mowienie) continue
    const termin = czasTerminu(karta)
    if (termin > czas) continue
    const pozycja = { k, termin }
    if (karta.stan === 'powtorka') powtorki.push(pozycja)
    else nauka.push(pozycja)
  }
  const wgTerminu = (a, b) => a.termin - b.termin
  return { nauka: nauka.sort(wgTerminu), powtorki: powtorki.sort(wgTerminu) }
}

// Kolejnosc: zalegla nauka i ponowne, zalegle powtorki (najstarsze najpierw), nowe mowienie, nowe EN.
export function zbudujSerie({ slowa, karty, ustawienia, dzis, teraz = new Date(), dlugosc }) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const maks = dlugosc ?? u.dlugoscSerii
  const { nauka, powtorki } = zalegle({ slowa, karty, ustawienia: u, teraz })
  const wynik = [...nauka, ...powtorki].slice(0, maks).map((p) => p.k)
  const limity = limityNowych({ karty, ustawienia: u, dzis, teraz })

  for (const s of slowa) {
    if (wynik.length >= maks || limity.pl <= 0) break
    const kPl = klucz(s.id, 'pl')
    if (mowienieOdblokowane(karty[klucz(s.id, 'en')]) && jestNowa(karty[kPl])) {
      wynik.push(kPl)
      limity.pl -= 1
    }
  }
  for (const s of slowa) {
    if (wynik.length >= maks || limity.en <= 0) break
    const kEn = klucz(s.id, 'en')
    if (jestNowa(karty[kEn])) {
      wynik.push(kEn)
      limity.en -= 1
    }
  }
  return wynik
}

// Do ekranu konca serii i menu: ile zaleglych teraz, ile dojdzie jeszcze dzisiaj, ile nowych w limicie.
export function podsumowanieDnia({ slowa, karty, ustawienia, dzis, teraz = new Date() }) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const { nauka, powtorki } = zalegle({ slowa, karty, ustawienia: u, teraz })
  const polnoc = new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() + 1).getTime()
  const ids = new Set(slowa.map((s) => s.id))
  let pozniejDzis = 0
  for (const [k, karta] of Object.entries(karty)) {
    if (karta.stan === 'nowa') continue
    const { id, kierunek } = rozbierzKlucz(k)
    if (!ids.has(id) || (kierunek === 'pl' && !u.mowienie)) continue
    const termin = czasTerminu(karta)
    if (termin > teraz.getTime() && termin < polnoc) pozniejDzis += 1
  }
  const noweDostepne = zbudujSerie({ slowa, karty, ustawienia: u, dzis, teraz, dlugosc: Infinity }).length -
    nauka.length - powtorki.length
  return { zalegle: nauka.length + powtorki.length, pozniejDzis, noweDostepne }
}

// Trening "Trudne slowa": karty obu kierunkow, na ktorych uzytkownik sie juz kiedys pomylil. Ocena w tym trybie
// nie zmienia stanu karty ani terminow, wiec kolejnosc liczy sie tylko z tego, co juz jest w pamieci.
const zPomylka = (karta) => karta.pomylki > 0

export function liczbaTrudnych({ slowa, karty }) {
  const ids = new Set(slowa.map((s) => s.id))
  let ile = 0
  for (const [k, karta] of Object.entries(karty)) {
    if (zPomylka(karta) && ids.has(rozbierzKlucz(k).id)) ile += 1
  }
  return ile
}

// Wiecej pomylek pierwsze, przy remisie pozniejsza ostatnia ocena.
export function trudneKarty({ slowa, karty, ustawienia, dlugosc }) {
  const maks = dlugosc ?? ustawieniaZDomyslnymi(ustawienia).dlugoscSerii
  const ids = new Set(slowa.map((s) => s.id))
  const lista = []
  for (const [k, karta] of Object.entries(karty)) {
    if (!zPomylka(karta) || !ids.has(rozbierzKlucz(k).id)) continue
    lista.push({ k, pomylki: karta.pomylki, ostatnio: Date.parse(karta.ostatnio) || 0 })
  }
  lista.sort((a, b) => b.pomylki - a.pomylki || b.ostatnio - a.ostatnio)
  return lista.slice(0, maks).map((p) => p.k)
}

function dolicz(mapa, nazwa, poznane) {
  const wpis = mapa.get(nazwa) || { nazwa, poznane: 0, wszystkie: 0 }
  wpis.wszystkie += 1
  wpis.poznane += poznane
  mapa.set(nazwa, wpis)
}

const kolejnoscPoziomu = (p) => (POZIOMY.includes(p) ? POZIOMY.indexOf(p) : POZIOMY.length)

// Poznane = karta EN juz nie jest nowa. Talie w kolejnosci dodania, poziomy tylko te, ktore wystepuja w slowach.
export function statystyki({ slowa, karty }) {
  const talie = new Map()
  const poziomy = new Map()
  let poznaneRazem = 0
  let wPowtorce = 0
  let odblokowane = 0
  let opanowane = 0
  for (const s of slowa) {
    const en = karty[klucz(s.id, 'en')]
    const poznane = jestNowa(en) ? 0 : 1
    poznaneRazem += poznane
    dolicz(talie, s.talia || 'Bez nazwy', poznane)
    if (s.poziom) dolicz(poziomy, s.poziom, poznane)
    if (en?.stan === 'powtorka') wPowtorce += 1
    if (mowienieOdblokowane(en)) odblokowane += 1
    if (en && en.stabilnosc >= PROG_OPANOWANIA) opanowane += 1
  }
  return {
    wszystkie: slowa.length,
    poznane: poznaneRazem,
    opanowane,
    talie: [...talie.values()],
    poziomy: [...poziomy.values()].sort(
      (a, b) => kolejnoscPoziomu(a.nazwa) - kolejnoscPoziomu(b.nazwa) || a.nazwa.localeCompare(b.nazwa),
    ),
    procentPowtorka: slowa.length ? Math.round((wPowtorce / slowa.length) * 1000) / 10 : 0,
    mowienieOdblokowane: odblokowane,
  }
}

// `trening` oznacza serie "Trudne slowa": oceny licza sie do EXP, combo i celu dnia, ale nie zmieniaja kart.
export function nowaSeria(klucze, trening = false) {
  return {
    kolejka: [...klucze],
    wszystkie: klucze.length,
    oczyszczone: 0,
    umiem: 0,
    prawie: 0,
    nieUmiem: 0,
    exp: 0,
    combo: 0,
    bonus: 0,
    trening,
  }
}

export const bonusComba = (combo) => (combo > 0 && combo % CO_ILE_COMBO === 0 ? EXP_ZA_COMBO : 0)

export const aktualnaKarta = (seria) => seria.kolejka[0]

export const koniecSerii = (seria) => seria.kolejka.length === 0

// "Nie umiem" odklada karte tak, ze wraca jako czwarta z kolei (albo ostatnia, gdy kolejka jest krotsza), i zeruje
// combo. Kazda inna ocena (takze "Prawie") zdejmuje karte z serii i podbija combo. `bonus` to EXP doliczone za
// combo przy tej wlasnie ocenie, zeby interfejs wiedzial, kiedy pokazac toast.
export function poOcenie(seria, ocena) {
  const [karta, ...reszta] = seria.kolejka
  if (karta === undefined) return seria
  if (ocena === 1) {
    reszta.splice(Math.min(ODSTEP_PO_POMYLCE - 1, reszta.length), 0, karta)
    return { ...seria, kolejka: reszta, nieUmiem: seria.nieUmiem + 1, exp: seria.exp + EXP_ZA_OCENE[1], combo: 0, bonus: 0 }
  }
  const combo = seria.combo + 1
  const bonus = bonusComba(combo)
  return {
    ...seria,
    kolejka: reszta,
    oczyszczone: seria.oczyszczone + 1,
    umiem: ocena === 2 ? seria.umiem : seria.umiem + 1,
    prawie: ocena === 2 ? seria.prawie + 1 : seria.prawie,
    exp: seria.exp + (EXP_ZA_OCENE[ocena] ?? 0) + bonus,
    combo,
    bonus,
  }
}

export const postepSerii = (seria) => (seria.wszystkie ? seria.oczyszczone / seria.wszystkie : 1)

// Wykladnik 1.5: pasek rusza powoli i przyspiesza pod koniec (goal-gradient), zeby chcialo sie dokonczyc.
export const pasekPostepu = (postep) => Math.pow(Math.min(Math.max(postep, 0), 1), 1.5)

// Jedna karta liczy sie najwyzej MAKS_SEKUND_KARTY, zeby odlozony telefon nie nabijal czasu nauki.
export const czasKarty = (sekundy) => Math.min(Math.max(Number(sekundy) || 0, 0), MAKS_SEKUND_KARTY)

export function zaliczCzas({ streak, dzis }, sekundy, teraz = new Date()) {
  const data = dataLokalna(teraz)
  const dzien = dzisiejszy(dzis, teraz)
  const dodane = czasKarty(sekundy)
  const razem = Math.round((dzien.sekundy + dodane) * 10) / 10
  let nowyStreak = streak
  if (razem >= SEKUNDY_DNIA && streak.ostatniDzien !== data) {
    const ciagiem = streak.ostatniDzien === dzienPrzed(data)
    nowyStreak = { dni: ciagiem ? streak.dni + 1 : 1, ostatniDzien: data }
  }
  return { streak: nowyStreak, dzis: { ...dzien, sekundy: razem } }
}

// Przerwa (ostatni zaliczony dzien starszy niz wczoraj) pokazuje 0, choc zapis zmieni sie dopiero przy zaliczeniu.
export function aktualnyStreak(streak, teraz = new Date()) {
  const data = dataLokalna(teraz)
  if (streak.ostatniDzien === data || streak.ostatniDzien === dzienPrzed(data)) return streak.dni
  return 0
}

// Podpowiedz do mowienia w trzech poziomach: 'brak' (nic), 'dlugosc' (same podkreslenia i granice wyrazow),
// 'litera' (pierwsza litera plus podkreslenia). Wyrazy rozdziela potrojna spacja, zeby bylo widac granice slow,
// a znaki inne niz litery (apostrof, dywiz) zostaja.
export function podpowiedz(tekst, poziom = 'litera') {
  if (poziom === 'brak') return ''
  let pierwsza = poziom !== 'dlugosc'
  return String(tekst)
    .trim()
    .split(/\s+/)
    .map((wyraz) =>
      [...wyraz]
        .map((znak) => {
          if (!/[\p{L}\p{N}]/u.test(znak)) return znak
          if (pierwsza) {
            pierwsza = false
            return znak
          }
          return '_'
        })
        .join(' '),
    )
    .join('   ')
}

// Przycisk "Podpowiedz" na karcie podnosi poziom o jeden, najwyzej do 'litera'. Po zmianie karty wraca ustawienie.
export function nastepnaPodpowiedz(poziom) {
  const i = POZIOMY_PODPOWIEDZI.indexOf(poziom)
  return POZIOMY_PODPOWIEDZI[Math.min(Math.max(i, 0) + 1, POZIOMY_PODPOWIEDZI.length - 1)]
}

// Historia dni: { 'RRRR-MM-DD': { oceny, nowe, exp, sekundy } }. Uzupelniana przy kazdej ocenie, takze w treningu.

const PUSTY_DZIEN = { oceny: 0, nowe: 0, exp: 0, sekundy: 0 }

export function dopiszDzien(historia, { oceny = 0, nowe = 0, exp = 0, sekundy = 0 }, teraz = new Date()) {
  const data = dataLokalna(teraz)
  const stary = historia?.[data] || PUSTY_DZIEN
  return {
    ...historia,
    [data]: {
      oceny: stary.oceny + oceny,
      nowe: stary.nowe + nowe,
      exp: stary.exp + exp,
      sekundy: Math.round((stary.sekundy + sekundy) * 10) / 10,
    },
  }
}

const przesunDzien = (teraz, o) => dataLokalna(new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() + o))

export function przytnijHistorie(historia, teraz = new Date()) {
  if (!historia) return {}
  const granica = przesunDzien(teraz, -(DNI_HISTORII - 1))
  const dzis = dataLokalna(teraz)
  const wynik = {}
  // Daty RRRR-MM-DD porownuja sie poprawnie jako tekst. Dni z przyszlosci (cofniety zegar) tez odpadaja.
  for (const [data, wpis] of Object.entries(historia)) {
    if (data >= granica && data <= dzis) wynik[data] = wpis
  }
  return wynik
}

// Reset slowa oddaje jego "nowe" z dnia wprowadzenia: inaczej ponowna nauka liczylaby je drugi raz,
// a prognoza ukonczenia talii pokazywalaby zawyzone tempo.
export function odejmijNowe(historia, daty) {
  const wynik = { ...historia }
  for (const iso of daty) {
    if (!iso) continue
    const data = dataLokalna(new Date(iso))
    const wpis = wynik[data]
    if (!wpis?.nowe) continue
    wynik[data] = { ...wpis, nowe: Math.max(0, wpis.nowe - 1) }
  }
  return wynik
}

export const ocenioneDzis = (historia, teraz = new Date()) => historia?.[dataLokalna(teraz)]?.oceny || 0

// Piec stopni intensywnosci heatmapy: 0 dni pustych, dalej wedlug liczby ocen.
export const STOPNIE_HEATMAPY = [1, 10, 25, 50]

export const stopienDnia = (oceny) => STOPNIE_HEATMAPY.filter((prog) => oceny >= prog).length

// Ostatnie `dni` dni konczac na dzisiaj, od najstarszego.
export function historiaDni(historia, dni = DNI_HEATMAPY, teraz = new Date()) {
  const wynik = []
  for (let i = dni - 1; i >= 0; i--) {
    const data = przesunDzien(teraz, -i)
    const wpis = historia?.[data] || PUSTY_DZIEN
    wynik.push({ data, oceny: wpis.oceny, nowe: wpis.nowe, stopien: stopienDnia(wpis.oceny) })
  }
  return wynik
}

// Srednia nowych kart dziennie z ostatnich dni. null, gdy w tym okresie nie ma ani jednego wpisu w historii.
export function sredniaNowych(historia, dni = DNI_TEMPA, teraz = new Date()) {
  const okres = historiaDni(historia, dni, teraz)
  if (!okres.some((d) => historia?.[d.data])) return null
  return okres.reduce((suma, d) => suma + d.nowe, 0) / dni
}

// Kiedy skoncza sie nowe slowa przy obecnym tempie. `dni: null` znaczy "brak danych o tempie".
export function prognozaUkonczenia({ pozostale, historia, ustawienia, teraz = new Date() }) {
  const srednia = sredniaNowych(historia, DNI_TEMPA, teraz)
  const tempo = srednia === null ? ustawieniaZDomyslnymi(ustawienia).noweDziennie : srednia
  if (!(tempo > 0)) return { tempo: 0, dni: null, data: '' }
  const dni = Math.max(0, Math.ceil(pozostale / tempo))
  return { tempo, dni, data: przesunDzien(teraz, dni) }
}

// Przeglad talii

const OGONKI = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' }

export const bezZnakow = (tekst) => String(tekst ?? '').toLowerCase().replace(/[ąćęłńóśźż]/g, (z) => OGONKI[z])

// Indeks liczony raz przy wczytaniu talii: przy 3000 slow filtrowanie po kazdym znaku to jedno przejscie po tablicy.
export const budujIndeks = (slowa) => slowa.map((s) => ({ slowo: s, szukaj: bezZnakow(`${s.w} ${s.pl}`) }))

export function szukajSlow(indeks, fraza, maks = MAKS_WYNIKOW) {
  const szukane = bezZnakow(fraza).trim()
  if (!szukane) return { slowa: indeks.slice(0, maks).map((p) => p.slowo), wszystkie: indeks.length }
  const slowa = []
  let wszystkie = 0
  for (const p of indeks) {
    if (!p.szukaj.includes(szukane)) continue
    wszystkie += 1
    if (slowa.length < maks) slowa.push(p.slowo)
  }
  return { slowa, wszystkie }
}

// Stan karty EN po polsku do listy slowek.
export function opisStanuKarty(karta, teraz = new Date()) {
  if (jestNowa(karta)) return 'nowa'
  if (karta.stabilnosc >= PROG_OPANOWANIA) return 'opanowane'
  if (karta.stan !== 'powtorka') return 'w nauce'
  const dni = Math.round((Date.parse(karta.termin) - teraz.getTime()) / 86400000)
  if (dni <= 0) return 'powtórka teraz'
  return `powtórka za ${dni} ${dni === 1 ? 'dzień' : 'dni'}`
}
