# Submission · PaperTrail · Nebius Healthcare / Life Sciences: Research Paper Discovery

Form: _TBD (captain to paste the form link)_ · deadline 18:30 CEST · our target 18:00. The human submits; nothing here is submitted, published, or uploaded yet.

Rewritten for the Library flow (CR-1 to CR-3). Numbers are measured or marked `TBD-n (from the recorded demo run / eval lane)`; the registry is in hack/PITCH.md. Replace or keep every TBD label before submitting.

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
| Figures for the final recorded run | TBD-2 (from the recorded demo run / eval lane) |
| Cost per build | TBD-10 (from the recorded demo run / eval lane) |
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
| Live app | _TBD (none if the app stays local; Nebius URL if deployed)_ |
| Demo mode | _TBD_ `/?demo=1` (local) |
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
| Every TBD-n in this file replaced or still labelled TBD | open |

## Checklist for the human

- [ ] Form link pasted, track and sponsor prizes selected (Nebius, Token Factory, Tavily)
- [ ] Video URL, team names and any live URL filled in
- [ ] Deployment status stated truthfully (local run, or the Nebius URL)
- [ ] Repo visibility confirmed against the rules (you decide whether to make it public)
- [ ] Every teammate added on the platform
- [ ] Fields pasted and preview checked
- [ ] Submitted by 18:00 target, 18:30 deadline; confirmation URL logged
