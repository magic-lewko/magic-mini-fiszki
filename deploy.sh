#!/usr/bin/env bash
# Deploying the flashcards to GitHub Pages: dist/ goes to the gh-pages branch of the magic-lewko/magic-mini-fiszki repo.
# The main branch is for the source code (this folder), gh-pages only for the built app.
# Login: a token from Git Credential Manager (account magic-lewko, scope repo).
# Usage: bash deploy.sh (it builds by itself; with DIST=... it pushes a ready folder without building).
# The build needs node_modules (npm install), because Vite builds the app.
set -euo pipefail

OWNER=magic-lewko
REPO=magic-mini-fiszki
BRANCH=gh-pages
ROOT="$(cd "$(dirname "$0")" && pwd)"
# Saved before setting the default value: otherwise the condition below would always see DIST as given.
DIST_GIVEN="${DIST+yes}"
DIST="${DIST:-$ROOT/dist}"
API=https://api.github.com
GIT_URL="https://github.com/$OWNER/$REPO.git"
URL="https://$OWNER.github.io/$REPO/"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# We build right before pushing: a "node build.mjs" run by hand was once skipped and the previous version of the app
# went to the server, with the same checksum in sw.js.
if [ -z "$DIST_GIVEN" ]; then
  [ -d "$ROOT/node_modules" ] || { echo "No node_modules: run npm install in $ROOT first"; exit 1; }
  node "$ROOT/build.mjs" > /dev/null
fi
[ -f "$DIST/index.html" ] && [ -f "$DIST/sw.js" ] || { echo "No built app in $DIST (run node build.mjs)"; exit 1; }
VERSION=$(sed -n "s/^const VERSION = '\([0-9a-f]*\)'.*/\1/p" "$DIST/sw.js")
[ -n "$VERSION" ] || { echo "No VERSION in $DIST/sw.js"; exit 1; }

TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | GCM_INTERACTIVE=never git credential fill 2>/dev/null | sed -n 's/^password=//p')
[ -n "$TOKEN" ] || { echo "No saved GitHub login in Git Credential Manager"; exit 1; }
gh_api() { curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

if [ "$(gh_api -o /dev/null -w '%{http_code}' "$API/repos/$OWNER/$REPO")" = 404 ]; then
  echo "Creating the public repo $OWNER/$REPO"
  gh_api -X POST "$API/user/repos" \
    -d "{\"name\":\"$REPO\",\"description\":\"English flashcards that work offline (PWA)\",\"private\":false,\"has_issues\":false,\"has_wiki\":false,\"has_projects\":false}" >/dev/null
fi

# The gh-pages branch: cloned, and when it does not exist yet, it starts from an empty history (no code from main).
if ! git clone -q --branch "$BRANCH" --single-branch "$GIT_URL" "$WORK" 2>/dev/null; then
  rm -rf "$WORK" && mkdir -p "$WORK"
  git -C "$WORK" init -q -b "$BRANCH"
  git -C "$WORK" remote add origin "$GIT_URL"
fi

find "$WORK" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r "$DIST"/. "$WORK"/
git -C "$WORK" add -A
if git -C "$WORK" diff --cached --quiet; then
  echo "$BRANCH already has version $VERSION"
else
  git -C "$WORK" commit -q -m "feat: flashcards version $VERSION"
  git -C "$WORK" push -q origin "$BRANCH"
  echo "Pushed version $VERSION to $BRANCH"
fi

# PUT updates an existing site, and on a repo without Pages it returns 404, so then POST creates the site.
SOURCE="{\"build_type\":\"legacy\",\"source\":{\"branch\":\"$BRANCH\",\"path\":\"/\"}}"
if [ "$(gh_api -o /dev/null -w '%{http_code}' "$API/repos/$OWNER/$REPO/pages")" = 404 ]; then
  gh_api -X POST "$API/repos/$OWNER/$REPO/pages" -d "$SOURCE" -o /dev/null -w "pages (create): %{http_code}\n" || true
else
  gh_api -X PUT "$API/repos/$OWNER/$REPO/pages" -d "$SOURCE" -o /dev/null -w "pages: %{http_code}\n" || true
fi
# A push from before the source was set (for example the first push to gh-pages) does not start a build, so we ask for it.
gh_api -X POST "$API/repos/$OWNER/$REPO/pages/builds" -o /dev/null -w "Pages build: %{http_code}\n" || true

# We wait for the address without parameters, because that is the sw.js the phone gets; the Pages CDN keeps an old file
# for up to 10 minutes.
echo "Waiting until $URL serves version $VERSION (up to about 12 minutes)..."
for _ in $(seq 1 120); do
  if curl -s "${URL}sw.js" | grep -q "VERSION = '$VERSION'"; then
    echo "Done: $URL (version $VERSION). You can open it on the phone."
    exit 0
  fi
  sleep 6
done
echo "Pages does not serve version $VERSION yet. Do not install on the phone, check in a few minutes: $URL"
exit 1
