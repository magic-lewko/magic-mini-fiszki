<script>
  // The home screen (E): the whole deck bar with one number, three big buttons and the menu in the corner. It shows
  // after a session, after leaving study and when there is nothing to review. Then instead of an empty message
  // it offers games. After a session the summary stands above the bar (D): at most three numbers.
  import { ui } from '../ui.svelte.js'
  import { addNewToday, endCelebration, startSession } from '../app.svelte.js'
  import { startCrossword, startLetters } from '../games.svelte.js'
  import Banners from './Banners.svelte'
  import StatTile from './StatTile.svelte'

  let { data } = $props()
  const summary = $derived(data.summary)
  const p = $derived(data.progress)
  const hasCards = $derived(data.hasCards)
</script>

<!-- The session end celebration can be skipped with a tap anywhere on the screen. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<section class="screen home" class:celebrating={ui.celebrating} onclick={endCelebration}>
  {#if summary}
    <div class="session-end">
      <h2>{summary.title}</h2>
      <div class="stats {summary.size}">{#each summary.numbers as [number, label, tone]}<StatTile {number} {label} {tone} />{/each}</div>
    </div>
  {/if}
  <div class="deck-summary">
    <div class="deck-track"><i class="known" style="transform: scaleX({p.knownRatio})"></i><i class="solid" style="transform: scaleX({p.solidRatio})"></i></div>
    <div class="deck-count">{`${p.known} / ${p.total}`}</div>
  </div>
  {#if !hasCards}
    <p class="muted">{p.total === 0 ? 'All decks are off. Turn them on in Menu > Decks.' : 'All done for today. Play a game or come back tomorrow.'}</p>
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
    <button class="button large" id="play-crossword" type="button" onclick={startCrossword}>Crossword</button>
    <button class="button large" id="play-letters" type="button" onclick={startLetters}>Letters</button>
  </div>
  <Banners />
</section>
