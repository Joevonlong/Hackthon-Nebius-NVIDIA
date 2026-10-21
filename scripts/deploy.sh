#!/usr/bin/env bash
# Deploy PaperTrail to a Nebius Serverless Endpoint (docs/PRODUCT_PLAN.md D-13, section 9).
# Usage: scripts/deploy.sh <version> [--dry-run]     e.g. scripts/deploy.sh v1
# Env:   NEBIUS_REGION (default eu-north1) · REGISTRY_NAME (default papertrail) · SUBNET_ID (default: first subnet found)
# Reads TOKEN_FACTORY_API_KEY, TAVILY_API_KEY, OPENALEX_API_KEY, OPENALEX_MAILTO from .env.local at the repo root; never prints them.
# Keys and the access token reach the CLI only through a mode-0600 temp file (--env-file), never as arguments. See docs/DEPLOY.md.
# Also: PUBLIC_ORIGIN (required for a real deploy, e.g. https://papertrail.example) · PAPERTRAIL_ACCESS_TOKEN (default: created and shown once)
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
# Prints commands with --env values redacted (KEY=***) so keys never reach terminal or CI logs.
redact() { local out=() a; for a in "$@"; do if [[ "$a" == *=* && "$a" =~ ^[A-Z0-9_]+= ]]; then out+=("${a%%=*}=***"); else out+=("$a"); fi; done; printf '%s ' "${out[@]}"; }
run() { if [[ $DRY_RUN == 1 ]]; then printf '[dry-run] %s\n' "$(redact "$@")"; else "$@"; fi; }

# 0. Private Docker config: Docker Desktop's "desktop" credential store hangs on this Mac,
#    so deploys use their own config dir (contexts and CLI plugins linked from ~/.docker).
if [[ -z "${PT_KEEP_DOCKER_CONFIG:-}" ]]; then
  export DOCKER_CONFIG="$ROOT/.docker-deploy"
  mkdir -p "$DOCKER_CONFIG"
  [[ -f "$DOCKER_CONFIG/config.json" ]] || printf '{"auths":{},"currentContext":"%s"}\n' "$(docker context show 2>/dev/null || echo default)" > "$DOCKER_CONFIG/config.json"
  for d in contexts cli-plugins buildx; do [[ -e "$HOME/.docker/$d" && ! -e "$DOCKER_CONFIG/$d" ]] && ln -s "$HOME/.docker/$d" "$DOCKER_CONFIG/$d"; done
fi

# 1. Tools and login
export PATH="$HOME/.nebius/bin:$PATH"
command -v docker >/dev/null || die "docker not found"
command -v jq >/dev/null || die "jq not found (brew install jq)"
if ! command -v nebius >/dev/null; then
  [[ $DRY_RUN == 1 ]] || die "nebius CLI not found. Install: curl -sSL https://artifacts.nebius.cloud/cli/install.sh | bash ; then: nebius profile create"
  say "nebius CLI not installed (dry run continues)"
else
  nebius iam whoami >/dev/null 2>&1 || {
    [[ $DRY_RUN == 1 ]] || die "Nebius CLI not logged in; run: nebius profile create"
    say "Nebius CLI not logged in (dry run continues)"
  }
fi

# 2. Env for the endpoint (values are read, never echoed)
ENV_FILE=""
d="$ROOT"   # walk up so worktrees under .claude/worktrees find the repo-root file
while [[ "$d" != "/" ]]; do
  if [[ -f "$d/.env.local" ]]; then ENV_FILE="$d/.env.local"; break; fi
  d="$(dirname "$d")"
done
# Keys and the access token go into a private file (mode 0600, removed on exit) that the CLI reads with --env-file,
# never into command-line arguments, where `ps` and shell history could show them (#35).
SECRETS="$(umask 077; mktemp "${TMPDIR:-/tmp}/papertrail-endpoint-env.XXXXXX")"
trap 'rm -f "$SECRETS"' EXIT
envval() { grep -E "^[[:space:]]*${1}=" "$ENV_FILE" | tail -1 | sed -E "s/^[^=]*=//; s/^['\"]//; s/['\"]\$//" || true; }
if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
  for key in TOKEN_FACTORY_API_KEY TAVILY_API_KEY OPENALEX_API_KEY OPENALEX_MAILTO; do
    val="$(envval "$key")"
    if [[ -n "$val" ]]; then printf '%s=%s\n' "$key" "$val" >> "$SECRETS"; say "env ${key}: set"; else say "env ${key}: missing (feature runs without it)"; fi
  done
else
  say "no .env.local found; deploying without API keys (demo mode still works)"
fi
# Access token: the server refuses to start on a public address without one. It comes from PAPERTRAIL_DEPLOY_TOKEN (environment) or
# .env.deploy.local at the repo root (git-ignored), else one is created and shown once at the end of a real deploy. It is not read from
# .env.local: a token there would also lock down your local `pnpm dev` / `pnpm start`.
TOKEN="${PAPERTRAIL_DEPLOY_TOKEN:-}"; NEW_TOKEN=0
if [[ -z "$TOKEN" && -f "$ROOT/.env.deploy.local" ]]; then
  TOKEN="$(grep -E '^[[:space:]]*PAPERTRAIL_DEPLOY_TOKEN=' "$ROOT/.env.deploy.local" | tail -1 | sed -E "s/^[^=]*=//; s/^['\"]//; s/['\"]\$//" || true)"
fi
if [[ -z "$TOKEN" ]]; then
  if [[ $DRY_RUN == 1 ]]; then TOKEN="<generated-token>"; else command -v openssl >/dev/null || die "openssl not found (needed to create the access token)"; TOKEN="$(openssl rand -hex 32)"; NEW_TOKEN=1; fi
fi
[[ ${#TOKEN} -ge 16 ]] || die "the deploy token must be at least 16 characters"
printf 'PAPERTRAIL_ACCESS_TOKEN=%s\n' "$TOKEN" >> "$SECRETS"
say "env PAPERTRAIL_ACCESS_TOKEN: $([[ $NEW_TOKEN == 1 ]] && echo 'created' || echo 'set')"
# Optional: a front-end origin that may call the API besides the endpoint itself (the server accepts its own origin when a token is set).
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-}"
if [[ -n "$PUBLIC_ORIGIN" ]]; then printf 'ALLOWED_ORIGINS=%s\n' "$PUBLIC_ORIGIN" >> "$SECRETS"; say "env ALLOWED_ORIGINS: $PUBLIC_ORIGIN"; fi
ENV_ARGS=(--env-file "$SECRETS")

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
# Never fall back to --env KEY=value: if this CLI has no --env-file, stop.
if [[ $DRY_RUN == 0 ]]; then
  nebius ai endpoint create --help 2>&1 | grep -q -- '--env-file' || die "this nebius CLI has no --env-file for 'ai endpoint create'; secrets are never passed as arguments. Update the CLI or deploy another way (docs/DEPLOY.md)"
fi
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
if [[ $NEW_TOKEN == 1 ]]; then
  say "access token (shown once; store it in a password manager): ${TOKEN}"
  say "sign in once with: ${URL%/}/?token=<token>  (keep it in ${ROOT}/.env.deploy.local as PAPERTRAIL_DEPLOY_TOKEN=... to reuse it)"
fi
# /api/health is open, so it proves nothing about access. Make an authenticated call; the token goes to curl on stdin, not on its command line.
auth_get() { printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" | curl -fsS --max-time 20 -K - -o /dev/null "${URL%/}$1"; }
OK=0
for _ in 1 2 3 4 5 6; do auth_get /api/questions && { OK=1; break; }; sleep 10; done
if [[ $OK == 1 ]]; then say "authenticated API call OK"; else
  die "the endpoint is running but an authenticated /api call failed. Tear down: nebius ai endpoint delete ${ID} (check --help), remove the image tag ${IMAGE} from the registry, then deploy again with a new version (docs/DEPLOY.md)"
fi
