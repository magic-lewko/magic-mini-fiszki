<script>
  // Game result: three numbers and two ways out, as on the session end screen. No grades and no due dates.
  import { showHome } from '../app.svelte.js'
  import StatTile from './StatTile.svelte'

  let { data } = $props()
</script>

<section class="screen">
  <div class="session-end">
    <h2>{data.title}</h2>
    <div class="stats three">{#each data.numbers as [number, label, tone]}<StatTile {number} {label} {tone} />{/each}</div>
    <div class="buttons">
      <button class="button primary" id="play-again" type="button" onclick={data.again}>Play again</button>
      <button class="button" id="game-back" type="button" onclick={() => showHome()}>Back</button>
    </div>
  </div>
</section>
