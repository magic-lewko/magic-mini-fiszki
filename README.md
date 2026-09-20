# magic-mini-fiszki

Fiszki na telefon (PWA offline). Nauka jest gestem: karta EN (co to znaczy?) i karta mówienia PL (powiedz po angielsku), ocena przez przesunięcie karty w jedną z czterech stron, powtórki FSRS-6. Po pierwszym otwarciu działa bez internetu. Zero zależności, czysty JS i CSS.

Apka nie ma wbudowanej listy słów. Słówka dodaje się w aplikacji (wklejenie albo plik) i zostają w telefonie (IndexedDB). Postęp jest w localStorage, kopia zapasowa zawiera słówka i postęp.

Algorytm powtórek `lib/fsrs.mjs` (z testem `lib/fsrs.test.mjs`) to kopia z `magic-mini-english`, ten sam co w apce na PC. Poprawkę algorytmu nanieś w obu projektach.

## Jak się tego używa

1. **Aplikacja otwiera się od razu na karcie.** Żadnego ekranu startowego: jeśli jest co powtarzać, pierwsza karta czeka na dotknięcie.
2. **Dotknięcie odsłania** odpowiedź. **Dwukrotne dotknięcie** (drugie w ciągu 280 ms) cofa ostatnią ocenę. Pierwsze dotknięcie działa od razu i na nic nie czeka.
3. **Ocena to gest**: w **prawo** "Umiem", w **lewo** "Nie umiem", w **górę** "Prawie", w **dół** koniec nauki i powrót na ekran wyboru. Karta podąża za palcem w obu osiach; po przekroczeniu progu (90 px w poziomie, 80 px w pionie albo szybki flick) kierunek podświetla się kolorem i ikoną, jeszcze zanim puścisz palec. Poniżej progu karta wraca na środek.
4. **Oceny działają tylko po odsłonięciu** (najpierw spróbuj sobie przypomnieć). Gest w dół działa zawsze.
5. **Ekran nauki nie ma żadnego widocznego przycisku.** Na górze jest wyłącznie cienki pasek postępu całej talii, na dole nic. Przyciski ocen zostały dla czytnika ekranu (klasa `tylko-czytnik`), a do testów i klawiatury zewnętrznej są skróty: spacja odsłania, strzałki w cztery strony odpowiadają czterem gestom, `z` to "Znam".
6. **Ekran wyboru** (po serii, po geście w dół i gdy nie ma czego powtarzać): pasek całej talii z jedną liczbą ("412 / 2981"), trzy duże przyciski **Powtórki**, **Krzyżówka**, **Literki** oraz trzy kropki menu w rogu.
7. **Koniec serii**: najwyżej trzy liczby (co przybyło, ile kart dziś, ile jutro) i te same trzy przyciski, co na ekranie wyboru.

### Pasek całej talii

To jedyny wskaźnik postępu w aplikacji: rangi, poziomów, punktów tygodnia i EXP nie ma ani na ekranie, ani w kodzie. Wypełnienie paska to **słowa poznane** (karta EN nie jest już nowa), jaśniejszy segment w środku to **słowa utrwalone** (stabilność co najmniej 30 dni). Pasek nie pokazuje cyfr; liczba "poznane / wszystkie" stoi wyłącznie na ekranie wyboru.

`expRazem` zostaje w zapisie pod starym polem `exp` wyłącznie dla zgodności ze starszym telefonem. Punkty nadal naliczają się w tle (są w historii dnia), ale nigdzie nie są pokazywane.

**Combo** to kolejne oceny inne niż "Nie umiem" w obrębie jednej serii. Co piąte daje krótki błysk na krawędzi ekranu (300 ms) i osobną wibrację, zamiast liczby punktów.

### Czas odpowiedzi

Po odsłonięciu karty jej ramka zmienia kolor wraz z czasem: 0-3 s neutralna, 3-8 s bursztynowa, powyżej 8 s cynobrowa. Zmiana jest płynna, bez cyfr i bez tykania.

**Powyżej 8 sekund gest "Umiem" zapisuje się jako "Prawie"** (ocena 2), a pod kartą pojawia się na 900 ms mikro-notka "wolno, liczę jako Prawie". Odpowiedź po tak długim szukaniu nie jest wiedzą gotową do użycia. Nie dotyczy to pierwszej ekspozycji słowa (nowa karta) ani treningu, bo tam czas nic nie mówi o wiedzy. Progi (`SEKUNDY_TEMPA_SREDNIEGO`, `SEKUNDY_TEMPA_WOLNEGO`) są stałymi w `talia.js`. Mediana czasów odpowiedzi z dnia trafia do historii jako `tempo` i widać ją w statystykach.

### Samouczek gestów

Przy pierwszym uruchomieniu po aktualizacji pokazuje się jednorazowa nakładka z czterema strzałkami i podpisami, zamykana dotknięciem. Ponownie wywołuje się ją z **Menu > Gesty**. Po zamknięciu samouczka przez trzy karty widać pod kartą podpis "Dotknij, aby odsłonić".

### Limity dnia i tryb nadrabiania

- **Nowe słowa dziennie**: 5 / 8 / 10 / 15 / 20 / 30, domyślnie **10**. Jedno słowo to dwie karty, więc 20 nowych oznacza docelowo około 200 powtórek dziennie.
- **Sufit powtórek dziennie**: 40 / 60 / 100 / bez limitu, domyślnie **60**. Dotyczy kart zaległych, nie nowych. Karty ponad sufit przechodzą na kolejne dni; FSRS radzi sobie z zaległościami sam, więc nic nie jest przeliczane.
- **Kolejność zaległych**: najpierw te najbliższe zapomnieniu, czyli rosnąco po szansie przypomnienia `przypomnienie(t, stabilność)` z FSRS, a nie po dacie terminu. Kroki nauki i karty po pomyłce idą przed powtórkami, bo ich terminy liczą się w minutach.
- **Odblokowania kart mówienia**: najwyżej 12 dziennie, osobno od limitu nowych słów.
- **Tryb nadrabiania** włącza się sam, gdy zaległość przekroczy 2x sufit: nowe słowa stają, limit powtórek rośnie do 1,5x sufitu, a ekran powrotu nie pokazuje liczby zaległych. Wyłącza się, gdy zaległość spadnie poniżej sufitu, i przez kolejne trzy dni przepuszcza połowę nowych słów.
- **Interferencja**: nowe słowo czeka, jeśli słowo kolidujące (ten sam główny polski sens albo pisownia w odległości jednej operacji edycji) weszło do nauki w ciągu ostatnich 7 dni albo jest w stanie nauka/ponowna. Indeks kolizji liczy `zrodlo/kolizje.js` raz po wczytaniu talii (około 60 ms na 2981 słowach) i trzyma go w IndexedDB pod kluczem zależnym od liczby słów i sumy kontrolnej id. Aplikacja czeka na ten indeks przed pierwszą serią, bo seria powstaje od razu po starcie.

### Seria bez kary

- Dzień zalicza **jedna oceniona karta**. Cel dnia jest osobny i aspiracyjny.
- Obok serii jest licznik, który nigdy się nie zeruje: **dni nauki w ostatnich 30**.
- **Zamrożenia**: jedno co 7 dni nauki, bank najwyżej 2. Dzień bez nauki zużywa jedno automatycznie, a apka mówi tylko "Wczoraj było wolne, seria zostaje".
- **Odzyskanie serii**: dwie sesje w ciągu 48 godzin od przerwy oddają dni sprzed niej. Raz na 30 dni.
- Nigdzie nie ma komunikatu o utracie czegokolwiek.

### Słowa oporne (leeche)

Po każdych 6 pomyłkach na karcie apka pokazuje panel "To słowo Cię męczy" z trzema wyjściami: **Odłóż na 3 tygodnie** (termin na dziś + 21 dni), **Pomijam** (słowo wypada z nauki) i **Uczę się dalej**. Historia karty nigdy nie jest kasowana, bo FSRS uczy się na niej. Panel wraca dopiero po kolejnych 6 pomyłkach.

### "Znam" i "Pomijam"

Talia Oxford 3000 zawiera mnóstwo słów, które już się zna. Są na to dwa osobne wyjścia. Ekran nauki nie ma przycisków, więc oba stoją w **Menu > Słówka** (a dla czytnika ekranu także wśród ukrytych przycisków karty).

- **Znam** (tylko dla nowej karty) to **jednorazowe sprawdzenie za około 45 dni**. Zwykłe FSRS po ocenie "łatwe" dałoby około 8 dni, więc setka słów oznaczonych w trzy dni wróciłaby jedną falą. Karta idzie od razu do powtórek ze stabilnością co najmniej 45 dni; po tym jednym sprawdzeniu liczy się już normalnie.
- **Pomijam** (dla **każdego** słowa, w obu kierunkach) wyrzuca słowo z nauki na dobre: nie ma go w żadnej serii, w limicie nowych ani w "Zaległych". Postęp nie jest kasowany - karty obu kierunków zostają w pamięci nietknięte, więc **Menu > Słówka > Przywróć** oddaje słowo dokładnie w to samo miejsce harmonogramu. Pierwsze użycie pokazuje podpowiedź, gdzie szukać przywracania. "Cofnij" działa też dla pominięcia.

W statystykach pominięte mają własny wiersz. Do "Poznanych słów" liczą się nadal te, które przeszły przez naukę, a prognoza ukończenia talii liczy tylko słowa, które jeszcze mogą być wprowadzone.

### Rozrzut terminów

Każda ocena poza treningiem przesuwa termin z FSRS o kilka procent w jedną albo drugą stronę (najwyżej ±21 dni, tylko dla terminów dalszych niż 3 dni). Przesunięcie jest deterministyczne (hash z klucza karty i terminu, bez losowania), więc wynik oceny da się powtórzyć i przetestować. Dzięki temu karty ocenione tego samego dnia nie wracają wszystkie jednego dnia.

Przy pierwszym uruchomieniu po tej zmianie apka raz rozkłada terminy, które już są w zapisie (mocniej, bo o ±25%), i zapisuje `rozproszono: 1`, żeby nie robić tego drugi raz. Karty nowe, zaległe i te bliżej niż 3 dni zostają nietknięte.

### Tryb "Trudne słowa" (trening)

Przycisk jest w menu, z liczbą dostępnych kart; gdy nie ma żadnej karty z pomyłką, jest nieaktywny z podpisem "Brak trudnych słów".

Do treningu trafiają karty (oba kierunki) z co najmniej jedną pomyłką, najpierw te z największą liczbą pomyłek. **Ocena w treningu nie zmienia stanu karty ani terminu powtórki** - to tylko powtarzanie. Liczą się za to punkty, combo, cel dnia, seria i historia dnia. Na karcie widać znacznik "Trening: terminy bez zmian", a ekran końca pisze wprost, że to był trening.

### Cofnięcie oceny

Cofa się **dwukrotnym dotknięciem karty** (drugie w ciągu 280 ms). Pierwsze dotknięcie działa od razu (odsłania) i nie czeka na ewentualne drugie. Dopóki migawka jest ważna, w menu jest też pozycja "Cofnij ostatnią ocenę", a dla czytnika ekranu ukryty przycisk na karcie. Cofnięcie przywraca dokładnie poprzedni stan (kartę, listę pominiętych, punkty łączne, serię, licznik dnia, combo, historię) i pokazuje kartę w tym samym stanie odsłonięcia, w jakim była. Migawka unieważnia się po kolejnej ocenie, po wyjściu z serii i po starcie apki. Gdy nie ma czego cofać, pojawia się tylko mikro-notka.

### Podpowiedź na karcie mówienia

Ustawienie `Podpowiedź na karcie mówienia`: **brak** (domyślnie), **długość** (same podkreślenia i granice wyrazów), **litera** (pierwsza litera plus podkreślenia). Niezależnie od ustawienia na karcie jest przycisk "Podpowiedź", który dla tej jednej karty podnosi poziom o jeden (brak → długość → litera). Następna karta wraca do ustawienia.

Przycisk jest **niewidoczny przez pierwsze 7 sekund** od pokazania karty, a karta, na której użyto podpowiedzi, **nie może w tej odsłonie dostać oceny "Umiem"**: przycisk jest wtedy nieaktywny z podpisem "z podpowiedzią maks. Prawie". Łatwiejsze wydobycie z pamięci daje mniejszy zysk, więc podpowiedź ma kosztować.

### Gry: Krzyżówka i Literki

Obie gry wchodzą z ekranu wyboru i **nie zmieniają harmonogramu ani stanu kart** - dokładnie jak trening "Trudne słowa". Do dnia nauki liczy się z nich wyłącznie czas. Słowa biorą się z kart do powtórki na dziś (oba kierunki, bez pominiętych i bez wyłączonych talii); gdy jest ich mniej niż 6, dochodzą ostatnio uczone. Nowe słowa do gier nie trafiają, bo gracz ich jeszcze nie widział. Gdy słów jest za mało, przycisk odpowiada jednym zdaniem zamiast otwierać pustą grę.

**Krzyżówka**: siatka maksymalnie 11x11 (komórka ma co najmniej 28 px, na 375 px wychodzi 30 px), hasła to polskie tłumaczenia, odpowiedzi angielskie. Dotknięcie pola wybiera hasło i podświetla je w całości, a treść hasła stoi nad klawiaturą; kolejne dotknięcie tego samego pola zmienia kierunek, gdy krzyżują się tam dwa hasła. Litery wpisuje klawiatura systemowa (ukryte pole tekstowe), Backspace cofa. "Sprawdź" koloruje litery poprawne na zielono, błędne na cynobrowo, "Podpowiedz literę" odkrywa jedną literę maksymalnie 3 razy i pokazuje, ile zostało. Po uzupełnieniu wszystkich pól krzyżówka sprawdza się sama. Wynik to liczba haseł, liczba podpowiedzi i czas. Generator mieści średnio około 83% podanych słów, więc dostaje ich kilka więcej niż ma ułożyć - nieużyte słowo to normalny wynik, nie błąd.

**Literki**: seria 10 słów. U góry polskie znaczenie, pod nim miejsca na litery odpowiedzi, na dole rozsypane kafelki (co najmniej 44 px, w jednym albo dwóch rzędach; przy słowach do 6 znaków dochodzą 2-3 litery zbędne, dobrane tak, żeby nie ułożyło się z nich inne słowo z talii). Dotknięcie kafelka dostawia literę, dotknięcie odpowiedzi cofa ostatnią. Poprawne słowo daje krótką animację, wymowę na głos i przechodzi dalej; błąd to samo drgnięcie kafelków i możliwość poprawy, bez kary. Na końcu serii: liczba słów, liczba podpowiedzi, czas oraz "Jeszcze raz" i "Wróć".

Z obu gier wychodzi się gestem w dół albo krzyżykiem w rogu.

### Talie (menu)

Sekcja **Talie** wypisuje talie w kolejności dodania, z liczbą słów, liczbą poznanych i przełącznikiem "ucz się z tej talii". Wyłączona talia znika z nauki i z gier (jeden filtr w silniku, ten sam, który odsiewa słowa pominięte), ale jej postęp zostaje w zapisie nietknięty, więc włączenie oddaje wszystko w to samo miejsce harmonogramu. Domyślnie wszystkie talie są włączone, więc przy jednej talii nic się nie zmienia.

Nową talię dodaje się tym samym ekranem "Dodaj słówka", który ma teraz pole **Nazwa talii** (domyślnie nazwa z pliku albo "Wklejone RRRR-MM-DD"). Przycisk "Usuń" kasuje słowa talii **razem z ich postępem**, po potwierdzeniu, które podaje liczbę słów i kart do stracenia.

Lista wyłączonych talii leży w ustawieniach jako opcjonalne pole `wylaczoneTalie`. `WERSJA_ZAPISU` zostaje 1, a zapis bez tego pola wczytuje się bez zmian (wszystkie talie włączone).

### Statystyki i przegląd talii (menu)

- statystyki zaczynają się od kilku krótkich zdań ("Znasz 412 z 2981 słów, utrwalonych 62.", "W tym tygodniu 340 kart.", "Najdłuższa seria: 13 dni.", "Zwykle odpowiadasz w 2,5 s."), a cała tabela liczb siedzi pod rozwijanym **Szczegóły**,
- heatmapa ostatnich 30 dni: kolumny to dni tygodnia, 5 stopni intensywności, data i liczba kart w podpowiedzi, a pod siatką podsumowanie („dziś N kart · najlepszy dzień · dni z nauką"),
- "Utrwalone słowa": karty EN o stabilności co najmniej 30 dni (to z nich rośnie jaśniejszy segment paska talii), "Opanowane": co najmniej 21 dni, oraz "Pominięte": ile słów jest poza pulą nauki,
- prognoza ukończenia talii z tempa nowych słów z ostatnich 14 dni ("Przy tym tempie: około 15 lutego 2027 (413 dni)"); gdy nie ma danych, wypisuje "Brak danych o tempie",
- sekcja **Słówka**: szukanie po angielskim i po polsku (bez rozróżniania wielkości liter i polskich znaków), maksymalnie 50 wierszy z licznikiem "pokazano 50 z 312". Każdy wiersz ma słowo, tłumaczenie, chip poziomu, stan karty EN po polsku (nowa / w nauce / powtórka za N dni / opanowane) oraz przyciski "Znam" (tylko dla nowej karty, sprawdzenie za około 45 dni bez wchodzenia w serię), "Pomijam" (wyrzuca słowo z nauki bez kasowania postępu), "Zresetuj" (kasuje postęp obu kierunków po potwierdzeniu) i "Zgłoś błąd". Słowo pominięte ma stan "pominięte" i zamiast nich przycisk "Przywróć", który oddaje je do nauki bez utraty postępu,
- sekcja **Zgłoszone błędy** (widoczna, gdy coś jest): lista, "Kopiuj listę" (JSON do schowka, a gdy schowek jest niedostępny, zaznaczony tekst do skopiowania) i "Wyczyść".

## Budowanie i testy

Polecenia z katalogu projektu:

```
node narzedzia/ikony.mjs   # tylko przy zmianie ikon, PNG leżą w zrodlo/
node zbuduj.mjs            # zrodlo/ + lib/fsrs.mjs -> dist/ (+ dist/sw.js, dist/.nojekyll)
node --test                # testy logiki i algorytmu; z katalogu wyżej: node --test magic-mini-fiszki/
```

## Test lokalny

```
node serwer.mjs
```

- http://127.0.0.1:4200/ oraz http://127.0.0.1:4200/magic-mini-fiszki/ (podkatalog jak na GitHub Pages)
- przykładowe słowa: `dane/przyklad.json` (Dodaj słówka > Wczytaj z pliku)
- Chrome DevTools > Application: Service Workers, Cache Storage (`mmf-<wersja>`), IndexedDB (`mmf`), Local Storage (`mmf-v1`)
- Network > Offline i odśwież stronę: musi się wczytać
- klawiatura: spacja odsłania, strzałka w prawo Umiem, w lewo Nie umiem, w górę Prawie, w dół koniec nauki, `z` Znam

## Wdrożenie (GitHub Pages)

Adres: **https://magic-lewko.github.io/magic-mini-fiszki/**

```
node zbuduj.mjs && bash wdroz.sh
```

`wdroz.sh` wgrywa zawartość `dist/` (razem z `.nojekyll`) na gałąź `gh-pages` publicznego repozytorium `magic-lewko/magic-mini-fiszki` i czeka, aż Pages poda nową wersję pod adresem bez parametrów (CDN trzyma stary plik do 10 minut). Dopiero po komunikacie "Gotowe" otwieraj apkę na telefonie. Gałąź `main` jest na kod źródłowy z tego folderu (`dist/` jest w `.gitignore`). Jeśli repozytorium albo Pages jeszcze nie istnieją, skrypt je zakłada. Logowanie bierze z Git Credential Manager.

Ścieżki są względne, więc podkatalog działa. Każda zmiana plików daje nową `WERSJA` w `sw.js`: telefon pobierze ją w tle i pokaże baner "Nowa wersja gotowa" na ekranie końca serii i w menu. Pages trzyma pliki w cache do 10 minut, więc nowa wersja może dotrzeć z opóźnieniem.

## Talie

- `talie/oxford3000.json`: 2981 słów z listy Oxford 3000 (A1-B2) z własnymi tłumaczeniami i zdaniami, po niezależnym przeglądzie. Nie trafia do zbudowanej apki (`gh-pages`). Surowe dane OUP z definicjami są w `.gitignore`. Przed pierwszym pushem źródeł trzeba zdecydować, czy sama talia ma być w publicznym repo, bo wybór słów i poziomy pochodzą z listy Oxfordu.
- `talie/zrodla/`: z czego i jak powstała talia (`dane/przygotuj.mjs` dzieli listę na paczki, `dane/scal.mjs` scala tłumaczenia i poprawki z przeglądu). Poprawkę pojedynczego słowa dopisz do `POPRAWKI` w `scal.mjs` i uruchom `node dane/scal.mjs` z katalogu `talie/zrodla/`. Wynik trafia do `talie/zrodla/dane/oxford3000.json`: skopiuj go do `talie/` i wczytaj talię ponownie w apce. Postęp zostaje.

## Instalacja na iPhonie

1. Safari > wpisz adres > Udostępnij > Do ekranu początkowego. Przełącznik "Otwórz jako aplikację internetową" (iOS 26) zostaw WŁĄCZONY, inaczej ikona otworzy zwykłą kartę Safari.
2. Otwieraj zawsze z ikony. Safari i ikona mają osobne dane, postęp z karty Safari nie przechodzi do apki.
3. Pierwsze otwarcie z internetem. Poczekaj, aż w górnym pasku pojawi się "offline ✓".
4. Dodaj słówka > Wczytaj z pliku > wybierz `oxford3000.json` z Plików lub iCloud Drive > sprawdź podgląd > Dodaj.
5. Menu > Zapisz kopię > Zachowaj w Plikach (albo iCloud Drive).

### Jak przerzucić plik z Windows na iPhone'a

- iCloud.com w przeglądarce > iCloud Drive > prześlij plik. Na iPhonie: Pliki > iCloud Drive.
- Albo mail do siebie z plikiem w załączniku. Na iPhonie przytrzymaj załącznik > Zapisz w Plikach.

## Checklista przed wyjazdem (na prawdziwym iPhonie)

- [ ] w górnym pasku "offline ✓", Menu > Offline: zapisane pliki N/N
- [ ] tryb samolotowy, zamknij apkę w przełączniku aplikacji, otwórz z ikony: startuje, słówka są
- [ ] w trybie samolotowym jedna seria, zamknij apkę i otwórz: punkty, seria i postęp zostały
- [ ] wyjdź z apki do ekranu początkowego: na ikonie pojawia się odznaka z liczbą kart na dziś (iOS 16.4+, tylko z ikony)
- [ ] wibracja przy tapnięciu w kartę (odsłonięcie); swipe na iOS nie wibruje, to normalne (Ustawienia > Dźwięki i haptyka > Haptyka systemowa musi być włączona)
- [ ] gest w cztery strony da się wykonać kciukiem jedną ręką, a podświetlenie kierunku widać przed puszczeniem palca
- [ ] dwukrotne dotknięcie cofa ocenę, a pojedyncze odsłania od razu (bez zauważalnej zwłoki)
- [ ] ekran wyboru i ekran końca serii mieszczą się bez przewijania (sprawdzone w Chrome na 375x667, ale iPhone ma inne paski systemowe)
- [ ] przycisk "Podpowiedź" na karcie mówienia nie odsłania karty przy tapnięciu
- [ ] 🔊 mówi po angielsku w trybie samolotowym (jeśli milczy: Ustawienia > Dostępność > Treść mówiona > Głosy > Angielski, pobierz głos)
- [ ] przewijanie karty gestem nie przewija strony i nie powiększa jej szczypaniem
- [ ] VoiceOver widzi przyciski ocen mimo że nic nie widać na ekranie
- [ ] Menu > Zapisz kopię, plik widać w Plikach
- [ ] nie czyść danych Safari (Ustawienia > Safari > Wymaż historię i dane), to może usunąć postęp

## W podróży

- Gdyby zniknęły słówka (pusta talia): Dodaj słówka > Wczytaj z pliku > `oxford3000.json`. Postęp jest zapisany osobno po `id` słowa, więc wraca razem ze słowami.
- Menu > Wczytaj kopię łączy kopię z obecnym postępem: nowsze powtórki zostają, starszy plik niczego nie cofa. Lista pominiętych słów to suma obu stron (jeśli na którymkolwiek telefonie słowo wypadło z nauki, zostaje poza nią). Stan sprzed wczytania trafia też do `mmf-v1-przed-wczytaniem`.
- Komunikat "Baza słówek nie odpowiada": zamknij apkę w przełączniku aplikacji i otwórz ponownie.
- Komunikat "Pominięto N uszkodzonych kart": reszta postępu działa, surowy zapis leży w `mmf-v1-uszkodzony`.

### Zasady

- Nie wdrażaj nowych wersji w czasie wyjazdu. Nowa wersja pobiera się w tle i po zamknięciu apki włącza się sama, bez możliwości sprawdzenia jej przed użyciem.
- Poprawiając pisownię słowa w talii, zostaw stare `id`. Nowe `id` to nowe słowo: powstanie duplikat bez postępu, a stare zostanie w talii.

## Formaty słówek

1. Obiekt JSON: `{ "nazwa": "Oxford 3000", "zrodlo": "...", "slowa": [ { "id", "w", "pl", "poziom", "ipa", "czesci", "zdanie", "zdaniePl" } ] }`
2. Sama tablica JSON słów w tym samym kształcie.
3. Tekst, linia po linii: `english ; polski` albo z tabulatorem, opcjonalnie dalej `; zdanie ; zdanie po polsku`. Puste linie i linie od `#` są pomijane.

Wymagane są `w` i `pl`. `id` to domyślnie `w` i rozróżnia wielkość liter ("May" i "may" to dwa słowa). Nazwa talii domyślnie "Wklejone RRRR-MM-DD". Przy ponownym imporcie nowe słowa idą na koniec kolejności nauki, istniejące dostają nową treść (pola pominięte w imporcie zostają), postęp nigdy nie jest kasowany.

## Gdzie są dane i jak je odzyskać

- `mmf-v1` (localStorage): postęp w zwartej postaci, zapisywany po każdej ocenie. Format ma nadal `wersja: 1`: nowe pola (`historia`, `zgloszenia`, `pominiete`, `rozproszono`, `nadrabianie`, `dzis.powtorki`, dodatkowe pola serii, ustawienia `celDzienny`, `podpowiedzMowienie`, `maksPowtorekDziennie` i `samouczekGestow`) są opcjonalne, więc zapis ze starszej wersji apki wczytuje się bez zmian, a brak pola daje wartość domyślną. Pole `exp` zostało w zapisie pod starą nazwą i znaczy "punkty łącznie": apka go nie pokazuje, ale nie kasuje. Pole `punktyTygodnia` ze starszego zapisu jest po prostu ignorowane, bo licznika tygodnia już nie ma. Karta ma 9 liczb, a dwie kolejne (licznik kolejnych ocen "Umiem" i licznik panelu słów opornych) dopisują się tylko wtedy, gdy nie są zerowe. `historia` to `{ "RRRR-MM-DD": { oceny, nowe, exp, sekundy, tempo, czasy } }` przycinane przy zapisie do ostatnich 180 dni; `tempo` to mediana czasów odpowiedzi z dnia, a surowe `czasy` (najwyżej 200) zostają tylko przy dzisiejszym dniu. `pominiete` to `{ "id słowa": "RRRR-MM-DD" }`, a `rozproszono: 1` znaczy, że jednorazowe rozłożenie terminów już się odbyło.
- `mmf-v1-poprzedni`: kopia postępu z początku dnia; gdy `mmf-v1` jest uszkodzony w całości, apka sama z niej wraca, a uszkodzony tekst odkłada do `mmf-v1-uszkodzony`. Pojedyncza uszkodzona karta jest tylko pomijana.
- `mmf-v1-przed-wczytaniem`: postęp sprzed wczytania kopii z pliku
- IndexedDB `mmf` / `dane` / `talia`: słówka
- plik `fiszki-kopia-RRRR-MM-DD.json`: słówka i postęp; Menu > Wczytaj kopię odtwarza wszystko na nowym telefonie, a na używanym łączy się z zapisanym postępem
