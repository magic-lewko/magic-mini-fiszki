// Talia (do ok. 6000 slow, ok. 1,5 MB) w IndexedDB, jako jeden rekord { wersja, slowa, talie }.
// Indeks kolizji (ok. 50 KB przy 3000 slow) lezy w osobnym rekordzie, zeby zapis talii go nie przepisywal.
// localStorage ma w WebKit ok. 5 MB liczone w UTF-16 i zostaje tylko dla postepu.

const NAZWA_BAZY = 'mmf'
const MAGAZYN = 'dane'
const KLUCZ_TALII = 'talia'
const KLUCZ_KOLIZJI = 'kolizje'
export const LIMIT_OTWARCIA_MS = 5000
export const BRAK_ODPOWIEDZI = 'Baza słówek nie odpowiada. Zamknij aplikację w przełączniku aplikacji i otwórz ponownie.'

const bladBrakuOdpowiedzi = () => Object.assign(new Error(BRAK_ODPOWIEDZI), { name: 'BazaNieOdpowiada' })

// WebKit potrafi zawiesic indexedDB.open bez zadnego zdarzenia (np. po uspieniu apki) i start stalby w miejscu.
// Po limicie czasu albo zablokowaniu otwarcie konczy sie bledem, a polaczenie otwarte juz po nim jest zamykane.
function otworz() {
  let czas
  let porzucone = false
  const otwarcie = new Promise((ok, nie) => {
    if (!globalThis.indexedDB) {
      nie(new Error('Ta przeglądarka nie ma IndexedDB'))
      return
    }
    const zadanie = indexedDB.open(NAZWA_BAZY, 1)
    zadanie.onupgradeneeded = () => zadanie.result.createObjectStore(MAGAZYN)
    zadanie.onsuccess = () => {
      if (porzucone) zadanie.result.close()
      else ok(zadanie.result)
    }
    zadanie.onerror = () => nie(zadanie.error || new Error('Nie udało się otworzyć bazy'))
    zadanie.onblocked = () => {
      porzucone = true
      nie(bladBrakuOdpowiedzi())
    }
  })
  const limit = new Promise((_, nie) => {
    czas = setTimeout(() => {
      porzucone = true
      nie(bladBrakuOdpowiedzi())
    }, LIMIT_OTWARCIA_MS)
  })
  return Promise.race([otwarcie, limit]).finally(() => clearTimeout(czas))
}

async function wTransakcji(tryb, dzialanie) {
  const baza = await otworz()
  try {
    return await new Promise((ok, nie) => {
      const tx = baza.transaction(MAGAZYN, tryb)
      const zadanie = dzialanie(tx.objectStore(MAGAZYN))
      tx.oncomplete = () => ok(zadanie.result)
      tx.onerror = () => nie(tx.error || new Error('Błąd transakcji'))
      tx.onabort = () => nie(tx.error || new Error('Transakcja przerwana'))
    })
  } finally {
    baza.close()
  }
}

// iOS potrafi zerwac polaczenie z baza po uspieniu apki, dlatego kazda operacja otwiera baze od nowa
// i ma jedna ponowna probe. put jest idempotentny, wiec powtorzenie zapisu jest bezpieczne.
// Po przekroczeniu limitu czasu druga proba tylko wydluzylaby czekanie na komunikat.
async function zPonowieniem(operacja) {
  try {
    return await operacja()
  } catch (blad) {
    if (blad?.name === 'BazaNieOdpowiada') throw blad
    return await operacja()
  }
}

export async function wczytajTalie() {
  const rekord = await zPonowieniem(() => wTransakcji('readonly', (m) => m.get(KLUCZ_TALII)))
  if (rekord === undefined) return { slowa: [], talie: [] }
  if (!rekord || !Array.isArray(rekord.slowa)) throw new Error('Zapisana talia ma nieznany format')
  return { slowa: rekord.slowa, talie: Array.isArray(rekord.talie) ? rekord.talie : [] }
}

export function zapiszTalie({ slowa, talie }) {
  return zPonowieniem(() => wTransakcji('readwrite', (m) => m.put({ wersja: 1, slowa, talie }, KLUCZ_TALII)))
}

// Indeks kolizji pod kluczem zaleznym od talii: po jej zmianie stary wpis nie pasuje i zostaje przeliczony.
// Brak indeksu nie moze zatrzymac apki, wiec odczyt i zapis nie rzucaja, tylko zwracaja null / false.
export async function wczytajKolizje(klucz) {
  try {
    const rekord = await zPonowieniem(() => wTransakcji('readonly', (m) => m.get(KLUCZ_KOLIZJI)))
    if (!rekord || rekord.klucz !== klucz || typeof rekord.kolizje !== 'object') return null
    return rekord.kolizje
  } catch {
    return null
  }
}

export async function zapiszKolizje(klucz, kolizje) {
  try {
    await zPonowieniem(() => wTransakcji('readwrite', (m) => m.put({ klucz, kolizje }, KLUCZ_KOLIZJI)))
    return true
  } catch {
    return false
  }
}
