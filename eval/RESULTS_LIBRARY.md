# Library mode: hold-out eval on two real reviews

Measured 2026-10-18, 15:56 to 16:20 CEST. Script: `eval/library_eval.ts`. Raw per-run numbers: `eval/out_library/*.json`.
Main runs used main at `0aae755` (top-25% pass rule and subtopic fix). Repeat runs used the code from before that merge (`9f65b64`).

## Method

Same idea as `eval/holdout.py` (docs/RANKING_AND_STORAGE.md §1).

- **Reviews.** OpenAlex `referenced_works` gives each review's reference list.
  - A = W3005326482, "CD8+ T cell states in human cancer: insights from single-cell analysis" (2020-02-05). It has 93 references, 1 of which OpenAlex cannot resolve.
  - B = W4365143025, "Dynamics and specificities of T cells in cancer immunotherapy" (2023-04-12). It has 235 references.
- **Vault.** The vault holds 6 notes:
  - a `Question.md` whose only text is the review title;
  - 5 seed notes, each holding one seed's title and DOI. The 5 seeds are references with a DOI, picked by a fixed-seed shuffle (seed 42).
- **Ground truth.** Every other reference published before the review: A = 87, B = 230.
- **System.** The real pipeline runs through `POST /api/library` on `:3022`. Settings: topK 30, default weights, threshold 0.5, topPercent 25, all sources. The pile cap is 600 by default, and some runs use 1500. Models: planner nemotron-3-super-120b, relevance by Qwen3-Embedding-8B, and the LLM read covers 40 abstracts on every run.
- **Ranking scored.** Ranks 1 to 30 among non-excluded papers. Seeds are excluded as "already in your vault". The review itself is not in the vault, so it can be ranked, and it counts as a miss.
- **Baselines.** Each baseline takes the top 30 after dropping the review and the seeds:
  - PubMed esearch with the review title, sort=relevance;
  - OpenAlex `search=` with the review title.
- **Date-restricted variant.** Only candidates published before the review count. The review could not cite later work. Library is filtered offline. PubMed uses `maxdate`. OpenAlex uses `to_publication_date`.

## Results (hits = hidden references in the top 30)

| | A cap 600 | B cap 600 | A cap 1500 | B cap 1500 |
|---|---|---|---|---|
| **Library hits@30** | **7** | **8** | **10** | **6** |
| Library P@30 / R@30 | 0.233 / 0.080 | 0.267 / 0.035 | 0.333 / 0.115 | 0.200 / 0.026 |
| Library, pre-review candidates only, hits@30 (P@30) | 7 (0.233) | 10 (0.333) | 13 (0.433) | 10 (0.333) |
| Reach: hidden refs anywhere in the scored pile | 24/87 | 29/230 | 39/87 | 53/230 |
| Hidden refs among papers that pass (top 25%, n) | 15 (n=149) | 22 (n=150) | 36 (n=374) | 37 (n=374) |
| Papers in the top 30 published after the review (always misses) | 10 | 8 | 12 | 7 |
| Rank of the review itself (not in the vault) | 1 | 1 | 2 | 4 |
| PubMed title search hits@30 | 0 (0 results) | 4 (P 0.133, R 0.017) | same | same |
| PubMed, pre-review only | 0 (0 results) | 4 of 30 | | |
| OpenAlex search hits@30 | 1 (P 0.033); 25 of 30 are post-review | 0 | same | same |
| OpenAlex, pre-review only | 4 of 30 | 1 of 30 | | |
| Hidden refs the 5 seeds themselves cite | 20/87 | 35/230 | | |
| Pipeline time (warm raw cache) | 59 s | 64 s | 58 s | 75 s |

**Repeat runs (older code, same notes).** These show run-to-run variance, which comes from the planner LLM, the web sources, and PubMed 429s.

| Run | Hits@30 | Reach | Pre-review hits@30 | Review rank | Pipeline time |
|---|---|---|---|---|---|
| A cap 600 | 9 (P 0.300) | 24/87 | 12 | 1 | 134 s, cold cache, PubMed 429s |
| B cap 600 | 8 (P 0.267) | 32/230 | 9 | 2 | 164 s, cold cache |
| A cap 1500 | 10 (P 0.333) | 37/87 | 14 | 2 | 107 s |

A fourth repeat (B cap 1500) was cut off when the server was killed mid-write. Its pile had only 184 papers, so it was discarded.

## Ablation: hits@30 (P@30), stored papers re-scored offline

Each column is one run. A row zeroes one weight, or keeps only one. The remaining weights are renormalized, using the same rule as `combine()`.

| Ranking | A 600 | B 600 | A 1500 | B 1500 | A 600 rep | B 600 rep | A 1500 rep |
|---|---|---|---|---|---|---|---|
| full (default) | 7 (0.233) | 8 (0.267) | 10 (0.333) | 6 (0.200) | 9 (0.300) | 8 (0.267) | 10 (0.333) |
| − relevance | 7 (0.233) | 4 (0.133) | 8 (0.267) | 5 (0.167) | 7 (0.233) | 6 (0.200) | 7 (0.233) |
| − graph | 8 (0.267) | 6 (0.200) | 6 (0.200) | 7 (0.233) | 8 (0.267) | 8 (0.267) | 5 (0.167) |
| − citations | 7 (0.233) | 6 (0.200) | 9 (0.300) | 7 (0.233) | 8 (0.267) | 8 (0.267) | 10 (0.333) |
| − venue | 6 (0.200) | 2 (0.067) | 8 (0.267) | 8 (0.267) | 5 (0.167) | 7 (0.233) | 7 (0.233) |
| − authors | 7 (0.233) | 4 (0.133) | 9 (0.300) | 7 (0.233) | 6 (0.200) | 6 (0.200) | 8 (0.267) |
| − llm | 7 (0.233) | 6 (0.200) | 9 (0.300) | 6 (0.200) | 8 (0.267) | 7 (0.233) | 10 (0.333) |
| only relevance | 2 | 0 | 2 | 3 | 1 | 2 | 1 |
| only graph | 4 | 3 | 4 | 3 | 4 | 3 | 4 |
| only citations | 2 | 3 | 2 | 2 | 2 | 3 | 2 |
| only venue | 7 | 4 | 5 | 7 | 7 | 5 | 5 |
| only authors | 3 | 6 | 4 | 4 | 3 | 5 | 3 |
| only llm* | 7 | 9 | 10 | 8 | 8 | 8 | 11 |

The offline "full" row equals the live top 30 in all 7 runs, which validates the re-scorer.

How to read it:
- **No single component explains the result.** Removing relevance lowers hits@30 in 6 of 7 runs, removing venue in 6 of 7, and removing authors in 5 of 7. Single-component rankings are mostly worse than the blend: relevance alone gets 0 to 3 hits, citations alone 2 or 3. Venue alone is the strongest single component; it ties or beats the blend in 2 of 7 runs.
- **Small differences are noise.** A difference of 1 or 2 hits is within the run-to-run variance: A cap 600 scored 7 on one run and 9 on the other.
- **The "only llm" row is misleading.** The LLM reads only the 40 papers that the other five components ranked highest. That row therefore re-orders a list the blend already picked, and it is not a standalone signal.
- **The ablation keeps the LLM reads fixed.** It does not re-run the choice of which 40 papers get read.

## Caveats (read before quoting)

- **The numbers are lower bounds.** The ground truth is one review's reference list. A relevant paper that the authors did not cite counts as a miss, and so does every paper published after the review: 7 to 14 of each top 30.
- **The baselines are weak by construction.** They are naive title queries, not tuned searches. PubMed returns 0 results for the full title of review A, with or without punctuation.
- **The sample is small.** There are 2 reviews, one seed set each, and 7 Library runs. The confidence intervals are wide.
- **Recall is low.** R@30 is between 0.026 and 0.115, because review B has 230 references and only 30 slots.
- **Reach is limited by the pile cap.** At cap 600, B reached 29 hidden references. That is fewer than the 35 the seeds cite directly, so the cap drops reachable papers. Cap 1500 lifts reach to 53/230 (B) and 39/87 (A), but hits@30 did not rise reliably: 10 and 6, against 7 and 8 at cap 600.
- **The review itself is ranked.** It sits at rank 1 to 4 in every run. Scored strictly, it is a miss. It is still a sign that the pipeline finds the right literature hub from 5 seeds.

## Claim we may put in the pitch

> From a one-line question and 5 seed papers taken from a real review, PaperTrail's Library put 6–10 of that review's hidden references in its top 30 across 7 runs on two immunology reviews (precision@30 0.20–0.33), where a PubMed title search found 0–4 and an OpenAlex search 0–1. In every run the review itself, which was not in the vault, ranked in the top 4.
