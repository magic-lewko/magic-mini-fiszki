// Node 24 treats `node --test magic-mini-fiszki/` as a path to a module, not a folder to search.
// package.json points to this file as "main", so that command runs all tests.
// The name does not match the *.test.mjs pattern, so `node --test` in this folder does not count tests twice.

import './study.test.mjs'
import './collisions.test.mjs'
import './words.test.mjs'
import './storage.test.mjs'
import './speech.test.mjs'
import './database.test.mjs'
import './grading.test.mjs'
import './text.test.mjs'
import './lib/fsrs.test.mjs'
