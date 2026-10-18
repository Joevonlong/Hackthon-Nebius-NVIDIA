# PaperTrail — agent rules (hackathon, 2026-10-18; submit 18:00 CEST)

Read first: `docs/PRODUCT_PLAN.md` (decisions D-01…D-16, board), `docs/RANKING_AND_STORAGE.md` (ranking, ingestion, storage spec), `shared/contracts.ts` (the API and data contracts — do not change without the captain).

## Stack
Vite + Vue 3 + Pinia + CodeMirror 6 + d3 (client/) · Hono on Node 22 (server/) · zod contracts (shared/) · AI SDK → Nebius Token Factory · SQLite (better-sqlite3) · pnpm · TypeScript 5.9. Repo license GPL-3.0 (we copy Zettlr code from /Users/unclejoe/Develop_Workspace/Zettlr).

## Ownership (only edit your own paths; ask the captain for anything else)
| Lane | Paths |
|---|---|
| A1 pipeline | server/sources/openalex.ts, server/sources/pubmed.ts, server/sources/europepmc.ts, server/data/**, server/discovery/**, server/routes/runs.ts |
| A2 AI | server/ai/** (keep the exported signatures in server/ai/index.ts), server/sources/tavily.ts, scripts/smoke-models.ts |
| B workspace | client/src/App.vue, client/src/workspace/**, client/src/editor/**, client/src/styles/**, client/src/stores/vault.ts, client/index.html |
| C discovery UI | client/src/discover/**, client/src/graph/**, client/src/stores/discovery.ts, client/src/api/** |
| D infra | Dockerfile, .dockerignore, scripts/deploy.sh, scripts/record-demo.ts, server/demo/**, server/routes/demo.ts, README.md, hack/** |
| captain | shared/**, client/src/stores/ui.ts, server/index.ts, server/env.ts, package.json, AGENTS.md, docs/** |
New dependencies: add them with `pnpm add`, and mention them in your final report (package.json conflicts are resolved by the captain).

## Rules
- Keys come from `.env.local` at the repo root (see `.env.example`); never print or commit them.
- Everything must work without keys: AI functions return null/[] and the pipeline still produces lanes from citations. Demo mode (`?demo=1`) replays `server/demo/recordings/melanoma.json`.
- Run `pnpm typecheck` and your own tests before finishing; `pnpm dev` runs server on :3001 and client on :5173.
- Commit on your branch with message `feat(<card>): …`. Do not merge to main; the captain merges.
- Measured numbers only in UI copy and README; label anything illustrative.
