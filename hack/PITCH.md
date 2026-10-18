# PaperTrail · Pitch

Status: rewritten for the Library flow (CR-1 to CR-3, decisions D-18 to D-30, 16:00). Owner: storyteller. Source of truth: docs/PRODUCT_PLAN.md sections 13 to 15, docs/LIBRARY_SPEC.md, shared/library.ts.

Number rule: every number below is either measured (source named) or marked `TBD-n (from the recorded demo run / eval lane)`. The captain fills the TBDs after the final recorded run; the registry is at the end of this file. Never say a TBD number on stage.

## Name and tagline

**PaperTrail** · *Start from the papers you trust. Find the ones you missed, with receipts.*

Short form (42 characters): *Find the papers you missed, with receipts.*

## One-liner (locked)

Type your research question, add the five papers you trust, and PaperTrail builds a library of new papers from OpenAlex, PubMed, arXiv and Tavily; grades each one with a plain-language verdict and a report card whose every number shows its evidence; and lets you steer the ranking in chat before you keep anything.

## Persona (illustrative, not an interviewed user)

**Lena**, an immuno-oncology postdoc writing a review of single-cell studies in melanoma. She has 5 papers she trusts and a question. She needs the papers she has not found yet, and a reason for each one that she can check before she cites it.

## Problem

Keyword search starts from words; Lena's best evidence is the papers she already has. Search tools return a long list with a score she cannot inspect, and she cannot tell the model "I care more about recent clinical studies" and see what changes.

- PubMed with her question as typed returns a count that is either too small or too big to read: `TBD-1 (from the recorded demo run / eval lane)` for the final question. (docs/PRODUCT_PLAN.md section 2.1 recorded 15 results for the question and 999 for loose keywords on the notebook's query; re-measure for the typed question before saying it.)
- A tool that recommends papers without saying why gives her nothing to cite.
- A paper she already has in her vault is not new. A retracted paper is not safe. Both must be handled, not hidden.

## Solution: the flow the judge sees

1. **Type the question** in the box at the top of the Library panel. It becomes the library's question and is saved to `Notes/Question.md`.
2. **Add 5 seed papers** (DOIs or PMIDs in notes). Each seed becomes a note in the vault. They are the papers she trusts.
3. **Build library.** A goals agent reads every note in the vault and writes the topic, goals, subtopics and keywords, with a verbatim quote from a note as evidence for each goal. Then the search runs for real: OpenAlex, PubMed (publication types and MeSH), arXiv and Tavily (high priority: the question, every subtopic and keyword group), plus graph expansion from the seeds (references, citing papers, PubMed similar articles). Every call is traced.
4. **Review verdicts and report cards.** Each paper in the list has a one-sentence verdict, its strongest and weakest components, a total, and a "Why this score" report card: a letter grade, a one-line reason and a weight for each of six components (relevance, graph, citations, venue, authors, LLM read), with the evidence folded under each row. The LLM read has the lowest weight by design.
5. **Chat: steer the ranking.** In the column on the right, Lena types "prioritize recent clinical studies". The agent proposes new weights, a pass rule or filters as a diff with a rationale. Nothing changes until she clicks **Apply**. The list re-scores in her browser, rank moves are shown, and the change is logged with the prompt.
6. **Keep and connect.** **Add to vault** writes a Markdown literature note with front matter, the verified quote and `[[seed]]` links. The node appears in the graph (node size follows the grade). **Export BibTeX** for Zotero.

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
| Figures for the final recorded run | `TBD-2 (from the recorded demo run / eval lane)` | captain fills |

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
| Demo replay `?demo=1` | A recording of a real run (the one we record from the same flow, CR-3 R-3.3). Say "this replays a recorded real run" the first time. Length of the replay: `TBD-4 (from the recorded demo run / eval lane)` |
| Mock data (`?mock=1`) | Dev builds only; never shown |
| Not used | Google Scholar; a reranker model; full-text reading (abstracts only); PDF and OCR ingestion |
| Not built | Nebius Serverless deploy (script ready, not run); Postgres and LanceDB; vault sync |

## TBD registry (captain fills after the final recorded run)

| ID | What | Where it is used |
|---|---|---|
| TBD-1 | PubMed result count for the final typed question | Pitch hook, Q&A |
| TBD-2 | Final run: seconds, source calls, papers scored, abstracts read, quotes verified | Pitch proof, README, SUBMISSION |
| TBD-3 | ✅ filled 16:40 from eval/RESULTS_LIBRARY.md | Pitch proof, Q&A 2 |
| TBD-4 | Replay length of `?demo=1`; recording length | Runbook |
| TBD-5 | Final question wording and the five seed papers (titles) | Runbook, SUBMISSION |
| TBD-6 | Goals: number of goals and subtopics found | Runbook beat 3 |
| TBD-7 | Top paper in the recorded run: title, year, total, grade | Runbook beat 4 |
| TBD-8 | Passed papers under the 25% rule, excluded papers (retracted, in vault) | Runbook beat 4 |
| TBD-9 | Chat step: which papers move and by how many ranks after "prioritize recent clinical studies" | Runbook beat 5 |
| TBD-10 | Cost per library build | Q&A 4 |
| TBD-11 | Vault notes added and BibTeX entries exported in the recording | Runbook beat 6 |
