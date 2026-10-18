# PaperTrail — Ranking, ingestion and storage spec

Status: **locked** 2026-10-18 13:05 CEST (decisions D-06 to D-12 in [PRODUCT_PLAN.md](PRODUCT_PLAN.md)). Owner: lane A (BE/AI). Evidence scripts: [`eval/`](../eval). Real fixtures: [`docs/data/`](data).

---

## 1. What we measured today

**Method (hold-out).** Take a real review paper. Hide all but 5 of its references; those 5 are the seeds, the review title is the question, and the hidden references are the "relevant" set. Build the candidate pool from the seeds (published before the review only), rank it, and count how many hidden references land in the top 20. Ground truth from one review's reference list is incomplete, so every number here is a lower bound.

Reviews: *Dynamics and specificities of T cells in cancer immunotherapy* (Nat Rev Cancer 2023, 235 refs) and *CD8+ T cell states in human cancer: insights from single-cell analysis* (2020, 93 refs).

### 1.1 Which discovery routes find relevant papers (recall)

| Route | Review 2023 hits / pool | Review 2020 hits / pool |
|---|---|---|
| R1 references of the seeds | 31 / 397 (13%) | 24 / 305 (27%) |
| R2 papers citing ≥2 seeds | 4 / 28 (2%) | 9 / 238 (10%) |
| R3a OpenAlex `related_works` | **0** / 42 | **0** / 43 |
| R3b PubMed similar articles (60 per seed) | 6 / 286 (3%) | 8 / 297 (9%) |
| **Union R1–R3** | **36 / 734 (16%)** | **37 / 860 (42%)** |
| Baseline: PubMed keyword, top 100 | 4 (2%) | 0 (title query returned no hits) |
| Baseline: OpenAlex search, top 100 | 2 (1%) | 5 (6%) |

### 1.2 How well each ranking orders that pool (precision at 20)

Base rate of relevant papers in the pool: 5.2% and 4.5%.

| Ranking | Review 2023 | Review 2020 |
|---|---|---|
| Citation count only | 0% | 25% |
| **Seed links only** (seeds it cites + seeds citing it) | **40%** | **35%** |
| Seed links, ties broken by title TF-IDF | 25% | 20% |
| Title TF-IDF only | 5% | 5% |
| RRF(seed links, title TF-IDF) | 30% | 15% |
| 0.5 links + 0.4 text + 0.1 citations (percentiles) | 5% | 10% |

Earlier 3-trial runs with random seeds: seed links beat citation count at top 20 in 4 of 6 trials; weighting seed links by inverse seed popularity (Adamic–Adar style) did not help.

### 1.3 Lessons that shape the design

1. **The pool caps quality.** The best routes reach 16–42% of the hidden references; keyword search reaches ≤6%. Spend effort on routes first.
2. **Seed links are the strongest signal we have measured:** 7–8× the base rate at top 20.
3. **Citation count alone is unreliable** (0% in one review).
4. **A weak signal blended into a strong one makes ranking worse.** Title TF-IDF dragged every blend down. Abstract embeddings, the reranker and the LLM judge should be much stronger than title TF-IDF, but each one gets weight only after the harness shows it helps.
5. **Drop OpenAlex `related_works`** (0 hits twice).
6. The benchmark favors older papers (a review cites older work). Recent papers are under-counted, which is why "Fresh" and "Bridges" get their own lanes below instead of competing on one score.

### 1.4 Real snapshot: the melanoma example through R1–R3 (no LLM yet)

| Route | Candidates |
|---|---|
| R1 references of the seeds | 238 |
| R2 papers citing ≥2 seeds | 494 |
| R3 PubMed similar articles (60 per seed) | 283 |
| **Union** (overlaps: R1∩R3 18, R2∩R3 13) | **980** |

| Lane | Count | What the top of the lane looks like before the judge |
|---|---|---|
| Core | 545 | 2026 paper citing all 5 seeds (0 citations); *Clonal replacement of tumor-specific T cells following PD-1 blockade* (2019, 4 seed links) |
| Fresh | 0 | Empty: R1–R3 return older work. Fresh papers come from R4 query expansion and the R5 Scout (bioRxiv, medRxiv) |
| Linked | 216 | Generic tool papers by citation count: SAMtools, BWA, STAR, edgeR, *Hallmarks of Cancer* |
| Bridges | 218 | PubMed-similar papers with no citation link, e.g. *Topological Tumor Graphs…* (2019), *CD103+ tumor-resident CD8+ T cells…* (2018) |
| Retracted | 1 | A 1991 paper on T-cell-receptor genes in tumor-infiltrating lymphocytes, flagged by OpenAlex `is_retracted` |

Three rules come out of this snapshot:
- **Generic tools need a facet, not a filter.** Tool papers are noise for an evidence question and exactly right for a method question. The judge labels `paperType: tool` and the Lens moves them.
- **Check dates on citation links.** OpenAlex lists a 2017 review as cited by a 2016 seed. An in-link from seed *s* to candidate *c* counts only if `year(c) ≤ year(s) + 1` (one year of slack for preprints); otherwise it is dropped and logged.
- **Fresh needs its own routes.** Without R4/R5, a run has no recent low-link papers at all.

Snapshot data: [`docs/data/melanoma-lanes-snapshot.json`](data/melanoma-lanes-snapshot.json).

---

## 2. Ranking design: a cascade with lanes, not one blended number

```
Stage 0  Candidate pool      R1 refs · R2 ≥2-seed citers · R3 PubMed similar · R4 query expansion · R5 Scout agent (Tavily)
                             every candidate keeps {route, via seed, API, URL}
Stage 1  Graph features      links, out, in, coupling, citations, year          (all candidates, free)
Stage 2  Semantic features   embeddings (all with abstract) → rerank top 150   (Token Factory)
Stage 3  LLM judge           top 40 Core + top 10 Bridges/Fresh                 (Nemotron, json_schema)
Stage 4  Verify              quote must be a verbatim substring of the abstract or full-text chunk
Stage 5  Order               lanes → within-lane score → diversity → lens (in the browser)
Stage 6  Feedback            👍 → new seed + Rocchio · 👎 + reason → facet weight / filter
```

### 2.1 Features (each one shows its source in the UI)

| Feature | Definition | Source shown to the user |
|---|---|---|
| `links` | distinct seeds connected either way | OpenAlex `referenced_works` |
| `out` / `in` | seeds the paper cites / seeds that cite the paper | OpenAlex |
| `coupling` | Σ_s \|refs(c) ∩ refs(s)\| / √(\|refs(c)\|·\|refs(s)\|), shared literature with seeds that the paper does not cite (catches parallel and new work) | OpenAlex · *untested, harness first* |
| `impact` | OpenAlex `citation_normalized_percentile` (field- and year-normalized), not raw counts | OpenAlex |
| `E_seed` | max over seeds of cos(paper, seed) | Qwen3-Embedding-8B |
| `E_f` | cos(paper, facet query f); facets come from one LLM call that splits the question into topic / method / population / outcome | Qwen3-Embedding-8B (queries use the instruction prefix, documents don't) |
| `R_f` | reranker score of facet query f vs. title + abstract (top 150 only) | Qwen3-Reranker-8B |
| `J_f` | judge grade 0–3 per facet with an anchored rubric (3 = same entity, 2 = closely related, 1 = tangential, 0 = absent or unclear) | Nemotron-3.5-Lightning |
| `verified` | 1 if the judge's quote is a verbatim substring after whitespace/Unicode normalization, else 0 | deterministic check |
| flags | `is_retracted`, `type` (review / article / preprint), `has_abstract`, `year` | OpenAlex |

### 2.2 Lanes (the order the researcher reads)

Lanes are assigned in this order; a paper takes the first rule it matches.

| Order | Lane | Rule | Why it is separate |
|---|---|---|---|
| 0 | **Retracted** (warning row) | OpenAlex `is_retracted` | Never recommended; shown so the researcher knows |
| 1 | **Not assessable** | no abstract and `links < 3` | We say so instead of guessing |
| 2 | **Core** | `links ≥ 2` (after the date check) | Strongest measured signal; this is the main list |
| 3 | **Fresh** | published in the last 18 months and `links < 2` | New papers have few links and no citations yet; they would never win on either |
| 4 | **Linked** | `links = 1` | Plausible, weaker evidence |
| 5 | **Bridges** | `links = 0`, from R3–R5, ranked by rerank/judge | Semantic finds that citations miss (other communities, other wording) |

The default list interleaves the lanes: Core and Linked in order, with one Fresh or Bridges paper inserted every 5th slot, each labeled with its lane. Retracted papers never appear in the main list; they show in a warning row with a red badge.

### 2.3 Score inside a lane

```
lens weights   w_f(lens): Evidence end favors topic + population, Method end favors method
J(lens) = Σ_f w_f · J_f / 3 × (verified ? 1 : 0.6)
R(lens) = Σ_f w_f · pct(R_f)
G       = pct(links) + 0.5 · pct(coupling)          # coupling weight 0 until the harness supports it
score   = a·J(lens) + b·R(lens) + c·G + d·impact

Defaults before the judge has run:  order by links, then citation count       (measured best so far)
Defaults after the judge:           a .45  b .20  c .30  d .05                (to be tuned on the harness)
```

- `pct()` = percentile within the run's pool, so features on different scales combine safely.
- **Diversity:** walk down the list and push an item below the next one when its embedding cosine with an item already above it exceeds 0.92 (near duplicate, often preprint + published version or two reviews on one topic).
- **Lens runs in the browser:** the server sends `J_f`, `R_f`, `E_f` per candidate, so re-ranking needs no new API calls.

### 2.4 "Why ranked #3" is deterministic

Two kinds of explanation, never mixed:
- **Why relevant** (content): the judge's sentence plus the verified quote and its source.
- **Why ranked here** (score): generated from the feature contributions, not by the LLM. Example: *"#3 · Core: cites 4 of 5 seeds (OpenAlex) · method facet 3/3 with verified quote (Nemotron) · reranker 92nd percentile for 'single-cell methods' (Qwen3-Reranker)."* It always matches the number.

### 2.5 Feedback

- 👍 Keep → the paper joins the seeds for the next round (graph routes expand from it) and the facet query embeddings move toward it (Rocchio: q' = q + 0.6·mean(👍) − 0.2·mean(👎)).
- 👎 Not relevant + one reason chip: *wrong disease · wrong method · wrong population · too old · it's a review*. Each chip changes one weight or filter and the UI says which.
- P2: after ≥5 labels, fit a small logistic regression on the features (L2 pulled toward the defaults) and show the changed weights.

### 2.6 Evaluation harness (F-11), the gate for every weight

- Scripts in [`eval/`](../eval): `holdout.py` (graph rankings, 3 random seed sets), `reach.py` (recall per route), `fuse.py` (ranking comparisons).
- Extend with: embeddings, reranker, judge, coupling; metrics P@20, nDCG@20, R@100.
- Use 3 reviews from different topics. Tune on 2 and report on the third.
- **Rule:** a feature gets non-zero weight only if it improves P@20 on the tuning reviews. Report the third review's numbers in the pitch, including weak ones.

### 2.7 Run size presets (decided 13:20)

Reranking 150 papers against 2 facet queries is ~90k tokens of abstracts per run (10–20 s on stage), and judging 50 papers is another 20–30 s. Too slow for a live demo, so the sizes are parameters with presets:

| Param (env / run option) | `demo` (default) | `deep` |
|---|---|---|
| `RERANK_TOP_K` | 60 | 150 |
| `RERANK_FACETS` (one rerank per facet query) | off (question only) | on |
| `JUDGE_TOP_K` (Core + Linked) | 30 | 50 |
| `JUDGE_EXTRA_K` (best Fresh/Bridges) | 5 | 10 |
| `JUDGE_CONCURRENCY` | 8 | 8 |
| `EMBED_MAX_DOCS` | 600 | 1500 |
| `SCOUT_MAX_CALLS` | 4 | 6 |

The Discover tab shows the preset and lets the user switch to `deep`. Lens facets come from the judge's grades in both presets, so the Lens still works without per-facet rerank.

### 2.8 Latency and cost per run

| Step | Calls | Time |
|---|---|---|
| Resolve + R1 + R2 | ~15 OpenAlex | ~12 s (measured) |
| R3 PubMed similar | 5 elink + 5 OpenAlex batches | ~4 s (3 req/s limit) |
| Embeddings, ~800 docs | ~13 batched calls of 64 | ~10 s |
| Rerank, top 60 (demo) / 150 × 2 facets (deep) | 1–4 calls | ~3 s / ~10–20 s |
| Judge, 35 papers (demo) / 60 (deep) | 8 in parallel | ~15 s / ~30 s |
| **Total** | | **~35–45 s live (demo preset); replay in ~5 s** |

---

## 3. Ingestion: from a search hit to a stored, quotable paper

### 3.1 The rule

Everything we find, in any format, becomes **one canonical paper record** (identity + metadata) plus **zero or more documents** (the text we can quote), each document stored as **normalized Markdown with chunk offsets** and linked to the **original bytes by hash**. Quotes point to `(document, chunk, char offsets)`, so every claim can be opened at its exact source.

### 3.2 Flow for a Tavily hit (and any other web hit)

```
Tavily result {url, title, content snippet, score}
  │
  ├─ 1. classify URL ─ publisher · preprint server (bioRxiv/medRxiv/arXiv) · PMC/Europe PMC · PubMed
  │                    · trial registry (ClinicalTrials.gov) · news/blog · other
  ├─ 2. extract identifiers ─ DOI from URL path or <meta name="citation_doi">, regex 10.\d{4,9}/…
  │                          · PMID / PMCID from the URL · NCT number · arXiv ID
  ├─ 3. resolve identity ─ DOI → OpenAlex /works/doi:… ; PMID → OpenAlex pmid: ; else title + year + first author
  │                        match via OpenAlex title search (accept only above a similarity threshold)
  │      ├─ resolved   → paper record (new or existing) + provenance row {route: web, query, url, snippet}
  │      └─ unresolved → web_source record (news, trial page, blog), linked to related papers as context
  └─ 4. fetch text, best source first (only when licensing allows, §3.4):
         Europe PMC / PMC JATS XML  >  publisher or preprint HTML  >  PDF (text layer)  >  PDF (OCR)  >  abstract only
```

Web sources are context, never evidence for a paper's findings. A claim drawn from a web page is quoted from that page and verified against it.

### 3.3 Converters by format

| Input | How we detect it | Converter (hackathon) | Converter (production) | Output quality |
|---|---|---|---|---|
| Structured metadata + abstract (OpenAlex JSON, PubMed XML) | API response | direct mapping | same | exact; the default for ranking and judging |
| **JATS XML** (PMC, Europe PMC, bioRxiv) | `fullTextXML` endpoint | parse sections → Markdown | same | best: sections, figure captions, reference list with DOIs |
| **HTML** article page | `text/html` | Tavily `extract` (Markdown) or Readability + Turndown; read `citation_*` meta tags for identity | same + per-publisher fixes | good; boilerplate removed |
| **Text PDF** (born digital) | `application/pdf` and text layer covers the pages | P2: pdf.js text (`unpdf`), no structure | GROBID (TEI: header, sections, parsed references) or Docling (tables, layout) | good with GROBID/Docling |
| **Scanned PDF** (image only) | under ~100 extracted characters per page | not supported today; marked "scanned, not processed" | OCR: ocrmypdf/Tesseract on CPU, or a GPU pipeline (NVIDIA NeMo Retriever extraction) as a Nebius job | fair; we store OCR confidence and show it next to any quote |
| Plain text / Markdown | `text/*` | as is | same | as given |
| Supplements (xlsx, csv, video) | extension | skipped, link kept | P3 | n/a |

Every document row records `source_type`, `converter` + version, `sha256` of the original bytes, `text_coverage`, and `ocr_confidence` when relevant. Converters can be re-run later without fetching again.

### 3.4 Licensing and what we keep

- Full text is fetched and stored **only for open-access papers** (OpenAlex `open_access.is_oa` and `best_oa_location.license`, e.g. CC BY).
- Closed papers: metadata, abstract and links only. The UI shows short quotes and links out.
- We never fetch through paywalls. The original PDF is cached only for papers the user saves; for everything else we keep the URL and hash.

### 3.5 References and identity

- References come from OpenAlex `referenced_works` first (already resolved IDs). JATS `<ref-list>` or GROBID references fill gaps; we resolve their DOIs to OpenAlex IDs, and unresolved ones stay as raw strings.
- Canonical ID = OpenAlex work ID. An alias table maps DOI (lowercased, `https://doi.org/` stripped), PMID, PMCID, arXiv and bioRxiv DOIs to it.
- Preprint and published version: when both resolve to one OpenAlex work, they merge; when they don't, link them as `version_of` and show only the published one in the list.

### 3.6 Chunking (for quotes now, for full-text search later)

Chunk Markdown by section, then by paragraph, at about 300–600 tokens. Each chunk keeps `section`, `ordinal`, `char_start`, `char_end`. Abstracts are one chunk. Quote verification searches the paper's chunks and stores the matching offsets.

---

## 4. Storage

### 4.1 Four layers, each with one job

| Layer | Holds | Hackathon | Production (Nebius) |
|---|---|---|---|
| **1. Paper store** (source of truth) | papers, ID aliases, citation edges, provenance, documents, chunks, web sources, runs, candidates, judgements, feedback | **SQLite** (better-sqlite3) + FTS5 keyword index, schema in Drizzle | **PostgreSQL**, same Drizzle schema (Nebius Managed PostgreSQL, *to verify*) |
| **2. Raw cache** (immutable) | original API responses, HTML, PDFs, JATS; keyed by sha256 | gzip files under `data/raw/{api}/{hash}` | S3-compatible object storage (Nebius Object Storage) |
| **3. Vector index** | embeddings keyed by (paper or chunk, model, dims, text hash) | float16 BLOBs in SQLite + exact cosine in memory | **LanceDB** on object storage, or pgvector, once the thresholds in §4.4 are crossed |
| **4. Notes vault** (the researcher's) | literature notes, own notes, links | Markdown with YAML front matter in the browser (IndexedDB); export as .zip, BibTeX, CSL JSON | same files synced per user to Postgres or object storage; Zettlr/Obsidian-compatible |

**Why not Markdown or JSON as the database?** Markdown is the right format for what the researcher reads and edits, and the right export, but it cannot answer "which papers cite 3 of my seeds" or join citations to runs. JSON files are right for the immutable raw cache, but wrong for data we query and update. SQLite gives us one file, transactions, joins, full-text search and millions of rows with no server, and the same schema moves to Postgres when we have many users.

**Why the split matters for traceability:** a literature note in the vault is generated from layer 1 and carries `paper_id`, `run_id` and quote offsets in its front matter, so the researcher can always jump from their note back to the evidence and the raw source.

### 4.2 Schema (layer 1)

```
papers        id PK (OpenAlex W…), doi, pmid, pmcid, title, abstract, abstract_source, year, venue,
              type, cited_by_count, citation_pct, is_retracted, is_oa, oa_url, license, authors JSON,
              updated_at
paper_ids     alias (doi|pmid|pmcid|arxiv|biorxiv) → paper_id
citations     citing_id, cited_id                                         -- edges, both indexed
provenance    paper_id, run_id, route, via_seed_id, api, request_url, raw_hash, fetched_at
documents     id, paper_id, source_type, source_url, raw_hash, converter, converter_version,
              text_coverage, ocr_confidence, markdown_hash, created_at
chunks        id, document_id, section, ordinal, char_start, char_end, text
web_sources   id, url, domain, kind (news|trial|blog|other), title, snippet, query, raw_hash
web_links     web_source_id, paper_id, relation
embeddings    owner_type (paper|chunk), owner_id, model, dims, text_hash, vec BLOB (fp16)
runs          id, question, facets JSON, seed_ids JSON, params JSON, models JSON, created_at
candidates    run_id, paper_id, lane, features JSON, score, rank
judgements    run_id, paper_id, model, prompt_hash, output JSON, quote_chunk_id, quote_start,
              quote_end, verified
feedback      run_id, paper_id, label, reason, created_at
```

### 4.3 Size estimates

Per item:

| Item | Size |
|---|---|
| Paper row: metadata + abstract (~250 words) + indexes | ~3 KB |
| Citation edges (~45 per paper, with indexes) | ~2 KB |
| Raw API response, gzip | ~1–2 KB |
| Paper embedding, Qwen3 **1024-d float16** | 2 KB |
| Paper embedding, Qwen3 4096-d float32 (model default) | 16 KB |
| Judgement (only the ~50 judged papers per run) | ~1.5 KB |
| Full-text Markdown (OA papers only), gzip | ~15 KB |
| Full-text chunks: ~12 per paper × 2 KB embeddings | ~24 KB |
| Original PDF (only for saved papers) | 1–3 MB |

**Recommendation:** request 1024 dimensions from Qwen3-Embedding (Matryoshka truncation; check Token Factory's `dimensions` parameter in the first API test) and store float16. That is 8× smaller than the default.

Scenarios (1024-d fp16; full text for ~30% of papers that are open access):

| Scenario | Unique papers | Abstracts only | With OA full text | Vectors |
|---|---|---|---|---|
| Demo day (~10 runs) | ~6k | ~50 MB | ~0.1 GB | 6k |
| One researcher, one year (~300 runs) | ~60k | ~0.5 GB | ~1.3 GB | 60k papers + ~220k chunks |
| Lab or department, 50 users | ~1M | ~8 GB | ~20 GB | 1M + ~3.6M chunks |
| Whole field (all of PubMed, ~38M records) | ~38M | ~300 GB | ~1 TB | 38M + ~140M chunks |

One run adds at most ~7 MB (800 new papers × ~8.5 KB); later runs in the same field overlap heavily and add much less.

### 4.4 When to use a vector database

Exact cosine over N vectors of 1024 dims costs N × 1024 multiply-adds per query.

| Vectors | What to use | Why |
|---|---|---|
| **< 100k** | **No vector DB.** Exact search in memory (Float32Array / NumPy); vectors in SQLite | 100k × 1024 ≈ 0.1 G multiply-adds → ~10–20 ms in NumPy, ~100 ms in plain JS; 200 MB of fp16 fits in RAM |
| 100k – 10M | **Embedded ANN index: LanceDB** (IVF-PQ, files on disk or object storage, no server) or pgvector HNSW if we are on Postgres already | exact search gets slow (~1 s at 1M in JS); memory for raw vectors passes several GB |
| > 10M | Managed or distributed (LanceDB on object storage at scale, Qdrant, Milvus) with product quantization | corpus-scale search, many concurrent users |

**Our triggers:** a run's pool (≤2k vectors) never needs a vector DB. We switch to LanceDB when any of these is true: the library passes ~100k vectors (in practice when full-text chunks are turned on: one researcher's year is already ~280k), p95 similarity query exceeds 100 ms, or we add "search my whole library" with metadata filters. Because embeddings are keyed by `(owner, model, dims, text_hash)`, moving them from SQLite to LanceDB is a copy, not a re-embed.

### 4.5 What runs where today

- Nebius Serverless Endpoint container: SQLite file + raw cache under `/data`. It survives while the endpoint runs and is lost when we recreate the endpoint. That is acceptable for the demo because everything in it is public data and can be re-fetched; the demo recording is also committed as JSON.
- Researcher's notes: in the browser (IndexedDB), so redeploys never touch them; exportable as Markdown .zip, BibTeX and CSL JSON.
- All storage goes through one `server/data` repository interface, so the move to Postgres + object storage + LanceDB touches only that folder.

---

## 5. Cards that implement this spec

The board lives in [PRODUCT_PLAN.md §7](PRODUCT_PLAN.md). Cards from this spec: F-01 store + raw cache · F-02 routes R1–R3 + lanes · F-03 embeddings, rerank, judge, verification · F-10 "why ranked here" + Lens · F-11 eval harness · F-12 Scout (R5) · F-13 Tavily ingestion · F-14 R4 query expansion · F-15 feedback · F-17 retraction + date check · F-18 Europe PMC full text · F-23 PDF/OCR worker and LanceDB (after the hackathon).
