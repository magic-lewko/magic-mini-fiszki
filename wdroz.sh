#!/usr/bin/env bash
# Wdrazanie fiszek na GitHub Pages: dist/ trafia na galaz gh-pages repozytorium magic-lewko/magic-mini-fiszki.
# Galaz main jest na kod zrodlowy (ten folder), gh-pages tylko na zbudowana apke.
# Logowanie: token z Git Credential Manager (konto magic-lewko, zakres repo).
# Uzycie: bash wdroz.sh (buduje sam; z DIST=... wypchnie gotowy katalog bez budowania).
set -euo pipefail

WLASCICIEL=magic-lewko
REPO=magic-mini-fiszki
GALAZ=gh-pages
KORZEN="$(cd "$(dirname "$0")" && pwd)"
# Zapamietane przed ustawieniem domyslnej wartosci: inaczej warunek nizej zawsze widzialby DIST jako podane.
DIST_PODANY="${DIST+tak}"
DIST="${DIST:-$KORZEN/dist}"
API=https://api.github.com
ADRES_GIT="https://github.com/$WLASCICIEL/$REPO.git"
ADRES="https://$WLASCICIEL.github.io/$REPO/"
ROBOCZY="$(mktemp -d)"
trap 'rm -rf "$ROBOCZY"' EXIT

# Budujemy tuz przed wypchnieciem: recznie odpalany "node zbuduj.mjs" raz zostal pominiety i na serwer
# poszla poprzednia wersja apki, z ta sama suma kontrolna w sw.js.
if [ -z "$DIST_PODANY" ]; then
  node "$KORZEN/zbuduj.mjs" > /dev/null
fi
[ -f "$DIST/index.html" ] && [ -f "$DIST/sw.js" ] || { echo "Brak zbudowanej apki w $DIST (uruchom node zbuduj.mjs)"; exit 1; }
WERSJA=$(sed -n "s/^const WERSJA = '\([0-9a-f]*\)'.*/\1/p" "$DIST/sw.js")
[ -n "$WERSJA" ] || { echo "Nie ma WERSJA w $DIST/sw.js"; exit 1; }

TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | GCM_INTERACTIVE=never git credential fill 2>/dev/null | sed -n 's/^password=//p')
[ -n "$TOKEN" ] || { echo "Brak zapisanego logowania do GitHuba w Git Credential Manager"; exit 1; }
gh_api() { curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

if [ "$(gh_api -o /dev/null -w '%{http_code}' "$API/repos/$WLASCICIEL/$REPO")" = 404 ]; then
  echo "Zakladam publiczne repo $WLASCICIEL/$REPO"
  gh_api -X POST "$API/user/repos" \
    -d "{\"name\":\"$REPO\",\"description\":\"Fiszki do nauki angielskiego, dzialaja offline (PWA)\",\"private\":false,\"has_issues\":false,\"has_wiki\":false,\"has_projects\":false}" >/dev/null
fi

# Galaz gh-pages: sklonowana, a gdy jej jeszcze nie ma, zaczyna sie od pustej historii (bez kodu z main).
if ! git clone -q --branch "$GALAZ" --single-branch "$ADRES_GIT" "$ROBOCZY" 2>/dev/null; then
  rm -rf "$ROBOCZY" && mkdir -p "$ROBOCZY"
  git -C "$ROBOCZY" init -q -b "$GALAZ"
  git -C "$ROBOCZY" remote add origin "$ADRES_GIT"
fi

find "$ROBOCZY" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r "$DIST"/. "$ROBOCZY"/
git -C "$ROBOCZY" add -A
if git -C "$ROBOCZY" diff --cached --quiet; then
  echo "Na $GALAZ jest juz wersja $WERSJA"
else
  git -C "$ROBOCZY" commit -q -m "feat: fiszki w wersji $WERSJA"
  git -C "$ROBOCZY" push -q origin "$GALAZ"
  echo "Wyslano wersje $WERSJA na $GALAZ"
fi

# PUT aktualizuje istniejaca strone, a na repo bez Pages zwraca 404, wiec wtedy strone tworzy POST.
ZRODLO="{\"build_type\":\"legacy\",\"source\":{\"branch\":\"$GALAZ\",\"path\":\"/\"}}"
if [ "$(gh_api -o /dev/null -w '%{http_code}' "$API/repos/$WLASCICIEL/$REPO/pages")" = 404 ]; then
  gh_api -X POST "$API/repos/$WLASCICIEL/$REPO/pages" -d "$ZRODLO" -o /dev/null -w "pages (utworzenie): %{http_code}\n" || true
else
  gh_api -X PUT "$API/repos/$WLASCICIEL/$REPO/pages" -d "$ZRODLO" -o /dev/null -w "pages: %{http_code}\n" || true
fi
# Push sprzed ustawienia zrodla (np. pierwszy push na gh-pages) nie uruchamia budowania, wiec prosimy o nie jawnie.
gh_api -X POST "$API/repos/$WLASCICIEL/$REPO/pages/builds" -o /dev/null -w "budowanie Pages: %{http_code}\n" || true

# Czekamy na adres bez parametrow, bo taki sw.js dostaje telefon; CDN Pages trzyma stary plik do 10 minut.
echo "Czekam, az $ADRES poda wersje $WERSJA (do ok. 12 minut)..."
for _ in $(seq 1 120); do
  if curl -s "${ADRES}sw.js" | grep -q "WERSJA = '$WERSJA'"; then
    echo "Gotowe: $ADRES (wersja $WERSJA). Mozna otwierac na telefonie."
    exit 0
  fi
  sleep 6
done
echo "Pages jeszcze nie podaje wersji $WERSJA. Nie instaluj na telefonie, sprawdz za kilka minut: $ADRES"
exit 1
