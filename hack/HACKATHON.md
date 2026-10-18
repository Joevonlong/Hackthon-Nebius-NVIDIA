# Hackathon facts

| Fact | Value |
|---|---|
| Event | Nebius Healthcare / Life Sciences hackathon, track "Research Paper Discovery" |
| Date | 2026-10-18 (all times CEST) |
| Start | 13:05 (plan locked) |
| Internal submit (`submit_by`) | 18:00 |
| Official deadline | 18:30 |
| Live demo | 20:00 |
| Feature freeze | 16:30 |
| Code freeze and deploy v3 | 17:30 |
| Sync (real run end to end on prod, deploy v2) | 15:15 |
| `prod_url` | _TBD after deploy v1 (record here)_ |
| `merge_mode` | captain merges; lanes commit on their own branch |
| Repo license | GPL-3.0-or-later (includes Zettlr code) |
| Product | PaperTrail: seed-based paper discovery with verified quotes (docs/PRODUCT_PLAN.md) |

## Lanes

| Lane | Owner scope | Paths |
|---|---|---|
| A1 pipeline | OpenAlex, PubMed, Europe PMC sources; data store; discovery routes R1-R3, lanes; runs API and SSE | server/sources/{openalex,pubmed,europepmc}.ts, server/data/**, server/discovery/**, server/routes/runs.ts |
| A2 AI | embeddings, rerank, Nemotron judge, quote verification, Scout agent, Tavily | server/ai/**, server/sources/tavily.ts, scripts/smoke-models.ts |
| B workspace | Zettlr-style shell, editor, vault | client/src/App.vue, workspace/**, editor/**, styles/**, stores/vault.ts, client/index.html |
| C discovery UI | Discover tab, graph, API client | client/src/discover/**, graph/**, stores/discovery.ts, api/** |
| D infra | Dockerfile, deploy, demo mode and recordings, README, hack docs | Dockerfile, .dockerignore, scripts/deploy.sh, scripts/record-demo.ts, server/demo/**, server/routes/demo.ts, README.md, hack/** |
| captain | shared contracts, config, integration | shared/**, server/index.ts, server/env.ts, package.json, AGENTS.md, docs/** |

Deploys: three only (v1 hello world, v2 at the sync point, v3 final); new tag and endpoint name each time.
