#!/usr/bin/env bash
# Run PaperTrail locally in Docker (decision D-18): build for this machine, start on http://127.0.0.1:${HOST_PORT:-3040}.
# Usage: scripts/docker-local.sh [--dry-run]     (--dry-run prints the docker commands and runs nothing)
# Keys come from .env.local at the repo root via --env-file (never on the command line, never printed). Data and trace logs persist in ./data and ./logs.
# The port is published on 127.0.0.1 only. The container listens on all its interfaces, so the server requires an access token (#35):
# one is created once in ./data/access-token (mode 0600) and passed through a second --env-file; the URL printed at the end signs the browser in.
set -euo pipefail
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
d="$ROOT"; ENV_FILE=""
while [[ "$d" != "/" ]]; do [[ -f "$d/.env.local" ]] && { ENV_FILE="$d/.env.local"; break; }; d="$(dirname "$d")"; done
[[ -n "$ENV_FILE" ]] || { echo "ERROR: .env.local not found"; exit 1; }
DATA="$(dirname "$ENV_FILE")"
PORT="${HOST_PORT:-3040}"
[[ "$PORT" =~ ^[0-9]{2,5}$ ]] || { echo "ERROR: HOST_PORT must be a number"; exit 1; }
run() { if [[ $DRY_RUN == 1 ]]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi; }

# Docker Desktop's credential store hangs on this Mac: use a private config (contexts and plugins linked).
export DOCKER_CONFIG="$ROOT/.docker-deploy"; mkdir -p "$DOCKER_CONFIG"
[[ -f "$DOCKER_CONFIG/config.json" ]] || printf '{"auths":{},"currentContext":"%s"}\n' "$(docker context show 2>/dev/null || echo default)" > "$DOCKER_CONFIG/config.json"
for x in contexts cli-plugins buildx; do [[ -e "$HOME/.docker/$x" && ! -e "$DOCKER_CONFIG/$x" ]] && ln -s "$HOME/.docker/$x" "$DOCKER_CONFIG/$x"; done
cd "$ROOT"

# Access token: reuse the one from the last run so the browser's cookie stays valid; create it with mode 0600.
mkdir -p "$DATA/data" "$DATA/logs"
TOKEN_FILE="$DATA/data/access-token"
NEW_TOKEN=0
if [[ ! -s "$TOKEN_FILE" ]]; then
  NEW_TOKEN=1
  if [[ $DRY_RUN == 1 ]]; then echo "[dry-run] would create $TOKEN_FILE (mode 0600)"; else
    command -v openssl >/dev/null || { echo "ERROR: openssl not found (needed to create the access token)"; exit 1; }
    (umask 077; openssl rand -hex 32 > "$TOKEN_FILE")
  fi
fi
chmod 600 "$TOKEN_FILE" 2>/dev/null || true
# Second env file (mode 0600, removed on exit): the token and the origins the Host check must accept for this port.
TOKEN_ENV="$(umask 077; mktemp "${TMPDIR:-/tmp}/papertrail-env.XXXXXX")"
trap 'rm -f "$TOKEN_ENV"' EXIT
{
  printf 'PAPERTRAIL_ACCESS_TOKEN=%s\n' "$(cat "$TOKEN_FILE" 2>/dev/null || true)"
  printf 'ALLOWED_ORIGINS=http://localhost:%s,http://127.0.0.1:%s\n' "$PORT" "$PORT"
} > "$TOKEN_ENV"

run docker build -t papertrail:local .
if [[ $DRY_RUN == 1 ]]; then echo "[dry-run] docker rm -f papertrail"; else docker rm -f papertrail >/dev/null 2>&1 || true; fi
run docker run -d --name papertrail -p "127.0.0.1:${PORT}:3000" --env-file "$ENV_FILE" --env-file "$TOKEN_ENV" \
  -e PORT=3000 -e DATA_DIR=/data -e LOG_DIR=/logs \
  -v "$DATA/data:/data" -v "$DATA/logs:/logs" papertrail:local
if [[ $DRY_RUN == 1 ]]; then echo "PaperTrail (dry run): http://127.0.0.1:${PORT}/?token=<contents of $TOKEN_FILE>"; exit 0; fi
if [[ $NEW_TOKEN == 1 ]]; then
  # shown only when it is created: the link stays in terminal scrollback and browser history, so it is not repeated on later starts
  echo "PaperTrail: http://127.0.0.1:${PORT}/?token=$(cat "$TOKEN_FILE")  (open it once; the cookie keeps you signed in)"
else
  echo "PaperTrail: http://127.0.0.1:${PORT}/  (your browser's cookie signs you in; token: $TOKEN_FILE, sign in again with /?token=<token>)"
fi
echo "logs: $DATA/logs/runs/<runId>/, docker logs -f papertrail"
