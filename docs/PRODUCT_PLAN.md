# PaperTrail — Product and build plan

> Nebius · Healthcare / Life Sciences: Research Paper Discovery · 2026-10-18
> Internal submit **18:00** · official deadline **18:30** · live demo **20:00** (CEST)
> **Start from the papers you trust. Find the ones you missed, with receipts.**

Visual version: `docs/plan.html` (published as an artifact). Detailed ranking, ingestion and storage spec: [RANKING_AND_STORAGE.md](RANKING_AND_STORAGE.md). Evidence scripts: [`eval/`](../eval). Real fixtures: [`docs/data/`](data).

---

## 1. Decisions (locked 13:05)

| # | Topic | Decision | Why |
|---|---|---|---|
| D-01 | Product | Seed-based paper discovery with verified explanations, inside a Zettlr-style research workspace (notes, Markdown, graph) | Covers the whole researcher loop: discover → read evidence → keep → link → export |
| D-02 | UI | **"Zettlr Web"**: copy Zettlr's essential parts (layout and styles, CodeMirror 6 Markdown renderers and themes, d3 graph view, sidebar tabs) into a Vue web app; add a **Discover** tab | The team wants Zettlr's UI; a web app is required to deploy on Nebius. Forking the desktop app can't be hosted; running Zettlr's renderer in a browser needs ~120 desktop calls faked (6–10 h) |
| D-03 | Stack | Vite + Vue 3 + Pinia + CodeMirror 6 + d3 (client) · Hono on Node 22 (API, SSE, serves the client) · zod contracts shared by both · AI SDK → Token Factory · one container | Zettlr is Vue; one language; one deploy |
| D-04 | Models (Token Factory) | Embeddings `Qwen/Qwen3-Embedding-8B` at 1024 dims, stored fp16 · rerank `Qwen/Qwen3-Reranker-8B` · judge `nvidia/Nemotron-3_5-Lightning` · facets, query expansion, Scout `nvidia/nemotron-3-super-120b-a12b` (fallback for tool calls: `Qwen/Qwen3-235B-A22B` or `openai/gpt-oss-120b`) | NVIDIA + Nebius fit. IDs, 1024-dim support and tool calling are verified in the first 15 minutes |
| D-05 | Agent | A fixed pipeline builds the ranked list; **one bounded Scout agent** (≤6 tool calls, ≤45 s; Tavily, OpenAlex search, PubMed similar, DOI lookup) adds candidates. No agent framework; AI SDK tool loop | The brief asks for agentic search; a fully agentic pipeline is slow and hard to verify |
| D-06 | Discovery routes | R1 references of seeds · R2 papers citing ≥2 seeds · R3 PubMed similar articles · R4 LLM query expansion · R5 Scout (Tavily). **Dropped:** OpenAlex `related_works` (0 hits in tests), Semantic Scholar unless we get a key | Measured on held-out reviews |
| D-07 | Ranking | **Lanes, not one blended score:** Core (≥2 seed links) → Fresh (≤18 months, <2 links) → Linked (1 link) → Bridges (0 links, semantic). Retracted papers go to a warning row. Inside a lane: seed links then citations until the judge runs; then judge + reranker + links + impact, weights set by the eval harness. Lens re-sorts in the browser | Seed links scored 35–40% precision at 20 vs a ~5% base rate; blending a weak signal made results worse |
| D-08 | Evidence | Judge quotes must be verbatim substrings of the abstract or a full-text chunk, stored with offsets. Unverified quotes are marked and down-weighted. Web pages are context, never evidence for a paper's findings | Traceability is the track's core requirement |
| D-09 | Evaluation | Hold-out test on real reviews gates every ranking weight; the pitch uses measured numbers only | Proof slide; avoids tuning by taste |
| D-10 | Ingestion | Every hit becomes one paper record (OpenAlex ID canonical) + documents normalized to Markdown with chunk offsets + original bytes stored by hash. Text sources in order: Europe PMC/PMC XML → HTML → text PDF → OCR → abstract. Full text only for open-access papers. **Today:** abstracts (+ PMC XML if time). PDF and OCR after the hackathon | One format to quote from; licensing-safe |
| D-11 | Storage | Four layers: **SQLite** paper store (Drizzle schema, FTS5) · raw cache (gzip files by sha256) · vectors as fp16 blobs in SQLite with exact in-memory search · **notes as Markdown** in the browser (IndexedDB), exported as .zip / BibTeX / CSL JSON. Production: Postgres + object storage + LanceDB | Lowest-ops option that scales by swapping one module |
| D-12 | Vector DB | **No vector DB today.** Switch to LanceDB (or pgvector) past ~100k vectors, at p95 search >100 ms, or when "search my whole library" ships; >10M vectors → distributed | A run's pool is <2k vectors; exact search is milliseconds |
| D-13 | Deploy | Docker (linux/amd64) → Nebius Container Registry → Nebius Serverless Endpoint (`cpu-d3`, `2vcpu-8gb`, public, no `--auth`). Three deploys only: v1 hello world, v2 at the sync point, v3 final; new tag and endpoint name each time | Endpoint creation takes ~5 min and there is no update command |
| D-14 | Licensing | Our repo is **GPL-3.0** because it includes Zettlr code | Zettlr is GPL-3.0 |
| D-16 | Run size | Presets: `demo` = rerank top 60 against the question, judge top 30 + 5 Fresh/Bridges; `deep` = rerank 150 per facet, judge 50 + 10. All sizes are env vars and per-run options | 150 × 2 facets adds 10–20 s; the demo run must stay under ~45 s |
| D-15 | Demo data | The notebook's melanoma example (5 seeds). Demo mode `?demo=1` replays a recorded real run | Reproducible on stage, works without Wi-Fi |

---

## 2. Product

### 2.1 The pain, measured today
- PubMed with the research question as typed: **15 results**. With loose keywords: **999**.
- **494** papers cite at least 2 of the 5 seeds; one 2026 paper cites all 5 and has 0 citations, so ranking by citations would never surface it.
- **Persona:** Lena, immuno-oncology postdoc writing a review. She has 5 papers she trusts and needs the ones she hasn't found, with reasons she can check.

### 2.2 The researcher loop
1. **Seed:** paste DOIs/PMIDs (or import .bib later). Each seed becomes a literature note.
2. **Discover:** run the Discover tab; candidates stream into lanes; the graph grows ghost nodes.
3. **Check:** open a candidate: paper trail (which seeds, which route, which API), verified quote, uncertainty, "why ranked here".
4. **Keep:** "Add to vault" writes a literature note (front matter + quote + `[[seed]]` links); the node turns solid.
5. **Connect:** write notes in Markdown, link with `[[wikilinks]]`; the graph and Related tab show backlinks.
6. **Export:** BibTeX / CSL JSON for Zotero, Markdown .zip for Zettlr or Obsidian.

### 2.3 Differentiators
Multi-seed consensus (not one-seed graphs) · goal-aware Lens (evidence vs. method) · verified quotes · honest lanes (Fresh, Bridges, Not assessable, Retracted) · measured against keyword search · notes and graph in the same place.

---

## 3. Experience

### 3.1 Workspace (Zettlr-style)
```
┌ toolbar: files · graph · search · discover · theme ───────────────────────────────┐
│ FILES          │ [Question.md] [Minowa 2026.md] [Graph]       │ DISCOVER · Related │
│ ▾ Seeds (5)    │ ---                                         │ Lens Evidence ○── M │
│   S1 Tirosh…   │ id: W7…  doi: 10.1080/…  lane: Core          │ Core 545            │
│ ▾ Discovered   │ seeds: [S1, S2, S3, S4, S5]                  │  1 Minowa 2026 ●●●●●│
│   Minowa 2026  │ ---                                         │  2 Yost 2019   ●●●● │
│ ▾ Notes        │ # Immune microenvironment … acral melanoma  │ Linked 216          │
│   Question     │ **Why:** … (Nemotron)                        │ Bridges 218         │
│                │ > "…verbatim quote…" ✓ verified (PubMed)    │ ⚠ Retracted 1       │
│                │ Links: [[S1 Tirosh 2016]] [[S2 Sade-F 2018]] │ [Add to vault]      │
├ status: Run #1 · 980 candidates · 4 lanes · Brightfield ──────────────────────────┤
```
- Light theme = **Brightfield** (H&E stains), dark = **Fluorescence** (DAPI / GFP / mCherry). Graph colors: seed = hematoxylin/DAPI, discovered = eosin/GFP, blind spot = DAB/mCherry.

### 3.2 Wow moment (stream-driven; demo mode replays it in ~5 s)
Setup: 5 seed notes in the graph, PubMed 15 / 999 in the header → Trigger: **Discover** → Build: step trail lights up, ghost nodes grow out of the seeds along citation links, lanes fill with live counts → Payoff: the top Core paper (cites all 5 seeds, 0 citations) with a verified quote → Hold.

---

## 4. System

```
Browser — Vue 3 "Zettlr Web": editor · file tree · graph · Discover tab · vault in IndexedDB
   │ HTTPS + SSE
Nebius Serverless Endpoint (cpu-d3, 2vcpu-8gb) — one container
   Hono API: POST /api/runs · GET /api/runs/:id/stream · GET /api/papers/:id · static client
   server/discovery  resolve · routes R1–R5 · embed · rerank · judge · verify · lanes
   server/data       SQLite (Drizzle) · raw cache · vectors
   │                     │                         │
Token Factory          OpenAlex · PubMed · Europe PMC     Tavily (Scout agent)
(separate model endpoint)
```

**Repo layout:** `client/` (Vue app: `workspace/`, `editor/` from Zettlr, `graph/` from Zettlr, `discover/`), `server/` (`routes/`, `discovery/`, `sources/`, `data/`, `demo/`), `shared/contracts/` (zod), `eval/` (Python harness), `docs/`.

**Contracts (shared/contracts):** `Paper`, `Seed`, `Signal {kind, seedIds, value, source{name,url}}`, `Judgement {facets J_f, why, quote, quoteRef{chunkId,start,end}, verified, uncertainty, paperType}`, `Candidate {lane, features, score, rank, signals, judgement}`, `RunEvent = stage | candidates | judgement | agent | done`, `LiteratureNote`.

**Deploy:** see §9 commands. Keys as endpoint env vars: `TOKEN_FACTORY_API_KEY`, `TAVILY_API_KEY`, `OPENALEX_API_KEY`, `OPENALEX_MAILTO`.

---

## 5. Discovery and ranking (summary; full spec in RANKING_AND_STORAGE.md)

- **Measured:** the union of our routes reaches **16–42%** of a review's hidden references; keyword search reaches **≤6%**. Ranking by seed links puts **35–40%** relevant papers in the top 20 (base rate ~5%).
- **Real melanoma run (no LLM yet):** 980 candidates → Core 545 · Linked 216 · Bridges 218 · Retracted 1 · Fresh 0.
- **What it taught us:** before the judge, the Linked lane is topped by generic tool papers (SAMtools, BWA, STAR). The judge's facets and the Lens handle this: tools rank up under Method, down under Evidence. Fresh papers come from R4/R5, so the Scout matters. OpenAlex reference data has errors (a 2017 review "cited" by a 2016 seed), so links must pass a date check.

---

## 6. Data: ingestion and storage (summary; full spec in RANKING_AND_STORAGE.md)

- **Tavily hit →** classify URL → extract DOI / PMID / NCT → resolve in OpenAlex → paper (with provenance) or web source (context only) → fetch text by best source → Markdown + chunk offsets + raw bytes by hash.
- **Sizes (1024-d fp16):** demo ~50 MB · one researcher-year ~0.5 GB (1.3 GB with OA full text) · lab of 50 ~8–20 GB · all of PubMed ~0.3–1 TB.
- **Vector DB thresholds:** <100k vectors none · 100k–10M LanceDB or pgvector · >10M distributed. A researcher-year with full-text chunks (~280k vectors) is the first real trigger.

---

## 7. Board

Lanes: **A** BE/AI · **B** FE workspace · **C** FE discovery · **D** infra, eval, story. Three people: A's agents take D's deploy and demo mode; C takes eval runs and README.

| ID | Card | Pri | Lane | Est |
|---|---|---|---|---|
| F-00 | Scaffold: Vite+Vue+Pinia client, Hono server, shared zod, Dockerfile; deploy v1 | P0 | D | 60m |
| F-01 | Contracts + SQLite store (Drizzle) + raw cache | P0 | A | 60m |
| F-02 | Pipeline v1: resolve, abstracts (OpenAlex → PubMed), R1/R2/R3, lanes, SSE | P0 | A | 75m |
| F-03 | Embeddings + rerank + Nemotron judge + **quote verification** (never cut) | P0 | A | 75m |
| F-04 | Zettlr shell: three panes, styles and themes, icons, file tree, tabs, status bar | P0 | B | 75m |
| F-05 | Markdown editor (CM6 + Zettlr renderers; fallback plain CM6) + vault in IndexedDB + wikilinks | P0 | B | 75m |
| F-06 | Discover tab: question, seeds, step trail, lanes with evidence | P0 | C | 75m |
| F-07 | Graph view (Zettlr d3): notes + candidate ghost nodes, click to open | P0 | C | 60m |
| F-08 | Demo mode `?demo=1` + prod smoke test (never cut) | P0 | D | 30m |
| F-09 | "Add to vault" literature notes + BibTeX / CSL JSON export | P1 | C | 45m |
| F-10 | "Why ranked here" + Lens re-sort from facet scores | P1 | C+A | 40m |
| F-11 | Eval harness on the full pipeline; numbers for the pitch | P1 | D | 60m |
| F-12 | Scout agent (R5) + agent trace in the UI | P1 | D | 60m |
| F-13 | Tavily ingestion: classify, extract IDs, resolve, web sources | P1 | D | 45m |
| F-14 | R4 query expansion from facets | P1 | A | 30m |
| F-15 | 👍/👎 with reason chips + grow again | P1 | A+C | 45m |
| F-16 | Related tab (backlinks) + References tab | P1 | B | 45m |
| F-17 | Retraction flag + date sanity check on citation links | P1 | A | 15m |
| F-18 | Europe PMC XML full text → chunks → quotes from full text | P2 | A | 45m |
| F-19 | Clusters + blind-spot view | P2 | A+C | 45m |
| F-20 | Seed import from .bib / .ris / CSL JSON | P2 | B | 40m |
| F-21 | PaperTrail as an MCP server | P2 | D | 30m |
| F-22 | ClinicalTrials.gov links | P2 | D | 30m |
| F-23 | After the hackathon: PDF (GROBID/Docling) + OCR worker on a Nebius job; Postgres + object storage + LanceDB; vault sync | P3 | — | — |

**Cut order** if the 15:15 sync misses: P2 → F-16 → F-15 → F-14 → F-13 → F-12 → F-10. **Never cut:** F-03 verification, F-08 demo mode. If the Zettlr editor port isn't working by 15:15, switch F-05 to plain CodeMirror Markdown.

---

## 8. Timeline (re-planned from 13:05)

| Time | Phase | A · BE/AI | B · workspace | C · discovery | D · infra/eval/story |
|---|---|---|---|---|---|
| 13:05–13:30 | Kickoff (eat while agents run) | keys; verify model IDs, 1024 dims, tool calling | copy Zettlr styles, themes, icons | Discover skeleton on `docs/data` fixtures | scaffold repo |
| 13:30 | **G1 + G2:** pitch and scope locked (this doc) | | | | |
| 13:30–15:15 | Build 1 (P0) | F-01 → F-02 | F-04 → F-05 | F-06 → F-07 | deploy v1 → F-08 → F-13 |
| **15:15** | **Sync:** real run end-to-end on prod (deploy v2) | | | | |
| 15:15–16:30 | Build 2 | F-03 → F-17 | F-05 → F-16 | F-09 → F-10 | F-12 Scout |
| **16:30** | **Feature freeze** | | | | |
| 16:30–17:30 | Harden | timeouts, caching, edge cases | polish | wow-moment polish | F-11 eval run, judge review |
| **17:30** | **Code freeze**, deploy v3 | | screenshots | 90 s recording | README, submission text |
| **18:00** | Submit (deadline 18:30) | | | | |
| 18:30–20:00 | Dinner, rehearse 3×, warm up prod at 19:45 | | | | |
| **20:00** | Live demo | | | | |

---

## 9. Deploy commands (Nebius docs; F-00 owner verifies each)

```bash
curl -sSL https://artifacts.nebius.cloud/cli/install.sh | bash
nebius profile create
export REGISTRY_PATH=$(nebius registry create --name papertrail --format json | jq -r ".metadata.id" | cut -d- -f 2)
nebius registry configure-helper
docker buildx build --platform linux/amd64 -t cr.<region>.nebius.cloud/$REGISTRY_PATH/papertrail:v1 --push .
nebius ai endpoint create --name papertrail-v1 \
  --image cr.<region>.nebius.cloud/$REGISTRY_PATH/papertrail:v1 \
  --platform cpu-d3 --preset 2vcpu-8gb --container-port 3000 --disk-size 20Gi \
  --subnet-id <subnet-id> \
  --env TOKEN_FACTORY_API_KEY=…,TAVILY_API_KEY=…,OPENALEX_API_KEY=…,OPENALEX_MAILTO=…
nebius ai endpoint get $ID --format json | jq -r '.status.public_endpoints[] | select(startswith("https://"))'
```

---

## 10. Demo script (3 minutes)

| Time | Beat | Line or action |
|---|---|---|
| 0:00 | Hook | "Lena has five papers she trusts. PubMed gives her 15 results for her question, or 999 for keywords. Neither is a reading list." |
| 0:20 | Workspace | Her vault: 5 seed notes made from DOIs, a question note, the graph |
| 0:35 | Discover | Run. Step trail lights up, ghost nodes grow, lanes fill |
| 1:05 | Receipts | Top Core paper: cites all 5 seeds, published 2026, 0 citations. Verified quote, paper trail, "why ranked here" |
| 1:35 | Honesty | Retracted row, Not assessable, Bridges explained |
| 1:50 | Lens | Evidence → Method: methods and tools rise |
| 2:10 | Keep | Add to vault: literature note with front matter, quote, `[[seed]]` links; node turns solid; Related tab shows backlinks |
| 2:30 | Proof | Measured: routes reach 16–42% vs ≤6% for keyword search; P@20 35–40% (plus F-11 full-pipeline numbers) |
| 2:45 | Close | "Nebius Serverless, Token Factory models, export to Zotero. PaperTrail: find the papers you missed, with receipts." |

---

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| OpenAlex without a key: the venue IP shares $0.10/day (one 401 already) | High | Free key now; cache every response |
| Endpoint creation ~5 min, no update | High | Three deploys; new tag and name each time |
| Zettlr editor code depends on desktop-only calls (21 config + 16 IPC references) | Medium | Shim `window.config` / `window.ipc`; fallback to plain CodeMirror at 15:15 |
| Nemotron tool calling unsupported | Medium | Test first; fallback model for the Scout |
| OpenAlex reference errors | Medium | Date sanity check; show the source link so users can check |
| Generic tool papers flood a lane | Medium | Judge facets + Lens; tool papers labeled |
| LLM JSON invalid or slow | Medium | json_schema + zod, one retry; top 50 judged, 8 in parallel, 20 s timeout |
| Venue Wi-Fi | Medium | Demo mode, local run, screen recording |
| Weak eval numbers | Low | Report as measured; lead with traceability |

---

## 12. Next 30 minutes

1. Register the OpenAlex key; confirm Token Factory and Tavily keys; `GET /v1/models`; test 1024-dim embeddings and tool calling.
2. Share the plan page with the team; assign lanes A–D.
3. Run `hack-init` (start 13:05, submit_by 18:00, deadline 18:30).
4. D scaffolds and starts deploy v1; A writes contracts + store; B copies Zettlr assets; C builds the Discover tab on the fixtures in `docs/data`.
