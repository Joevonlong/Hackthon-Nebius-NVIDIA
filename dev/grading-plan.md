# PaperTrail grading — plan, FINAL v2 (PM)

All counts are measured on the Happiness library, on one basis: **477 non-excluded papers**.

## What changed from v1
- **Study design** starts at weight **0.10**. It rises to 0.20 only once the label precision is ≥0.80 and at least 70% of the top 40 carry a label.
  - When a model key is set, the judge classifies the design.
  - Reviews leave the ladder.
  - The ladder changes with the question type.
- **Seed links** counts only when the paper cites or is cited by a seed. It is drawn as a text line, not a bar.
- **Shortlist** is the top 20, plus a separate "Read first" row of reviews.
- **Preprints** can be shortlisted only if they are ≤24 months old and no published version exists. Preprint and published versions are merged first.
- **"Rigour (AI)"** gets a new 4-item rubric. The LLM is renamed **once**, when the rubric ships; there is no interim "AI read".
- **Citations** drops to 0.10 and gains a "Landmark" chip.
- **Topic fit** rises to 0.50.
- **Tile:** one column, at least 260px wide, ink-only bars, at most 3 chips, and every word states its comparison set ("here" / "of field").

## 1. Decisions (v1 decisions kept unless noted; round-3 rulings marked R3)

| # | Final decision | Why | Raised by | Rejected |
|---|---|---|---|---|
| D-1 | Fit · Evidence · Standing order the bars and appear in the legend and table headers. **R3 modify:** the tile shows the bars in one column with a 6px gap between groups, and no group names. | Two columns need ~390px; the tile is ~192px inside. | Des | Two-column rows |
| D-2 | Authors leaves the score and becomes an info line. | h-index is contested, and Authors was not assessed for 478/478. | R, agreed by both | "Track record ◇" |
| D-3 | Venue → **Peer review**, which measures *vetting, not prestige* (MDPI = Psychol Bull is intended). | 153 of 318 venue scores were exactly 1.00. | R | "Venue rank ◇" |
| D-4 | Venue and author h-index appear only under "Context (not scored)". | — | PM | — |
| D-5 | **R3 accept** the researcher's rubric. Items: claims match design (counts double), control/comparison group, validated outcome measure, preregistered or replicated. yes = 1; no or unclear = 0; n/a leaves the denominator. A "yes" without a verbatim quote counts as unclear. The relevance half leaves the score; the off-topic gate stays. Year and venue are hidden from the judge. | "design stated" and "n reported" score writing, not rigour. | R | v1 items |
| D-6 | **R3 accept, with changes.** Study design weight 0.10 → 0.20 once **both** gates are measured. The judge labels design in the call it already makes. Without a key, only the deterministic labels apply. | Redistribution penalises labelled papers while 14/40 are labelled. | R | 0.20 now |
| D-6a | **R3 accept:** narrative reviews leave the ladder (not assessed: "review — not primary evidence"; Read first row). SR/MA scores 1.0 if it pools RCTs, otherwise 0.8; without a key, SR/MA = 0.8. Methods/measurement papers get a `methods/measure` tag and no design score. | A review is not primary evidence. | R | Review at 0.5 |
| D-6b | **R3 accept:** the ladder depends on the question type, which the planner classifies: intervention, association, prevalence or experience. Without a key, a keyword rule classifies it, defaulting to intervention. | An RCT is not the top design for a prevalence question. | R | One ladder |
| D-7 | Sample size is a chip only (86/439 abstracts). | — | PM, R agrees | 5% weight |
| D-8 | **R3 reconcile:** Seed links is binary. Cites / cited-by a seed **paper** = 1.0. PubMed-similar only or no link = `not_counted`: no reward and no row. Similar-only is shown as evidence in the report card. Tile: "✓ Cites your seed: Diener 2015", or nothing. | A 0.5 would *penalise* papers above 0.5, so it is not reward-only. Similar is a guess. A binary signal is not a scale, so it gets no bar. | R + Des | Similar = 0.5; any link = 1.0 |
| D-9 | Not scored = hatched + reason word. Scored zero = empty track + "0". Not counted = no row. The footer reads "5 scored · Rigour (AI) not read", with not-counted signals outside the denominator. The verdict never names a not-counted signal. | Three states that can be told apart in greyscale. | Des | "Scored on N of 6" |
| D-10 | **R3 accept:** every word states its comparison set: "top third here" (◇) or "top 10% of field". This applies to the tile, the `plain` sentence and the verdict. | Otherwise relative and absolute claims read the same. | Des | Bare "top third" |
| D-11 | **R3 accept:** the **Shortlist is the top 20** non-excluded papers (adjustable) with a floor of 0.50, and narrative reviews are not counted. A separate **Read first** row shows the top 5 reviews/SR/MA. The tile says only "Shortlisted"; the rule appears once in the results header. | ~119 papers is not a reading list, and showing the rule 119× is noise. | R + Des | Top 25%; rule on every tile |
| D-12 | No letter grade, ring, radar or stacked bar anywhere. The report-card donut becomes the same total bar. | One encoding for the total. | Both | Radar in report card |
| D-13 | One COMPONENT_META in shared/library.ts. | — | Des | — |
| D-14 | Keys stay stable and only `design` and `status` are added. `venue` and `authors` stay at 0. | Old library.json files keep working. | PM | Renaming keys |
| D-15 | Citations for papers under 2 years old with no FWCI → not assessed. | — | PM | Neutral 0.5 |
| D-16 | **R3 modify:** no veto. Preprints score Peer review 0.3 and get a "Not peer reviewed" chip. A preprint is **shortlist-eligible only if ≤24 months old and no published version was found**. Versions are merged first. | 0.3 at weight 0.10 is no signal. Many "preprints" are copies of published papers. | R (Des agreed with v1) | Veto; 0.3 alone |
| D-17 | The verdict sentence sits on the tile. | — | Des | — |
| D-18 | **R3 accept:** Citations 0.10. "Landmark" chip at ≥99th percentile for field and year. | The top 45 span 0.82–1.00. | R | 0.15 |
| D-19 | **R3 accept:** one-column tile with a 260px minimum; a 320px phone gets one full-width tile. | 80px label + 50px bar + 70px word. | Des | 220px |
| D-20 | **R3 accept:** rename the LLM once, to "Rigour (AI)", when the rubric ships. Spelling "rigour" everywhere. | Avoids three names in a week; "AI rigour" reads as the AI's rigour. | Des (R wanted "AI" visible; kept) | Interim "AI read" |
| D-21 | **R3 accept:** chips max 3, warnings first: Not peer reviewed / Retraction concern / Animal study > Read first > Landmark > Recent > OA > n=. No kind chip. | Wrapping, and the kind repeats Study design. | Des | 5 chips |
| D-22 | **R3 accept:** ink-only bars; accent only for Shortlisted. The six hues are retired. ◇ has screen-reader text, and each bar is `role="img"` with an aria-label that includes the number. | Accessibility. | Des | Six hues |
| D-23 | **R3 accept:** the banner is dismissible and reopenable, with real `<button>`s. AI wording: "only the top 40 are read (by design)". The legend's localStorage access is wrapped in try/catch and defaults to open. | A deliberate limit should not look like a failure. | Des | "420 of 478 not read" |
| D-24 | **R3 accept:** the Topic fit weight goes to 0.50 while Design is gated (0.40 after). | It is the only signal with full coverage and spread. | PM | — |

## 2. Final grading model

| key | Short (≤12) | Long | Definition (higher = better) | Source | No keys? | Basis | Weight (gate met) | Not assessed |
|---|---|---|---|---|---|---|---|---|
| relevance | Topic fit ◇ | Fit to your question | Higher = title and abstract match your question and subtopics more closely than other papers **here** | embedding; keyword fallback | yes | here | **0.50** (0.40) | no text → hatched |
| graph | Seed links | Cites your seed papers | 1.0 when it cites or is cited by a seed paper | OpenAlex refs / cited-by | yes | absolute | **0.10** | no seeds → banner "Add seed papers"; no link → not counted, no row |
| design | Study design | Strength of study design | Higher = stronger design for **this question type** (intervention ladder: SR/MA-of-RCTs 1.0 · RCT .9 · SR/MA other .8 · quasi-exp .7 · cohort .5 · case-control .4 · cross-sectional .3 · qualitative .3 · case report/commentary .1) | kind, PubMed types, MeSH, regex; judge for the top 40 | partial | absolute | **0.10** (0.20) | no label / review / methods → hatched + reason |
| llm | Rigour (AI) | Rigour, AI read of the abstract | Higher = more rubric items met (D-5) | judge, top 40 | no | absolute | **0.10** (lowest, D-29) | not read → hatched "not read" |
| citations | Citations | Citations for field & year | Higher = cited more than papers of the same **field** and year; library fallback ◇ ("here") | OpenAlex percentile | yes | of field (◇ fallback) | **0.10** | no data, or <2y without FWCI → hatched |
| status | Peer review | Publication status | Vetting, not prestige: indexed 1.0 · peer reviewed .7 · book·thesis .5 · preprint .3 | peerReviewed, venue type, DOAJ/ISSN/core | yes | absolute | **0.10** | unknown → hatched |

The weights sum to **1.00** at launch, and still sum to 1.00 after the gate (Topic fit 0.40 + Design 0.20).

A not-assessed signal's weight is redistributed over the assessed signals and is never drawn as 0.

**Outside the score:**
- Retracted → excluded.
- AI relevance ≤1 → cannot be shortlisted.
- Preprint rule (D-16).
- Flags: expression of concern / erratum, animal-only on a human question.
- Chips: n=, Landmark.

## 3. UI

**Tile** (illustrative, ~232px inside):
```
#1 ▲2                 Shortlisted  0.79
███████████████████░░░░░│░░░░░░
Happiness and health: a meta-
analysis of prospective studies
Diener et al. 2017 · Psychol Bull
Strong on topic fit and design;
weaker on citations
Topic fit ◇   ██████░░  top third here

Study design  ██████░░  SR/MA
Rigour (AI)   ╱╱╱╱╱╱╱╱  not read

Citations     ██████░░  top 10% of field
Peer review   ████████  indexed
✓ Cites your seed: Diener 2015
[Read first] [Landmark] [Recent]
5 scored · Rigour (AI) not read  Report card ▸
```

**Results header**
- "Shortlist: top 20 by score (min 0.50) · 20 of 477".
- A **Read first** row with the 5 top reviews.
- The legend: collapsible, with "longer = better", ◇ = "compared within this library (477 papers): best here ≠ best in field", hatched = not scored with its weight moved, and one definition line per signal.

**Banner**
```
Not scored here — their weight moved to the other signals        [×]
• Seed links: your notes name no papers.   [Add seed papers in Library]
• Rigour (AI): only the top 40 are read (by design); 8 have no abstract.
• Study design: no design label for 260 of 477.
```

**Table**
- Group headers use `scope="colgroup"`.
- Column headers wrap to two lines, ≥64px per column.
- Below 720px the signal columns hide and the tile's bar block shows on row expand.
- One total column; no grade column.

**Report card**
- The `plain` sentence comes first, stating "here" / "of field".
- "▸ Exact rule" and "▸ Evidence" are folded.
- A not-scored row shows a fix button.
- "Context (not scored)".
- The total bar replaces the donut.

## 4. Bug fixes (file:line)
- **B1** Graph counts ids, not papers: `server/library/score.ts:126,181`
- **B2** Venue rescales to 1.00: `score.ts:247-255`
- **B3** Preprints fixed at 0.2: `score.ts:240`
- **B4** Papers under 2 years get a neutral 0.5: `score.ts:207`
- **B5** Concerns are never scored: `score.ts:287`
- **B6** The judge sees year and venue: `llmread.ts:42`
- **B7** The radar draws missing as 0: `client/src/library/results/MiniRadar.vue:15`
- **B8** A missing value is graded E: `Verdict.vue:12`
- **B9** "top X%" is unfilled: `results/facts.ts:35`, `Verdict.vue:11`
- **B10** Recent is 5 years vs 3 years: `facts.ts:44` vs `LibraryResults.vue:108`
- **B11** Grade shown twice / headers tooltip-only: `ResultRow.vue:34-35`, `ResultTable.vue:30`
- **B12** Labels in three places: server `score.ts:13-16`, client `score.ts:9-16`, `chat.ts:328`, `LibraryPanel.vue:180,184`
- **B13** Relative copy reads absolute: client `score.ts:95-102`
- **B14 (new)** With `venue` and `authors` at weight 0, "LLM lowest" warns falsely: `LibraryPanel.vue:98` (every other weight must be ≥ llm) and `chat.ts:258`. Zero-weight retired keys must be excluded from the check.
- **B15 (new)** The 220px tile minimum: `ResultTiles.vue:26`, `LibraryResults.vue:189`

## 5. Roadmap

Lanes are taken from the file headers: L2 = server/library scoring, U1 = client/src/library, U2 = chat.ts. **[C]** = needs the captain's approval (a `shared/library.ts` contract change).

**Phase 0 — fixes + final-name copy (≤1 day, no contract change)**

| Item | Lane | Files | Eff | Acceptance |
|---|---|---|---|---|
| B1 count seed papers | L2 | score.ts:126,181 | S | Unit: 3 ids of one paper → "1 seed paper" |
| B2 no h-index → not assessed | L2 | score.ts:247-255 | S | Happiness rebuild: 0 papers (was 153) at 1.00 without an h-index |
| B7, B8 | U1 | MiniRadar.vue, Verdict.vue | S | **On Happiness, no tile shows a not-assessed component drawn as 0 or graded E** (component test, 477 papers) |
| B9, B10, B11 | U1 | facts.ts, Verdict.vue, LibraryResults.vue, ResultRow/Table | S | Tip text = PassRule; Recent chip count = filter count; one total per row |
| Rename to final names only: Topic fit, Seed links | U1, L2, U2 | B12 files | S | grep: 0 UI strings "Graph"/"Lnk"/"Relevance to"; LLM name untouched |
| Seed links copy "Add seed papers in the Library tab"; B6 | L2 | score.ts:159, llmread.ts:42 | S | Prompt test: no Year/Venue line |

**Phase 1 — UI, naming, shortlist (2 days)**

| Item | Lane | Files | Eff | Acceptance |
|---|---|---|---|---|
| **[C]** shared COMPONENT_META; ScoreComponent optional `plain`, `relative`, `state`, `fix`; LibraryRequest `shortlistSize` (default 20) | captain | shared/library.ts | S | Old library.json files parse (zod test) |
| Emit `plain` / `state` / `fix`; Seed links binary | L2 | score.ts, pipeline.ts:225 | M | Happiness: 0 papers with graph 0 or 0.5; similar-only → not_counted |
| Shortlist top 20 + floor; Read first row; PASSED → Shortlisted | L2, U1, U2 | score.ts passFlags, client score.ts:34, PassRule.vue, chat.ts | M | Happiness: exactly 20 shortlisted, 0 narrative reviews among them; Read first ≤5; server = client ranks |
| Tile (B15), legend, banner, table, report card, a11y | U1 | ResultTile(s).vue, ChartLegend.vue, LibraryResults.vue, WhyScore.vue, HoverCard.vue, ResultTable.vue | L | Playwright at 260/320px: no overflow. 0 rings/letters/radars. Each bar has an aria-label with its number. Banner counts match the data, and its button opens the Library tab |

**Phase 2 — model (3–4 days)**

| Item | Lane | Files | Eff | Acceptance |
|---|---|---|---|---|
| **[C]** keys `design`, `status`; DEFAULT_WEIGHTS (§2); Goals `questionType` | captain | shared/library.ts | S | Weights sum to 1.00; old libraries rescore without error |
| Merge preprint + published versions | L2 | score.ts findDuplicates (title ±1 year, OpenAlex locations) | M | Fixture: PsyArXiv copy merged into the journal record; Happiness count reported |
| Peer review; preprint shortlist rule; Authors → Context | L2, U1 | score.ts, WhyScore.vue | M | 0 shortlisted preprints older than 24 months or with a published version; no h-index in any total |
| Study design: ladders, judge classification, methods tag, review exclusion | L2 | labels.ts, llmread.ts, goals.ts, score.ts | L | The eval script prints precision (50 papers hand-labelled by the researcher) and top-40 coverage; weight stays 0.10 unless ≥0.80 and ≥70% |
| Rigour (AI) rubric + the single rename; B14 | L2, U1, U2 | llmread.ts, score.ts, LibraryPanel.vue:98, chat.ts:258 | M | Each read returns all 4 items; grep finds one name for `llm` across client, server and chat; no false "lowest" warning at the default weights |
| Citations 0.10, <2y → not assessed, Landmark | L2, U1 | score.ts:207, facts.ts | S | 0 neutral-0.5 values |
| Flag chips (D-21) | L2, U1 | labels.ts, facts.ts | M | ≤3 chips per tile; warnings shown first |

## Later
- Include/maybe/exclude per paper with a reason, saved and exportable (PRISMA). This also produces precision@20 labels.
- Population match chip (age group, country).
- Per-question recency toggle as a filter.
- Kappa between the researcher and the judge on 50 design labels, shown in the UI as the measured value or "not yet measured".
- A predatory or journal-list check.
- Full-text reads.

## 6. Metrics, risks, open questions

**Metrics**
- Not-assessed components drawn as 0: **0**.
- Hallway test (5 researchers): "why is X not scored and how do I fix it?" and "which signals are here vs of field?" ≥4/5 correct.
- No non-binary signal with >30% of papers at one value.
- Design gate: precision and top-40 coverage published by the eval script.
- Bias check: mean total of papers with a design label vs without.
- Precision@20 against researcher labels once screening exists (Later).

**Risks**
- At 0.50, Topic fit (relative) dominates the order until Design clears its gate.
- Regex design labels may be wrong.
- The question-type classification may misfire, which changes the ladder.
- Version merging may produce false merges.
- The demo becomes less visual.
- Both contract changes are blocked until the captain approves them.

**Open questions for the user**
1. Is a default Shortlist of 20 right for you (it stays adjustable)?
2. Is "How to be more happy in modern society?" an **intervention** question (RCT top, qualitative 0.3)?
3. Are preprints shortlist-eligible only when ≤24 months old?
4. Is it acceptable for Topic fit to carry 0.50 until the design labels are measured?
5. British "rigour" or US "rigor"?
