# Submission · PaperTrail · Nebius Healthcare / Life Sciences: Research Paper Discovery

Form: _TBD (captain to paste the form link)_ · deadline 18:30 CEST · our target 18:00. The human submits; nothing here is submitted, published, or uploaded yet.

## Project name

PaperTrail

## Tagline

Find the papers you missed, with receipts.

(Long form: Start from the papers you trust. Find the ones you missed, with receipts.)

## Description (142 words, target 150)

PaperTrail turns the papers a researcher already trusts into a ranked list of papers they have missed, with a checkable paper trail for each. Paste a few DOIs and a research question. PaperTrail follows citations, PubMed similar articles and a bounded Tavily scouting agent, then sorts candidates into honest lanes: Core, Fresh, Linked and Bridges, plus a Retracted warning row. Every paper shows which seeds link to it, through which route and API, and a quote that is verified word for word against the abstract. On two real reviews, our routes reached 16% and 42% of hidden references, against 6% at most for keyword search. Seed-link ranking put 35 to 40% relevant papers in the top 20, where chance is about 5%. Kept papers become Markdown literature notes linked to the seeds in a Zettlr-style workspace, exportable to BibTeX and CSL JSON.

## How it uses Nebius, Token Factory and Tavily

- **Nebius Serverless Endpoint** hosts the app: one Docker container (Hono API with SSE, plus the Vue client) on `cpu-d3`, `2vcpu-8gb`, behind a public HTTPS URL. The app is deployed separately from the model endpoint.
- **Nebius Token Factory** serves the models: `Qwen/Qwen3-Embedding-8B` (1024-dim embeddings), `Qwen/Qwen3-Reranker-8B` (reranking), `nvidia/Nemotron-3_5-Lightning` (relevance judge: facet grades, one-sentence reason, quote), and `nvidia/nemotron-3-super-120b-a12b` (research-question facets, query expansion, Scout agent).
- **Tavily** powers the Scout agent (route R5). It searches the web and preprint servers for recent work and context, in at most 6 tool calls and 45 seconds. Each hit is resolved to a paper by DOI, PMID or title match; web pages are context, never evidence for a paper's findings.

## Architecture

The Vue 3 client (Pinia, CodeMirror 6, d3 graph) talks over HTTPS and server-sent events to one Hono server on Node 22. The server resolves seeds through OpenAlex, then builds a candidate pool with five routes: references of the seeds (R1), papers citing at least two seeds (R2), PubMed similar articles (R3), query expansion by a language model (R4) and the Scout agent (R5). Candidates are assigned to lanes by seed links, with a date check on citation links. Embeddings, a reranker and a judge on Token Factory then grade the top candidates; the judge's quote must be a verbatim substring of the source text or it is marked unverified and down-weighted. Papers and vectors live in SQLite with exact in-memory search; the researcher's notes live in the browser as Markdown. Shared zod contracts type every event between client and server.

## Measured results

Hold-out test on two real reviews (Nat Rev Cancer 2023, 235 references; 2020 review, 93 references): hide all but 5 references as seeds, build a pool from the seeds, count hidden references. One review's reference list is incomplete, so every number is a lower bound. Method and tables: `docs/RANKING_AND_STORAGE.md` section 1.

| Measure | Result |
|---|---|
| Hidden references reached by our routes | 16% and 42% (two reviews) |
| Hidden references reached by keyword search | PubMed top 100: 2% and 0%; OpenAlex search top 100: 1% and 6% |
| Relevant papers in the top 20, ranked by seed links | 40% and 35% (base rate 5.2% and 4.5%) |
| Relevant papers in the top 20, ranked by citation count | 0% and 25% |
| PubMed results for the question vs loose keywords (melanoma example) | 15 vs 999 |
| Melanoma example, citation routes | 980 candidates; Core about 536 to 545; Linked 216; Bridges 218; 1 retracted paper flagged; 494 papers cite at least 2 of 5 seeds |
| Live citation part of a run | 7.8 s cold, 0.5 s warm |
| Judge quote verification rate | TBD after live run |
| Full-pipeline evaluation (embeddings, reranker, judge) | TBD after live run |
| End-to-end run time and cost per run with AI stages | TBD after live run |

## What is real and what is replayed

Real: OpenAlex, PubMed and Europe PMC calls, citation routes, lanes, retraction flag, deployment on Nebius. Demo mode (`?demo=1`) replays a recorded real run in about 5 seconds. The recording committed so far holds the citation stages; the AI stages are to be re-recorded with API keys. Not built: PDF and OCR ingestion, Postgres and LanceDB, vault sync.

## Team

_TBD (names and roles)._

## Links

| Item | Link |
|---|---|
| Repository | https://github.com/Joevonlong/Hackthon-Nebius-NVIDIA (visibility to be checked by the human) |
| Live app | _TBD (prod URL after deploy v3)_ |
| Demo mode | _TBD_ `/?demo=1` |
| Video | _TBD (not recorded or uploaded)_ |

## License and credits

GPL-3.0-or-later. PaperTrail includes code and styles adapted from Zettlr (GPL-3.0); credit to the Zettlr authors and contributors.

## Checks (to fill before submitting)

| Check | Status |
|---|---|
| Prod answers `/api/health` and `scripts/smoke.sh <prod-url>` | not run |
| Every link above returns 200 | not run |
| Description is 150 words or fewer | 142 words counted with wc -w |
| Repo visibility matches the rules; full git history scanned for keys before making it public | not done; ask the human first |
| Video plays signed out | no video yet |
| TBD cells in Measured results replaced or still labeled TBD | open |

## Checklist for the human

- [ ] Form link pasted, track and sponsor prizes selected (Nebius, Token Factory, Tavily)
- [ ] Prod URL, video URL and team names filled in
- [ ] Repo visibility confirmed against the rules (you decide whether to make it public)
- [ ] Every teammate added on the platform
- [ ] Fields pasted and preview checked
- [ ] Submitted by 18:00 target, 18:30 deadline; confirmation URL logged
