// App entry: styles, mounting the Svelte view, start and registering the service worker after the page loads.

import { mount } from 'svelte'
import './styles.css'
import App from './components/App.svelte'
import { registerWorker, start } from './app.svelte.js'

// The static skeleton from index.html ("Loading…") stays only for the fallback message, in case this module
// does not start. The Svelte view takes its place, before the fallback script.
const skeleton = document.getElementById('app')
const anchor = skeleton?.nextElementSibling ?? null
skeleton?.remove()
mount(App, { target: document.body, anchor })

start()

// In development mode (vite) there is no built sw.js, so no registration.
if (!import.meta.env.DEV) {
  if (document.readyState === 'complete') registerWorker()
  else window.addEventListener('load', registerWorker)
}
