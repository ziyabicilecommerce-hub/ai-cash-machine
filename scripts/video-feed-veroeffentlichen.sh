#!/usr/bin/env bash
# Ergaenzt video-feed/videos.json aus out/manifest.json und pusht. Hat parallel
# jemand anderes gepusht (z. B. #94 und #95 gleichzeitig), wird der Feed auf dem
# neuesten Stand neu erzeugt statt einen Merge-Konflikt zu riskieren. Danach entstehen die
# Video-Seiten + Sitemap (#100) und neue Seiten werden per IndexNow gemeldet.
#   scripts/video-feed-veroeffentlichen.sh BASIS_URL [weitere Dateien, z. B. anime-serie/serie.json]
set -euo pipefail
basis="$1"
shift
sicher=$(mktemp -d)
for f in "$@"; do mkdir -p "$sicher/$(dirname "$f")" && cp "$f" "$sicher/$f"; done
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
for versuch in 1 2 3 4 5; do
  git fetch -q origin "$GITHUB_REF_NAME"
  git reset -q --hard "origin/$GITHUB_REF_NAME"
  for f in "$@"; do mkdir -p "$(dirname "$f")" && cp "$sicher/$f" "$f"; done
  node automations/94-video-fabrik.mjs --feed "$basis"
  node automations/100-reichweite.mjs --seiten
  git add video-feed "$@"
  git commit -qm "chore: Video-Feed aktualisiert [skip ci]" || exit 0
  if git push -q origin "HEAD:$GITHUB_REF_NAME"; then node automations/100-reichweite.mjs --ping || true; exit 0; fi
  echo "Push abgelehnt - neuer Versuch ($versuch)"
  sleep $((versuch * 5))
done
exit 1
