#!/usr/bin/env bash
# L0 gate: typecheck, lint, build. Budget 90 s. Run on the rebased branch before every merge.
#   scripts/gate.sh          full gate
#   scripts/gate.sh --fast   skip the build while iterating (never as the final gate)
# Project-specific checks go in scripts/gate.local.sh (runs last if present).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

fast=0
[[ "${1:-}" == "--fast" ]] && fast=1

if [[ -f pnpm-lock.yaml ]]; then pm=pnpm; px="pnpm exec"
elif [[ -f bun.lock || -f bun.lockb ]]; then pm=bun; px="bunx"
elif [[ -f yarn.lock ]]; then pm=yarn; px="yarn"
else pm=npm; px="npx --no-install"; fi

has_script() { node -e "process.exit(require('./package.json').scripts?.['$1'] ? 0 : 1)" 2>/dev/null; }
log_dir="$(mktemp -d "${TMPDIR:-/tmp}/hack-gate.XXXXXX")"
started=$(date +%s)
failed=0

step() {
  local label="$1"; shift
  local t0=$(date +%s)
  if "$@" >"$log_dir/$label.log" 2>&1; then
    printf 'ok    %-10s %3ss\n' "$label" "$(( $(date +%s) - t0 ))"
  else
    printf 'FAIL  %-10s %3ss\n' "$label" "$(( $(date +%s) - t0 ))"
    tail -n 40 "$log_dir/$label.log" | sed 's/^/      /'
    failed=1
  fi
}

[[ -f package.json ]] || { echo "gate: no package.json at repo root"; exit 1; }
[[ -d node_modules ]] || step install $pm install

if [[ -f tsconfig.json ]]; then
  # Next.js 15.5+ declares route types (LayoutProps, PageProps) in generated files; tsc needs them first.
  if [[ -x node_modules/.bin/next ]] && $px next typegen --help >/dev/null 2>&1; then
    step typegen $px next typegen
  fi
  step typecheck $px tsc --noEmit -p tsconfig.json
else echo "skip  typecheck  (no tsconfig.json)"; fi

if has_script lint; then step lint $pm run lint
else echo "skip  lint       (no lint script)"; fi

if (( fast )); then echo "skip  build      (--fast)"
elif has_script build; then step build $pm run build
else echo "skip  build      (no build script)"; fi

[[ -x scripts/gate.local.sh ]] && step local scripts/gate.local.sh

total=$(( $(date +%s) - started ))
rm -rf "$log_dir"
if (( failed )); then echo "gate FAILED in ${total}s"; exit 1; fi
echo "gate ok in ${total}s$( (( fast )) && echo ' (fast: build skipped)')"
(( total > 90 )) && echo "note: over the 90 s budget; use --fast while iterating, keep the full gate before merging"
exit 0
