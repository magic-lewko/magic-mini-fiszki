<script>
  // A hard word (A7): after every 6 mistakes the card gets a panel with three choices.
  import { keepLeech, postponeLeech, skipLeech } from '../app.svelte.js'

  let { data } = $props()
</script>

<section class="screen">
  <h2>This word is hard for you</h2>
  <p class="muted">{data.text}</p>
  <div class="buttons">
    <button class="button primary" type="button" onclick={() => postponeLeech(data.key)}>Put away for 3 weeks</button>
    <button class="button" type="button" onclick={() => skipLeech(data.key)}>Skip</button>
    <button class="button" type="button" onclick={() => keepLeech(data.key)}>Keep learning</button>
  </div>
</section>
