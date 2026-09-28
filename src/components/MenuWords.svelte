<script>
  // The word list: search in English and Polish, case and Polish letters do not matter.
  import * as study from '../study.js'
  import { ui } from '../ui.svelte.js'
  import { knownFromList, model, reportError, resetWord, restoreWord, skipFromList } from '../app.svelte.js'

  const found = $derived(study.searchWords(model.index, ui.search))
  const cards = $derived(model.state.karty)
  const skippedWords = $derived(model.state.pominiete)
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
  <p class="muted small" id="word-count" style="margin-top: 8px">{found.total ? `showing ${found.words.length} of ${found.total}` : 'nothing found'}</p>
  <div class="word-list" id="word-list">
    {#each found.words as word (word.id)}
      {@const en = cards[study.cardKey(word.id, 'en')]}
      {@const skipped = study.isSkipped(skippedWords, word.id)}
      <div class="word-row">
        <div class="word-body">
          <div class="word-header"><b>{word.w}</b>{#if word.poziom}<span class="chip level">{word.poziom}</span>{/if}</div>
          <div class="muted">{word.pl}</div>
          <div class="muted small">{study.cardStatus(en, new Date(), skipped)}</div>
        </div>
        <div class="word-actions">
          {#if skipped}<button class="button small" type="button" onclick={() => restoreWord(word)}>Restore</button>{/if}
          {#if !skipped && study.isNew(en)}<button class="button small" type="button" onclick={() => knownFromList(word)}>Already know</button>{/if}
          <!-- The study screen has no "Skip" button (B), so the only visible way out for a word is here. -->
          {#if !skipped}<button class="button small" type="button" onclick={() => skipFromList(word)}>Skip</button>{/if}
          {#if !skipped}<button class="button small" type="button" onclick={() => resetWord(word)}>Reset</button>{/if}
          <button class="button small" type="button" onclick={() => reportError(word)}>Report error</button>
        </div>
      </div>
    {/each}
  </div>
</div>
