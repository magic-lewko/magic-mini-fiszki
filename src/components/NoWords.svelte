<script>
  // An empty deck: one sentence and two ways in, pasting a list or loading a backup from another phone.
  import { showAddWords } from '../app.svelte.js'
</script>

<section class="screen">
  <div class="logo">🃏</div>
  <h2>Add words to start</h2>
  <p class="muted">Paste a list or load a file (for example oxford3000.json from Files or iCloud). Words stay on the phone and work offline.</p>
  <div class="buttons">
    <button class="button primary" type="button" onclick={() => showAddWords()}>Add words</button>
    <label class="button" for="backup-file">Load backup</label>
  </div>
</section>
