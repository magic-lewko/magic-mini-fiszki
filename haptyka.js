// Wibracje. iOS Safari nie ma navigator.vibrate; jedyny dzialajacy sposob to przelacznik
// <input type="checkbox" switch>, ktory przy zmianie stanu daje systemowy "klik" haptyczny.
// Od iOS 26.5 nie dziala programowe klikniecie, tylko prawdziwe tapniecie, dlatego przelacznik
// lezy niewidocznie na calej powierzchni elementu, w ktory tapie uzytkownik.
// Akcje obsluguje zdarzenie click na rodzicu: tapniecie w przelacznik daje jedno klikniecie, ktore wyplywa w gore.

const WZORY = {
  odsloniecie: 20,
  umiem: [40, 30, 40],
  prawie: [30, 25, 30],
  nieUmiem: 60,
  combo: [25, 20, 25, 20, 60],
  koniec: [50, 40, 50, 40, 160],
  awans: [60, 40, 90, 40, 60, 40, 220],
}

export function dodajPrzelacznik(rodzic) {
  const przelacznik = document.createElement('input')
  przelacznik.type = 'checkbox'
  przelacznik.setAttribute('switch', '')
  przelacznik.className = 'haptyka'
  przelacznik.tabIndex = -1
  przelacznik.setAttribute('aria-hidden', 'true')
  rodzic.append(przelacznik)
  return przelacznik
}

// Android i reszta. Brak wsparcia albo blokada przegladarki to po prostu cisza.
export function wibruj(rodzaj) {
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(WZORY[rodzaj] ?? 20)
  } catch {
    // brak wibracji nie jest bledem
  }
}
