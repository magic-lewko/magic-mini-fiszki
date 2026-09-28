# magic-mini-fiszki

English flashcards for the phone (offline PWA). Study is done by swipes: an EN card (what does it mean?) and a speaking card PL (say it in English), a grade by moving the card in one of four directions, FSRS-6 reviews. After the first opening it works without the internet. Built with Svelte 5 (runes) and Vite.

The app has no built-in word list. Words are added in the app (paste or file) and stay on the phone (IndexedDB). Progress is in localStorage, and the backup has both the words and the progress.

The review algorithm `lib/fsrs.mjs` (with its test `lib/fsrs.test.mjs`) is a copy from `magic-mini-english`, the same as in the PC app. It is shared, so it keeps its Polish names; a fix of the algorithm must go to both projects.

## How to use it

1. **The app opens at once on a card.** No start screen: if there is something to review, the first card waits for a touch.
2. **A tap reveals** the answer. **A double tap** (the second within 280 ms) undoes the last grade. The first tap works at once and waits for nothing.
3. **A grade is a swipe**: **right** "Know", **left** "Don't know", **up** "Almost", **down** throws the word out of study (the same as "Skip"). The card follows the finger on both axes; after the threshold is crossed (90 px horizontally, 80 px vertically or a fast flick) the direction lights up with a color and an icon, before you let go. Below the threshold the card goes back to the center. The cross on the card (or Escape) ends study and goes to the home screen.
4. **The card fills the study screen**: the bottom gap equals the side gaps, so the panel goes low, but its rounding stays visible. The system inset (the iPhone gesture bar) is added to the padding inside the card.
5. **A grade works at once, also on a hidden card**: a word you know ends with one move, without touching it first. A tap is for words you want to check - and only then the answer time counts. The exception: "Already know" (`z`) works only at the first exposure of a word.
6. **The study screen has no visible button.** At the top there is only a thin progress bar of the whole deck, at the bottom nothing. The grade buttons stay for the screen reader (class `sr-only`), and for tests and an external keyboard there are shortcuts: space reveals, arrows in four directions match the four swipes, `z` is "Already know".
7. **The home screen** (after a session, after the cross and when there is nothing to review): the whole deck bar with one number ("412 / 2981"), three big buttons **Reviews**, **Crossword**, **Letters** and the three dots menu in the corner. When there is nothing to review, **+10** next to "Reviews" adds ten new words for today.
8. **Session end**: at most three numbers (what was added, cards today, cards tomorrow) and the same buttons as on the home screen.

### The whole deck bar

This is the only progress indicator in the app: there is no rank, level, weekly points or XP on the screen. The bar fill is **known words** (the EN card is not new any more), the lighter part inside is **solid words** (stability of at least 30 days). The bar shows no digits; the number "known / all" is only on the home screen.

`expRazem` stays in the save under the old field `exp` only for compatibility with an older phone. Points are still counted in the background (they are in the day history), but they are not shown anywhere.

**Combo** is a run of grades other than "Don't know" within one session. Every fifth one gives a short flash on the screen edge (300 ms) and its own vibration, instead of a number of points.

### Answer time

After the card is revealed, its border changes color with time: 0-3 s neutral, 3-8 s amber, over 8 s vermilion. The change is smooth, with no digits and no ticking. A card graded by a swipe without revealing has no answer time (it counts as zero seconds), so no lowering applies to it.

**Over 8 seconds a "Know" swipe is saved as "Almost"** (grade 2), quietly - the only signal is the border color. An answer after such a long search is not knowledge ready to use. This does not apply to the first exposure of a word (a new card) or to training, because there time says nothing about knowledge. The thresholds (`MEDIUM_PACE_SECONDS`, `SLOW_PACE_SECONDS`) are constants in `src/study.js`. The median of the day's answer times goes to the history as `tempo` and is visible in the stats.

### Gesture tutorial

At the first start after an update a one-time overlay shows four arrows with labels; a tap closes it. It can be opened again from **Menu > Gestures**. After the tutorial the caption "Tap to reveal" shows under the card for three cards.

### Daily limits and catch-up mode

- **New words per day**: 5 / 8 / 10 / 15 / 20 / 30, **10** by default. One word is two cards, so 20 new words means about 200 reviews a day in the long run.
- **Daily review cap**: 40 / 60 / 100 / no limit, **60** by default. It applies to due cards, not new ones. Cards over the cap move to the next days; FSRS handles overdue cards by itself, so nothing is counted again.
- **Order of due cards**: first the ones closest to being forgotten, so by the recall chance `przypomnienie(t, stability)` from FSRS, not by due date. Learning steps and cards after a mistake go before reviews, because their due dates count in minutes.
- **Speaking card unlocks**: at most 12 a day, separate from the new words limit.
- **Catch-up mode** starts by itself when the backlog is over 2x the cap: new words stop, the review limit grows to 1.5x the cap, and the screen does not show the backlog number. It ends when the backlog drops below the cap, and for the next three days lets in half of the new words.
- **Interference**: a new word waits if a similar word (the same main Polish meaning or a spelling one edit away) came into study within the last 7 days or is in the learning/relearning state. The collision index is counted by `src/collisions.js` once after the deck loads (about 60 ms for 2981 words) and kept in IndexedDB under a key that depends on the word count and a checksum. The app waits for this index before the first session, because the session is built right after the start.

### A streak without punishment

- **One graded card** counts the day. The daily goal is separate and optional.
- Next to the streak there is a counter that never resets: **study days in the last 30**.
- **Freezes**: one every 7 study days, a bank of at most 2. A day without study uses one automatically, and the app only says "Yesterday was a day off, the streak stays."
- **Recovering the streak**: two sessions within 48 hours after a break give back the days from before it. Once in 30 days.
- There is no message about losing anything.

### Hard words (leeches)

After every 6 mistakes on a card the app shows the panel "This word is hard for you" with three choices: **Put away for 3 weeks** (due date today + 21 days), **Skip** (the word leaves study) and **Keep learning**. The card history is never deleted, because FSRS learns from it. The panel comes back only after 6 more mistakes.

### "Already know" and "Skip"

The Oxford 3000 deck has plenty of words you already know. There are two separate ways out for them. The study screen has no buttons, so both are in **Menu > Words** (and for the screen reader also among the hidden card buttons). "Skip" is also the swipe down.

- **Already know** (only for a new card) is **a single check in about 45 days**. Plain FSRS after an "easy" grade would give about 8 days, so a hundred words marked in three days would come back in one wave. The card goes straight to reviews; after this one check it counts normally.
- **Skip** (for **any** word, both directions) throws the word out of study for good: it is not in any session, in the new words limit or in "Due". Progress is not deleted - the cards of both directions stay untouched in memory, so **Menu > Words > Restore** puts the word back at exactly the same place in the schedule. The first use shows a tip where to restore it. Undo also works for a skip.

In the stats skipped words have their own row. "Known words" still count the ones that went through study, and the deck finish forecast counts only words that can still be introduced.

### Due date fuzz

Every grade outside training moves the FSRS due date by a few percent one way or the other (at most +/-21 days, only for due dates further than 3 days). The shift is deterministic (a hash of the card key and the due date, no randomness), so a grade result can be repeated and tested. Thanks to it cards graded on the same day do not all come back on one day.

At the first start after this change the app once spreads due dates that are already saved (more strongly, by +/-25%), and saves `rozproszono: 1`, so it does not do it again. New cards, overdue cards and cards closer than 3 days stay untouched.

### "Hard words" mode (training)

The button is in the menu, with the number of available cards; when there is no card with a mistake, it is disabled with the label "No hard words".

Training takes cards (both directions) with at least one mistake, the ones with most mistakes first. **A grade in training does not change the card state or the due date** - it is only practice. Points, combo, the daily goal, the streak and the day history still count. The card shows the mark "Training: due dates stay the same", and the end screen says plainly that it was training.

### Undoing a grade

You undo with **a double tap on the card** (the second within 280 ms). The first tap works at once (reveals) and does not wait for a second one. While the snapshot is valid, the menu also has "Undo last grade", and the screen reader has a hidden button on the card. Undo brings back exactly the previous state (the card, the skipped list, total points, the streak, the day counter, combo, history) and shows the card in the same reveal state it had. The snapshot is dropped after the next grade, after leaving the session and after the app starts. When there is nothing to undo, only a short note shows.

### Hint on the speaking card

The setting "Hint on the speaking card": **none** (default), **length** (only underscores and word boundaries), **letter** (the first letter plus underscores). The saved values stay as the Polish version wrote them (`brak`, `dlugosc`, `litera`). Whatever the setting, the card has a "Hint" button, which raises the level by one for this one card (none -> length -> letter). The next card goes back to the setting.

The button is **invisible for the first 7 seconds** after the card shows, and on a card where the hint was used **a "Know" is saved as "Almost"**, quietly. An easier recall gives a smaller gain, so a hint has a cost.

### Games: Crossword and Letters

Both games start from the home screen and **do not change the schedule or the card state** - exactly like "Hard words" training. Only their time counts to the study day. Words come from cards due for review today (both directions, without skipped words and without turned off decks); when there are fewer than 6, recently studied ones are added. New words do not go into games, because the player has not seen them yet. When there are too few words, the button answers with one sentence instead of opening an empty game.

**Crossword**: a grid of at most 11x11 (a cell is at least 28 px, at 375 px it is 30 px), clues are Polish translations, answers are English. A tap on a cell chooses the entry and highlights it whole, and the clue text stands above the keyboard; another tap on the same cell switches the direction, when two entries cross there. Letters come from the system keyboard (a hidden text field), Backspace takes one back. "Check" colors correct letters green and wrong ones vermilion, "Hint a letter" reveals one letter at most 3 times and shows how many are left. When all cells are filled, the crossword checks itself. The result is the number of entries, the number of hints and the time. The generator fits about 83% of the given words on average, so it gets a few more than it has to place - an unused word is a normal result, not an error.

**Letters**: a series of 10 words. At the top the Polish meaning, below it places for the letters of the answer, at the bottom scattered tiles (at least 44 px; each word gets 4-6 extra letters, at most 14 tiles, chosen so that no other deck word can be built from them). A tap on a tile adds a letter, a tap on the answer takes off the last one. A correct word gives a short animation, is spoken aloud and moves on; a mistake is only a shake of the tiles and a chance to fix it, with no penalty. At the end of the series: the number of words, the number of hints, the time, and "Play again" and "Back".

You leave both games with the cross in the corner (or Escape). There is no swipe out: in the crossword you type letters, and scrolling the grid would end the game in the middle of an entry.

### Decks (menu)

The **Decks** section lists decks in the order they were added, with the number of words, the number of known words and the switch "study this deck". A turned off deck leaves study and games (one filter in the engine, the same one that filters skipped words), but its progress stays untouched in the save, so turning it on gives everything back at the same place in the schedule. All decks are on by default, so with one deck nothing changes.

A new deck is added with the same "Add words" sheet, which has the field **Deck name** (by default the name from the file or "Pasted YYYY-MM-DD"). The "Remove" button deletes the words of the deck **together with their progress**, after a confirmation that says how many words and cards will be lost.

The list of turned off decks lives in the settings as the optional field `wylaczoneTalie`. `SAVE_VERSION` stays 1, and a save without this field loads with no change (all decks on).

### Stats and the word list (menu)

- the stats start with a few short sentences ("You know 412 of 2981 words, 62 solid.", "This week 340 cards.", "Longest streak: 13 days.", "You usually answer in 2.5 s."), and the whole table of numbers is under the expandable **Details**,
- a heatmap of the last 30 days: columns are weekdays, 5 intensity levels, the date and the number of cards in the tooltip, and a summary under the grid ("today N cards · best day · study days"),
- "Solid words": EN cards with a stability of at least 30 days (the lighter part of the deck bar grows from them), "Mastered": at least 21 days, and "Skipped": how many words are out of study,
- a deck finish forecast from the pace of new words in the last 14 days ("At this pace: around 15 February 2027 (413 days)."); without data it says "No pace data.",
- the **Words** section: search in English and Polish (case and Polish letters do not matter), at most 50 rows with the counter "showing 50 of 312". Each row has the word, the translation, the level chip, the EN card state (new / learning / review in N days / mastered) and the buttons "Already know" (only for a new card, a check in about 45 days without going into a session), "Skip" (throws the word out of study without deleting progress), "Reset" (deletes the progress of both directions after a confirmation) and "Report error". A skipped word has the state "skipped" and instead of them the button "Restore", which gives it back to study without losing progress,
- the **Reported errors** section (visible when there is something): the list, "Copy list" (JSON to the clipboard, and when the clipboard is not available, a selected text to copy) and "Clear".

## Code

```text
src/                   # the app, Vite builds dist/ from it
├─ index.html, main.js, styles.css
├─ public/             # manifest.webmanifest and icon-*.png (copied as they are)
├─ components/         # Svelte components (only the view)
├─ app.svelte.js       # app control: study, home screen, menu, decks, backup, offline
├─ games.svelte.js     # crossword and letters game state
├─ ui.svelte.js        # view state (runes)
├─ study.js            # study logic: session, daily limits, review cap, catch-up, streak, stats
├─ storage.js          # progress in localStorage and the backup file
├─ database.js         # deck and collision index in IndexedDB
├─ collisions.js       # index of similar words (interference)
├─ words.js            # word import: pasted text, JSON, merging
├─ grading.js          # grading a card, taking cards off a session
├─ text.js             # UI texts and text helpers
├─ crossword.js, letters.js  # game logic
└─ speech.js, haptics.js     # pronunciation (Web Speech) and vibration on iOS
lib/fsrs.mjs           # FSRS-6 review algorithm (shared with magic-mini-english)
*.test.mjs             # unit tests (node --test), tests.mjs imports all of them
browser-tests.mjs      # the whole app in headless Chrome through CDP
live-tests.mjs         # the deployed app on GitHub Pages
build.mjs              # Vite build + dist/sw.js with VERSION (a content hash)
server.mjs             # static server for dist/ on 127.0.0.1:4200
deploy.sh              # build and push dist/ to the gh-pages branch
vite.config.js         # root src/, base /magic-mini-fiszki/
tools/icons.mjs        # makes the PNG icons
data/example.json      # a few words for a manual test
talie/                 # word decks (JSON outside the repo), talie/zrodla/ - how the Oxford deck was made
```

The domain logic (`study.js`, `storage.js`, `words.js`, `collisions.js`, `crossword.js`, `letters.js`, `grading.js`, `text.js`) is plain JS without DOM and without timers, tested in Node. Svelte is only the view layer.

Saved data keeps the Polish field names of the old version (for example `karty`, `ustawienia.noweDziennie`, a word's `pl` and `zdanie`), because this is the format stored on the phone and in the deck and backup files. Names in code are English.

## Build and tests

First `npm install` (once). Commands from the project folder:

```text
npm start                 # build and server: http://127.0.0.1:4200/magic-mini-fiszki/
npm run dev               # Vite dev server (no service worker): http://127.0.0.1:4300/magic-mini-fiszki/
npm run build             # src/ + lib/fsrs.mjs -> dist/ (+ dist/sw.js, dist/.nojekyll)
npm test                  # logic and algorithm tests; from the folder above: node --test magic-mini-fiszki/
npm run test:browser      # build and the whole app in headless Chrome (swipes, games, decks, offline, engine)
npm run test:live         # the deployed app on GitHub Pages: install, deck import, grade, offline
npm run icons             # only when the icons change, the PNGs are in src/public/
```

Browser tests drive real Chrome through CDP (touch, not clicking in the DOM), so they catch what unit tests do not see: an overlay covering the card, a swipe below the threshold, sideways scrolling.

- `browser-tests.mjs` needs the built `dist/` (`npm run build`) and the deck `talie/oxford3000.json` (engine scenarios need a big deck; the deck stays outside the repo). The unit tests for collisions, crossword and letters also read this deck,
- `live-tests.mjs` checks what really is on Pages, so run it after `bash deploy.sh`,
- variables: `CHROME` (another browser path), `MMF_DECK` (another deck), `MMF_WORK_DIR` (folder for the Chrome profile and screenshots; `%TEMP%/mmf-tests` by default, it must be short, otherwise Chrome does not create CacheStorage), `MMF_PROFILE` (another Chrome profile folder), `MMF_URL` (another address for the live test).

## Local test

```text
npm start
```

- <http://127.0.0.1:4200/magic-mini-fiszki/> (the root address redirects there; the folder is the same as on GitHub Pages, so offline mode works)
- example words: `data/example.json` (Add words > Load from file)
- Chrome DevTools > Application: Service Workers, Cache Storage (`mmf-<version>`), IndexedDB (`mmf`), Local Storage (`mmf-v1`)
- Network > Offline and reload the page: it must load
- keyboard: space reveals, right arrow Know, left Don't know, up Almost, down Skip, `z` Already know, Escape ends study

## Deploy (GitHub Pages)

Address: **<https://magic-lewko.github.io/magic-mini-fiszki/>**

```text
bash deploy.sh
```

`deploy.sh` builds the app (it needs `node_modules`, so `npm install` first), uploads the content of `dist/` (with `.nojekyll`) to the `gh-pages` branch of the public repo `magic-lewko/magic-mini-fiszki` and waits until Pages serves the new version at the address without parameters (the CDN keeps an old file for up to 10 minutes). Open the app on the phone only after the message "Done". The `main` branch is for the source code from this folder (`dist/` is in `.gitignore`). If the repo or Pages do not exist yet, the script creates them. The login comes from Git Credential Manager.

Vite builds with `base: '/magic-mini-fiszki/'`, and the service worker is always `/magic-mini-fiszki/sw.js`, the same address as before, so the installed app updates its own registration. Every change of files gives a new `VERSION` in `sw.js`: the phone downloads it in the background and shows the banner "New version ready" on the home screen and in the menu. Pages keeps files in cache for up to 10 minutes, so a new version can arrive with a delay.

### The first update from the Polish version

The phone still runs the old version until the banner. The old app shows its own banner ("Nowa wersja gotowa"); a tap loads this version. The new service worker still accepts the old message `aktualizuj` and answers the status with the old fields, so this step works. Progress (`mmf-v1`), words (IndexedDB `mmf`) and backups stay as they are: the storage format did not change. Ready habit anchors saved in Polish (for example "po kawie") are read as their English versions. The name under the home screen icon ("Fiszki") changes only when the app is added to the home screen again.

## Decks

- `talie/oxford3000.json`: 2981 words from the Oxford 3000 list (A1-B2) with our own translations and sentences, after an independent review. It does not go into the built app (`gh-pages`). The raw OUP data with definitions is in `.gitignore`. Before the first push of the sources, decide whether the deck itself should be in a public repo, because the word choice and levels come from the Oxford list.
- `talie/zrodla/`: what the deck was made from and how (`dane/prepare.mjs` splits the list into packs, `dane/merge.mjs` merges translations and review fixes). The data files there keep their Polish names (`kolejnosc.json`, `wejscie-NN.json`, `wyjscie-NN.json`, `poprawki-N.json`). Add a fix of a single word to `FIXES` in `merge.mjs` and run `node dane/merge.mjs` from `talie/zrodla/`. The result goes to `talie/zrodla/dane/oxford3000.json`: copy it to `talie/` and load the deck again in the app. Progress stays.

## Installing on iPhone

1. Safari > type the address > Share > Add to Home Screen. Leave the switch "Open as Web App" (iOS 26) ON, otherwise the icon opens a normal Safari tab.
2. Always open it from the icon. Safari and the icon have separate data, progress from a Safari tab does not move to the app.
3. The first opening with internet. Wait until "offline ✓" shows in the top bar (it disappears once everything is saved; the state is in Menu > Offline).
4. Add words > Load from file > choose `oxford3000.json` from Files or iCloud Drive > check the preview > Add.
5. Menu > Save backup > Save to Files (or iCloud Drive).

### How to move a file from Windows to the iPhone

- iCloud.com in the browser > iCloud Drive > upload the file. On the iPhone: Files > iCloud Drive.
- Or email it to yourself as an attachment. On the iPhone hold the attachment > Save to Files.

## Checklist before a trip (on a real iPhone)

- [ ] Menu > Offline: "Ready to work without internet ✓", saved files N/N
- [ ] airplane mode, close the app in the app switcher, open from the icon: it starts, the words are there
- [ ] in airplane mode one session, close the app and open it: points, streak and progress stayed
- [ ] leave the app to the home screen: the icon shows a badge with the number of cards for today (iOS 16.4+, only from the icon)
- [ ] vibration when tapping the card (reveal); a swipe on iOS does not vibrate, that is normal (Settings > Sounds & Haptics > System Haptics must be on)
- [ ] a swipe in four directions can be done with the thumb of one hand, and the direction highlight is visible before letting go
- [ ] a double tap undoes a grade, and a single tap reveals at once (without a noticeable delay)
- [ ] the home screen and the session end screen fit without scrolling (checked in Chrome at 375x667, but the iPhone has other system bars)
- [ ] the "Hint" button on the speaking card does not reveal the card when tapped
- [ ] 🔊 speaks English in airplane mode (if it is silent: Settings > Accessibility > Spoken Content > Voices > English, download a voice)
- [ ] moving the card with a swipe does not scroll the page and does not zoom it with a pinch
- [ ] VoiceOver sees the grade buttons even though nothing is visible on the screen
- [ ] Menu > Save backup, the file is visible in Files
- [ ] do not clear Safari data (Settings > Safari > Clear History and Website Data), it can delete progress

## On the road

- If the words disappear (an empty deck): Add words > Load from file > `oxford3000.json`. Progress is saved separately by the word `id`, so it comes back with the words.
- Menu > Load backup joins the backup with the current progress: newer reviews stay, an older file undoes nothing. The list of skipped words is the sum of both sides (if a word left study on either phone, it stays out). The state from before loading also goes to `mmf-v1-przed-wczytaniem`.
- The message "The word database does not respond": close the app in the app switcher and open it again.
- The message "Skipped N broken cards": the rest of the progress works, the raw save is in `mmf-v1-uszkodzony`.

### Rules

- Do not deploy new versions during a trip. A new version downloads in the background and turns on by itself after the app is closed, with no chance to check it before use.
- When fixing the spelling of a word in the deck, keep the old `id`. A new `id` is a new word: a duplicate without progress appears, and the old one stays in the deck.

## Word formats

1. A JSON object: `{ "nazwa": "Oxford 3000", "zrodlo": "...", "slowa": [ { "id", "w", "pl", "poziom", "ipa", "czesci", "zdanie", "zdaniePl" } ] }` (deck name, source, words; a word: id, English, Polish, level, IPA, parts of speech, sentence, Polish sentence).
2. A plain JSON array of words in the same shape.
3. Text, line by line: `english ; polish` or with a tab, optionally then `; sentence ; Polish sentence`. Empty lines and lines starting with `#` are skipped.

`w` and `pl` are required. `id` is `w` by default and is case sensitive ("May" and "may" are two words). The deck name is "Pasted YYYY-MM-DD" by default. On a new import new words go to the end of the study order, existing ones get new content (fields missing in the import stay), and progress is never deleted.

## Where the data is and how to get it back

The storage keys and field names are the same as in the Polish version, so an update does not lose anything.

- `mmf-v1` (localStorage): progress in a compact form, saved after every grade. The format still has `wersja: 1`: newer fields (`historia`, `zgloszenia`, `pominiete`, `rozproszono`, `nadrabianie`, `dzis.powtorki`, extra streak fields, settings `celDzienny`, `podpowiedzMowienie`, `maksPowtorekDziennie`, `samouczekGestow`, `wylaczoneTalie`) are optional, so a save from an older version of the app loads with no change, and a missing field gives a default value. The field `exp` stayed in the save under its old name and means "total points": the app does not show it, but does not delete it. The field `punktyTygodnia` from an older save is simply ignored. A card has 9 numbers, and two more (the "Know" in a row counter and the leech panel counter) are added only when they are not zero. `historia` is `{ "YYYY-MM-DD": { oceny, nowe, exp, sekundy, tempo, czasy } }` (grades, new cards, points, seconds, median answer time, raw times), trimmed at save to the last 180 days; `tempo` is the median of the day's answer times, and raw `czasy` (at most 200) stay only for today. `pominiete` is `{ "word id": "YYYY-MM-DD" }`, and `rozproszono: 1` means the one-time spread of due dates already happened.
- `mmf-v1-poprzedni`: a copy of progress from the start of the day; when `mmf-v1` is broken as a whole, the app comes back from it by itself, and puts the broken text into `mmf-v1-uszkodzony`. A single broken card is only skipped.
- `mmf-v1-przed-wczytaniem`: progress from before loading a backup from a file
- IndexedDB `mmf` / `dane` / `talia`: the words (the record `{ wersja, slowa, talie }`), `kolizje`: the collision index
- the file `flashcards-backup-YYYY-MM-DD.json` (older ones: `fiszki-kopia-YYYY-MM-DD.json`, the same format `mmf-kopia`): words and progress; Menu > Load backup restores everything on a new phone, and on a used one joins it with the saved progress
