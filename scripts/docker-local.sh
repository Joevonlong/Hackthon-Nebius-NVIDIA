#!/usr/bin/env bash
# Run PaperTrail locally in Docker (decision D-18): build for this machine, start on http://localhost:${HOST_PORT:-3040}.
# Keys come from .env.local at the repo root (--env-file; never printed). Data and trace logs persist in ./data and ./logs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
d="$ROOT"; ENV_FILE=""
while [[ "$d" != "/" ]]; do [[ -f "$d/.env.local" ]] && { ENV_FILE="$d/.env.local"; break; }; d="$(dirname "$d")"; done
[[ -n "$ENV_FILE" ]] || { echo "ERROR: .env.local not found"; exit 1; }
DATA="$(dirname "$ENV_FILE")"
# Docker Desktop's credential store hangs on this Mac: use a private config (contexts and plugins linked).
export DOCKER_CONFIG="$ROOT/.docker-deploy"; mkdir -p "$DOCKER_CONFIG"
[[ -f "$DOCKER_CONFIG/config.json" ]] || printf '{"auths":{},"currentContext":"%s"}\n' "$(docker context show 2>/dev/null || echo default)" > "$DOCKER_CONFIG/config.json"
for x in contexts cli-plugins buildx; do [[ -e "$HOME/.docker/$x" && ! -e "$DOCKER_CONFIG/$x" ]] && ln -s "$HOME/.docker/$x" "$DOCKER_CONFIG/$x"; done
cd "$ROOT"
docker build -t papertrail:local .
docker rm -f papertrail >/dev/null 2>&1 || true
mkdir -p "$DATA/data" "$DATA/logs"
docker run -d --name papertrail -p "${HOST_PORT:-3040}:3000" --env-file "$ENV_FILE" \
  -e PORT=3000 -e DATA_DIR=/data -e LOG_DIR=/logs \
  -v "$DATA/data:/data" -v "$DATA/logs:/logs" papertrail:local
echo "PaperTrail: http://localhost:${HOST_PORT:-3040}  (logs: $DATA/logs/runs/<runId>/, docker logs -f papertrail)"
