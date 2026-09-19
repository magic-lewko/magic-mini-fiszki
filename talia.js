// Logika nauki bez DOM: budowa serii, dzienne limity, sufit powtorek, tryb nadrabiania, seria, ranga
// i punkty tygodnia. Nie importuje fsrs.mjs, bo w zrodle lezy on w lib/, a w dist obok: funkcje
// `przypomnienie` (do pilnosci kart) podaje app.js albo test.
// Klucz karty to `${id}|en` (widzisz EN, przypominasz PL) albo `${id}|pl` (widzisz PL, mowisz EN).

// Te same stany co STANY w lib/fsrs.mjs. Test pilnuje, zeby sie nie rozjechaly.
export const STANY = ['nowa', 'nauka', 'powtorka', 'ponowna']

// Karta mowienia odblokowuje sie przy stabilnosci karty EN >= 4 dni ALBO po dwoch kolejnych ocenach "Umiem".
// Kierunek produkcyjny (PL -> EN) jest glownym kierunkiem dla celu "mowic", wiec nie ma sensu go odwlekac.
export const PROG_STABILNOSCI_MOWIENIA = 4
export const KOLEJNE_UMIEM_DO_MOWIENIA = 2
// Odblokowania kart mowienia maja wlasny limit dzienny, osobny od limitu nowych slow.
export const MAKS_ODBLOKOWAN_DZIENNIE = 12
export const ODSTEP_PO_POMYLCE = 4
// Oceny: 1 "Nie umiem", 2 "Prawie", 3 "Umiem", 4 "Znam" (tylko dla nowej karty).
export const EXP_ZA_OCENE = { 1: 10, 2: 30, 3: 50, 4: 20 }
// "Znam" na nowej karcie to jednorazowe sprawdzenie za ok. 45 dni. Zwykle FSRS dalby po ocenie 4 okolo 8 dni,
// wiec setka slow z poziomu A1 oznaczona w trzy dni wracalaby jedna fala.
export const DNI_ZNAM = 45
export const MAKS_SEKUND_KARTY = 20
export const POZIOMY = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
// Jedno slowo to u nas dwie karty, a docelowo 7-10 powtorek dziennie: 20 nowych to juz ok. 200 powtorek.
export const OPCJE_NOWYCH = [5, 8, 10, 15, 20, 30]
// Sufit dzienny powtorek. 0 znaczy "bez limitu". Dotyczy kart zaleglych, nowe maja wlasny limit.
export const OPCJE_SUFITU = [40, 60, 100, 0]
export const OPCJE_DLUGOSCI = [10, 15, 20]
export const OPCJE_CELU = [30, 60, 100, 150]
export const DODATKOWE_NOWE = 10
export const POZIOMY_PODPOWIEDZI = ['brak', 'dlugosc', 'litera']
// Karta EN o stabilnosci co najmniej 21 dni jest uznawana za opanowana (osobna statystyka).
export const PROG_OPANOWANIA = 21
// Ranga liczy sie z kart EN o stabilnosci co najmniej 30 dni. Tego nie da sie wyklikac: stabilnosc rosnie
// tylko z czasem i z poprawnymi odpowiedziami. Karta po "Znam" ma ok. 8 dni, wiec rangi nie zawyza.
export const PROG_UTRWALENIA = 30
export const DNI_HISTORII = 180
export const DNI_HEATMAPY = 30
export const DNI_OSTATNICH = 30
export const DNI_TEMPA = 14
export const MAKS_WYNIKOW = 50

// Tryb nadrabiania po przerwie: wchodzi przy zaleglosci powyzej 2x sufit, wychodzi ponizej sufitu.
export const KROTNOSC_NADRABIANIA = 2
export const MNOZNIK_NADRABIANIA = 1.5
export const DNI_POLOWY_NOWYCH = 3

// Seria: prog utrzymania to jedna oceniona karta (cel dnia jest osobny, aspiracyjny).
export const PROG_SERII = 1
export const DNI_NA_ZAMROZENIE = 7
export const MAKS_ZAMROZEN = 2
export const GODZIN_NA_ODZYSKANIE = 48
export const SESJI_DO_ODZYSKANIA = 2
export const DNI_MIEDZY_ODZYSKANIAMI = 30

// Podpowiedz na karcie mowienia jako trudnosc pozadana: przycisk pojawia sie dopiero po 7 sekundach,
// a karta z uzyta podpowiedzia nie moze dostac oceny "Umiem".
export const SEKUNDY_DO_PODPOWIEDZI = 7
export const PODPIS_BLOKADY_UMIEM = 'z podpowiedzią maks. Prawie'

// Interferencja: nowe slowo czeka, gdy slowo kolidujace jest swieze albo dopiero w nauce.
export const DNI_INTERFERENCJI = 7

// Slowa oporne (leeche): po 6 pomylkach karta dostaje jednorazowy panel z trzema wyjsciami.
export const PROG_LEECHA = 6
export const DNI_ODLOZENIA_LEECHA = 21

// Combo: kolejne oceny inne niz "Nie umiem" w obrebie serii. Pokazywane od 3, bonus co 5.
export const PROG_POKAZANIA_COMBO = 3
export const CO_ILE_COMBO = 5
export const EXP_ZA_COMBO = 10

// Kotwica nawyku (implementation intention): wskazowka zdarzeniowa, nie godzina na zegarze.
// Gollwitzer i Sheeran 2006 (d = 0,65 na 94 testach), Stawarz i in. 2015 (zdarzenie buduje automatyzm
// lepiej niz przypomnienie o godzinie). Pusty tekst znaczy "wylaczona".
export const KOTWICE = ['po kawie', 'po umyciu zębów', 'w drodze', 'przed snem']
export const MAKS_ZNAKOW_KOTWICY = 40

// Prognoza "co dalej" na ekranie konca serii. Liczbe pokazujemy tylko wtedy, gdy jest znosna: inaczej
// zamienia sie w dlug, a to najczestszy powod porzucenia powtorek.
export const ZNOSNE_JUTRO = 60

export const DOMYSLNE_USTAWIENIA = {
  noweDziennie: 10,
  maksPowtorekDziennie: 60,
  dlugoscSerii: 15,
  autowymowa: true,
  mowienie: true,
  celDzienny: 60,
  podpowiedzMowienie: 'brak',
  kotwica: '',
  kotwicaPytano: false,
}

// Zdanie kotwicy na ekran startu. Pusta albo zlozona z samych bialych znakow kotwica daje pusty tekst,
// wiec ekran startu po prostu jej nie rysuje.
export function zdanieKotwicy(kotwica) {
  const tekst = String(kotwica ?? '').trim()
  if (!tekst) return ''
  return `Uczysz się ${tekst}.`
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

// Co nastapi wczesniej: stabilnosc karty EN >= 4 dni albo dwie kolejne oceny "Umiem" (3 albo 4).
export function mowienieOdblokowane(kartaEn) {
  if (!kartaEn || kartaEn.stan === 'nowa') return false
  if (kartaEn.stan === 'powtorka' && kartaEn.stabilnosc >= PROG_STABILNOSCI_MOWIENIA) return true
  return (kartaEn.kolejneUmiem || 0) >= KOLEJNE_UMIEM_DO_MOWIENIA
}

// Licznik kolejnych ocen "Umiem" na karcie: kazda inna ocena go zeruje. Trzymany w karcie, bo tylko
// z niego widac postep w kierunku odblokowania mowienia.
export const kolejneUmiem = (karta, ocena) => (ocena >= 3 ? (karta?.kolejneUmiem || 0) + 1 : 0)

export const jestNowa = (karta) => !karta || karta.stan === 'nowa'

export function ustawieniaZDomyslnymi(ustawienia) {
  return { ...DOMYSLNE_USTAWIENIA, ...ustawienia }
}

// Pominiete slowa ("Pomijam"): mapa { id: 'RRRR-MM-DD' }. Slowo wypada z nauki, ale jego karty zostaja w pamieci,
// wiec "Przywroc" oddaje je dokladnie w to samo miejsce harmonogramu.
export const jestPominiete = (pominiete, id) => !!pominiete?.[id]

// Zbior id slow, ktore moga trafic do serii: wszystko z listy poza pominietymi.
function dostepneIds(slowa, pominiete) {
  const ids = new Set()
  for (const s of slowa) {
    if (!jestPominiete(pominiete, s.id)) ids.add(s.id)
  }
  return ids
}

// Rozrzut terminow (fuzz)

export const MIN_DNI_ROZRZUTU = 3
export const MAKS_DNI_ROZRZUTU = 21
export const SILA_ROZPROSZENIA = 0.25
const DOBA = 86400000

// FNV-1a 32 bit: ten sam klucz i ten sam termin zawsze daja to samo przesuniecie, wiec wynik oceny jest
// powtarzalny i testowalny (bez Math.random).
function hash32(tekst) {
  let h = 2166136261
  for (let i = 0; i < tekst.length; i++) {
    h = Math.imul(h ^ tekst.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

// Przesuwa termin o +/- `sila` odstepu (najwyzej 21 dni), zeby karty ocenione tego samego dnia nie wrocily kupa.
// Terminy blizsze niz 3 dni zostaja bez zmian: tam rozrzut zepsulby krotkie kroki nauki.
export function rozrzucTermin(klucz, terminISO, teraz = new Date(), sila = 0.08) {
  const termin = Date.parse(terminISO)
  if (!Number.isFinite(termin)) return terminISO
  const czas = teraz.getTime()
  const odstep = termin - czas
  if (odstep < MIN_DNI_ROZRZUTU * DOBA) return terminISO
  // Ulamek -1..1 z hasha klucza i terminu; termin w hashu sprawia, ze to samo slowo dostaje inny rozrzut po kazdej ocenie.
  const ulamek = (hash32(`${klucz}|${terminISO}`) / 4294967295) * 2 - 1
  const maks = Math.min(odstep * sila, MAKS_DNI_ROZRZUTU * DOBA)
  const przesuniety = Math.max(termin + ulamek * maks, czas + DOBA)
  return new Date(Math.round(przesuniety / 60000) * 60000).toISOString()
}

// Jednorazowe rozlozenie terminow, ktore juz sa w zapisie. Karty nowe, zalegle i te blizej niz 3 dni zostaja
// nietkniete. Zwraca nowe karty i liczbe faktycznie przesunietych.
export function rozprosTerminy(karty, teraz = new Date()) {
  const wynik = {}
  let przesuniete = 0
  for (const [k, karta] of Object.entries(karty)) {
    const termin = karta.stan === 'nowa' ? karta.termin : rozrzucTermin(k, karta.termin, teraz, SILA_ROZPROSZENIA)
    if (termin === karta.termin) {
      wynik[k] = karta
      continue
    }
    wynik[k] = { ...karta, termin }
    przesuniete += 1
  }
  return { karty: wynik, przesuniete }
}

// Karta po "Znam": jedno sprawdzenie za ok. DNI_ZNAM dni zamiast wejscia w normalny cykl nauki.
// Stabilnosc zostaje ta z FSRS: slowo nie przeszlo jeszcze zadnej powtorki, wiec nie wolno go liczyc
// jako utrwalonego. Po tym sprawdzeniu karta wraca do normalnego cyklu z prawdziwa historia.
export function kartaZnam(karta, klucz, teraz = new Date()) {
  const termin = new Date(teraz.getTime() + DNI_ZNAM * DOBA).toISOString()
  return { ...karta, stan: 'powtorka', krok: 0, termin: rozrzucTermin(klucz, termin, teraz) }
}

// Ranga z utrwalonych slow

// [prog, nazwa]. Prog to liczba utrwalonych slow, czyli kart EN o stabilnosci co najmniej PROG_UTRWALENIA dni.
// Ostatni prog to rozmiar talii Oxford 3000.
export const PROGI_RANG = [
  [0, 'Start'],
  [50, 'Pierwsze słowa'],
  [150, 'Turysta'],
  [350, 'Rozmowa'],
  [700, 'Swobodnie'],
  [1200, 'Pewnie'],
  [1800, 'Biegle'],
  [2500, 'Prawie natywnie'],
  [2981, 'Cała talia'],
]

// Liczy karty EN o stabilnosci co najmniej PROG_UTRWALENIA dni. Slowa pominiete tez sie licza: wiedza
// zostaje wiedza, a "Pomijam" mowi tylko, ze nie ma po co ich powtarzac.
export function liczbaUtrwalonych({ slowa, karty }) {
  let ile = 0
  for (const s of slowa) {
    const en = karty[klucz(s.id, 'en')]
    if (en && en.stan !== 'nowa' && en.stabilnosc >= PROG_UTRWALENIA) ile += 1
  }
  return ile
}

// Ranga i pasek do nastepnego progu. `stopien` to indeks w PROGI_RANG, wiec awans poznaje sie po jego wzroscie.
export function ranga(utrwalone) {
  const ile = Math.max(Math.trunc(Number(utrwalone) || 0), 0)
  let stopien = 0
  while (stopien + 1 < PROGI_RANG.length && PROGI_RANG[stopien + 1][0] <= ile) stopien += 1
  const od = PROGI_RANG[stopien][0]
  const ostatnia = stopien + 1 >= PROGI_RANG.length
  const doNastepnej = ostatnia ? 0 : PROGI_RANG[stopien + 1][0] - ile
  const zakres = ostatnia ? 1 : PROGI_RANG[stopien + 1][0] - od
  return {
    stopien,
    nazwa: PROGI_RANG[stopien][1],
    utrwalone: ile,
    prog: od,
    nastepnyProg: ostatnia ? od : PROGI_RANG[stopien + 1][0],
    nastepnaNazwa: ostatnia ? '' : PROGI_RANG[stopien + 1][1],
    doNastepnej,
    ostatnia,
    procent: ostatnia ? 100 : Math.min(99, Math.floor(((ile - od) / zakres) * 100)),
  }
}

// Zdanie do interfejsu, zeby ekran startu i menu mowily to samo.
export function opisRangi(r) {
  if (r.ostatnia) return `${r.nazwa} · ${r.utrwalone} słów utrwalonych`
  return `${r.nazwa} · ${r.utrwalone} / ${r.nastepnyProg} słów utrwalonych`
}

// Punkty tygodnia: licznik zerowany w poniedzialek rano. Laczne punkty (expRazem) zostaja w statystykach.

// Poniedzialek biezacego tygodnia jako RRRR-MM-DD. getDay(): 0 to niedziela.
export function poczatekTygodnia(teraz = new Date()) {
  const przesuniecie = (teraz.getDay() + 6) % 7
  return dataLokalna(new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() - przesuniecie))
}

export function punktyTygodnia(punkty, teraz = new Date()) {
  const tydzien = poczatekTygodnia(teraz)
  if (punkty?.tydzien === tydzien) return { tydzien, punkty: Math.max(Number(punkty.punkty) || 0, 0) }
  return { tydzien, punkty: 0 }
}

export function dolozPunkty(punkty, ile, teraz = new Date()) {
  const biezace = punktyTygodnia(punkty, teraz)
  return { tydzien: biezace.tydzien, punkty: biezace.punkty + Math.max(Number(ile) || 0, 0) }
}

// Stan dnia (sekundy nauki, dodatkowe nowe, zrobione powtorki) zeruje sie o lokalnej polnocy.
export function dzisiejszy(dzis, teraz = new Date()) {
  const data = dataLokalna(teraz)
  if (dzis?.data === data) return { powtorki: 0, ...dzis }
  return { data, sekundy: 0, dodatkoweNowe: 0, powtorki: 0 }
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

// Tryb nadrabiania po przerwie (A2). Wchodzi sam, gdy zaleglosc przekracza 2x sufit: wtedy nowe slowa staja,
// a limit powtorek rosnie do 1,5x sufitu. Wychodzi, gdy zaleglosc spadnie ponizej sufitu, i przez trzy dni
// (liczac dzien wyjscia) przepuszcza polowe nowych slow. Bez sufitu tryb nie ma sensu i nie wlacza sie.
export const PUSTE_NADRABIANIE = { aktywne: 0, polowaDo: '' }

export const nadrabianieZDomyslnymi = (n) => ({
  aktywne: n?.aktywne === 1 ? 1 : 0,
  polowaDo: typeof n?.polowaDo === 'string' ? n.polowaDo : '',
})

export function stanNadrabiania(poprzedni, zaleglych, ustawienia, teraz = new Date()) {
  const n = nadrabianieZDomyslnymi(poprzedni)
  const sufit = ustawieniaZDomyslnymi(ustawienia).maksPowtorekDziennie
  if (!(sufit > 0)) return n.aktywne ? { ...n, aktywne: 0 } : n
  if (zaleglych > KROTNOSC_NADRABIANIA * sufit) return n.aktywne ? n : { ...n, aktywne: 1 }
  if (!n.aktywne) return n
  if (zaleglych >= sufit) return n
  return { aktywne: 0, polowaDo: przesunDzien(teraz, DNI_POLOWY_NOWYCH - 1) }
}

// 0 w trybie nadrabiania, 0,5 przez trzy dni po wyjsciu, poza tym 1.
export function mnoznikNowych(nadrabianie, teraz = new Date()) {
  const n = nadrabianieZDomyslnymi(nadrabianie)
  if (n.aktywne) return 0
  if (n.polowaDo && dataLokalna(teraz) <= n.polowaDo) return 0.5
  return 1
}

// Ile kart zaleglych wolno jeszcze dzisiaj pokazac. Karty ponad sufit same przechodza na kolejne dni:
// FSRS radzi sobie z zaleglosciami, wiec nic nie trzeba przeliczac.
export function budzetPowtorek({ ustawienia, dzis, teraz = new Date(), nadrabianie }) {
  const sufit = ustawieniaZDomyslnymi(ustawienia).maksPowtorekDziennie
  if (!(sufit > 0)) return Infinity
  const mnoznik = nadrabianieZDomyslnymi(nadrabianie).aktywne ? MNOZNIK_NADRABIANIA : 1
  return Math.max(0, Math.round(sufit * mnoznik) - (dzisiejszy(dzis, teraz).powtorki || 0))
}

function limityNowych({ karty, ustawienia, dzis, teraz, nadrabianie }) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const dzien = dzisiejszy(dzis, teraz)
  // "+10 nowych na dziś" to swiadoma decyzja uzytkownika, wiec mnoznik nadrabiania jej nie dotyczy.
  const limit = Math.round(u.noweDziennie * mnoznikNowych(nadrabianie, teraz)) + (dzien.dodatkoweNowe || 0)
  const wprowadzone = noweDzis(karty, teraz)
  return {
    en: Math.max(0, limit - wprowadzone.en),
    pl: u.mowienie ? Math.min(Math.max(0, limit - wprowadzone.pl), Math.max(0, MAKS_ODBLOKOWAN_DZIENNIE - wprowadzone.pl)) : 0,
  }
}

// Termin, ktorego nie da sie odczytac, traktujemy jako zalegly, zeby karta nie utknela na zawsze.
const czasTerminu = (karta) => Date.parse(karta.termin) || 0

// Pilnosc karty to szansa przypomnienia R(t, S) z lib/fsrs.mjs: im nizsza, tym blizej zapomnienia.
// Funkcje `przypomnienie` podaje wolajacy (talia.js nie importuje fsrs.mjs, bo sciezki w zrodle i w dist
// sa inne). Bez niej zostaje kolejnosc po terminie, czyli zachowanie sprzed sufitu.
export function pilnosc(karta, teraz = new Date(), przypomnienie) {
  if (typeof przypomnienie !== 'function') return null
  const stabilnosc = Number(karta?.stabilnosc)
  const ostatnio = Date.parse(karta?.ostatnio)
  if (!(stabilnosc > 0) || !Number.isFinite(ostatnio)) return 0
  const dni = Math.max(0, (teraz.getTime() - ostatnio) / 86400000)
  const r = przypomnienie(dni, stabilnosc)
  return Number.isFinite(r) ? r : 0
}

// Kroki nauki i karty po pomylce ida przed powtorkami (ich terminy licza sie w minutach), a wewnatrz obu
// grup rzadzi pilnosc: najpierw te najblizsze zapomnieniu. To odpowiednik "relative overdueness" z Anki.
function zalegle({ slowa, karty, ustawienia, teraz, pominiete, przypomnienie }) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const ids = dostepneIds(slowa, pominiete)
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
    const pozycja = { k, termin, pilnosc: pilnosc(karta, teraz, przypomnienie) }
    if (karta.stan === 'powtorka') powtorki.push(pozycja)
    else nauka.push(pozycja)
  }
  const wgPilnosci = (a, b) => (a.pilnosc === null ? 0 : a.pilnosc - b.pilnosc) || a.termin - b.termin
  return { nauka: nauka.sort(wgPilnosci), powtorki: powtorki.sort(wgPilnosci) }
}

export function liczbaZaleglych({ slowa, karty, ustawienia, teraz = new Date(), pominiete }) {
  const { nauka, powtorki } = zalegle({ slowa, karty, ustawienia, teraz, pominiete })
  return nauka.length + powtorki.length
}

// Czy nowe slowo trzeba na razie pominac przez interferencje: slowo kolidujace jest w nauce albo weszlo
// w ciagu ostatnich DNI_INTERFERENCJI dni. `kolizje` to { id: [id kolidujacych] } z kolizje.js.
export function kolidujeTeraz({ kolizje, id, karty, teraz = new Date(), dni = DNI_INTERFERENCJI, pominiete }) {
  const lista = kolizje?.[id]
  if (!lista?.length) return false
  const granica = teraz.getTime() - dni * 86400000
  for (const inny of lista) {
    // Slowo pominiete nigdy juz nie bedzie oceniane, wiec jego karta zostalaby w stanie "nauka" na zawsze
    // i blokowala partnerow bezterminowo.
    if (jestPominiete(pominiete, inny)) continue
    const k = karty[klucz(inny, 'en')]
    if (!k || k.stan === 'nowa') continue
    if (k.stan === 'nauka' || k.stan === 'ponowna') return true
    const wprowadzono = Date.parse(k.wprowadzono)
    if (Number.isFinite(wprowadzono) && wprowadzono >= granica) return true
  }
  return false
}

// Kolejnosc: zalegla nauka i ponowne, zalegle powtorki (najpilniejsze najpierw), nowe mowienie, nowe EN.
// Zalegle sa przycinane do dziennego budzetu powtorek, nowe do limitu nowych slow.
export function zbudujSerie({
  slowa,
  karty,
  ustawienia,
  dzis,
  teraz = new Date(),
  dlugosc,
  pominiete,
  nadrabianie,
  kolizje,
  przypomnienie,
}) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const maks = dlugosc ?? u.dlugoscSerii
  const { nauka, powtorki } = zalegle({ slowa, karty, ustawienia: u, teraz, pominiete, przypomnienie })
  const budzet = budzetPowtorek({ ustawienia: u, dzis, teraz, nadrabianie })
  // Budzet dotyczy wylacznie powtorek. Karta zaczeta dzis (nauka albo ponowna) musi dac sie dzis skonczyc:
  // inaczej apka mowi "na dzis wszystko", majac przeterminowane karty, a FSRS liczy je jutro jak powtorke
  // po dniu przerwy zamiast kroku tego samego dnia.
  const wynik = [...nauka, ...powtorki.slice(0, Math.max(0, budzet))].slice(0, maks).map((p) => p.k)
  const limity = limityNowych({ karty, ustawienia: u, dzis, teraz, nadrabianie })
  const dodaneNowe = new Set()

  for (const s of slowa) {
    if (wynik.length >= maks || limity.pl <= 0) break
    if (jestPominiete(pominiete, s.id)) continue
    const kPl = klucz(s.id, 'pl')
    if (mowienieOdblokowane(karty[klucz(s.id, 'en')]) && jestNowa(karty[kPl])) {
      wynik.push(kPl)
      limity.pl -= 1
    }
  }
  for (const s of slowa) {
    if (wynik.length >= maks || limity.en <= 0) break
    if (jestPominiete(pominiete, s.id)) continue
    const kEn = klucz(s.id, 'en')
    if (!jestNowa(karty[kEn])) continue
    // Slowo kolidujace czeka na kolejny dzien: bierzemy nastepne z listy zamiast blokowac cala kolejke.
    if (kolidujeTeraz({ kolizje, id: s.id, karty, teraz, pominiete })) continue
    // To samo dla partnera, ktory wszedl do tej samej serii przed chwila.
    if (kolizje?.[s.id]?.some((inny) => dodaneNowe.has(inny))) continue
    wynik.push(kEn)
    dodaneNowe.add(s.id)
    limity.en -= 1
  }
  return wynik
}

// Do ekranu startu, konca serii i menu. `doZrobienia` to jedna liczba kart na teraz (bez rozbicia na dlug),
// `zalegle` i reszta zostaja do statystyk w menu.
export function podsumowanieDnia({ slowa, karty, ustawienia, dzis, teraz = new Date(), pominiete, nadrabianie, kolizje, przypomnienie }) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const { nauka, powtorki } = zalegle({ slowa, karty, ustawienia: u, teraz, pominiete })
  const polnoc = new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() + 1).getTime()
  const ids = dostepneIds(slowa, pominiete)
  let pozniejDzis = 0
  for (const [k, karta] of Object.entries(karty)) {
    if (karta.stan === 'nowa') continue
    const { id, kierunek } = rozbierzKlucz(k)
    if (!ids.has(id) || (kierunek === 'pl' && !u.mowienie)) continue
    const termin = czasTerminu(karta)
    if (termin > teraz.getTime() && termin < polnoc) pozniejDzis += 1
  }
  const zaleglych = nauka.length + powtorki.length
  const doZrobienia = zbudujSerie({
    slowa,
    karty,
    ustawienia: u,
    dzis,
    teraz,
    dlugosc: Infinity,
    pominiete,
    nadrabianie,
    kolizje,
    przypomnienie,
  }).length
  // Jak w zbudujSerie: w serii sa wszystkie karty w nauce i tylko tyle powtorek, ile miesci sie w budzecie.
  const wSerii = nauka.length + Math.min(powtorki.length, budzetPowtorek({ ustawienia: u, dzis, teraz, nadrabianie }))
  return {
    zalegle: zaleglych,
    pozniejDzis,
    noweDostepne: doZrobienia - wSerii,
    doZrobienia,
    nadrabianie: nadrabianieZDomyslnymi(nadrabianie).aktywne === 1,
  }
}

// "Co dalej" na ekranie konca serii (C5): ile kart czeka do konca jutrzejszego dnia. Nowych slow tu nie ma,
// bo o nich decyduje limit dzienny, a nie harmonogram. `znosna` mowi interfejsowi, czy wolno pokazac liczbe:
// ponad sufit powtorek robi sie z niej dlug, a dlugu nie pokazujemy.
export function prognozaNaJutro({ slowa, karty, ustawienia, teraz = new Date(), pominiete }) {
  const u = ustawieniaZDomyslnymi(ustawienia)
  const ids = dostepneIds(slowa, pominiete)
  const koniecJutra = new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() + 2).getTime()
  let liczba = 0
  for (const [k, karta] of Object.entries(karty)) {
    if (karta.stan === 'nowa') continue
    const { id, kierunek } = rozbierzKlucz(k)
    if (!ids.has(id) || (kierunek === 'pl' && !u.mowienie)) continue
    if (czasTerminu(karta) < koniecJutra) liczba += 1
  }
  const sufit = u.maksPowtorekDziennie > 0 ? u.maksPowtorekDziennie : ZNOSNE_JUTRO
  return { liczba, znosna: liczba > 0 && liczba <= sufit }
}

// Trening "Trudne slowa": karty obu kierunkow, na ktorych uzytkownik sie juz kiedys pomylil. Ocena w tym trybie
// nie zmienia stanu karty ani terminow, wiec kolejnosc liczy sie tylko z tego, co juz jest w pamieci.
const zPomylka = (karta) => karta.pomylki > 0

export function liczbaTrudnych({ slowa, karty, pominiete }) {
  const ids = dostepneIds(slowa, pominiete)
  let ile = 0
  for (const [k, karta] of Object.entries(karty)) {
    if (zPomylka(karta) && ids.has(rozbierzKlucz(k).id)) ile += 1
  }
  return ile
}

// Wiecej pomylek pierwsze, przy remisie pozniejsza ostatnia ocena.
export function trudneKarty({ slowa, karty, ustawienia, dlugosc, pominiete }) {
  const maks = dlugosc ?? ustawieniaZDomyslnymi(ustawienia).dlugoscSerii
  const ids = dostepneIds(slowa, pominiete)
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

// Poznane = karta EN juz nie jest nowa (takze dla slow pominietych po nauce). Pominiete liczymy osobno, a do
// prognozy idzie `doWprowadzenia`: slowa, ktore jeszcze moga wejsc do nauki.
// Talie w kolejnosci dodania, poziomy tylko te, ktore wystepuja w slowach.
export function statystyki({ slowa, karty, pominiete }) {
  const talie = new Map()
  const poziomy = new Map()
  let poznaneRazem = 0
  let wPowtorce = 0
  let odblokowane = 0
  let opanowane = 0
  let utrwalone = 0
  let pominietych = 0
  let doWprowadzenia = 0
  for (const s of slowa) {
    const en = karty[klucz(s.id, 'en')]
    const poznane = jestNowa(en) ? 0 : 1
    poznaneRazem += poznane
    dolicz(talie, s.talia || 'Bez nazwy', poznane)
    if (s.poziom) dolicz(poziomy, s.poziom, poznane)
    if (en?.stan === 'powtorka') wPowtorce += 1
    if (mowienieOdblokowane(en)) odblokowane += 1
    if (en && en.stabilnosc >= PROG_OPANOWANIA) opanowane += 1
    if (poznane && en.stabilnosc >= PROG_UTRWALENIA) utrwalone += 1
    if (jestPominiete(pominiete, s.id)) pominietych += 1
    else if (!poznane) doWprowadzenia += 1
  }
  return {
    wszystkie: slowa.length,
    poznane: poznaneRazem,
    pominiete: pominietych,
    doWprowadzenia,
    opanowane,
    utrwalone,
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
    nowe: 0,
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
// `nowa` mowi, ze ta karta wchodzi do nauki pierwszy raz: licznik `nowe` niesie ekran konca serii ("co przybylo").
// Karta bez daty wprowadzenia jest nowa tylko przy pierwszej ocenie, wiec "Nie umiem" nie policzy jej dwa razy.
export function poOcenie(seria, ocena, nowa = false) {
  const [karta, ...reszta] = seria.kolejka
  if (karta === undefined) return seria
  const nowe = (seria.nowe || 0) + (nowa ? 1 : 0)
  if (ocena === 1) {
    reszta.splice(Math.min(ODSTEP_PO_POMYLCE - 1, reszta.length), 0, karta)
    return { ...seria, kolejka: reszta, nieUmiem: seria.nieUmiem + 1, nowe, exp: seria.exp + EXP_ZA_OCENE[1], combo: 0, bonus: 0 }
  }
  const combo = seria.combo + 1
  const bonus = bonusComba(combo)
  return {
    ...seria,
    kolejka: reszta,
    oczyszczone: seria.oczyszczone + 1,
    umiem: ocena === 2 ? seria.umiem : seria.umiem + 1,
    prawie: ocena === 2 ? seria.prawie + 1 : seria.prawie,
    nowe,
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

// Czas nauki jest juz tylko statystyka: o serii decyduje jedna oceniona karta, nie 60 sekund.
export function zaliczCzas(dzis, sekundy, teraz = new Date()) {
  const dzien = dzisiejszy(dzis, teraz)
  return { ...dzien, sekundy: Math.round((dzien.sekundy + czasKarty(sekundy)) * 10) / 10 }
}

// Seria bez kary (A3)

export const PUSTE_ZERWANIE = { dni: 0, do: '' }

export const PUSTY_STREAK = {
  dni: 0,
  ostatniDzien: '',
  zamrozenia: 0,
  doZamrozenia: 0,
  zerwane: PUSTE_ZERWANIE,
  sesje: 0,
  ostatnieOdzyskanie: '',
}

const calkowita = (x, maks) => Math.min(Math.max(Math.trunc(Number(x) || 0), 0), maks)
const dzienLubPusto = (x) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : '')

export function streakZDomyslnymi(streak) {
  const z = streak?.zerwane
  return {
    dni: calkowita(streak?.dni, 1e6),
    ostatniDzien: dzienLubPusto(streak?.ostatniDzien),
    zamrozenia: calkowita(streak?.zamrozenia, MAKS_ZAMROZEN),
    doZamrozenia: calkowita(streak?.doZamrozenia, DNI_NA_ZAMROZENIE),
    zerwane: { dni: calkowita(z?.dni, 1e6), do: typeof z?.do === 'string' && Date.parse(z.do) ? z.do : '' },
    sesje: calkowita(streak?.sesje, 1e6),
    ostatnieOdzyskanie: dzienLubPusto(streak?.ostatnieOdzyskanie),
  }
}

// Roznica dni miedzy datami RRRR-MM-DD, liczona po kalendarzu lokalnym (zmiana czasu nie psuje wyniku).
export function dniMiedzyDatami(od, dO) {
  const naCzas = (data) => {
    const [r, m, d] = data.split('-').map(Number)
    return new Date(r, m - 1, d).getTime()
  }
  return Math.round((naCzas(dO) - naCzas(od)) / 86400000)
}

// Jedna oceniona karta zalicza dzien. Dzien opuszczony pokrywa zamrozenie z banku (max 2), a jesli nie ma
// czym pokryc, seria zaczyna sie od nowa i zapisuje sie okno 48 h na jej odzyskanie.
// Zwraca { streak, zamrozono, zerwano, zaliczony }; nigdzie nie ma komunikatu o utracie czegokolwiek.
export function zaliczDzien(streak, teraz = new Date()) {
  const s = streakZDomyslnymi(streak)
  const data = dataLokalna(teraz)
  if (s.ostatniDzien === data) return { streak: s, zamrozono: false, zerwano: false, zaliczony: false }
  // Data wczesniejsza niz ostatni zaliczony dzien (cofniety zegar, strefa na zachod): nie cofamy serii,
  // bo powrot do wlasciwej daty wygladalby jak przerwa i seria by przepadla.
  if (s.ostatniDzien && dniMiedzyDatami(s.ostatniDzien, data) < 0) {
    return { streak: s, zamrozono: false, zerwano: false, zaliczony: false }
  }

  const opuszczone = s.ostatniDzien ? Math.max(0, dniMiedzyDatami(s.ostatniDzien, data) - 1) : 0
  let dni = s.dni + 1
  let zamrozenia = s.zamrozenia
  let zerwane = s.zerwane
  let sesje = s.sesje
  let zamrozono = false
  let zerwano = false
  if (!s.ostatniDzien) {
    dni = 1
  } else if (opuszczone > 0 && opuszczone <= zamrozenia) {
    zamrozenia -= opuszczone
    zamrozono = true
  } else if (opuszczone > 0) {
    zerwane = { dni: s.dni, do: new Date(teraz.getTime() + GODZIN_NA_ODZYSKANIE * 3600000).toISOString() }
    sesje = 0
    dni = 1
    zerwano = true
  }

  // Zamrozenie naliczane co DNI_NA_ZAMROZENIE dni nauki, bank najwyzej MAKS_ZAMROZEN.
  let doZamrozenia = s.doZamrozenia + 1
  if (doZamrozenia >= DNI_NA_ZAMROZENIE) {
    doZamrozenia = 0
    if (zamrozenia < MAKS_ZAMROZEN) zamrozenia += 1
  }
  return {
    streak: { ...s, dni, ostatniDzien: data, zamrozenia, doZamrozenia, zerwane, sesje },
    zamrozono,
    zerwano,
    zaliczony: true,
  }
}

// Odzyskanie serii: dwie sesje w ciagu 48 h od zerwania oddaja dni sprzed przerwy. Raz na 30 dni.
export function zaliczSesje(streak, teraz = new Date()) {
  const s = streakZDomyslnymi(streak)
  if (!s.zerwane.do) return { streak: s, odzyskano: false }
  if (teraz.getTime() > Date.parse(s.zerwane.do)) {
    return { streak: { ...s, zerwane: PUSTE_ZERWANIE, sesje: 0 }, odzyskano: false }
  }
  const sesje = s.sesje + 1
  if (sesje < SESJI_DO_ODZYSKANIA) return { streak: { ...s, sesje }, odzyskano: false }
  const data = dataLokalna(teraz)
  if (s.ostatnieOdzyskanie && dniMiedzyDatami(s.ostatnieOdzyskanie, data) < DNI_MIEDZY_ODZYSKANIAMI) {
    return { streak: { ...s, sesje }, odzyskano: false }
  }
  // Dni zebrane po przerwie zostaja doliczone, wiec seria wyglada, jakby przerwy nie bylo.
  return {
    streak: { ...s, dni: s.dni + s.zerwane.dni, zerwane: PUSTE_ZERWANIE, sesje: 0, ostatnieOdzyskanie: data },
    odzyskano: true,
  }
}

// Przerwa, ktorej nie da sie juz pokryc zamrozeniem, pokazuje 0. Zamrozenia w banku trzymaja licznik.
export function aktualnyStreak(streak, teraz = new Date()) {
  const s = streakZDomyslnymi(streak)
  if (!s.ostatniDzien) return 0
  const opuszczone = Math.max(0, dniMiedzyDatami(s.ostatniDzien, dataLokalna(teraz)) - 1)
  return opuszczone <= s.zamrozenia ? s.dni : 0
}

// Licznik, ktory nigdy sie nie zeruje: ile z ostatnich 30 dni mialo choc jedna oceniona karte.
export function dniZNauka(historia, dni = DNI_OSTATNICH, teraz = new Date()) {
  return historiaDni(historia, dni, teraz).filter((d) => d.oceny > 0).length
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

// Trudnosc pozadana (A5): przycisk podpowiedzi jest niewidoczny przez pierwsze 7 sekund, a po jej uzyciu
// karta nie moze dostac "Umiem" w tej odslonie. Latwiejsze wydobycie z pamieci daje mniejszy zysk.
export function regulyPodpowiedzi({ sekundy = 0, uzyto = false } = {}) {
  return {
    widoczna: uzyto || (Number(sekundy) || 0) >= SEKUNDY_DO_PODPOWIEDZI,
    umiemZablokowane: !!uzyto,
    podpisUmiem: uzyto ? PODPIS_BLOKADY_UMIEM : '',
  }
}

// Slowa oporne (A7). Panel pokazuje sie po kazdych PROG_LEECHA pomylkach od ostatniego pokazania: pole `leech`
// trzyma liczbe pomylek z chwili, gdy uzytkownik ostatnio o nim decydowal.
export const czyPanelLeecha = (karta) => !!karta && (karta.pomylki || 0) - (karta.leech || 0) >= PROG_LEECHA

export const kartaPoLeechu = (karta) => ({ ...karta, leech: karta.pomylki || 0 })

// "Odloz na 3 tygodnie": termin na dzis + 21 dni i wyzerowany licznik proponowania panelu.
// Historia karty zostaje nietknieta, bo FSRS uczy sie na niej.
export function kartaOdlozona(karta, klucz, teraz = new Date()) {
  const termin = new Date(teraz.getTime() + DNI_ODLOZENIA_LEECHA * DOBA).toISOString()
  return { ...kartaPoLeechu(karta), stan: 'powtorka', krok: 0, termin: rozrzucTermin(klucz, termin, teraz) }
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

// Siatka heatmapy w kolumnach dni tygodnia (poniedzialek pierwszy): przed najstarszym dniem dokladamy puste
// pola, zeby kazda kolumna byla tym samym dniem tygodnia. Zwraca tez liczby do podpisu pod siatka.
export function siatkaHeatmapy(historia, dni = DNI_HEATMAPY, teraz = new Date()) {
  const pola = historiaDni(historia, dni, teraz)
  const [r, m, d] = pola[0].data.split('-').map(Number)
  // getDay(): 0 to niedziela, a my chcemy poniedzialek jako pierwsza kolumne
  const puste = (new Date(r, m - 1, d).getDay() + 6) % 7
  const zNauka = pola.filter((p) => p.oceny > 0)
  return {
    puste,
    pola,
    dzis: pola.at(-1).oceny,
    najlepszy: pola.reduce((max, p) => Math.max(max, p.oceny), 0),
    pierwszyDzien: zNauka[0]?.data || '',
    dniZNauka: zNauka.length,
  }
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

// Stan karty EN po polsku do listy slowek. Pominiete slowo ma wlasny stan, bo jego karta zostaje nietknieta.
export function opisStanuKarty(karta, teraz = new Date(), pominiete = false) {
  if (pominiete) return 'pominięte'
  if (jestNowa(karta)) return 'nowa'
  if (karta.stabilnosc >= PROG_OPANOWANIA) return 'opanowane'
  if (karta.stan !== 'powtorka') return 'w nauce'
  const dni = Math.round((Date.parse(karta.termin) - teraz.getTime()) / 86400000)
  if (dni <= 0) return 'powtórka teraz'
  return `powtórka za ${dni} ${dni === 1 ? 'dzień' : 'dni'}`
}
