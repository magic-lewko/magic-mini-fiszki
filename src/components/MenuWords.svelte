<script>
  // The word list: search in English and Polish, case and Polish letters do not matter. All words in pages of
  // LIST_PAGE rows, so going through the whole deck and removing known words is quick. "Remove" is the same as the
  // trash in study: the word leaves study for good, also after loading a new version of the deck.
  import * as study from '../study.js'
  import { ui } from '../ui.svelte.js'
  import { knownFromList, model, reportError, resetWord, restoreWord, skipFromList } from '../app.svelte.js'

  let removedView = $state(false)
  let limit = $state(study.LIST_PAGE)
  const skippedWords = $derived(model.state.pominiete)
  const found = $derived(study.searchWords(model.index, ui.search, limit, { skipped: skippedWords, removed: removedView }))
  const removedCount = $derived(model.index.filter((item) => study.isSkipped(skippedWords, item.word.id)).length)
  const cards = $derived(model.state.karty)

  // A new search or view starts from the first page.
  $effect(() => {
    ui.search
    removedView
    limit = study.LIST_PAGE
  })

  function showMore() {
    limit += study.LIST_PAGE
  }

  // Scrolling near the end of the list loads the next page by itself, the button stays as the visible way.
  function loadNearEnd(element) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) showMore()
    }, { rootMargin: '400px' })
    observer.observe(element)
    return () => observer.disconnect()
  }
</script>

<div class="section">
  <h3>Words</h3>
  <input
    class="search-field"
    id="search"
    type="search"
    bind:value={ui.search}
    spellcheck="false"
    autocapitalize="off"
    autocomplete="off"
    autocorrect="off"
    aria-label="Search word"
    placeholder="Search in English or Polish"
  />
  <div class="segments" style="margin-top: 8px" role="group" aria-label="Word list view">
    <button id="words-in-study" type="button" aria-pressed={String(!removedView)} onclick={() => (removedView = false)}>In study</button>
    <button id="words-removed" type="button" aria-pressed={String(removedView)} onclick={() => (removedView = true)}>Removed ({removedCount})</button>
  </div>
  <p class="muted small" id="word-count" style="margin-top: 8px">{found.total ? `showing ${found.words.length} of ${found.total}` : 'nothing found'}</p>
  <div class="word-list" id="word-list">
    {#each found.words as word (word.id)}
      {@const en = cards[study.cardKey(word.id, 'en')]}
      <div class="word-row">
        <div class="word-body">
          <div class="word-header"><b>{word.w}</b>{#if word.poziom}<span class="chip level">{word.poziom}</span>{/if}</div>
          <div class="muted">{word.pl}</div>
          <div class="muted small">{removedView ? 'removed' : study.cardStatus(en, new Date())}</div>
        </div>
        <div class="word-actions">
          {#if removedView}
            <button class="button small" type="button" onclick={() => restoreWord(word)}>Restore</button>
          {:else}
            <button class="button small remove-word" type="button" aria-label="Remove {word.w}" onclick={() => skipFromList(word)}>Remove</button>
            {#if study.isNew(en)}<button class="button small" type="button" onclick={() => knownFromList(word)}>Already know</button>{/if}
            <button class="button small" type="button" onclick={() => resetWord(word)}>Reset</button>
          {/if}
          <button class="button small" type="button" onclick={() => reportError(word)}>Report error</button>
        </div>
      </div>
    {/each}
  </div>
  {#if found.words.length < found.total}
    <button class="button" id="words-more" type="button" style="margin-top: 8px; width: 100%" {@attach loadNearEnd} onclick={showMore}>Show more ({found.total - found.words.length} left)</button>
  {/if}
</div>
