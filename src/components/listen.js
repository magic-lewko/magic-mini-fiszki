// A direct event listener on an element (for {@attach}) instead of Svelte event delegation.
// Delegation works through bubbling, and an input event sent by a script without bubbles (for example autofill,
// browser tests) does not reach it. Form fields must react as in the version without a framework.

import { on } from 'svelte/events'

export const listen = (type, handler) => (element) => on(element, type, handler)
