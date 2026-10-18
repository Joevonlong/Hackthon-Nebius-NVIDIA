#!/usr/bin/env bash
# Deploy PaperTrail to a Nebius Serverless Endpoint (docs/PRODUCT_PLAN.md D-13, section 9).
# Usage: scripts/deploy.sh <version> [--dry-run]     e.g. scripts/deploy.sh v1
# Env:   NEBIUS_REGION (default eu-north1) · REGISTRY_NAME (default papertrail) · SUBNET_ID (default: first subnet found)
# Reads TOKEN_FACTORY_API_KEY, TAVILY_API_KEY, OPENALEX_API_KEY, OPENALEX_MAILTO from .env.local at the repo root; never prints them.
# Each deploy uses a new tag and endpoint name (papertrail-<version>); there is no update command and creation takes ~5 min.
set -euo pipefail

VERSION="${1:-}"
DRY_RUN=0
[[ "${2:-}" == "--dry-run" || "${DRY_RUN_ENV:-}" == "1" ]] && DRY_RUN=1
if [[ -z "$VERSION" ]]; then echo "usage: scripts/deploy.sh <version> [--dry-run]" >&2; exit 2; fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
REGION="${NEBIUS_REGION:-eu-north1}"
REGISTRY_NAME="${REGISTRY_NAME:-papertrail}"
NAME="papertrail-${VERSION}"
say() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
run() { if [[ $DRY_RUN == 1 ]]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi; }

# 1. Tools and login
command -v docker >/dev/null || die "docker not found"
command -v jq >/dev/null || die "jq not found (brew install jq)"
if ! command -v nebius >/dev/null; then
  [[ $DRY_RUN == 1 ]] || die "nebius CLI not found. Install: curl -sSL https://artifacts.nebius.cloud/cli/install.sh | bash ; then: nebius profile create"
  say "nebius CLI not installed (dry run continues)"
else
  nebius profile current >/dev/null 2>&1 || nebius profile list >/dev/null 2>&1 || {
    [[ $DRY_RUN == 1 ]] || die "no Nebius profile; run: nebius profile create"
  }
fi

# 2. Env for the endpoint (values are read, never echoed)
ENV_FILE=""
d="$ROOT"   # walk up so worktrees under .claude/worktrees find the repo-root file
while [[ "$d" != "/" ]]; do
  if [[ -f "$d/.env.local" ]]; then ENV_FILE="$d/.env.local"; break; fi
  d="$(dirname "$d")"
done
ENV_ARGS=()
if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
  for key in TOKEN_FACTORY_API_KEY TAVILY_API_KEY OPENALEX_API_KEY OPENALEX_MAILTO; do
    val="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -1 | sed -E "s/^[^=]*=//; s/^['\"]//; s/['\"]\$//")" || true
    if [[ -n "$val" ]]; then ENV_ARGS+=(--env "${key}=${val}"); say "env ${key}: set"; else say "env ${key}: missing (feature runs without it)"; fi
  done
else
  say "no .env.local found; deploying without API keys (demo mode still works)"
fi

# 3. Registry (create or reuse)
REGISTRY_PATH=""
if [[ $DRY_RUN == 0 ]]; then
  say "registry ${REGISTRY_NAME}"
  REG_ID="$(nebius registry list --format json 2>/dev/null | jq -r --arg n "$REGISTRY_NAME" '(.items // [])[] | select(.metadata.name == $n) | .metadata.id' | head -1 || true)"
  if [[ -z "$REG_ID" ]]; then
    REG_ID="$(nebius registry create --name "$REGISTRY_NAME" --format json | jq -r '.metadata.id')"
    say "created registry ${REG_ID}"
  else say "reusing registry ${REG_ID}"; fi
  REGISTRY_PATH="$(echo "$REG_ID" | cut -d- -f2)"
  nebius registry configure-helper
else
  say "registry: nebius registry list/create --name ${REGISTRY_NAME}; nebius registry configure-helper"
  REGISTRY_PATH="<registry-path>"
fi
IMAGE="cr.${REGION}.nebius.cloud/${REGISTRY_PATH}/papertrail:${VERSION}"

# 4. Build and push (linux/amd64)
say "build + push ${IMAGE}"
run docker buildx build --platform linux/amd64 -t "$IMAGE" --push .

# 5. Subnet
SUBNET="${SUBNET_ID:-}"
if [[ -z "$SUBNET" && $DRY_RUN == 0 ]]; then
  SUBNET="$(nebius vpc subnet list --format json | jq -r '(.items // [])[0].metadata.id')"
  [[ -n "$SUBNET" && "$SUBNET" != null ]] || die "no subnet found; set SUBNET_ID"
fi
SUBNET_ARGS=(); [[ -n "$SUBNET" ]] && SUBNET_ARGS=(--subnet-id "$SUBNET")
[[ $DRY_RUN == 1 && -z "$SUBNET" ]] && SUBNET_ARGS=(--subnet-id "<subnet-id>")

# 6. Create the endpoint
say "create endpoint ${NAME}"
run nebius ai endpoint create --name "$NAME" --image "$IMAGE" \
  --platform cpu-d3 --preset 2vcpu-8gb --container-port 3000 --disk-size 20Gi \
  "${SUBNET_ARGS[@]}" "${ENV_ARGS[@]+"${ENV_ARGS[@]}"}"

if [[ $DRY_RUN == 1 ]]; then say "dry run done (env values are not shown)"; exit 0; fi

# 7. Wait until running, print the public URL
ID="$(nebius ai endpoint get-by-name --name "$NAME" --format jsonpath='{.metadata.id}')"
say "endpoint ${ID}; waiting for RUNNING (about 5 min)"
URL=""
for _ in $(seq 1 90); do
  J="$(nebius ai endpoint get "$ID" --format json)"
  STATE="$(echo "$J" | jq -r '.status.state // "UNKNOWN"')"
  URL="$(echo "$J" | jq -r '(.status.public_endpoints // [])[] | select(startswith("https://"))' | head -1)"
  printf '    state=%s\n' "$STATE"
  if [[ "$STATE" == "RUNNING" && -n "$URL" ]]; then break; fi
  case "$STATE" in ERROR|FAILED) die "endpoint ${ID} failed; see: nebius ai endpoint get ${ID}";; esac
  sleep 10
done
[[ -n "$URL" ]] || die "timeout waiting for endpoint ${ID}"
say "public URL: ${URL}"
curl -fsS --max-time 20 "${URL%/}/api/health" >/dev/null && say "health OK" || say "health check not yet answering; retry in a minute"
