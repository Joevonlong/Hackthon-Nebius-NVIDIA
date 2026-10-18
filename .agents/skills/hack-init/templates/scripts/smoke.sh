#!/usr/bin/env bash
# L1 smoke: walk the demo golden path with Playwright, one screenshot per beat. Budget 3 min.
#   scripts/smoke.sh                       local app (starts the dev server if none answers)
#   scripts/smoke.sh https://x.vercel.app  a deployed URL
#   scripts/smoke.sh <url> --live          real AI calls instead of demo-mode replays
#   scripts/smoke.sh <url> --capture       1920x1080 video with visible cursor, for hack-video
# Screenshots: hack/demo/shots/<beat>.png (capture: hack/demo/shots/capture/).
# Capture keeps every take: hack/demo/video/takes/take-<MMDD-HHMM>.webm + .beats.json.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

export HACK_DEMO=1 HACK_CAPTURE=0
for arg in "$@"; do
  case "$arg" in
    --live) HACK_DEMO=0 ;;
    --capture) HACK_CAPTURE=1 ;;
    http://*|https://*) export BASE_URL="${arg%/}" ;;
    *) echo "smoke: unknown argument $arg"; exit 2 ;;
  esac
done

if [[ -f pnpm-lock.yaml ]]; then px="pnpm exec"
elif [[ -f bun.lock || -f bun.lockb ]]; then px="bunx"
elif [[ -f yarn.lock ]]; then px="yarn"
else px="npx --no-install"; fi

if ! $px playwright --version >/dev/null 2>&1; then
  echo "smoke: Playwright missing. Install once: pnpm add -D @playwright/test && pnpm exec playwright install chromium"
  exit 1
fi

mkdir -p hack/demo/shots
(( HACK_CAPTURE )) && mkdir -p hack/demo/video/raw
started=$(date +%s)
echo "smoke: ${BASE_URL:-local dev server} · demo=$HACK_DEMO · capture=$HACK_CAPTURE"
$px playwright test e2e/golden-path.spec.ts --reporter=line
status=$?
total=$(( $(date +%s) - started ))
shots=hack/demo/shots; (( HACK_CAPTURE )) && shots=hack/demo/shots/capture
echo "screenshots:"; ls -1 "$shots"/*.png 2>/dev/null | sed 's/^/  /'
if (( HACK_CAPTURE )); then
  # Playwright empties its output folder on every run, so copy the take out now.
  take="hack/demo/video/takes/take-$(date +%m%d-%H%M)"
  mkdir -p hack/demo/video/takes
  video=$(find hack/demo/video/raw -name '*.webm' | head -1)
  if [[ -n "$video" ]]; then
    cp "$video" "$take.webm"
    [[ -f hack/demo/video/raw/beats.json ]] && cp hack/demo/video/raw/beats.json "$take.beats.json"
    echo "take: $take.webm$([[ -f "$take.beats.json" ]] && echo " + beats.json")"
  else
    echo "take: no video recorded"
  fi
fi
if (( status )); then echo "smoke FAILED in ${total}s"; exit 1; fi
echo "smoke ok in ${total}s"
(( total > 180 )) && echo "note: over the 3 min budget; trim waits or split beats"
exit 0
