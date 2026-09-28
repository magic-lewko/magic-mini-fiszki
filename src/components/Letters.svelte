<script>
  // G2. Letters: the Polish meaning at the top, places for the letters of the answer and scattered tiles.
  import { SHAKE_MS } from '../text.js'
  import { ui } from '../ui.svelte.js'
  import { addTile, lettersHint, removeTile } from '../games.svelte.js'
  import GameTopBar from './GameTopBar.svelte'

  const game = $derived(ui.game)
  let tiles
  const shakeAtStart = ui.shake

  // A mistake shakes the tiles. We remove the class and add it again after a style recalculation, so the shake
  // starts also at the second mistake in a row.
  $effect(() => {
    if (ui.shake === shakeAtStart || !tiles) return
    tiles.classList.remove('shake')
    void tiles.offsetWidth
    tiles.classList.add('shake')
    setTimeout(() => tiles?.classList.remove('shake'), SHAKE_MS)
  })
</script>

<section class="screen game letters">
  <GameTopBar title={game.progress} titleId="letters-progress" closeId="letters-close" />
  <h2 class="letters-meaning" id="letters-meaning">{game.pl}</h2>
  <!-- A tap on the answer takes off the last letter. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="letters-answer" class:success={game.success} id="letters-answer" aria-live="polite" onclick={removeTile}>{#each game.slots as char}<span class="letters-slot" class:full={!!char}>{char}</span>{/each}</div>
  <div class="letters-tiles" id="letters-tiles" bind:this={tiles}>{#each game.tiles as tile, i}<button class="tile" class:used={tile.used} type="button" data-index={i} disabled={tile.used} onclick={() => addTile(i)}>{tile.char}</button>{/each}</div>
  <div class="game-buttons">
    <button class="button" id="letters-hint" type="button" onclick={lettersHint}>{`Hint (${game.hints})`}</button>
  </div>
</section>
