<script>
  // Banners: only on the home screen (after a session) and in the menu, never during a card.
  import { count, daysSince } from '../text.js'
  import { ui } from '../ui.svelte.js'
  import { applyUpdate, backupNeeded, makeBackup, model } from '../app.svelte.js'

  const needed = $derived(model.state && backupNeeded())
  const last = $derived(model.state.ostatniaKopia)
</script>

<div class="banners">
  {#if ui.newVersion}
    <div class="banner"><span>New version ready - restart</span><button class="button small" type="button" onclick={applyUpdate}>Restart</button></div>
  {/if}
  {#if needed}
    <div class="banner backup"><span>{last ? `Last backup ${count(daysSince(last), 'day', 'days')} ago` : 'You have no backup yet'}</span><button class="button small" type="button" onclick={makeBackup}>Save backup</button></div>
  {/if}
</div>
