<script>
  // Menu: a sheet with sections in the order people look for them: stats, decks, words, how to learn,
  // settings, backup, offline, sources. Reported errors are conditional and stand next to the words they are about.
  // The content is counted again after every save (ui.version), and the scroll position stays.
  import * as study from '../study.js'
  import { ui } from '../ui.svelte.js'
  import {
    addNewToday,
    clearReports,
    closeMenu,
    copyReports,
    hardCount,
    hardSession,
    hasNewToIntroduce,
    makeBackup,
    model,
    showAddWords,
    showGuide,
    showTutorial,
    undoGrade,
  } from '../app.svelte.js'
  import Banners from './Banners.svelte'
  import MenuStats from './MenuStats.svelte'
  import MenuDecks from './MenuDecks.svelte'
  import MenuWords from './MenuWords.svelte'
  import MenuSettings from './MenuSettings.svelte'
  import MenuOffline from './MenuOffline.svelte'

  const state = $derived(model.state)
  const canUndo = $derived(!!model.session && !!model.undo)
  const hard = $derived((void model.state, hardCount()))
  const newToIntroduce = $derived((void model.state, hasNewToIntroduce()))

  // Reports text to copy by hand: selected at once when the clipboard is not available.
  function select(field) {
    field.focus()
    field.select()
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay-backdrop" onclick={closeMenu}></div>
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<section class="sheet" role="dialog" aria-label="Menu">
  <header class="sheet-header"><h2>Menu</h2><button class="close" type="button" aria-label="Close" onclick={closeMenu}>✕</button></header>
  <div class="sheet-body">
    <div class="section">
      <Banners />
      <div class="buttons" style="margin-top: 8px">
        {#if canUndo}<button class="button" type="button" onclick={undoGrade}>Undo last grade</button>{/if}
        <button class="button" type="button" disabled={hard === 0} onclick={hardSession}>{hard ? `Hard words (${hard})` : 'No hard words'}</button>
        {#if newToIntroduce}<button class="button" id="more-new" type="button" onclick={addNewToday}>{`+${study.EXTRA_NEW} new today`}</button>{/if}
        <button class="button" id="open-gestures" type="button" onclick={showTutorial}>Gestures</button>
        <button class="button primary" type="button" onclick={() => showAddWords()}>Add words</button>
      </div>
    </div>
    <MenuStats />
    <MenuDecks />
    <MenuWords />
    {#if state.zgloszenia.length}
      <div class="section">
        <h3>Reported errors</h3>
        {#each state.zgloszenia as r}<p class="small">{`${r.w} - ${r.pl}`}</p>{/each}
        <div class="button-row">
          <button class="button small" type="button" onclick={copyReports}>Copy list</button>
          <button class="button small" type="button" onclick={clearReports}>Clear</button>
        </div>
        <div id="reports-text">{#if ui.reportsText}<textarea class="field" rows="6" readonly aria-label="Reported errors" value={ui.reportsText} use:select></textarea>{/if}</div>
      </div>
    {/if}
    <div class="section">
      <h3>How to learn</h3>
      <p class="caption">Seven rules, each from research: how much, when, in what order and what not to do.</p>
      <div class="buttons" style="margin-top: 10px">
        <button class="button" id="open-guide" type="button" onclick={showGuide}>Open the guide</button>
      </div>
    </div>
    <MenuSettings />
    <div class="section">
      <h3>Backup</h3>
      <p>{state.ostatniaKopia ? `Last backup: ${new Date(state.ostatniaKopia).toLocaleString('en-GB')}` : 'You have no backup yet.'}</p>
      <p class="caption">The backup has the words and all progress. On a new phone just load it.</p>
      <div class="button-row">
        <button class="button" type="button" onclick={makeBackup}>Save backup</button>
        <label class="button" for="backup-file">Load backup</label>
      </div>
    </div>
    <MenuOffline />
    <div class="section">
      <h3>Sources and license</h3>
      {#each model.decks as d}<p>{d.zrodlo ? `${d.nazwa}: ${d.zrodlo}` : d.nazwa}</p>{/each}
      {#if !model.decks.length}<p class="muted">No decks added.</p>{/if}
      <p class="muted">Review algorithm: FSRS-6 (open-spaced-repetition, MIT license). Pronunciation: the system speech synthesis. Words come from files added in the app.</p>
    </div>
  </div>
</section>
