<script>
  // The "How to learn" screen (D3): a short guide, each rule from research.
  import { STUDY_RULES } from '../text.js'
  import { closeGuide } from '../app.svelte.js'
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay-backdrop" onclick={closeGuide}></div>
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<section class="sheet" role="dialog" aria-label="How to learn">
  <header class="sheet-header"><h2>How to learn</h2><button class="close" type="button" aria-label="Close" onclick={closeGuide}>✕</button></header>
  <div class="sheet-body">
    <p class="rule-intro">Seven rules, each from research. The rest is details.</p>
    {#each STUDY_RULES as [title, text], i}
      <div class="rule" class:first={i === 0}><div class="rule-title"><span class="rule-number">{`${i + 1}.`}</span><span>{title}</span></div><p class="rule-text">{text}</p></div>
    {/each}
    <div class="section">
      <h3>What to expect</h3>
      <p class="rule-text justified">Oxford 3000 is about 90-95% of the words you hear in normal conversation, in films and in series. That is a lot, but it is not fluency yet: understanding everything freely needs twice as many words. Treat this deck as a base, after which conversation stops being guesswork.</p>
      <p class="rule-text justified" style="margin-top: 10px">With 10 new words a day the whole deck takes about a year, and with your pace of throwing out known words a lot less. The number that really shows progress is in the stats: <b>solid</b> words are the ones the app planned at least a month ahead, because they lasted that long in your memory.</p>
    </div>
  </div>
</section>
