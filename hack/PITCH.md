# PaperTrail · Pitch

Status: locked
Locked: 2026-10-18 (decisions D-01..D-16, docs/PRODUCT_PLAN.md). Owner: storyteller. Every number below comes from docs/RANKING_AND_STORAGE.md section 1 or the recorded melanoma run; anything not yet measured says "TBD after live run".

## Name and tagline

**PaperTrail** · *Start from the papers you trust. Find the ones you missed, with receipts.*

Short form (cards, repo description, 42 characters): *Find the papers you missed, with receipts.*

## One-liner (locked)

PaperTrail turns the few papers a researcher already trusts into a ranked reading list of papers they have missed, and shows a checkable paper trail for each one: which seeds link to it, through which route and API, and a quote that is verified word for word against the source text.

## Persona (illustrative, not an interviewed user)

**Lena**, an immuno-oncology postdoc writing a review. She has 5 papers she trusts and a research question. She needs the papers she has not found yet, with reasons she can check before she cites them.

## Problem

Keyword search starts from words, but Lena's best evidence is the papers she already has.

- PubMed with her question as typed returns **15 results**. With loose keywords it returns **999**. Neither is a reading list.
- In the melanoma example, **494** papers cite at least 2 of the 5 seeds. One 2026 paper cites all 5 seeds and has **0 citations**, so ranking by citation count would never show it.
- Tools that recommend papers rarely say why. A researcher who cannot check the reason cannot cite the paper.

Source: docs/PRODUCT_PLAN.md section 2.1 (measured on the notebook's melanoma example).

## Solution

1. **Seed.** Paste DOIs or PMIDs and a question. Each seed becomes a note in a Zettlr-style research workspace.
2. **Discover.** Five routes build a candidate pool: references of the seeds, papers citing 2 or more seeds, PubMed similar articles, LLM query expansion, and one bounded Scout agent that uses Tavily.
3. **Rank in honest lanes.** Core (2 or more seed links), Fresh (last 18 months, fewer than 2 links), Linked (1 link), Bridges (0 links, found semantically). A Retracted warning row and a Not assessable count keep the list honest.
4. **Show receipts.** Each candidate has a paper trail (seeds, route, API, link), a judge's one-sentence reason, a quote checked as a verbatim substring of the abstract, and a "why ranked here" line generated from the score features, not by the model.
5. **Keep and connect.** "Add to vault" writes a Markdown literature note with `[[seed]]` links, the graph shows it, and BibTeX, CSL JSON and Markdown .zip exports go to Zotero or Zettlr.

## Measured proof (hold-out on two real reviews)

Method: hide all but 5 references of a real review; those are the seeds; the hidden references are the "relevant" set. One review's reference list is incomplete, so every number is a lower bound. Source: docs/RANKING_AND_STORAGE.md section 1.

| Claim | Evidence |
|---|---|
| Our routes find far more of the hidden references than keyword search | Union of routes reaches 16% and 42% of hidden references (two reviews). Keyword search reaches 6% at best (PubMed top 100: 2% and 0%; OpenAlex search top 100: 1% and 6%) |
| Seed links are a strong ranking signal | Seed-link ranking puts 40% and 35% relevant papers in the top 20, against a base rate of 5.2% and 4.5%. Citation count alone: 0% and 25% |
| A real run produces a usable pool | Melanoma example: 980 candidates; Core about 536 to 545, Linked 216, Bridges 218, 1 retracted paper flagged |
| It is fast enough for a live run | Live citation part of a run: 7.8 s cold, 0.5 s warm |
| Not yet measured | Judge quote verification rate, full-pipeline eval (F-11), end-to-end time and cost per run with the AI stages: **TBD after live run** |

## Why now

- Open scholarly data is now complete enough to follow citations at scale (OpenAlex, PubMed, Europe PMC are free APIs).
- Hosted open-weight models for embeddings, reranking and judging (Qwen3-Embedding-8B, Qwen3-Reranker-8B, Nemotron) are available through one API on Nebius Token Factory, so a team can add semantic ranking and verified explanations in a weekend.
- Search APIs built for agents (Tavily) let a small, bounded agent look beyond one database for recent work such as preprints.

## Sponsor technology (where each is visible)

| Sponsor | What it does in PaperTrail | Where the judge sees it |
|---|---|---|
| **Nebius Serverless Endpoint** | Hosts the whole app (Hono API, SSE, static client) in one container: `cpu-d3`, `2vcpu-8gb`, public URL | The prod URL in the demo |
| **Nebius Token Factory** | `Qwen/Qwen3-Embedding-8B` (1024-dim embeddings), `Qwen/Qwen3-Reranker-8B` (rerank), Nemotron judge (`nvidia/Nemotron-3_5-Lightning`) for relevance grades, reason and quote; `nvidia/nemotron-3-super-120b-a12b` for facets, query expansion and the Scout | Step trail, "why relevant" with verified quote, Lens (facet grades) |
| **Tavily** | Powers the Scout agent (route R5): web and preprint search for recent papers and context, at most 6 tool calls and 45 s | Agent trace in the step trail; Fresh and Bridges candidates with their route in the paper trail |

The app host and the model endpoint are separate, as the track brief asks.

## Differentiators

Comparison is positioning from each tool's public description, not a benchmark; we did not run them on our test. Do not say a competitor "cannot" do something on stage; say what we do. Verify each competitor description against the tool's current site before the pitch.

| Compared with | What PaperTrail does differently |
|---|---|
| **Connected Papers** (graph around one paper) | Starts from several seeds and uses agreement between them (a paper linked to 2 or more seeds is Core). Ranks and explains, instead of showing a graph to read |
| **ResearchRabbit** (collections and recommendations) | Every recommendation carries a paper trail and a quote checked against the source. Lanes show what kind of find it is (Core, Fresh, Linked, Bridges) and a Retracted row. Notes live in the same workspace |
| **Elicit** (question-driven search and extraction) | Starts from the papers you trust, not only a question, and measures itself: a hold-out test against keyword search, with numbers published |
| All three | Judge quotes must be verbatim substrings of the abstract or a full-text chunk, stored with offsets; unverified quotes are marked and down-weighted. Web pages are context, never evidence for a paper's findings |

## Wow moment

Setup: 5 seed notes in the graph; PubMed 15 / 999 in the header. Trigger: **Run discovery**. Build: the step trail lights up, ghost nodes grow out of the seeds, lanes fill with live counts. Payoff: the top Core paper (cites all 5 seeds, published 2026, 0 citations) opens with its paper trail and a verified quote. Hold on it for two seconds.

## Fit to the track brief (track-chanlenge/track-health-papers.md)

| Brief asks | PaperTrail |
|---|---|
| Accept a research question and a collection of seed papers | Discover tab: question box plus seed DOIs |
| Retrieve and rank candidate publications | Routes R1 to R5, lanes, rerank, judge |
| Metadata and source links for each result | Paper card with DOI, venue, year, authors, links |
| Explain why a paper is relevant | Judge reason and verified quote, plus a deterministic "why ranked here" |
| Token Factory for embeddings and LLM inference | Qwen3 embeddings and reranker, Nemotron judge |
| Tavily for agentic search | Bounded Scout agent (R5) |
| Optional graphs, clusters, filters | Graph view with ghost nodes, Lens slider, lanes |
| Deploy on Nebius, app separate from model endpoint | Serverless Endpoint for the app; Token Factory for models |

The scoring rubric and weights are not in hack/HACKATHON.md. Open item: captain to paste the rubric so the pitch script can map criteria to moments.

## What is real and what is replayed

- Real: OpenAlex, PubMed and Europe PMC calls, the citation routes, lane assignment, the recorded melanoma run (980 candidates), retraction flag.
- Demo mode `?demo=1` replays a recorded real run in about 5 seconds. The committed recording currently holds the citation stages; the AI stages (judge quote, Lens facet grades) are to be re-recorded with keys. Say so if asked.
- Not built today: PDF and OCR ingestion, Postgres and LanceDB, vault sync (post-hackathon, F-23).
