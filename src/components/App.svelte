<script>
  // The app frame: top bar, stage with the screen, footer for the screen reader, overlays and messages.
  // styles.css and browser-tests.mjs depend on the layout and class names, so the DOM matches the version
  // without a framework.
  import { onMount } from 'svelte'
  import { SWIPES, errorText } from '../text.js'
  import { ui, toast, setMessage } from '../ui.svelte.js'
  import { watchHaptics } from '../haptics.js'
  import { listen } from './listen.js'
  import { closeTutorialByTap, loadBackup, loadWordsFile, onKey, onVisibilityChange, openMenu } from '../app.svelte.js'
  import Card from './Card.svelte'
  import Home from './Home.svelte'
  import NoWords from './NoWords.svelte'
  import Leech from './Leech.svelte'
  import Menu from './Menu.svelte'
  import Guide from './Guide.svelte'
  import AddWords from './AddWords.svelte'
  import Tutorial from './Tutorial.svelte'

  let flashElement

  const swipe = $derived(SWIPES[ui.swipeDirection])

  // The edge flash: the animation starts again at every grade, so we remove the classes and add them again
  // after a style recalculation. The element stays the same for the whole life of the app.
  $effect(() => {
    const f = ui.flash
    if (!f.nr || !flashElement) return
    flashElement.hidden = false
    flashElement.classList.remove('visible', 'weak', 'flash-yes', 'flash-no', 'flash-discard')
    void flashElement.offsetWidth
    flashElement.classList.add('visible', `flash-${f.tone}`)
    if (!f.strong) flashElement.classList.add('weak')
  })

  $effect(() => {
    if (ui.flashVisible || !flashElement) return
    flashElement.hidden = true
    flashElement.classList.remove('visible')
  })

  const pickFile = (action) => (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) action(file)
  }

  onMount(() => {
    const stopHaptics = watchHaptics(document.body)
    // We block pinching only over the card, so a grade swipe does not turn into zoom. On other screens
    // text zoom stays available (WCAG 1.4.4).
    const pinch = (e) => {
      if (e.target?.closest?.('#card')) e.preventDefault()
    }
    // Without a touchstart listener iOS does not show the :active state on buttons.
    const touch = () => {}
    document.addEventListener('gesturestart', pinch)
    document.addEventListener('touchstart', touch, { passive: true })
    return () => {
      stopHaptics()
      document.removeEventListener('gesturestart', pinch)
      document.removeEventListener('touchstart', touch)
    }
  })
</script>

<svelte:document onkeydown={onKey} onvisibilitychange={onVisibilityChange} />
<svelte:window onerror={(e) => toast(`Error: ${e.message}`, 'error')} onunhandledrejection={(e) => toast(`Error: ${errorText(e.reason)}`, 'error')} />

<div id="app" class:studying={ui.screen === 'card'}>
  <!-- The top of the study screen is only a thin progress bar of the whole deck: no digits, no rank, no streak
       and no menu button (B). The fill is known words, the lighter part is solid words.
       The menu and the offline badge show only outside study. -->
  <header class="top">
    <div id="deck-progress" class="deck-progress" role="progressbar" aria-label={ui.bar?.label ?? 'Deck progress'}><i id="bar-known" class="bar-known" style:transform={ui.bar ? `scaleX(${ui.bar.known})` : null}></i><i id="bar-solid" class="bar-solid" style:transform={ui.bar ? `scaleX(${ui.bar.solid})` : null}></i></div>
    <button id="offline" class="badge" class:ok={ui.badgeOk} type="button" hidden={ui.badgeHidden} onclick={openMenu}>{ui.badgeOk ? 'offline ✓' : '⚠ not offline'}</button>
    <button id="menu-button" class="menu-button" type="button" aria-label="Menu" hidden={ui.menuButtonHidden} onclick={openMenu}>⋯</button>
  </header>
  <main id="stage" class="stage">
    {#key ui.screenNr}
      {#if ui.screen === 'card'}
        <Card data={ui.data} />
      {:else if ui.screen === 'home'}
        <Home data={ui.data} />
      {:else if ui.screen === 'no-words'}
        <NoWords />
      {:else if ui.screen === 'leech'}
        <Leech data={ui.data} />
      {:else if ui.screen === 'start-error'}
        <section class="screen"><h2>Could not start</h2><p class="muted">{ui.data.text}</p></section>
      {:else}
        <section class="screen"><p class="muted">Loading…</p></section>
      {/if}
    {/key}
  </main>
  <!-- The bottom of the study screen is empty. Only buttons for the screen reader stay here (class "sr-only"),
       because without them an app driven only by swipes would be unusable with VoiceOver. -->
  <footer id="actions" class="actions" hidden={!ui.actions}>
    {#each ui.actions ?? [] as action}
      <button class="sr-only" type="button" onclick={action.action}>{action.text}</button>
    {/each}
  </footer>
  <!-- The swipe direction stands above the card, not in it: the card moves away with the finger, and the status
       must stay in the middle of the screen and be readable until the finger lets go. -->
  <div id="swipe-marker" class={swipe ? `swipe-marker visible ${swipe.tone}` : 'swipe-marker'} aria-hidden="true">
    <span class="swipe-icon">{swipe ? swipe.icon : ''}</span>
    <span class="swipe-label">{swipe ? swipe.label : ''}</span>
  </div>
  <div id="note" class="note" role="status" hidden={!ui.noteVisible}>{ui.note}</div>
  <div id="flash" class="flash" aria-hidden="true" hidden bind:this={flashElement}></div>
</div>

<div id="messages" class="messages" aria-live="assertive">
  {#each ui.messages as m (m.key)}
    <div class="message" role="alert"><span>{m.text}</span>{#if m.closable}<button class="close" type="button" aria-label="Close" onclick={() => setMessage(m.key, '')}>✕</button>{/if}</div>
  {/each}
</div>
<div id="menu" class="overlay" hidden={!ui.menu}>
  {#if ui.menu}<Menu />{/if}
</div>
<div id="guide" class="overlay" hidden={!ui.guide}>
  {#if ui.guide}<Guide />{/if}
</div>
<div id="add-words" class="overlay" hidden={!ui.addWords}>
  {#if ui.addWords}
    {#key ui.addWordsNr}<AddWords />{/key}
  {/if}
</div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div id="tutorial" class="tutorial" hidden={!ui.tutorial} onpointerdown={closeTutorialByTap}>
  {#if ui.tutorial}<Tutorial />{/if}
</div>
<div id="toast" class="toast {ui.toast.kind}" role="status" hidden={!ui.toastVisible}>{ui.toast.text}</div>
<input id="words-file" class="hidden-file" type="file" accept=".json,.txt,application/json,text/plain" {@attach listen('change', pickFile(loadWordsFile))} />
<input id="backup-file" class="hidden-file" type="file" accept=".json,.txt,application/json,text/plain" {@attach listen('change', pickFile(loadBackup))} />
