<script>
  // The home screen (E): the review button and the menu in the corner, with no numbers. It shows after a session,
  // after leaving study and when there is nothing to review.
  import { ui } from '../ui.svelte.js'
  import { addNewToday, endCelebration, startSession } from '../app.svelte.js'
  import Banners from './Banners.svelte'

  let { data } = $props()
  const p = $derived(data.progress)
  const hasCards = $derived(data.hasCards)
</script>

<!-- The session end celebration can be skipped with a tap anywhere on the screen. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<section class="screen home" class:celebrating={ui.celebrating} onclick={endCelebration}>
  {#if !hasCards}
    <p class="muted">{p.total === 0 ? 'All decks are off. Turn them on in Menu > Decks.' : 'All done for today. Come back tomorrow.'}</p>
  {/if}
  <div class="home-buttons">
    <!-- When there is nothing to review, "+10" stands next to the disabled button: it adds ten new words
         for today, so you can keep studying without going into the menu. -->
    <div class="home-row">
      <button class="button primary large" id="play-reviews" type="button" disabled={!hasCards} onclick={() => startSession()}>Reviews</button>
      {#if !hasCards}
        <button class="button large add-more" id="add-new" type="button" aria-label="Add ten new words for today" onclick={addNewToday}>+10</button>
      {/if}
    </div>
  </div>
  <Banners />
</section>
