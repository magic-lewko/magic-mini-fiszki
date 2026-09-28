<script>
  // Decks (H): the switch "study this deck" and removing a whole deck with its progress.
  import * as study from '../study.js'
  import { model, removeDeck, showAddWords, toggleDeck } from '../app.svelte.js'

  const list = $derived(study.deckList({ words: model.words, cards: model.state.karty, disabledDecks: model.state.ustawienia.wylaczoneTalie || [] }))
</script>

<div class="section" id="decks-section">
  <h3>Decks</h3>
  {#if !list.length}<p class="muted">You have no deck yet.</p>{/if}
  {#each list as d}
    <div class="deck-row">
      <div class="deck-info"><span class="deck-name">{d.name}</span><span class="muted small">{`${d.known} / ${d.total} known${d.enabled ? '' : ' · not in study'}`}</span></div>
      <button class="toggle" type="button" role="switch" data-deck={d.name} aria-checked={String(d.enabled)} aria-label="Study deck {d.name}" onclick={() => toggleDeck(d.name, !d.enabled)}></button>
      <div class="deck-actions"><button class="button small" type="button" aria-label="Remove deck {d.name}" onclick={() => removeDeck(d.name)}>Remove</button></div>
    </div>
  {/each}
  <div class="buttons" style="margin-top: 10px">
    <button class="button" id="add-deck" type="button" onclick={() => showAddWords()}>Add deck</button>
  </div>
</div>
