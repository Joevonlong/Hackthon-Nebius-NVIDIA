# PaperTrail · Pitch

Status: rewritten for the Library flow (CR-1 to CR-3, decisions D-18 to D-30, 16:00). Owner: storyteller. Source of truth: docs/PRODUCT_PLAN.md sections 13 to 15, docs/LIBRARY_SPEC.md, shared/library.ts.

Number rule: every number below is measured (source named) or marked "not measured". The TBD-n placeholders were filled on 2026-10-18 from the `?demo=1` recording (server/demo/recordings/library-melanoma.json, recorded 14:01 UTC from run lib_20261018135951_a27857) and from the checks named in the registry at the end of this file. Never say a number on stage that is not in this file.

## Name and tagline

**PaperTrail** · *Start from the papers you trust. Find the ones you missed, with receipts.*

Short form (42 characters): *Find the papers you missed, with receipts.*

## One-liner (locked)

Type your research question, add the five papers you trust, and PaperTrail builds a library of new papers from OpenAlex, PubMed, arXiv and Tavily; grades each one with a plain-language verdict and a report card whose every number shows its evidence; and lets you steer the ranking in chat before you keep anything.

## Persona (illustrative, not an interviewed user)

**Lena**, an immuno-oncology postdoc writing a review of single-cell studies in melanoma. She has 5 papers she trusts and a question. She needs the papers she has not found yet, and a reason for each one that she can check before she cites it.

## Problem

Keyword search starts from words; Lena's best evidence is the papers she already has. Search tools return a long list with a score she cannot inspect, and she cannot tell the model "I care more about recent clinical studies" and see what changes.

- PubMed with her question as typed ("Which single-cell methods help study melanoma immune cells?") returns **15 results** (NCBI esearch, count only, run 2026-10-18 at 15:11 UTC / 17:11 CEST); the recorded run's own PubMed call returned the same 15. Fifteen is too few to map a field. (docs/PRODUCT_PLAN.md section 2.1 recorded 999 results for loose keywords on the notebook's query, a different query and too many to read.)
- A tool that recommends papers without saying why gives her nothing to cite.
- A paper she already has in her vault is not new. A retracted paper is not safe. Both must be handled, not hidden.

## Solution: the flow the judge sees

1. **Type the question** in the box at the top of the Library panel. It becomes the library's question and is saved to `Notes/Question.md`.
2. **Add 5 seed papers** (DOIs or PMIDs in notes). Each seed becomes a note in the vault. They are the papers she trusts.
3. **Build library.** A goals agent reads every note in the vault and writes the topic, goals, subtopics and keywords, with a verbatim quote from a note as evidence for each goal. Then the search runs for real: OpenAlex, PubMed (publication types and MeSH), arXiv and Tavily (high priority: the question, every subtopic and keyword group), plus graph expansion from the seeds (references, citing papers, PubMed similar articles). Every call is traced.
4. **Review verdicts and report cards.** Each paper in the list has a one-sentence verdict, its strongest and weakest components, a total, and a "Why this score" report card: a letter grade, a one-line reason and a weight for each of six components (relevance, graph, citations, venue, authors, LLM read), with the evidence folded under each row. A score donut and value bars show at a glance where the points come from (CR-11). The LLM read has the lowest weight by design.
5. **Chat: steer the ranking.** In the column on the right, Lena types "prioritize recent clinical studies". The agent proposes new weights, a pass rule or filters as a diff with a rationale. Nothing changes until she clicks **Apply**. The list re-scores in her browser, rank moves are shown, and the change is logged with the prompt.
6. **Keep and connect.** **Add to vault** writes a Markdown literature note with front matter, the verified quote and `[[seed]]` links. The node appears in the graph (node size follows the grade), and citation links between the papers are drawn as edges (CR-10). **Export BibTeX** for Zotero.

Pass rule: the top X% of each library (default 25%) with an absolute floor on the total (default 0.50); both are adjustable in the UI and by the chat agent. Papers already in the vault and retracted papers are excluded before scoring (new papers only).

## Measured proof

### Live Library run (real backend, local, melanoma example)

| Measure | Result | Source |
|---|---|---|
| Time to build a library | 94 to 102 s | live Library runs on the real backend; traces in logs/runs/<libraryId>/ |
| Source calls per build (OpenAlex, PubMed, arXiv, Tavily, expansion) | 74 to 107 | same traces |
| Papers scored per build | 599 | same |
| Abstracts read by the LLM (top candidates only) | 40 | same |
| Judge quotes verified word for word against the abstract | 38 of 40 (95%) | same |
| Earlier seed pipeline: quotes verified | 32 of 35 (91%) | earlier seed run |
| Figures for the final recorded run | see the next table | server/demo/recordings/library-melanoma.json |

### Final recorded run (the `?demo=1` replay), TBD-2

Source: server/demo/recordings/library-melanoma.json (events and library), recorded 2026-10-18 14:01 UTC from run lib_20261018135951_a27857. The replay keeps the top 150 of the 599 scored papers.

| Measure | Result |
|---|---|
| Time to build | 84.9 s (stage times: goals 7.4 s, search 60.3 s, labels and relevance embeddings 7.9 s, pre-LLM scoring 0.08 s, LLM read 5.8 s, select 1.0 s) |
| Source calls | 82 logged, 81 ran (OpenAlex 36, PubMed 19, arXiv 13, Tavily 13); the 82nd, Google Scholar, was skipped because no SerpAPI key is set |
| Papers scored | 599 |
| Abstracts read by the LLM | 40 of 40 |
| Quotes verified word for word against the abstract | 37 of 40 (92.5%) |
| Passed under the pass rule | 150 (top 25% with a floor of 0.50, cutoff 150); grades of those 150: 24 A, 126 B (scale A at 0.85, B 0.70, C 0.55, D 0.40) |
| Excluded | 5 (see TBD-8 in the registry) |

### Added since the first draft: graph, report card, resilience

| Feature | Measured | Source |
|---|---|---|
| Citation graph between papers | The demo graph shows 60 papers and 287 citation links | measured in the browser on main ba70395 |
| Citation graph in a real library | graph.json of a real library has 1,296 edges, of which 1,112 are paper to paper (149 passed papers plus 6 known papers as nodes) | lib_20261018141959_87bff3; recomputed from its papers with `graphOf` (server/library/store.ts) |
| Europe PMC reference fallback | Added 227 citation links in a caffeine build with OpenAlex switched off; the reference step took 9.1 s | lib_20261018144844_4cda2c, figures as reported by the captain (the run files are not on this machine, so not re-checked) |
| Score donut and value bars | "Why this score" at a glance: a donut of where the points come from and bars for each component's value (qualitative; no number) | commit ebff925 (CR-11) |
| OpenAlex entity cache | The cache keeps builds working when the OpenAlex daily budget is spent. The backfill from the older URL cache processed 41,479 entity records from 1,013 cached responses; the cache holds 12,416 distinct entities today (8,186 works, 3,766 authors, 464 sources) plus 14,836 DOI and PMID aliases | data/raw/openalex-entities.sqlite (meta backfill_stats; counts taken 2026-10-18 15:14 UTC) |

### Hold-out test on two real reviews (earlier seed pipeline, docs/RANKING_AND_STORAGE.md section 1)

Method: hide all but 5 references of a real review; those are the seeds; the hidden references are the "relevant" set. One review's reference list is incomplete, so every number is a lower bound.

| Claim | Evidence |
|---|---|
| Citation routes find far more of the hidden references than keyword search | Union of routes reaches 16% and 42% (two reviews). Keyword search reaches 6% at best (PubMed top 100: 2% and 0%; OpenAlex search top 100: 1% and 6%) |
| Links to the papers you trust are a strong ranking signal | Ranking by seed links puts 40% and 35% relevant papers in the top 20, against a base rate of 5.2% and 4.5%. Citation count alone: 0% and 25% |
| The seed-based pool for the melanoma example is large and varied | 980 candidates: Core 545, Linked 216, Bridges 218, 1 retracted paper flagged |

What the hold-out does not show: it tested the seed-link pipeline, not the six-component Library score. The default Library weights (relevance 0.30, graph 0.15, citations 0.18, venue 0.15, authors 0.12, LLM 0.10) are design defaults, not tuned on the hold-out. A hold-out run of the full Library pipeline: Hold-out on two real immunology reviews (5 of each review's references as seeds, the rest hidden; 7 runs): the Library put 6–10 hidden references in its top 30 (precision@30 0.20–0.33) where a PubMed title search found 0–4 and an OpenAlex search 0–1; the review itself, not in the vault, ranked in the top 4 every run. Lower bounds: ground truth is one review's reference list and 7–14 of each top 30 were published after the review. Details: eval/RESULTS_LIBRARY.md.

## Why now

- Open scholarly data is complete enough to follow citations and enrich venues and authors at scale (OpenAlex, PubMed, arXiv are free APIs).
- Hosted open-weight models on Nebius Token Factory give embeddings, a judge and a planner through one API, so a team can add semantic ranking, verified explanations and a chat agent in a weekend.
- Search APIs built for agents (Tavily) let a library reach beyond one database to preprints, society pages and recent work.

## Sponsor technology (where each is visible)

| Sponsor | What it does in PaperTrail | Where the judge sees it |
|---|---|---|
| **Nebius Token Factory** | `Qwen/Qwen3-Embedding-8B` (1024-dim) for relevance to the question and subtopics; `nvidia/Nemotron-3_5-Lightning` as the judge that reads abstracts and returns grades, reason and a quote; `nvidia/nemotron-3-super-120b-a12b` as the planner (goals from the vault, subtopics, queries) and for the chat agent (chat model: confirm in server config before claiming) | Goals card with note evidence; "LLM read" row of the report card; chat proposals |
| **Tavily** | High-priority search: the question, every subtopic (advanced depth) and every keyword group; hits are resolved to papers by DOI, PMID or arXiv id; web pages are context, never evidence for a paper's findings. At most 25 calls per library | Sources table (Tavily rows and counts); "found by" chips on each paper |
| **Nebius (hosting)** | The brief asks for a Nebius deployment. Today the app runs locally on the presenting laptop (decision D-18). Deploy script is ready but has not been run | Say so plainly; see the open decision in the runbook |

There is no reranker model on Token Factory (D-19): relevance is embedding similarity to the question and subtopics, and the UI says so. Google Scholar is not used (it has no public API and we do not scrape it, D-21).

## Differentiators

Positioning from each tool's public description, not a benchmark; we did not run them on our test. Verify each against the tool's current site before the pitch. Do not say a competitor "cannot" do something on stage; say what we do.

| Compared with | What PaperTrail does differently |
|---|---|
| **Connected Papers** (graph around one paper) | Starts from your whole vault (question plus several papers), reads your notes for goals, searches four sources, and grades every paper with a report card instead of showing a graph to read |
| **ResearchRabbit** (collections and recommendations) | Every paper has a score you can audit down to the source number, and you can steer weights in chat and see the rank change before you apply it |
| **Elicit** (question-driven search and extraction) | Starts from the papers you trust as well as a question, and shows evidence for each grade; the LLM's opinion is the smallest weight, not the whole score |
| All three | Judge quotes must be verbatim substrings of the abstract; unverified quotes are marked and down-weighted. The agent proposes changes and the user applies them; nothing is silent |

## Wow moment

Setup: question typed, five seeds in the graph. Trigger: **Build library**. Build: the Goals card appears with a quote from her own notes next to each goal; source rows count up (OpenAlex, PubMed, arXiv, Tavily); papers appear. Payoff: she types "prioritize recent clinical studies" in the chat, clicks **Apply**, and the list re-ranks in front of the judge, with the rank changes shown and the reason in the report card. Hold on the new top paper for two seconds.

## Fit to the track brief (track-chanlenge/track-health-papers.md)

| Brief asks | PaperTrail |
|---|---|
| Accept a research question and a collection of seed papers | Question box plus seed notes |
| Retrieve and rank candidate publications | OpenAlex, PubMed, arXiv, Tavily, graph expansion; six-component score; top X% pass rule |
| Metadata and source links for each result | Labels (type, study design, peer reviewed, open access, field, recency), venue and author info, source links, one JSON file per paper |
| Explain why a paper is relevant and where the information came from | Verdict plus report card; each component shows its evidence with a source link; verified quote; provenance of every hit |
| Token Factory for embeddings and LLM inference | Qwen3 embeddings, Nemotron judge, planner and chat |
| Tavily for agentic search | High-priority search source, resolved to papers |
| Optional graphs, clusters, filters | Citation graph (node size follows grade), filters by kind, year, open access, peer review, set by hand or by chat |
| Deploy on Nebius, app separate from the model endpoint | App runs locally; models on Token Factory (separate). Nebius Serverless deploy postponed: open item |

The scoring rubric and weights are not in hack/HACKATHON.md. Open item: captain to paste the rubric so the script can map criteria to moments.

## What is real and what is replayed (fake-versus-real matrix)

| Part | Status |
|---|---|
| Goals agent, source calls, graph expansion, enrichment, labels, scoring, LLM read, quote check, chat proposals, in-browser re-score, Add to vault, BibTeX export | Real. The production build uses no mock or fixture data (CR-3 R-3.1); failures show an error with Retry |
| Demo replay `?demo=1` | A recording of a real run (the one we record from the same flow, CR-3 R-3.3). Say "this replays a recorded real run" the first time. The real run took 84.9 s; the replay stream (`/api/demo/library/stream`) plays it back in 6.2 s (three timings with curl to the done event: 6.22, 6.22, 6.16 s; default `DEMO_LIBRARY_REPLAY_MS` is 6000). It keeps the top 150 of the 599 scored papers. The demo video is not recorded yet (human-only item) |
| Mock data (`?mock=1`) | Dev builds only; never shown |
| Not used | Google Scholar; a reranker model; full-text reading (abstracts only); PDF and OCR ingestion |
| Not built | Nebius Serverless deploy (script ready, not run); Postgres and LanceDB; vault sync |


## TBD registry (filled 2026-10-18 from the final recorded run and named checks)

Recording = server/demo/recordings/library-melanoma.json (recorded 14:01 UTC, run lib_20261018135951_a27857; read with node: request, passRule, events, library, notes). Grades use the D-25 scale: A at 0.85 or more, B at 0.70, C at 0.55, D at 0.40, else E.

| ID | What | Value | Source | Used in |
|---|---|---|---|---|
| TBD-1 | PubMed result count for the final typed question | **15** for "Which single-cell methods help study melanoma immune cells?" | NCBI esearch `db=pubmed`, count only, 2026-10-18 15:11 UTC (17:11 CEST); the recording's own PubMed call also returned 15 | Pitch hook, Q&A |
| TBD-2 | Final run: seconds, source calls, papers scored, abstracts read, quotes verified | 84.9 s; 82 source calls logged (81 ran, Google Scholar skipped: no SerpAPI key); 599 scored; 40 of 40 abstracts read; 37 of 40 quotes verified | recording `events` (stage and done messages) | Pitch proof, README, SUBMISSION |
| TBD-3 | filled 16:40 from eval/RESULTS_LIBRARY.md | see Measured proof | eval/RESULTS_LIBRARY.md | Pitch proof, Q&A 2 |
| TBD-4 | Replay length of `?demo=1`; recording length | Replay stream **6.2 s** (6.22, 6.22, 6.16 s with curl to the done event on `/api/demo/library/stream`). Video length: not recorded yet (human-only) | local server on port 3099, 2026-10-18 | Runbook |
| TBD-5 | Final question wording and the five seed papers | Question: "Which single-cell methods help study melanoma immune cells?" Seeds: (1) Dissecting the multicellular ecosystem of metastatic melanoma by single-cell RNA-seq, Science 2016, 10.1126/science.aad0501; (2) Defining T Cell States Associated with Response to Checkpoint Immunotherapy in Melanoma, Cell 2018, 10.1016/j.cell.2018.10.038; (3) Phenotype, specificity and avidity of antitumour CD8+ T cells in melanoma, Nature 2021, 10.1038/s41586-021-03704-y; (4) Landscape of helper and regulatory antitumour CD4+ T cells in melanoma, Nature 2022, 10.1038/s41586-022-04682-5; (5) Single-Cell Characterization of the Immune Microenvironment of Melanoma Brain and Leptomeningeal Metastases, Clinical Cancer Research 2021, 10.1158/1078-0432.CCR-21-1694 | recording `notes` (Notes/Question.md, Seeds/S1 to S5) | Runbook, SUBMISSION |
| TBD-6 | Goals: number of goals and subtopics found | **5 goals, 8 subtopics**, 15 keywords, 5 known papers, 5 note quotes verified; planner `nvidia/nemotron-3-super-120b-a12b`, 7.4 s | recording `goals` event and goals stage message | Runbook beat 3 |
| TBD-7 | Top paper in the recorded run: title, year, total, grade | "A Cancer Cell Program Promotes T Cell Exclusion and Resistance to Checkpoint Blockade", Cell 2018, total **0.98**, grade **A**; its LLM read has a verified quote. Second: "Mature and migratory dendritic cells promote immune infiltration and response to anti-PD-1 checkpoint blockade in metastatic melanoma", 2025, 0.94, A | recording `library.papers` rank 1 and 2 | Runbook beat 4 |
| TBD-8 | Passed papers under the 25% rule, excluded papers | **150 passed** (top 25%, floor 0.50, cutoff 150; 574 of 599 were above the floor before the LLM read). **5 excluded**; the replay file keeps only passed papers, so it does not store the reasons. In the build started two minutes later on the same example (lib_20261018140150_03bfe6) exactly 5 were excluded, all "already in your vault", the five seeds. Retracted papers in the recorded run: not stored | recording `passRule` and select message; data/library/lib_20261018140150_03bfe6/papers | Runbook beat 4, Q&A 12 |
| TBD-9 | Chat step: which papers move after "prioritize recent clinical studies" | Measured with the prompt "Prioritize recent clinical studies and ignore preprints" (three identical proposals) and with the runbook's own prompt "prioritize recent clinical studies" (two identical proposals, with the same weights and filters as the first three). Proposal: relevance weight 0.30 to 0.40, keep journal-article, review, systematic-review and meta-analysis from 2023 on. Applied to the 150 held papers with the client re-score: 33 match the filters; in the visible top 10, **8 papers enter and 8 leave**; two stay, moved up: the 2025 dendritic-cell paper from #2 to #1 and the 2025 exhausted CD8 T-cell paper from #7 to #2. The 2018 Cell paper (#1 before) leaves because of the year filter. The weight change alone leaves the same ten papers in the top 10 and moves 136 of the 150 ranks (largest move up 37, down 34). No preprint is among the 150 held papers, so "ignore preprints" removes nothing here, and there is no study-design filter, so "clinical" is read as article types (the proposal's own rationale says so) | POST /api/library/demo-melanoma/chat on a local server (model `nvidia/nemotron-3-super-120b-a12b`, 1.8 s, 15,885 to 15,887 tokens per turn), then `rescore` and `matchesFilters` from client/src/library/score.ts over the recording | Runbook beat 5 |
| TBD-10 | Cost per library build | **Tokens measured, price not measured.** The recording's own run trace (logs/runs/lib_20261018135951_a27857) was not kept. Eight other builds of the same example (599 papers scored, 40 judge calls) used 213,682 to 223,076 tokens each, by model: `Qwen/Qwen3-Embedding-8B` 180,304 to 186,217; `nvidia/Nemotron-3_5-Lightning` 29,086 to 32,871; `nvidia/nemotron-3-super-120b-a12b` 4,292 to 5,825. One example: lib_20261018140150_03bfe6, 219,142 tokens (181,796 + 32,871 + 4,475). A chat turn is about 15,900 tokens on the planner model. No Token Factory prices are in the repo docs, so no dollar figure | logs/runs/lib_*/llm.jsonl in the main repo (usage fields), summed per model | Q&A 4, SUBMISSION |
| TBD-11 | Vault notes added and BibTeX entries exported in the recording | Not measured as a count. The flow adds one vault note (the paper where Add to vault is clicked); BibTeX export lists the question's seed notes plus the notes added (client/src/workspace/export.ts exports every seed and literature note in the vault) | code reading, not an end-to-end run | Runbook beat 6 |
