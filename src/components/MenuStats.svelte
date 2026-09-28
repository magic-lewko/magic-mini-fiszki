<script>
  // Stats must be friendly (D): first short sentences and the heatmap, and the whole table of numbers only
  // under "Details". No success percent and no points.
  import * as study from '../study.js'
  import { WEEKDAYS, count, formatDate, heatmapCaption } from '../text.js'
  import { daySummary, deckProgress, model } from '../app.svelte.js'
  import Row from './Row.svelte'

  function forecastText(state, remaining) {
    if (!remaining) return 'All words from the deck are already introduced.'
    const f = study.finishForecast({ remaining, history: state.historia, settings: state.ustawienia })
    if (f.days === null) return 'No pace data.'
    return `At this pace: around ${formatDate(f.date)} (${count(f.days, 'day', 'days')}).`
  }

  function statSentences(state, stats, now) {
    const p = deckProgress()
    const sentences = [`You know ${p.known} of ${p.total} words, ${p.solid} solid.`]
    const week = study.cardsThisWeek(state.historia, now)
    if (week) sentences.push(`This week ${count(week, 'card', 'cards')}.`)
    // The daily goal has no bar of its own any more (D), but the setting stays and this is its only place.
    const today = study.gradedToday(state.historia, now)
    const goal = state.ustawienia.celDzienny
    sentences.push(today >= goal ? `Daily goal done: ${count(today, 'card', 'cards')}.` : `Today ${today} of ${goal} cards.`)
    const longest = study.longestRun(state.historia)
    if (longest) sentences.push(`Longest streak: ${count(longest, 'day', 'days')}.`)
    const pace = study.recentPace(state.historia, study.PACE_DAYS, now)
    if (pace) sentences.push(`You usually answer in ${pace.toLocaleString('en-GB')} s.`)
    if (stats.toIntroduce) sentences.push(forecastText(state, stats.toIntroduce))
    return sentences
  }

  const view = $derived.by(() => {
    const state = model.state
    const words = model.words
    const collisions = model.collisions
    const indexTime = model.collisionsTime
    const now = new Date()
    const stats = study.statistics({ words, cards: state.karty, skipped: state.pominiete, disabledDecks: state.ustawienia.wylaczoneTalie })
    const day = daySummary(now)
    const withCollisions = Object.keys(collisions).length
    const grid = study.heatmapGrid(state.historia)
    return {
      stats,
      day,
      sentences: statSentences(state, stats, now),
      grid,
      caption: heatmapCaption(grid),
      streak: count(study.currentStreak(state.streak, now), 'day', 'days'),
      studyDays: `${study.studyDays(state.historia, study.RECENT_DAYS, now)} / ${study.RECENT_DAYS}`,
      index: withCollisions ? `${withCollisions} words${indexTime ? ` · ${indexTime} ms` : ' · from memory'}` : 'counting',
    }
  })
</script>

{#snippet statRow(name, known, total)}
  <div class="stat-row"><Row {name} value={`${known} / ${total}`} /><div class="mini-track"><i style="transform: scaleX({total ? known / total : 0})"></i></div></div>
{/snippet}

<div class="section">
  <h3>Stats</h3>
  <div class="sentences">{#each view.sentences as s}<p>{s}</p>{/each}</div>
  <h3 style="margin-top: 16px">Last 30 days</h3>
  <!-- Heatmap of the last 30 days: columns are weekdays, numbers underneath, so the grid says something
       even when the history has just started. -->
  <div class="heatmap-block">
    <div class="heatmap weekdays" aria-hidden="true">{#each WEEKDAYS as d}<span>{d}</span>{/each}</div>
    <div class="heatmap">{#each { length: view.grid.empty } as _}<i class="day before"></i>{/each}{#each view.grid.cells as d}{@const label = `${formatDate(d.date)}: ${count(d.ratings, 'card', 'cards')}`}<i class="day s{d.level}" title={label} aria-label={label}></i>{/each}</div>
    <p class="caption">{view.caption}</p>
  </div>
  <details class="details" id="stats-details">
    <summary>Details</summary>
    <Row name="Known words" value={`${view.stats.known} / ${view.stats.total}`} />
    <Row name="Solid words" value={`${view.stats.solid} / ${view.stats.total}`} />
    <Row name="Mastered" value={`${view.stats.mastered} / ${view.stats.total}`} />
    <Row name="Skipped" value={view.stats.skipped} />
    <Row name="In review" value={`${view.stats.reviewPercent.toLocaleString('en-GB')}% of the list`} />
    <Row name="Unlocked speaking cards" value={view.stats.speakingUnlocked} />
    <Row name="Due now" value={view.day.laterToday ? `${view.day.due} (+${view.day.laterToday} later today)` : view.day.due} />
    <Row name="To do today" value={view.day.toDo} />
    <Row name="Catch-up mode" value={view.day.catchUp ? 'yes' : 'no'} />
    <Row name="Streak" value={view.streak} />
    <Row name="Study days in the last 30" value={view.studyDays} />
    <Row name="Collision index" value={view.index} />
    {#if view.stats.decks.length > 0}<h3 style="margin-top: 16px">Decks</h3>{/if}
    {#each view.stats.decks as d}{@render statRow(d.name, d.known, d.total)}{/each}
    {#if view.stats.levels.length > 0}<h3 style="margin-top: 16px">Levels</h3>{/if}
    {#each view.stats.levels as l}{@render statRow(l.name, l.known, l.total)}{/each}
  </details>
</div>
