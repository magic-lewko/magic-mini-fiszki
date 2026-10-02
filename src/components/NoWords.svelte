<script>
  // An empty deck: one sentence and three ways in, the built-in 5000 words, pasting a list or loading a backup.
  import { reloadWords, showAddWords } from '../app.svelte.js'
</script>

<section class="screen">
  <div class="logo">🃏</div>
  <h2>Add words to start</h2>
  <p class="muted">Load the 5000 words deck (A1 to C1), or paste your own list. Words stay on the phone and work offline.</p>
  <div class="buttons">
    <button class="button primary" id="load-built-in" type="button" onclick={reloadWords}>Load 5000 words</button>
    <button class="button" type="button" onclick={() => showAddWords()}>Add words</button>
    <label class="button" for="backup-file">Load backup</label>
  </div>
</section>
