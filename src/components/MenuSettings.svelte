<script>
  // Study settings: segments with numbers, toggles and the habit anchor (D1).
  import * as study from '../study.js'
  import { changeSetting, model, ownAnchor, setAnchor } from '../app.svelte.js'

  const s = $derived(model.state.ustawienia)
  // Saved values stay as the Polish version wrote them ('brak', 'dlugosc', 'litera'), only the labels are English.
  const HINTS = [
    ['brak', 'none'],
    ['dlugosc', 'length'],
    ['litera', 'letter'],
  ]
</script>

{#snippet segments(options, field)}
  <div class="segments">{#each options as [value, label]}<button type="button" aria-pressed={String(value === s[field])} onclick={() => changeSetting(field, value)}>{label}</button>{/each}</div>
{/snippet}

{#snippet toggle(field, label)}
  <div class="row"><span>{label}</span><button class="toggle" type="button" role="switch" aria-checked={String(s[field])} aria-label={label} onclick={() => changeSetting(field, !s[field])}></button></div>
{/snippet}

<div class="section">
  <h3>Settings</h3>
  <div class="row"><span>New per day</span></div>
  {@render segments(
    study.NEW_PER_DAY_OPTIONS.map((o) => [o, String(o)]),
    'noweDziennie',
  )}
  <div class="row" style="margin-top: 8px"><span>Daily review cap</span></div>
  {@render segments(
    study.REVIEW_CAP_OPTIONS.map((o) => [o, o === 0 ? 'no limit' : String(o)]),
    'maksPowtorekDziennie',
  )}
  <div class="row" style="margin-top: 8px"><span>Session length</span></div>
  {@render segments(
    study.SESSION_LENGTH_OPTIONS.map((o) => [o, String(o)]),
    'dlugoscSerii',
  )}
  <div class="row" style="margin-top: 8px"><span>Daily goal (cards)</span></div>
  {@render segments(
    study.DAILY_GOAL_OPTIONS.map((o) => [o, String(o)]),
    'celDzienny',
  )}
  <div class="row" style="margin-top: 8px"><span>Hint on the speaking card</span></div>
  {@render segments(HINTS, 'podpowiedzMowienie')}
  {@render toggle('autowymowa', 'Speak after reveal')}
  {@render toggle('mowienie', 'Speaking cards (PL → EN)')}
  <!-- Habit anchor (D1): here it can be changed and turned off. -->
  <div class="row" style="margin-top: 8px"><span>Habit anchor</span><span class="muted">{s.kotwica ? study.anchorSentence(s.kotwica) : 'off'}</span></div>
  <div class="anchor-options">{#each study.HABIT_ANCHORS as a}<button type="button" aria-pressed={String(a === s.kotwica)} onclick={() => setAnchor(a)}>{a}</button>{/each}<button type="button" onclick={ownAnchor}>Own…</button><button class="quiet" type="button" onclick={() => setAnchor('')}>{s.kotwica ? 'Turn off' : 'Not now'}</button></div>
</div>
