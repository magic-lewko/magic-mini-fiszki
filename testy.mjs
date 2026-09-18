// Node 24 traktuje `node --test magic-mini-fiszki/` jak sciezke do modulu, a nie katalog do przeszukania.
// package.json wskazuje ten plik jako "main", wiec to polecenie uruchamia wszystkie testy.
// Nazwa nie pasuje do wzorca *.test.mjs, zeby `node --test` w tym katalogu nie liczyl testow dwa razy.

import './talia.test.mjs'
import './slowka.test.mjs'
import './magazyn.test.mjs'
import './mowa.test.mjs'
import './baza.test.mjs'
import './lib/fsrs.test.mjs'
