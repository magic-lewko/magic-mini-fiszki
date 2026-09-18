# magic-mini-fiszki

Fiszki na telefon (PWA offline). Nauka słówek w stylu przewijania kart: karta EN (co to znaczy?) i karta mówienia PL (powiedz po angielsku), powtórki FSRS-6. Po pierwszym otwarciu działa bez internetu. Zero zależności, czysty JS i CSS.

Apka nie ma wbudowanej listy słów. Słówka dodaje się w aplikacji (wklejenie albo plik) i zostają w telefonie (IndexedDB). Postęp jest w localStorage, kopia zapasowa zawiera słówka i postęp.

Algorytm powtórek `lib/fsrs.mjs` (z testem `lib/fsrs.test.mjs`) to kopia z `magic-mini-english`, ten sam co w apce na PC. Poprawkę algorytmu nanieś w obu projektach.

## Jak się tego używa

1. **Ekran startu dnia** (po otwarciu apki i po "Koniec na dziś"): poziom gracza z paskiem, cel dzienny, cztery liczby (zaległe, później dziś, nowe w limicie, trudne), streak, duży przycisk **Start** i mniejszy **Trudne słowa**.
2. **Seria**: karta po karcie. Dotknięcie odsłania, dopiero wtedy pojawiają się oceny. Górny rząd akcji jest widoczny od razu: **Znam** (tylko na nowej karcie), **Pomijam** (na każdej) i **Cofnij** (po ocenie).
3. **Trzy oceny w jednym rzędzie**: **Nie umiem** (czerwony), **Prawie** (bursztynowy, węższy), **Umiem** (zielony). Swipe w górę to Umiem, w dół Nie umiem. Tylko "Nie umiem" wraca do kolejki serii; "Prawie" zdejmuje kartę jak "Umiem", ale daje krótszy termin i mniej EXP.
4. **Koniec serii**: zdobyte EXP, blok awansu (gdy poziom poszedł w górę), Umiem / Prawie / Nie umiem, pasek celu dnia, streak i przyciski do następnej serii, treningu albo powrotu na ekran startu.

### EXP i poziomy

| Ocena | EXP |
| --- | --- |
| Nie umiem (1) | 10 |
| Prawie (2) | 30 |
| Umiem (3) | 50 |
| Znam (4) | 20 |
| bonus za co piąte combo | 10 |

Poziom 1 zaczyna się od 0 EXP, awans na poziom 2 kosztuje 200 EXP, a każdy kolejny awans jest o 15% droższy (zaokrąglone do 10 EXP). Tytuły: 1-4 Początkujący, 5-9 Turysta, 10-14 Rozmówca, 15-19 Swobodny, 20-29 Biegły, 30+ Native wannabe. Górny pasek pokazuje `Lv N` z cienkim paskiem do następnego poziomu; pełne EXP i tytuł są w menu i na ekranie końca serii.

**Combo** to kolejne oceny inne niż "Nie umiem" w obrębie jednej serii. Od 3 w górę widać je na karcie ("combo x4"), co piąte daje 10 EXP bonusu i osobną wibrację. Combo zeruje "Nie umiem" i koniec serii.

**Cel dzienny** (30 / 60 / 100 / 150, domyślnie 60) liczy oceniane karty z danego dnia, razem z treningiem. Pasek celu jest na ekranie startu i na końcu serii.

### "Znam" i "Pomijam"

Talia Oxford 3000 zawiera mnóstwo słów, które już się zna. Są na to dwa różne przyciski w górnym rzędzie akcji.

- **Znam** (tylko na nowej karcie, też w przeglądzie talii) to **jednorazowe sprawdzenie za około 45 dni**. Zwykłe FSRS po ocenie "łatwe" dałoby około 8 dni, więc setka słów oznaczonych w trzy dni wróciłaby jedną falą. Karta idzie od razu do powtórek ze stabilnością co najmniej 45 dni; po tym jednym sprawdzeniu liczy się już normalnie.
- **Pomijam** (na **każdej** karcie, w obu kierunkach, także w treningu) wyrzuca słowo z nauki na dobre: nie ma go w żadnej serii, w limicie nowych ani w "Zaległych". Postęp nie jest kasowany - karty obu kierunków zostają w pamięci nietknięte, więc **Menu > Słówka > Przywróć** oddaje słowo dokładnie w to samo miejsce harmonogramu. Pierwsze użycie pokazuje podpowiedź, gdzie szukać przywracania. "Cofnij" działa też dla pominięcia.

W statystykach pominięte mają własny wiersz. Do "Poznanych słów" liczą się nadal te, które przeszły przez naukę, a prognoza ukończenia talii liczy tylko słowa, które jeszcze mogą być wprowadzone.

### Rozrzut terminów

Każda ocena poza treningiem przesuwa termin z FSRS o kilka procent w jedną albo drugą stronę (najwyżej ±21 dni, tylko dla terminów dalszych niż 3 dni). Przesunięcie jest deterministyczne (hash z klucza karty i terminu, bez losowania), więc wynik oceny da się powtórzyć i przetestować. Dzięki temu karty ocenione tego samego dnia nie wracają wszystkie jednego dnia.

Przy pierwszym uruchomieniu po tej zmianie apka raz rozkłada terminy, które już są w zapisie (mocniej, bo o ±25%), i zapisuje `rozproszono: 1`, żeby nie robić tego drugi raz. Karty nowe, zaległe i te bliżej niż 3 dni zostają nietknięte.

### Tryb "Trudne słowa" (trening)

Przycisk jest na ekranie startu, na ekranie końca serii i w menu, wszędzie z liczbą dostępnych kart; gdy nie ma żadnej karty z pomyłką, jest nieaktywny z podpisem "Brak trudnych słów".

Do treningu trafiają karty (oba kierunki) z co najmniej jedną pomyłką, najpierw te z największą liczbą pomyłek. **Ocena w treningu nie zmienia stanu karty ani terminu powtórki** - to tylko powtarzanie. Liczą się za to EXP, combo, cel dnia, czas nauki (streak) i historia dnia. Na karcie widać znacznik "Trening: terminy bez zmian", a ekran końca pisze wprost, że to był trening.

### Cofnięcie oceny

Po każdej ocenie (także w treningu) i po "Pomijam" pod kartą, w rzędzie akcji obok „Znam”, pojawia się przycisk **Cofnij**, który znika po 6 sekundach. Dopóki migawka jest ważna, w menu jest też pozycja "Cofnij ostatnią ocenę". Cofnięcie przywraca dokładnie poprzedni stan (kartę, listę pominiętych, EXP, streak, licznik dnia, combo, historię) i pokazuje kartę w tym samym stanie odsłonięcia, w jakim była. Migawka unieważnia się po kolejnej ocenie, po wyjściu z serii i po starcie apki.

### Podpowiedź na karcie mówienia

Ustawienie `Podpowiedź na karcie mówienia`: **brak** (domyślnie), **długość** (same podkreślenia i granice wyrazów), **litera** (pierwsza litera plus podkreślenia). Niezależnie od ustawienia na karcie jest przycisk "Podpowiedź", który dla tej jednej karty podnosi poziom o jeden (brak → długość → litera). Następna karta wraca do ustawienia.

### Statystyki i przegląd talii (menu)

- heatmapa ostatnich 30 dni: kolumny to dni tygodnia, 5 stopni intensywności, data i liczba kart w podpowiedzi, a pod siatką podsumowanie („dziś N kart · najlepszy dzień · dni z nauką"),
- "Opanowane": karty EN o stabilności co najmniej 21 dni, oraz "Pominięte": ile słów jest poza pulą nauki,
- prognoza ukończenia talii z tempa nowych słów z ostatnich 14 dni ("Przy tym tempie: około 15 lutego 2027 (413 dni)"); gdy nie ma danych, wypisuje "Brak danych o tempie",
- sekcja **Słówka**: szukanie po angielskim i po polsku (bez rozróżniania wielkości liter i polskich znaków), maksymalnie 50 wierszy z licznikiem "pokazano 50 z 312". Każdy wiersz ma słowo, tłumaczenie, chip poziomu, stan karty EN po polsku (nowa / w nauce / powtórka za N dni / opanowane) oraz przyciski "Znam" (tylko dla nowej karty, sprawdzenie za około 45 dni bez wchodzenia w serię), "Zresetuj" (kasuje postęp obu kierunków po potwierdzeniu) i "Zgłoś błąd". Słowo pominięte ma stan "pominięte" i zamiast "Znam" i "Zresetuj" przycisk "Przywróć", który oddaje je do nauki bez utraty postępu,
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
- klawiatura: spacja odsłania, strzałka w górę Umiem, w dół Nie umiem, `z` Znam (oceny "Prawie" i "Pomijam" tylko przyciskiem)

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
- [ ] w trybie samolotowym jedna seria, zamknij apkę i otwórz: EXP, streak i postęp zostały
- [ ] wibracja przy tapnięciu w kartę (odsłonięcie) i w przyciski Nie umiem / Prawie / Umiem / Znam / Pomijam; swipe na iOS nie wibruje, to normalne (Ustawienia > Dźwięki i haptyka > Haptyka systemowa musi być włączona)
- [ ] trzy przyciski górnego rzędu (Cofnij, Znam, Pomijam) mieszczą się obok siebie i da się w nie trafić kciukiem
- [ ] ekran startu dnia i ekran końca serii mieszczą się bez przewijania (sprawdzone w Chrome na 375x667, ale iPhone ma inne paski systemowe)
- [ ] przycisk "Cofnij" nad kartą da się trafić kciukiem i nie łapie przypadkowych tapnięć w kartę
- [ ] przycisk "Podpowiedź" na karcie mówienia nie odsłania karty przy tapnięciu
- [ ] 🔊 mówi po angielsku w trybie samolotowym (jeśli milczy: Ustawienia > Dostępność > Treść mówiona > Głosy > Angielski, pobierz głos)
- [ ] swipe w górę i w dół po odsłonięciu, tapnięcie nie ocenia karty
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

- `mmf-v1` (localStorage): postęp w zwartej postaci, zapisywany po każdej ocenie. Format ma nadal `wersja: 1`: nowe pola (`historia`, `zgloszenia`, `pominiete`, `rozproszono`, ustawienia `celDzienny` i `podpowiedzMowienie`) są opcjonalne, więc zapis ze starszej wersji apki wczytuje się bez zmian, a brak pola daje wartość domyślną. `historia` to `{ "RRRR-MM-DD": { oceny, nowe, exp, sekundy } }` przycinane przy zapisie do ostatnich 180 dni. `pominiete` to `{ "id słowa": "RRRR-MM-DD" }`, a `rozproszono: 1` znaczy, że jednorazowe rozłożenie terminów już się odbyło.
- `mmf-v1-poprzedni`: kopia postępu z początku dnia; gdy `mmf-v1` jest uszkodzony w całości, apka sama z niej wraca, a uszkodzony tekst odkłada do `mmf-v1-uszkodzony`. Pojedyncza uszkodzona karta jest tylko pomijana.
- `mmf-v1-przed-wczytaniem`: postęp sprzed wczytania kopii z pliku
- IndexedDB `mmf` / `dane` / `talia`: słówka
- plik `fiszki-kopia-RRRR-MM-DD.json`: słówka i postęp; Menu > Wczytaj kopię odtwarza wszystko na nowym telefonie, a na używanym łączy się z zapisanym postępem
