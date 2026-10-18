# PaperTrail

**Start from the papers you trust. Find the ones you missed, with receipts.**

PaperTrail is a seed-based paper discovery tool inside a Zettlr-style research workspace. You paste a few papers you already trust (DOIs or PMIDs) and a research question. PaperTrail follows citations, PubMed similarity and a bounded web-scouting agent to build a pool of candidates, sorts them into honest lanes (Core, Fresh, Linked, Bridges, plus a Retracted warning row), and explains every ranking decision with a paper trail: which seeds link to it, through which route and API, and a verbatim quote from the abstract that is checked against the source text. Kept papers become Markdown literature notes linked to your seeds, shown in a graph, and exportable to BibTeX and CSL JSON. Built for the Nebius Healthcare / Life Sciences "Research Paper Discovery" track.

## Measured results

Hold-out test on two real reviews: hide all but 5 references (the seeds), build a pool from the seeds, and count how many hidden references are found. Ground truth is one review's reference list, so every number is a lower bound. Details and method: [docs/RANKING_AND_STORAGE.md](docs/RANKING_AND_STORAGE.md) section 1.

- **Recall.** The union of our routes (references of seeds, papers citing 2+ seeds, PubMed similar articles) reaches **16% and 42%** of the hidden references. PubMed keyword search reaches 2% and 0%; OpenAlex search reaches 1% and 6%.
- **Ranking.** Ranking by seed links puts **40% and 35%** relevant papers in the top 20, against a base rate of 5.2% and 4.5%. Citation count alone scores 0% and 25%.
- **Melanoma example (5 seeds, no LLM yet).** 980 candidates: Core 545, Linked 216, Bridges 218, Retracted 1. 494 papers cite at least 2 of the 5 seeds.

## Architecture

```
Browser: Vue 3 + Pinia + CodeMirror 6 + d3; notes vault in IndexedDB
   | HTTPS + SSE
One container (Nebius Serverless Endpoint, cpu-d3, 2vcpu-8gb)
   Hono API: POST /api/runs, GET /api/runs/:id/stream, GET /api/demo/stream, static client
   server/discovery  resolve, routes R1-R5, embed, rerank, judge, verify, lanes
   server/data       SQLite (Drizzle), raw cache, vectors
   |                    |                      |
Token Factory        OpenAlex, PubMed,       Tavily (Scout agent)
(models below)       Europe PMC
```

Layout: `client/` (Vue app), `server/` (routes, discovery, sources, data, demo), `shared/` (zod contracts used by both), `docs/` (plan, spec, fixtures), `eval/` (hold-out harness).

## Models (Nebius Token Factory)

| Job | Model |
|---|---|
| Embeddings (1024 dims) | `Qwen/Qwen3-Embedding-8B` |
| Reranker | `Qwen/Qwen3-Reranker-8B` |
| Judge (relevance, facets, quote) | `nvidia/Nemotron-3_5-Lightning` |
| Facets, query expansion, Scout agent | `nvidia/nemotron-3-super-120b-a12b` |

All model IDs are overridable in `.env.local` (see `.env.example`). Without keys, AI steps return nothing and the pipeline still produces lanes from citations.

## Setup

Requires Node 22 and pnpm.

```bash
pnpm install
cp .env.example .env.local   # fill in the keys; never commit this file
pnpm dev                     # server on :3001, client on http://localhost:5173
```

Keys in `.env.local`: `TOKEN_FACTORY_API_KEY`, `TAVILY_API_KEY`, `OPENALEX_API_KEY`, `OPENALEX_MAILTO`.

**Demo mode.** Open the app with `?demo=1` (for example `http://localhost:5173/?demo=1`). The client replays `server/demo/recordings/melanoma.json` through `GET /api/demo/stream` in about 5 seconds; no keys and no network needed. `GET /api/demo/snapshot` returns the final state. To re-record from a running server with keys: `pnpm tsx scripts/record-demo.ts http://localhost:3001`. To check recordings against the contract: `pnpm tsx server/demo/validate.ts`.

Other commands: `pnpm typecheck`, `pnpm test`, `pnpm gate` (typecheck + tests + build), `pnpm build && pnpm start` (production build on the port in `PORT`, default 3000).

## Deploy (Nebius Serverless Endpoint)

```bash
curl -sSL https://artifacts.nebius.cloud/cli/install.sh | bash && nebius profile create   # once
scripts/deploy.sh v1 --dry-run   # prints the commands
scripts/deploy.sh v1             # registry, linux/amd64 build + push, endpoint, waits, prints the https URL
```

The script reads the four keys from `.env.local` without printing them. Each deploy uses a new tag and endpoint name (`papertrail-<version>`) because endpoints cannot be updated in place. Local check of the image: `docker buildx build --platform linux/amd64 -t papertrail:local --load . && docker run -p 3100:3000 papertrail:local`.

## Team

Team: _TBD (names and roles)_.

## License

GPL-3.0-or-later. PaperTrail includes code and styles adapted from [Zettlr](https://github.com/Zettlr/Zettlr) (GPL-3.0); credit to the Zettlr authors and contributors.
