# magic-mini-fiszki - instructions for Claude

English flashcards for the iPhone: an offline PWA, FSRS-6 reviews, study by swipe (four directions). How the app works
for the user (grade buttons, swipes, daily limits, decks, stats, installing on the iPhone) is in `README.md`. When you change
the app behavior, update the right section of the README.

Tasks for this project are on the board next to it, in the project `english-nauka`:
`node ../magic-mini-todo-table/todo.mjs lista --projekt english-nauka`.

## Stack

- **Svelte 5 (runes) + Vite 8.** `npm install` once. Dependencies are only dev dependencies (svelte, vite,
  @sveltejs/vite-plugin-svelte); the built app has no runtime libraries except the Svelte runtime in the bundle.
  Do not add libraries without a good reason.
- Node is used for the build, the test server and tests (`node --test`, no Vitest).
- Data on the phone: words in IndexedDB (`mmf`), progress in localStorage (`mmf-v1`), app files in Cache Storage
  (`mmf-<version>`) through the service worker.

## Structure

```text
src/                   # the app, Vite builds dist/ from it (root in vite.config.js, base /magic-mini-fiszki/)
├─ index.html, main.js, styles.css (global styles, class names used by components and tests)
├─ public/             # manifest.webmanifest, icon-*.png (copied as they are)
├─ components/         # Svelte components: only the view
├─ app.svelte.js       # control: study, swipes, home screen, menu, decks, adding words, backup, offline
├─ ui.svelte.js        # view state ($state), toast, note, flash, messages
├─ study.js            # study logic: session, daily limits, review cap, catch-up, time thresholds, stats
├─ storage.js          # progress in localStorage and the backup, SAVE_VERSION
├─ database.js         # deck and collision index in IndexedDB
├─ collisions.js       # index of similar words (interference for new words)
├─ words.js            # word import: pasted text, JSON, merging decks
├─ grading.js          # grading a card with fuzz, taking cards off a session
├─ text.js             # UI texts and helpers (plural, dates, times)
└─ speech.js, haptics.js     # pronunciation (Web Speech) and vibration on iOS
lib/fsrs.mjs           # FSRS-6 review algorithm (+ fsrs.test.mjs), shared, Polish names kept
*.test.mjs             # unit tests in the root, tests.mjs imports all of them
browser-tests.mjs      # the whole app in headless Chrome through CDP (touch, not clicking in the DOM)
live-tests.mjs         # the deployed app on GitHub Pages
build.mjs              # Vite build + dist/sw.js with VERSION (a content hash) and the file list
server.mjs             # static server for dist/ on 127.0.0.1:4200 (/ redirects to /magic-mini-fiszki/)
deploy.sh              # build and push dist/ to the gh-pages branch
deck/                  # the built-in deck: list/ (words by level), chunks/, parts/ (content), build.mjs, chunks.mjs
talie/                 # the old Oxford deck (JSON outside the repo, OUP license), talie/zrodla/ - how it was made
data/example.json      # a few words for a manual test
tools/icons.mjs        # makes the PNG icons
```

## Commands

```bash
npm install                # once
npm start                  # build and server: http://127.0.0.1:4200/magic-mini-fiszki/
npm run dev                # Vite dev server without the service worker: http://127.0.0.1:4300/magic-mini-fiszki/
npm test                   # logic and algorithm tests (node --test), need talie/oxford3000.json
npm run test:browser       # build and the whole app in headless Chrome (needs talie/oxford3000.json)
bash deploy.sh             # build and deploy to GitHub Pages, waits until the CDN serves the new version
npm run test:live          # after deploying: test the app at the public address
npm run icons              # only when the icons change
```

## Rules

- **All code in simple English**: names of variables, functions, components, files, CSS classes, comments, tests
  and docs. UI texts are English too. Card content (English words and their Polish translations) is learning data
  and stays as it is.
- **Logic without DOM.** `study.js`, `words.js`, `collisions.js`, `grading.js`, `storage.js`
  and `text.js` are pure modules tested in Node: no DOM, no timers, no `Math.random`. Instead of random, a
  deterministic hash or a seeded generator, so a result can be repeated in a test.
  Svelte components and `*.svelte.js` are the view layer.
- **Do not break the save on the phone.** The phone has real study progress. The storage keys (`mmf-v1`,
  `mmf-v1-poprzedni`...), the IndexedDB names (`mmf`, `dane`, `talia`, `kolizje`), the backup format (`mmf-kopia`) and
  all saved field names stay as the Polish version wrote them (`karty`, `ustawienia.noweDziennie`, a word's `pl`,
  `zdanie`...). The state in memory uses the same field names, so there is no mapping layer to get wrong.
  `SAVE_VERSION` stays 1: new fields in the save are optional, and a save without them loads with no change.
  No change may delete progress.
- **The service worker protocol.** The worker (in `build.mjs`) lives at `/magic-mini-fiszki/sw.js`, answers
  'status' and 'update', and still accepts the old 'aktualizuj' and returns the old status fields (`wersja`, `pliki`,
  `zapisane`), because an app from before the update may talk to the new worker. No `skipWaiting` on install:
  the user chooses when to update.
- **Training does not change the schedule** or the card state. Only a grade in study changes it.
- **FSRS is shared.** `lib/fsrs.mjs` is a copy from `magic-mini-english` (a PC app, not in this folder). Do not
  change its logic or rename its exports; a fix must go to both projects - say so.
- **The built-in deck is our own.** `deck/` (list, chunks, parts) builds `src/public/deck.json` with
  `node deck/build.mjs`: 5000 words A1-C1 written for this app, so it is public in the repo and the app. Never copy
  anything from `talie/` into it: `talie/**/*.json` is the old Oxford 3000 deck (OUP license), stays in `.gitignore`
  and never goes into `dist/`. `deck.json` is not in the service worker cache (only "Reload words" downloads it).
- **Buttons keep a fixed class.** `haptics.js` adds the class `with-haptic` and an invisible switch to every button
  outside Svelte, so in components a button has a static `class="..."` and changes classes only with `class:`
  directives (a dynamic `class={...}` would overwrite `with-haptic`).
- **Tests after a change**: always `npm test`. For a change of UI, swipes or the service worker also
  `npm run test:browser`. Add a new test file to `tests.mjs`.
- **Deploy only through `deploy.sh` and only when asked.** The script builds by itself (a build skipped by hand once
  pushed an old version). After deploying run `npm run test:live`.
- The `main` branch is the source code, `gh-pages` only the built app. Never commit to `gh-pages` by hand.

## Code conventions

- No semicolons, single quotes, 2 space indent.
- Names of files, functions and variables in simple English (`addDeck`, `recall`), except saved data fields.
- Comments in simple English. UI texts in English.
- Config constants at the top of a module in capitals (`SLOW_PACE_SECONDS`).
- No long dashes (em dash, en dash) in code, texts or docs. Always `-`.
- Commits: Conventional Commits, no AI as a co-author.

## Gotchas

- Every change in `src/` gives a new `VERSION` in `sw.js`. The phone downloads it in the background and shows the banner
  "New version ready" - there is no `skipWaiting`, the user decides about the update.
- GitHub Pages (CDN) keeps old files for up to 10 minutes. `deploy.sh` waits until the address serves the new
  `VERSION`, only after "Done" is the app on the phone.
- The Chrome profile of browser tests (`MMF_WORK_DIR`, by default `%TEMP%/mmf-tests`) must have a short path,
  otherwise Chrome does not create CacheStorage.
- Svelte delegates events like `oninput` through bubbling. Form fields use `{@attach listen('input', ...)}`
  (`components/listen.js`), so an input event without bubbles (tests, autofill) still reaches them.
- Node 24 from the folder above: `node --test magic-mini-fiszki/` works through `tests.mjs` (the `main` field in
  `package.json`). The name `tests.mjs` does not match `*.test.mjs` on purpose, so tests do not count twice.
- iOS speaks (Web Speech) only in reaction to a user gesture, so call `speak()` only from a tap handler.
