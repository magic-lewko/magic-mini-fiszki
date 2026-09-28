<script>
  // Offline mode state: the service worker, files in the cache, persistent storage and a manual update check.
  import { ui } from '../ui.svelte.js'
  import { checkForUpdate, model, offlineReady } from '../app.svelte.js'
  import Row from './Row.svelte'

  const view = $derived.by(() => {
    void model.state
    const offline = ui.offline
    if (!('serviceWorker' in navigator)) {
      return { error: 'This browser does not support offline mode. On iPhone open the app from the icon on the home screen (HTTPS address).' }
    }
    if (!navigator.serviceWorker.controller) return { error: 'Offline mode does not work yet. Wait a moment with internet or close and open the app.' }
    if (offline?.error) return { error: `Could not check the state: ${offline.error}` }
    if (offline) return { status: offline, ready: offlineReady() }
    return { checking: true }
  })
  const persistent = $derived(ui.persistent === null ? 'unknown' : ui.persistent ? 'yes' : 'no')
</script>

<div class="section" id="offline-section">
  <h3>Offline</h3>
  {#if view.error}
    <p class="error-text">{view.error}</p>
  {:else if view.status}
    {#if view.ready}<p>Ready to work without internet ✓</p>{:else}<p class="error-text">Not all files are saved. Open the app with internet.</p>{/if}
    <Row name="Version" value={view.status.version} />
    <Row name="Saved files" value={`${view.status.saved}/${view.status.files}`} />
  {:else}
    <p class="muted">Checking…</p>
  {/if}
  <Row name="Persistent storage" value={persistent} />
  <div class="button-row"><button class="button small" type="button" onclick={checkForUpdate}>Check for update</button></div>
</div>
