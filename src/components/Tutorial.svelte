<script>
  // The gesture tutorial (A): only from the menu ("Gestures"). A tap anywhere on the overlay
  // closes it (handled in App.svelte), so the first swipe reaches the card only after it closes.
  import { TUTORIAL_SWIPES } from '../text.js'
</script>

<div class="tutorial-body" role="dialog" aria-label="Gestures">
  <div class="tutorial-title">Swipe the card</div>
  <div class="tutorial-grid">{#each TUTORIAL_SWIPES as [arrow, label]}<div class="tutorial-swipe"><span class="tutorial-arrow" aria-hidden="true">{arrow}</span><span class="tutorial-label">{label}</span></div>{/each}</div>
  <p class="tutorial-text">Swipes work at once. Tap to reveal, double tap to undo. Close with the cross.</p>
  <button class="button primary" id="tutorial-ok" type="button">Start</button>
</div>
