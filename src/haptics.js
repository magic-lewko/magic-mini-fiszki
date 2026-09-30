// Vibration. iOS Safari has no navigator.vibrate; the only way that works is a switch
// <input type="checkbox" switch>, which gives a system haptic "click" when its state changes.
// Since iOS 26.5 a programmatic click does not work, only a real tap, so the switch lies invisibly
// over the whole element the user taps.
// Actions are handled by the click event on the parent: a tap on the switch gives one click that bubbles up.

// Stronger and longer than a light tick, so every action is clearly felt.
const PATTERNS = {
  tap: 25,
  reveal: 35,
  know: [50, 40, 50],
  almost: [40, 35, 40],
  dontKnow: [90, 50, 90],
  discard: [30, 30, 30, 30, 70],
  combo: [35, 25, 35, 25, 80],
  end: [60, 40, 60, 40, 200],
  levelUp: [60, 40, 90, 40, 60, 40, 220],
}

export function addSwitch(parent) {
  const toggle = document.createElement('input')
  toggle.type = 'checkbox'
  toggle.setAttribute('switch', '')
  toggle.className = 'haptic'
  toggle.tabIndex = -1
  toggle.setAttribute('aria-hidden', 'true')
  parent.append(toggle)
  return toggle
}

// Android and the rest. No support or a browser block is simply silence.
export function vibrate(kind) {
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tap)
  } catch {
    // no vibration is not an error
  }
}

// Haptics (iPhone): the system click comes only from an <input switch> really tapped with a finger,
// a programmatic click does not work since iOS 26.5. So every button in the app gets its own invisible
// switch. The observer also catches buttons drawn later, because Svelte draws screens again at every change.
// The class with-haptic (position: relative) is added outside Svelte, so buttons in components have a fixed
// class and change it only with class: directives, which do not overwrite the whole className.
// A grade swipe does not vibrate and cannot: a swipe is not a tap on the switch.
export function watchHaptics(root = document.body) {
  const add = (node) => {
    if (!(node instanceof Element)) return
    const buttons = node.matches('button') ? [node, ...node.querySelectorAll('button')] : [...node.querySelectorAll('button')]
    for (const button of buttons) {
      if (button.classList.contains('sr-only') || button.querySelector('.haptic')) continue
      button.classList.add('with-haptic')
      addSwitch(button)
    }
  }
  add(root)
  const observer = new MutationObserver((changes) => {
    for (const change of changes) for (const node of change.addedNodes) add(node)
  })
  observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}
