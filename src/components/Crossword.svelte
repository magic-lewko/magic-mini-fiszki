<script>
  // G1. Crossword: a grid with numbers as in a paper one, the text of the chosen entry above the keyboard and a hidden
  // field, through which iOS shows the system keyboard.
  import { INPUT_SENTINEL } from '../text.js'
  import { ui } from '../ui.svelte.js'
  import { listen } from './listen.js'
  import { checkCrossword, crosswordHint, onCrosswordInput, tapCell } from '../games.svelte.js'
  import GameTopBar from './GameTopBar.svelte'

  const game = $derived(ui.game)
  // Without this a tap on a cell or a button takes the focus from the hidden field and the system keyboard hides.
  const keepFocus = (e) => e.preventDefault()
</script>

<section class="screen game crossword">
  <GameTopBar title="Crossword" titleId="crossword-title" closeId="crossword-close" />
  <div class="crossword-grid" id="crossword-grid" style="--columns: {game.columns}">
    {#each game.cells as cell (cell.key)}
      {#if cell.empty}
        <div class="crossword-empty"></div>
      {:else}
        <button
          class="crossword-cell"
          class:selected={cell.selected}
          class:active={cell.active}
          class:correct={cell.correct}
          class:wrong={cell.wrong}
          type="button"
          data-row={cell.row}
          data-col={cell.col}
          aria-label="Cell {cell.row + 1}, {cell.col + 1}"
          onmousedown={keepFocus}
          onclick={() => tapCell(cell.row, cell.col)}
          >{#if cell.number !== null}<i class="crossword-number">{String(cell.number)}</i>{/if}<span class="crossword-letter">{cell.letter}</span></button
        >
      {/if}
    {/each}
  </div>
  <p class="game-clue" id="crossword-clue" aria-live="polite">{game.clue}</p>
  <!-- A hidden text field is the only way to get the system keyboard on iOS. It must be visible to the browser
       (only transparent, not display: none), otherwise focus() does not open it. -->
  <input
    class="hidden-input"
    id="crossword-input"
    type="text"
    autocapitalize="characters"
    autocomplete="off"
    autocorrect="off"
    spellcheck="false"
    aria-label="Type a letter"
    value={INPUT_SENTINEL}
    {@attach listen('input', onCrosswordInput)}
  />
  <div class="game-buttons">
    <button class="button" id="crossword-check" type="button" onmousedown={keepFocus} onclick={checkCrossword}>Check</button>
    <button class="button" id="crossword-hint" type="button" disabled={game.hintsLeft <= 0} onmousedown={keepFocus} onclick={crosswordHint}>{`Hint a letter (${game.hintsLeft})`}</button>
  </div>
</section>
