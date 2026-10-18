# Submission · PaperTrail · Nebius Healthcare / Life Sciences: Research Paper Discovery

Form: _TBD (captain to paste the form link)_ · deadline 18:30 CEST · our target 18:00. The human submits; nothing here is submitted, published, or uploaded yet.

Rewritten for the Library flow (CR-1 to CR-3). Numbers are measured, with the source named in the TBD registry in hack/PITCH.md (filled 2026-10-18 from the `?demo=1` recording and named checks), or marked "not measured". The human-only items below stay TBD: form link, team, video.

## Project name

PaperTrail

## Tagline

Find the papers you missed, with receipts.

(Long form: Start from the papers you trust. Find the ones you missed, with receipts.)

## Description (143 words, limit 150)

PaperTrail turns a researcher's question and the papers they trust into a library of new papers, each with a report card that shows its evidence. Type the question, add five seed papers, and press Build. An agent reads the vault notes for goals, quoting the notes. The app searches OpenAlex, PubMed, arXiv and Tavily, follows citations from the seeds, and scores each paper on relevance, graph links, citations, venue, authors and a language-model read, which has the smallest weight. Every score row shows its numbers and source links. In live runs a build took 94 to 102 seconds, scored 599 papers, and verified 38 of 40 model quotes against the abstract. In chat you say "prioritize recent clinical studies"; the agent proposes new weights, you apply them, and the list re-ranks. Add papers to the vault, see them in the graph, export BibTeX.

## How it uses Nebius, Token Factory and Tavily

- **Nebius Token Factory** serves all models: `Qwen/Qwen3-Embedding-8B` (1024-dim embeddings for relevance to the question and subtopics), `nvidia/Nemotron-3_5-Lightning` (the judge that reads abstracts and returns grades, a reason and a quote), and `nvidia/nemotron-3-super-120b-a12b` (planner: goals, subtopics and queries from the vault; chat model to be confirmed before submitting). There is no reranker model on Token Factory, so relevance is embedding similarity and the UI says so.
- **Tavily** is a high-priority search source: the question, every subtopic (advanced depth) and every keyword group, with scholarly domains, at most 25 calls per library. Each hit is resolved to a paper by DOI, PMID or arXiv id. Web pages are context, never evidence for a paper's findings.
- **Nebius hosting.** The brief asks for a deployment on Nebius. The app currently runs locally (Docker on port 3040, or `pnpm start` on 3030) and calls Token Factory; the Nebius Serverless Endpoint deploy script (`scripts/deploy.sh`) is ready but has not been run. Status: open item for the captain (see Checks). Do not describe the app as deployed on Nebius unless this is done.

## Architecture

The Vue 3 client (Pinia, CodeMirror 6, d3 graph; notes as Markdown in the browser) talks over HTTP and server-sent events to one Hono server on Node 22. A Library build runs in stages: the goals agent reads every note and extracts the topic, goals, subtopics and keywords, with a verified note quote for each goal; search runs on OpenAlex, PubMed (with publication types and MeSH), arXiv and Tavily; graph expansion follows references, citing papers and PubMed similar articles from the seeds; results are deduplicated with provenance and enriched with venue and author data from OpenAlex; each paper gets labels (type, study design, peer review, open access, field, recency) and a score of six components with evidence; the judge reads the best candidates; the top X% of the library (default 25%, floor 0.50) passes. Papers already in the vault and retracted papers are excluded. The chat agent answers from the library JSON and proposes weight, pass-rule and filter changes that the user applies; the browser re-scores instantly. Each paper is stored as one JSON file, and every source and model call is traced under `logs/runs/<libraryId>/`. Shared zod contracts type every message (`shared/library.ts`).

## Measured results

Live Library runs on the real backend (melanoma example, local):

| Measure | Result |
|---|---|
| Time to build a library | 94 to 102 s |
| Source calls per build | 74 to 107 |
| Papers scored per build | 599 |
| Abstracts read by the language model | 40 |
| Model quotes verified word for word against the abstract | 38 of 40 (95%); earlier seed pipeline: 32 of 35 (91%) |
| Final recorded run (the `?demo=1` replay, recorded 2026-10-18 14:01 UTC) | 84.9 s; 82 source calls logged (81 ran: OpenAlex 36, PubMed 19, arXiv 13, Tavily 13; Google Scholar skipped, no key); 599 papers scored; 40 of 40 abstracts read; 37 of 40 quotes verified (92.5%); 150 passed (top 25%, floor 0.50), 5 excluded. Source: server/demo/recordings/library-melanoma.json |
| Goals found in the recorded run | 5 goals, 8 subtopics, 15 keywords, 5 note quotes verified |
| Top paper in the recorded run | "A Cancer Cell Program Promotes T Cell Exclusion and Resistance to Checkpoint Blockade" (Cell, 2018), total 0.98, grade A |
| PubMed results for the question as typed | 15 (NCBI esearch, count only, 2026-10-18 15:11 UTC) |
| Chat step on the recording | "Prioritize recent clinical studies": the proposal raises the relevance weight from 0.30 to 0.40 and keeps articles and reviews from 2023 on; in the top 10, 8 papers enter and 8 leave (150 held papers, client re-score, same proposal in 5 of 5 calls) |
| Cost per build | Tokens measured, price not measured. Eight other builds of the same example used 213,682 to 223,076 tokens each (embeddings 180,304 to 186,217; judge 29,086 to 32,871; planner 4,292 to 5,825); the recorded run's own trace was not kept. No Token Factory price is in the repo docs |
| Citation graph | Demo graph: 60 papers and 287 citation links (measured in the browser on main ba70395). A real library's graph.json: 1,296 edges, 1,112 paper to paper (lib_20261018141959_87bff3) |
| Europe PMC reference fallback | Added 227 citation links in a caffeine build with OpenAlex off; reference step 9.1 s (lib_20261018144844_4cda2c, as reported by the captain; run files not re-checked) |
| OpenAlex entity cache | Keeps builds working when the OpenAlex API budget is spent: 12,416 distinct cached entities (8,186 works, 3,766 authors, 464 sources); the backfill processed 41,479 entity records from 1,013 cached responses (counts taken 2026-10-18 15:14 UTC) |
| Score donut and value bars | "Why this score" at a glance: where each paper's points come from, row by row (a view, no number) |
| Evaluation of the full six-component score against known references | Hold-out on two real immunology reviews (5 of each review's references as seeds, the rest hidden; 7 runs): the Library put 6–10 hidden references in its top 30 (precision@30 0.20–0.33) where a PubMed title search found 0–4 and an OpenAlex search 0–1; the review itself, not in the vault, ranked in the top 4 every run. Lower bounds: ground truth is one review's reference list and 7–14 of each top 30 were published after the review. Details: eval/RESULTS_LIBRARY.md |

Hold-out test on two real reviews (Nat Rev Cancer 2023, 235 references; 2020 review, 93 references), for the citation routes of the earlier seed pipeline: hide all but 5 references as seeds, build a pool, count hidden references. One review's reference list is incomplete, so every number is a lower bound. Method and tables: `docs/RANKING_AND_STORAGE.md` section 1.

| Measure | Result |
|---|---|
| Hidden references reached by the citation routes | 16% and 42% (two reviews) |
| Hidden references reached by keyword search | PubMed top 100: 2% and 0%; OpenAlex search top 100: 1% and 6% |
| Relevant papers in the top 20, ranked by seed links | 40% and 35% (base rate 5.2% and 4.5%) |
| Relevant papers in the top 20, ranked by citation count | 0% and 25% |

## What is real and what is replayed

Real: every source call, the goals agent, enrichment, labels, scoring, the language-model read with quote verification, chat proposals, in-browser re-scoring, Add to vault and BibTeX export. The production build uses no mock or fixture data; failures show an error with Retry. Demo mode (`?demo=1`) replays a recording of a real run so it works without Wi-Fi; it is labelled as a replay. Mock data exists only behind a developer flag. Not used: Google Scholar (no API, not scraped) and a reranker model; the model reads abstracts only. Not built: Nebius Serverless deployment (script ready), PDF and OCR ingestion, Postgres and LanceDB, vault sync.

## Team

_TBD (names and roles)._

## Links

| Item | Link |
|---|---|
| Repository | https://github.com/Joevonlong/Hackthon-Nebius-NVIDIA (visibility to be checked by the human) |
| Live app | None: the app runs locally (laptop or Docker), no hosted URL. Models run on Nebius Token Factory |
| Demo mode | `http://localhost:3030/?demo=1` (local, after `pnpm build && PORT=3030 pnpm start`; replays a recorded real run, no keys and no network needed) |
| Video | _TBD (not recorded or uploaded)_ |

## License and credits

GPL-3.0-or-later. PaperTrail includes code and styles adapted from Zettlr (GPL-3.0); credit to the Zettlr authors and contributors.

## Checks (to fill before submitting)

| Check | Status |
|---|---|
| App starts from a clean clone: `pnpm install && pnpm build && PORT=3030 pnpm start`, then `/api/health` | not run |
| Every link above returns 200 | not run |
| Description is 150 words or fewer | 143 words counted with `wc -w` |
| Nebius deployment decided: deploy, or state local run | open (captain) |
| Chat model name confirmed from server config | open |
| Repo visibility matches the rules; full git history scanned for keys before making it public | not done; ask the human first |
| Video plays signed out | no video yet |
| Every TBD-n number in this file replaced | done 2026-10-18 (measured, sources named in hack/PITCH.md); human-only TBDs remain: form link, team, video |

## Checklist for the human

- [ ] Form link pasted, track and sponsor prizes selected (Nebius, Token Factory, Tavily)
- [ ] Video URL, team names and any live URL filled in
- [ ] Deployment status stated truthfully (local run, or the Nebius URL)
- [ ] Repo visibility confirmed against the rules (you decide whether to make it public)
- [ ] Every teammate added on the platform
- [ ] Fields pasted and preview checked
- [ ] Submitted by 18:00 target, 18:30 deadline; confirmation URL logged
