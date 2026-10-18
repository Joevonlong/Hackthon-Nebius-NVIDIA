# Seed2Discover

Research question + seed papers → ranked, traceable new papers.
OpenAlex (citation graph + abstracts) → Nebius Token Factory (embeddings + Nemotron explanations) → Nebius Serverless.

See [../docs/EXECUTION_PLAN.md](../docs/EXECUTION_PLAN.md) for the full plan.

## Run locally

```bash
uv venv --python 3.12 && uv pip install -r requirements.txt
cp .env.example .env          # add TOKEN_FACTORY_API_KEY and OPENALEX_API_KEY
.venv/bin/uvicorn backend.main:app --reload --port 8000
```

Open http://localhost:8000. Without a Token Factory key the app still runs: semantic scoring falls back
to local TF-IDF and explanations fall back to citation-link templates (shown as badges in the UI).

## API

`POST /api/discover` `{"question": "...", "seeds": ["10.1126/science.aad0501", ...], "top_k": 12}`
`GET /api/health` shows which services are active.

## Deploy to Nebius Serverless (Endpoint)

```bash
# 1. Warm the cache with the demo query (optional, makes the demo instant and rate-limit proof)
curl -s -X POST localhost:8000/api/discover -H 'Content-Type: application/json' \
  -d "$(curl -s localhost:8000/api/example)" > /dev/null

# 2. Build for linux/amd64 and push to your registry (Nebius Container Registry or Docker Hub)
docker buildx build --platform linux/amd64 -t <registry>/seed2discover:latest --push .

# 3. Create the endpoint (flags from the Nebius endpoint quickstart)
nebius ai endpoint create \
  --name seed2discover \
  --image <registry>/seed2discover:latest \
  --platform cpu-d3 --preset 4vcpu-16gb \
  --container-port 8000 --public \
  --subnet-id <subnet_ID>
```

To check before deploying:
- How to pass `TOKEN_FACTORY_API_KEY` / `OPENALEX_API_KEY` as env vars: check `nebius ai endpoint create --help`.
- The quickstart example uses `--auth token`. A browser UI cannot send that bearer header, so confirm the
  endpoint can be public without token auth, or put a token check inside the app instead.

Get the URL:
```bash
ENDPOINT_ID=$(nebius ai endpoint get-by-name --name seed2discover --format jsonpath='{.metadata.id}')
nebius ai endpoint get "$ENDPOINT_ID" --format json | jq -r '.status.public_endpoints[] | select(startswith("https://"))'
```
