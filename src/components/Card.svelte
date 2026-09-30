<script module>
  // Tap state lives longer than one card: a second tap on the new card within 280 ms undoes the grade of the previous one.
  // -Infinity, not 0: performance.now() right after the app starts is small, so zero would treat
  // the first tap as the second tap of a pair and try to undo a grade instead of revealing.
  let lastTap = -Infinity
  let ignoreClick = false
</script>

<script>
  // The study card and swipes in four directions (A). The card follows the finger on both axes and turns a little
  // on a horizontal move. After crossing the threshold (90 px horizontally, 80 px vertically or a fast flick) the
  // direction lights up with the color and icon of the status, before the user lets go. Right "Know", left "Don't know",
  // up "Almost", down trash. Each works also on a hidden card. Below MOVE_THRESHOLD lifting the finger counts as a tap.
  // The same four actions are buttons under the card: a swipe is easy to miss, and only a tap vibrates on the iPhone.
  // The card shows only the word and its translation, nothing else.
  import * as study from '../study.js'
  import { SWIPES } from '../text.js'
  import { ui } from '../ui.svelte.js'
  import { exitToHome, gradeCard, isBusy, pronounce, reveal, skipCurrent, undoGrade } from '../app.svelte.js'

  let { data } = $props()

  // The screen is drawn again for every card (a key in App.svelte), so the card data is fixed.
  const word = $derived(data.word)
  const c = $derived(ui.card)

  let card
  let touch = null

  const highlight = (direction) => {
    const known = !!SWIPES[direction]
    ui.card.threshold = known
    ui.card.swipe = known ? direction : ''
    ui.swipeDirection = known ? direction : ''
  }

  // A micro reaction from I: after crossing the threshold the card "snaps" to 1.02. The scale is in the same
  // transform as the movement, because that one follows the finger and would override a class.
  const move = (dx, dy, atThreshold = false) => {
    ui.card.transform = !dx && !dy ? '' : `translate(${dx}px, ${dy}px) rotate(${dx * 0.04}deg)${atThreshold ? ' scale(1.02)' : ''}`
  }

  const clear = () => {
    highlight('')
    ui.card.dragging = false
    move(0, 0)
  }

  function pointerDown(e) {
    if (touch || isBusy() || (e.pointerType === 'mouse' && e.button !== 0)) return
    ignoreClick = false
    touch = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, dy: 0, vx: 0, vy: 0, dragging: false }
  }

  function pointerMove(e) {
    if (!touch || e.pointerId !== touch.id) return
    const dx = e.clientX - touch.x0
    const dy = e.clientY - touch.y0
    if (!touch.dragging && Math.hypot(dx, dy) > study.MOVE_THRESHOLD && !isBusy()) {
      touch.dragging = true
      ui.card.entering = false
      ui.card.dragging = true
      try {
        card.setPointerCapture(e.pointerId)
      } catch {
        // without capture the swipe works, only a mouse can lose the card outside its area
      }
    }
    const dt = e.timeStamp - touch.t
    if (dt > 0) {
      touch.vx = 0.8 * ((e.clientX - touch.x) / dt) + 0.2 * touch.vx
      touch.vy = 0.8 * ((e.clientY - touch.y) / dt) + 0.2 * touch.vy
    }
    touch.x = e.clientX
    touch.y = e.clientY
    touch.t = e.timeStamp
    touch.dx = dx
    touch.dy = dy
    if (!touch.dragging) return
    // The highlight comes only from the distance, without the flick: it shows "if I let go now, this happens".
    const direction = study.swipeDirection({ dx, dy })
    const active = study.swipeAllowed(direction) ? direction : ''
    move(dx, dy, !!active)
    highlight(active)
  }

  function release(e, cancelled) {
    if (!touch || e.pointerId !== touch.id) return
    const { dragging, dx, dy, t } = touch
    // stopping the finger before letting go is not a flick
    const fresh = e.timeStamp - t <= 100
    const direction = study.swipeDirection({ dx, dy, vx: fresh ? touch.vx : 0, vy: fresh ? touch.vy : 0 })
    touch = null
    if (!dragging) return
    ignoreClick = true
    if (!cancelled && study.swipeAllowed(direction)) {
      highlight('')
      ui.card.dragging = false
      // Down is the trash: a word you surely know leaves study. You leave the session with the cross at the top.
      if (direction === 'down') {
        skipCurrent()
        return
      }
      gradeCard(study.gradeFromSwipe(direction))
      return
    }
    // Below the threshold the card goes back to the center.
    highlight('')
    ui.card.dragging = false
    ui.card.transition = 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'
    move(0, 0)
    setTimeout(() => {
      ui.card.transition = ''
    }, 240)
  }

  // A tap on the haptic switch comes here as one click. The first tap works at once (reveal) and waits for nothing;
  // a second one within 280 ms undoes the last grade.
  function click(e) {
    if (ignoreClick) {
      ignoreClick = false
      return
    }
    if (e.target.closest('.speaker, .no-reveal')) return
    const now = performance.now()
    const double = now - lastTap < study.DOUBLE_TAP_MS
    lastTap = now
    if (double) {
      lastTap = -Infinity
      undoGrade()
      return
    }
    reveal()
  }
</script>

<!-- The card is the swipe surface. The screen reader has the same actions in hidden buttons under the card (App.svelte). -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  id="card"
  bind:this={card}
  class="card direction-{data.direction}"
  class:entering={c.entering}
  class:revealed={c.revealed}
  class:dragging={c.dragging}
  class:threshold={c.threshold}
  class:swipe-right={c.swipe === 'right'}
  class:swipe-left={c.swipe === 'left'}
  class:swipe-up={c.swipe === 'up'}
  class:swipe-down={c.swipe === 'down'}
  class:fly-out-right={c.flyOut === 'right'}
  class:fly-out-left={c.flyOut === 'left'}
  class:fly-out-up={c.flyOut === 'up'}
  class:fly-out-down={c.flyOut === 'down'}
  class:fly-out-quiet={c.flyOut === 'quiet'}
  class:result-yes={c.result?.tone === 'yes'}
  class:result-no={c.result?.tone === 'no'}
  class:result-almost={c.result?.tone === 'almost'}
  style:transform={c.transform || null}
  style:transition={c.transition || null}
  onanimationend={(e) => {
    if (e.target === card) ui.card.entering = false
  }}
  onpointerdown={pointerDown}
  onpointermove={pointerMove}
  onpointerup={(e) => release(e, false)}
  onpointercancel={(e) => {
    release(e, true)
    clear()
  }}
  onclick={click}
>
  {#if data.direction === 'en'}
    <div class="word">{word.w}</div>
    <button class="speaker" type="button" aria-label="Pronunciation" onclick={() => pronounce(word.w)}>🔊</button>
    <div class="reveal">
      <div class="translation">{word.pl}</div>
    </div>
  {:else}
    <div class="translation big">{word.pl}</div>
    <div class="reveal">
      <div class="word">{word.w}</div>
      <div class="pronunciation"><button class="speaker" type="button" aria-label="Pronunciation" onclick={() => pronounce(word.w)}>🔊</button></div>
    </div>
  {/if}
  <!-- The cross ends study. It is on the card, not in the top bar: the bar must stay a clean progress bar,
       and a 44 px touch target would not fit there without pushing the card down. -->
  <button class="close on-card no-reveal" type="button" aria-label="End study" onclick={exitToHome}>✕</button>
  <input class="haptic" type="checkbox" switch tabindex="-1" aria-hidden="true" />
  {#if c.result}<div class="result" aria-hidden="true">{c.result.icon}</div>{/if}
</div>

<!-- The four grades as buttons (the same as the swipes). Each button has its own haptic switch (haptics.js),
     so on the iPhone every grade vibrates. The screen reader has its own buttons in the footer. -->
<div class="grade-buttons" aria-hidden="true">
  <button class="grade-button discard" id="grade-discard" type="button" tabindex="-1" onclick={skipCurrent}><span class="grade-icon">🗑</span><span>Trash</span></button>
  <button class="grade-button no" id="grade-no" type="button" tabindex="-1" onclick={() => gradeCard(1)}><span class="grade-icon">✗</span><span>Don't know</span></button>
  <button class="grade-button almost" id="grade-almost" type="button" tabindex="-1" onclick={() => gradeCard(2)}><span class="grade-icon">~</span><span>Not sure</span></button>
  <button class="grade-button yes" id="grade-yes" type="button" tabindex="-1" onclick={() => gradeCard(3)}><span class="grade-icon">✓</span><span>Know</span></button>
</div>
