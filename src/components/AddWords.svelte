<script>
  // Adding words: pasted text or a file, the deck name and a preview before saving.
  import * as study from '../study.js'
  import { ui } from '../ui.svelte.js'
  import { listen } from './listen.js'
  import { addWords, closeAddWords, deckNameChanged, importDeckName, model, pastedChanged } from '../app.svelte.js'

  // The link to a backup only with an empty deck, counted when the sheet opens.
  const noWords = !model.words.length
  const preview = $derived(ui.preview)
</script>

<div class="overlay-backdrop"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<section class="sheet full" role="dialog" aria-label="Add words">
  <header class="sheet-header"><h2>Add words</h2><button class="close" type="button" aria-label="Close" onclick={closeAddWords}>✕</button></header>
  <div class="sheet-body">
    <p class="caption">Paste a list or load a .json or .txt file. In text, one line is one word: english ; polish, then optionally ; sentence ; Polish sentence (a tab can be used instead of a semicolon). Case matters: May and may are two different words. Progress of existing words stays.</p>
    <div class="button-row"><label class="button" for="words-file">Load from file</label><span class="muted" id="file-info">{ui.fileInfo}</span></div>
    <!-- Deck name (H): by default the one from the file or "Pasted YYYY-MM-DD", until the user changes it. -->
    <label class="field-label" for="deck-name-input">Deck name</label>
    <input
      class="search-field"
      id="deck-name-input"
      type="text"
      maxlength={study.MAX_DECK_NAME_CHARS}
      spellcheck="false"
      autocomplete="off"
      aria-label="Deck name"
      placeholder="for example Oxford 3000"
      bind:value={ui.deckName}
      {@attach listen('input', deckNameChanged)}
    />
    <label class="field-label" for="paste">Paste</label>
    <textarea
      class="field"
      id="paste"
      rows="7"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      autocorrect="off"
      placeholder={'apple ; jabłko\nice cream ; lody ; I like ice cream. ; Lubię lody.'}
      bind:value={ui.pasted}
      {@attach listen('input', pastedChanged)}
    ></textarea>
    <div class="preview" id="preview" aria-live="polite">
      {#if preview?.loading}
        <p class="muted">Loading the file…</p>
      {:else if preview?.error}
        <p class="error-text">{preview.error}</p>
      {:else if preview}
        <p class="summary">{preview.summary}</p>
        <p class="muted" id="preview-deck" data-rest={preview.rest}>{`Deck: ${importDeckName()}${preview.rest}`}</p>
        {#if preview.errors.length > 0}
          <ul class="errors">
            {#each preview.errors as error}<li>{error}</li>{/each}
            {#if preview.more > 0}<li>{`and ${preview.more} more`}</li>{/if}
          </ul>
        {/if}
        {#if preview.nothingToAdd}<p class="muted">Nothing to add.</p>{/if}
      {/if}
      {#if ui.addError}<p class="error-text">{ui.addError}</p>{/if}
    </div>
    <div class="buttons" style="margin-top: 14px">
      <button class="button primary" id="add-words-button" type="button" disabled={ui.addDisabled} onclick={addWords}>{ui.addLabel}</button>
    </div>
    {#if noWords}
      <p class="caption" style="margin-top: 18px">Have a backup from another phone? <label for="backup-file" style="text-decoration: underline">Load backup</label></p>
    {/if}
  </div>
</section>
