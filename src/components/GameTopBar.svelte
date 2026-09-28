<script>
  // The game top bar: title or progress and the cross to leave (games have no way out by swipe).
  import { leaveGame } from '../games.svelte.js'

  let { title, titleId, closeId } = $props()
</script>

<div class="game-top"><span class="game-title" id={titleId}>{title}</span><button class="close" id={closeId} type="button" aria-label="Close game" onclick={leaveGame}>✕</button></div>
