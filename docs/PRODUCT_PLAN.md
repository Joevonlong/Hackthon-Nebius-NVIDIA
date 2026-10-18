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

---

## 13. Change request CR-1 · Library mode (confirmed 15:25)

Status: **CONFIRMED** 15:25. Requested by the user at 15:00. Detailed spec: [LIBRARY_SPEC.md](LIBRARY_SPEC.md); contracts: `shared/library.ts`.
Note: three build agents were started at 15:15 before this confirmation step; their branches are not merged and will only be merged after confirmation.

### Decisions added since 13:05
| # | Decision |
|---|---|
| D-18 | Run locally (`PORT=3030 pnpm start` or `scripts/docker-local.sh` → :3040); Nebius deploy postponed |
| D-19 | Token Factory has no reranker: the rerank step uses embedding similarity to the question, labelled as such |
| D-20 | Library mode as below (confirmed) |
| D-21 | Google Scholar dropped (no SerpAPI key, no scraping); Tavily gets high priority: question + every subtopic + every keyword group, max 10 results, advanced depth for subtopics, scholarly host list, ≤ 25 calls per library |
| D-22 | Defaults confirmed: top-N 30, threshold 0.55, LLM reads abstracts only |
| D-23 | **Library replaces the seed-based Discover tab** (user choice, 15:35). The sidebar shows Library, Related, References. Seed DOIs/PMIDs written in notes become `knownPapers` and drive graph expansion. The seed pipeline (`/api/runs`) stays on the server as an internal API but has no UI. Demo mode replays a recorded Library run. |
| D-24 | **Graph view and Library sidebar take the IMS Dictionary design** (user choice, 15:28): monochrome ink-on-paper with ink alpha tiers, hairline rules, uppercase mono eyebrows, pill chips/buttons, film grain on the graph; motion from its `--reveal` / `--drawer` curves (staggered reveal, rule grow, chip text roll, grid-row expand); graph intro bloom, ambient drift, hover star of neighbours with dimming, ring, edge particles, label declutter, click-to-focus. One accent colour marks papers above the threshold. Stays d3 2D (no three.js). The rest of the app keeps its tokens. Reduced motion respected. |

### Requirements (from the user's request)
| ID | Requirement |
|---|---|
| R-1 | Treat the whole vault as one research topic; an agent derives the goals (topic, question, goals, subtopics, keywords) from the notes, with the note passages as evidence |
| R-2 | Find many papers: keyword search + subtopic search on Tavily, Google Scholar, PubMed, arXiv and OpenAlex, using every useful API parameter; expand through references, citing papers and similar articles; record every relation |
| R-3 | Label every paper (type: journal article, conference paper, preprint, review, systematic review, meta-analysis, book, chapter, dataset, thesis, editorial; study design; peer reviewed; open access; field/topic; recency; tags) and save the labels in one JSON file per paper |
| R-4 | Clean the pile: keep high-quality, truly relevant papers using citations, venue/conference standing, author reliability and affiliation, and an LLM read (abstract or full text) whose weight is lower than every other signal |
| R-5 | Papers above a threshold join the citation graph |
| R-6 | Every grade shows its evidence: the weighted items, how each was scored, the source of each number |
| R-7 | The number of papers returned is a UI parameter |

### Features and board (all P1 unless noted)
| ID | Card | Lane | Est |
|---|---|---|---|
| F-30 | Goals agent from vault notes with verified note quotes (R-1) | L2 | 30m |
| F-31 | Multi-source search: OpenAlex, PubMed (+ publication types, MeSH), arXiv, Tavily, Google Scholar via SerpAPI only; graph expansion; dedupe with provenance (R-2) | L1 | 75m |
| F-32 | Enrichment: venues (h-index, core, DOAJ, type), authors (h-index, works, institution/ROR) (R-4) | L1 | 30m |
| F-33 | Labels + per-paper JSON files (R-3) | L2 | 30m |
| F-34 | Quality score: relevance .30 · graph .15 · citations .18 · venue .15 · authors .12 · LLM read .10, each with rule + evidence; hard gates; threshold → graph (R-4, R-5, R-6) | L2 | 45m |
| F-35 | Library UI: top-N, threshold, sources, weights; goals card; sources table; score bars; evidence lists; labels; paper JSON view; add to vault; graph (R-5, R-6, R-7) | L3 | 75m |
| F-36 | Traced live run + summary.md with goals, sources, labels, top N with evidence | captain | 20m |
| F-37 | Remove the Discover tab; Library is the only discovery UI; "Import seeds" writes seed notes into the vault (D-23) | L3 | 20m |
| F-38 | Library demo recording + `?demo=1` replay (replaces the seed recording) | captain | 20m |
| F-39 | Update pitch, demo runbook and README to the Library flow | story | 20m |
| F-40 | Graph view in the IMS Dictionary style and motion (D-24) | C | 60m |
| F-41 | Library sidebar in the IMS Dictionary style and motion (D-24) | C | 45m |

### Answers (15:25)
1. Google Scholar: dropped; Tavily high priority instead (D-21).
2. LLM read: abstract only for now (D-22).
3. Defaults: top-N 30, threshold 0.55 (D-22).
4. Placement: **Library replaces Discover** (D-23, 15:35).

### CR-1 status (16:00)
F-30…F-35, F-37 done and merged (main `ff3055f`); live run in the UI against the real backend: 94 s, 599 papers scored, top 30 shown with labels, score bars and evidence; no console errors. F-36 trace: `logs/runs/<libraryId>/` + `data/library/<libraryId>/papers/*.json`.
Open findings (need a decision before changing):
1. Threshold 0.55 passes 500–553 of 599 (median total 0.67), so it barely filters. Option: calibrate the threshold as a percentile of the pile, or raise the default to ~0.75.
2. The `subtopics` label lists every subtopic for most papers (match rule too loose).
3. F-38 Library demo recording and F-39 story updates not started.

---

## 14. Change request CR-2 · Feedback from 王星然 (confirmed 16:20)

| # | Feedback (verbatim, shortened) | Proposed requirement | Card | Lane | Est |
|---|---|---|---|---|---|
| FB-1 | Node diameters in the graph should relate to grades | Library paper node radius ∝ total score (min 4 px at 0, max 16 px at 1); seed/vault notes keep a fixed size; legend shows the scale | F-45 | UI | 20m |
| FB-2 | Chat feature on the right side, several rounds | A chat panel on the right (see placement options) with multi-round history per library; the agent answers questions about the library (goals, papers, scores, evidence) using the library JSON as context, cites papers by rank/title, and can act (FB-5) | F-46 | UI + AI | 60m |
| FB-3 | Visualization of gradings is not easy to understand | Replace the six-colour stacked bar with the design chosen from the candidates (see below); plain-language summary line per paper ("Strong on relevance and venue; weak on author record") | F-47 | UI | 40m |
| FB-4 | "Why this score" should be easy to understand; give several candidates to review | Show 3–4 candidate designs now (this request); build the chosen one; each component shows value as a grade + one-sentence reason, evidence collapsed below | F-47 | UI | (in F-47) |
| FB-5 | Weights adjustable at runtime; the agent adjusts gradings from the prompt | In chat, a prompt like "care more about recent clinical papers, less about citations" → the agent proposes new weights (and optional filters: kind, year, OA) as a diff, the user applies it, the library re-scores instantly in the browser and shows rank changes; every change is logged with the prompt | F-48 | AI + UI | 45m |
| — | Pending from CR-1 | Threshold behaviour (0.55 passes ~85%) and the loose `subtopics` label | F-49 | core | 20m |

Order if confirmed: F-47 (after design pick) ∥ F-45 ∥ F-49 → F-46 → F-48. F-45 builds on the IMS-style graph from D-24/F-40 (another session). Total ≈ 3 h of agent work; with three parallel agents ≈ 75 min.

### CR-2 decisions (16:20; user accepted the recommended defaults)
| # | Decision |
|---|---|
| D-25 | Score visualization: **D "verdict first"** in the result list (one plain sentence, top 2 strengths + main weakness chips, total) and **A "report card"** in "Why this score" (overall letter grade, one row per component: letter grade, one-line reason, weight; evidence folded under each row). Grades: A ≥ 0.85, B ≥ 0.70, C ≥ 0.55, D ≥ 0.40, else E. The six-colour stacked bar goes away. |
| D-26 | Chat lives in **its own column on the far right**, collapsible; multi-round history per library, persisted in the browser. |
| D-27 | Pass rule: **top X% of each library** (default 25%) with an absolute floor of 0.50; both adjustable in the UI and by the chat agent. `threshold` in the request becomes the floor. |
| D-28 | `subtopics` label: only subtopics whose cosine is within 0.05 of the paper's best match and ≥ the library's 60th percentile (keyword fallback: ≥2 keyword hits). |
| D-29 | Chat agent tools: answer questions from the library JSON (cite papers by rank and title); **propose** weight / pass-rule / filter changes as a diff with a rationale; the user clicks Apply; the list re-scores in the browser and shows rank moves; every applied change is logged (prompt, diff, before/after top 10) to `logs/runs/<libraryId>/chat.jsonl`. |

| Card | Owner lane | Status |
|---|---|---|
| F-45 node radius ∝ score · F-47 score design A + D · F-49 pass-rule UI | U1 | building |
| F-46 chat column · F-48 chat adjusts weights · F-49 server (pass rule, subtopics) | U2 | building |


---

## 15. Change request CR-3 · Real demo, no mock data (confirmed 16:28; demo topic: melanoma single-cell, 5 notebook seeds)
| # | Requirement | Card |
|---|---|---|
| R-3.1 | Production build never uses mock or fixture data. Silent fallbacks to the mock (on 404/5xx/offline) are removed; failures show an error with Retry. Mock data stays only behind an explicit dev flag (`?mock=1`, dev builds only) | F-50 |
| R-3.2 | A visible research-question box at the top of the Library panel (plus a Build button). The typed question becomes the library's question and is saved into `Notes/Question.md`; the goals agent still reads every note | F-51 |
| R-3.3 | Run the whole process for real (seeds → library → review → add to vault → graph → chat adjust → export) on the demo question(s), fix what breaks, and record the run as the `?demo=1` replay (replaces the mock and the old seed recording) | F-52 |
| R-3.4 | Docs (pitch, runbook, README) describe only what the real run shows, with numbers from that run | F-53 |

---

## 16. Change request CR-4 · Judge review fixes (confirmed 16:15)
Judge (simulated, read-only) scored 6.1/10. Already covered by running lanes: stale story docs (story lane), pass rule (U1/U2), real `?demo=1` (demo lane), build speed incl. parallel Tavily (perf lane).
New items proposed:
| # | Fix | Card | Est |
|---|---|---|---|
| J-1 | **Deploy to a Nebius Serverless Endpoint** (brief deliverable; reverses D-18 for the submission, local stays for development). Needs `nebius profile create` finished by the user; then `scripts/deploy.sh v2` after the merge | F-54 | 30m + 5m wait |
| J-2 | Plain-language "why relevant" sentence + verified quote on every top-N card; LLM read covers every returned paper (llmReadTopK ≥ topK) | F-55 | 30m |
| J-3 | "Recent (≤ 3 years)" filter and Fresh badge so new work is visible in the top 10 | F-56 | 20m |
| J-4 | Visible Tavily evidence: "found via Tavily" chip linking the page, Tavily row in the sources panel | F-57 | 20m |
| J-5 | Cleanups: remove the Google Scholar chip (dropped, D-21), label graph nodes, show seed titles instead of K-ids, fix field-label noise (use the topic field, not the first OpenAlex topic) | F-58 | 30m |

Decisions (16:15): **D-31** J-1 rejected by the user — the app stays local (laptop / Docker); the submission states that only the models run on Nebius Token Factory and that `scripts/deploy.sh` is ready but not run. **D-32** J-2…J-5 confirmed; J-2/J-3/J-4/J-5 UI go to lane U1, J-2 server (LLM read covers every returned paper) and J-5 field label go to lane U2.


---

## 17. Change request CR-5 · Visual library list, saved history, question-scoped seeds (confirmed 16:30)
| # | Requirement (user, 16:18) | Proposal | Card | Est |
|---|---|---|---|---|
| R-5.1 | The Library list is too text-heavy; redesign it to be visual without losing information; still show the score basis | Replace the text rows with the layout chosen from the candidates below. Every field stays reachable (hover / expand), scores keep their evidence | F-60 | 60m |
| R-5.2 | Every generated library is saved locally and stays available; a new build never replaces old results | Server already writes `data/library/<id>/` per build. Add `GET /api/libraries` (id, question, created, counts, top paper) and a **History** list in the Library panel (open, rename, delete-with-confirm, compare counts); the last opened library reopens on reload; "Add to vault" notes keep a link to their library id. Export a library as one JSON/zip file | F-61 | 40m |

Layout candidates for R-5.1 (pick one or two):
- **V1 Score tiles grid** — card grid; each card: grade badge, big score ring, 6-segment mini radar, 3 chips (kind, year, OA); hover = verdict + quote.
- **V2 Bubble map** — x = year, y = total score, size = citations, colour = kind; click a bubble → report card side panel.
- **V3 Compact table + sparkbars** — one dense row per paper: rank, title, 6 tiny bars (one per component), grade, chips; sortable columns.
- **V4 Ranked lanes** — columns by grade A/B/C/D with small cards, drag-free; counts on top.

| R-5.3 | Seeds must be easy to upload and manage; the vault starts **empty**; seeds belong to a question; each build reads only one question and its own seeds, never another question's seeds (user, 16:24) | **Research question = a folder** `Questions/<short name>/` holding `Question.md` + `seeds/*.md` (+ the user's own notes for that question). A **Questions** switcher at the top of the Library panel: New question, rename, delete-with-confirm. Seeds per question: paste DOIs/PMIDs/arXiv/OpenAlex ids, **upload** `.bib`, `.ris`, CSL JSON or a text/CSV list of ids; a seed table with title, year, status (resolved / not found), remove, and "open note". A build sends **only that question's folder** (goals agent + known papers come from it); libraries are stored with their question id, and History is grouped by question. Default vault: empty with an empty state "Create your first research question". Supersedes D-20's "whole vault is one topic" (a question folder is now the topic). | F-62 | 60m |

Decisions (16:30): **D-33** one folder per research question (`Questions/<name>/Question.md` + `seeds/`), empty default vault, a build reads only its question folder (supersedes D-20's whole-vault topic). **D-34** list layout = V1 score tiles by default + V3 table-with-sparkbars toggle; no information lost (hover/click). **D-35** History list per question in the Library panel (open, rename, delete-with-confirm, export JSON); libraries stored with their question id. **D-36** seed upload: paste ids, BibTeX / RIS / CSL JSON, CSV or text id lists, PDF (DOI extracted from the first pages).
| Card | Lane | Status |
|---|---|---|
| F-60 tiles + table toggle | W1 | building |
| F-61 history + F-62 question folders, seeds table, uploads, empty vault | W2 | building |


---

## 18. Change request CR-6 · Graph back button + correct navigation (user, 16:45; clear, started immediately)
| # | Requirement | Card |
|---|---|---|
| R-6.1 | The graph view has a visible **Back** button that returns to exactly where the user came from (previous tab, with its scroll position and selection) | F-63 |
| R-6.2 | Navigation history across tabs: an in-app back/forward stack in the UI store; Back buttons in the graph and in the paper view; ⌘[ / Alt+← also go back; browser Back does not leave the app | F-63 |
| R-6.3 | Every jump lands on the right target, verified in the browser: list tile/row → paper view → Back → list (same scroll, same item focused); graph node → paper view or note → Back → graph (same zoom/selection); chat citation [#rank] → paper → Back → chat context; History → library → Back; file tree → note → Back; Add to vault → note → Back → paper | F-63 |

**D-37 (16:55, user clarification of CR-5):** everything for one research question lives in **one parent folder on disk**, and a second topic gets its own folder:
```
workspace/<question-slug>/
  Question.md                 the question (front matter: id, created)
  seeds/S1 Tirosh 2016.md …   seed notes (uploaded / pasted / resolved)
  notes/*.md                  the user's own notes for this question
  libraries/<libraryId>/      one folder per build: goals.json, library.json, papers/<paperId>.json,
                              graph.json (nodes + edges as shown), chat.jsonl, summary.md
  exports/                    BibTeX / CSL JSON / zip exports of this question
```
The server owns this folder (`WORKSPACE_DIR`, default `./workspace`); the browser vault is a write-through cache of it, so notes, seeds and libraries survive reloads and restarts and can be opened in Finder, Zettlr or Obsidian. Builds write into `libraries/` of their question only; History lists that folder. Trace logs stay in `logs/runs/<libraryId>/` with a link file in the library folder.

---

## 19. CR-7 · QA findings (17:05; bug fixes, no behaviour change except Q-6)
| # | Finding | Owner |
|---|---|---|
| Q-1 | Reload loses the built library (must reopen the last library of the question) | W2 |
| Q-2 | Chat does not scroll to the proposal card; Apply hidden | F1 |
| Q-3 | "Prioritize recent clinical studies" ignores "recent"/"clinical"; banner shows raw model reasoning; weight shown as 0.4 vs 36% | F1 |
| Q-4 | "149 of 594 pass" but only 30 shown; 594 vs 599 denominators | F2 |
| Q-5 | 0.85 shown but "BELOW" at min 0.85 (rounding) | F2 |
| Q-6 | Off-topic papers (judge relevance ≤ 1) still in the top 30 — **policy change, needs user decision** | — |
| Q-7/Q-8 | Rank arrows tiny; no arrows after slider changes | F2 |
| Q-9 | Seed DOIs parsed twice (trailing backtick) → 20 known papers for 5 seeds | captain |
| Q-10 | Saved note shows raw weight 0.40 instead of normalized 36% | F1 |
| Q-11 | Graph legend overlaps fit/reset; labels clipped at 1100 px | G1 |
| Q-12 | BibTeX authors capped at 10 without "and others" | captain |
| Q-13 | Raw OpenAlex ids in paper relations | G1 |
| Q-14/15 | Keyboard shortcuts fire while typing / without focus | G1 |

**D-38 (17:15, user choice for Q-6):** LLM off-topic gate — when the LLM read rates relevance 0–1 of 3, the paper cannot pass (no backfill of its slot), stays listed with the tag "off-topic (LLM read)" and the model's evidence; weights unchanged. Same rule in server/library/score.ts and client/src/library/score.ts.

---

## 20. CR-8 · Obsidian-style note titles (user, 17:25)
| # | Requirement | Card | Owner |
|---|---|---|---|
| R-8.1 | Every note page shows an **inline title = the note's name** (Obsidian / Apple Notes style), above the body; no separate generic "# Question" heading | F-64 | W2 |
| R-8.2 | For a question note the title is the question's **subject** — the same name as its folder `workspace/<subject>/` and its row in the file tree; a new question's name defaults to a short subject derived from the typed question (first ~6 meaningful words) | F-64 | W2 |
| R-8.3 | Editing the inline title renames the note (question: renames the folder and the switcher entry); file tree, tabs and History update live; links `[[old name]]` are updated | F-64 | W2 |

---

## 21. CR-9 · Production: clean notes environment (user, 17:35)
| # | Requirement | Owner |
|---|---|---|
| R-9.1 | On a fresh start the app shows an empty workspace: no sample question, no sample seeds, no sample notes; the first screen invites "Create your first research question" | W2 |
| R-9.2 | No topic-specific defaults anywhere in production code: question placeholder is neutral ("Type your research question"), no hard-coded seed DOIs, no melanoma keyword rules (the legacy Discover store's lens rule goes) | W2 + captain |
| R-9.3 | Demo content stays only behind `?demo=1` (replay of the recorded real run) and never writes into the user's workspace | captain (check) |

## 22. CR-10 · Graph edges between papers (user, 17:50; confirmed)
Problem: the graph view drew no edges. Cause 1: it ignored `paper.referencedWorks` (real melanoma build: ~1,100 citation links among the 149 passed papers, none drawn) and matched seed relations only by exact note.paperId. Cause 2: when OpenAlex is rate-limited (HTTP 429, no key) papers carry no reference lists at all.
- **E-1 Citation edges (client graph + graph.json):** paper→paper edges from OpenAlex `referenced_works` among the drawn library papers; edges to seed / vault notes matched by any id (OpenAlex id, DOI, PMID, arXiv). Legend + edge count in the graph header; hover highlights a node's edges. `graph.json` on disk gets the same edges.
- **E-2 Europe PMC fallback (server):** after scoring, passed papers with a PMID and no OpenAlex references get their reference list from Europe PMC (`/MED/<pmid>/references`, free, no key), time-boxed and cached; matched references become `relations` (cites) and edges. Traced to `references.jsonl`.
- **E-3 Final graph test:** after every feature is merged, a final QA run screenshots the graph view (edges visible, counts) on the final build.

## 23. CR-11 · "Why this score" as a chart (user, 17:58; confirmed)
Readers should get the score at a glance, not by reading text.
- **V-1 Score donut** (report card in the paper view): each coloured slice = what one component adds to the total (weight share × value); grey = points missed; centre = letter grade + total. One fixed colour per component, used everywhere.
- **V-2 Value bars** next to the donut: one bar per component, length = value 0–1, label = value and weight share; not-assessed components show a dotted empty bar with "not assessed". The existing text rows (rule + evidence with links) stay below, folded.
- **V-3 Small donut** in the tile hover popover; **V-4 mini stacked bar** (contributions, same colours) on every tile and table row, so the list is scannable.
- Values come from the paper's stored components after rescoring (live weights); no new data.
