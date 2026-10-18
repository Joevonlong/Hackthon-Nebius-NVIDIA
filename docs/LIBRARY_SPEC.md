# Library mode — spec (locked 15:10, decision D-20)

The whole vault is one research topic. An agent reads every note, derives goals and subtopics, searches every source heavily, labels every paper, scores quality with evidence for every number, and returns the best N (a UI parameter). Papers above the threshold join the citation graph. Contracts: `shared/library.ts`.

## 1. Goals agent (from the vault)
- Input: all notes (path, title, content). Extract identifiers with regex first (DOI, PMID, arXiv id, OpenAlex W-id) → `knownPapers`.
- One planner call (nemotron-3-super, JSON): `topic`, `question`, 3–5 `goals`, 4–8 `subtopics` (name + OpenAlex-friendly query), 8–15 `keywords`, and `evidence` = for each goal a verbatim quote from a note (verified by substring check; drop unverifiable ones).
- Fallback without a key: topic = Question note title/body; subtopics = headings; keywords = top TF-IDF terms of the vault.

## 2. Search (get a big pile) — every call traced to logs/runs/<id>/api.jsonl or tavily.jsonl
| Source | How | Useful parameters |
|---|---|---|
| OpenAlex | `/works?search=<q>` per keyword group and per subtopic (per-page 50, 2 pages for subtopics), `filter=from_publication_date:` optional; known papers by id; `referenced_works` and `filter=cites:` for known papers (graph expansion) | `select=` fields below; `sort=relevance_score:desc`; `api_key`/`mailto` |
| PubMed | `esearch` (sort=relevance, retmax 50) per subtopic → `efetch` XML → title, abstract, **PublicationType** (Review, Systematic Review, Meta-Analysis, Randomized Controlled Trial, Clinical Trial, Case Reports…), **MeSH** headings, journal; `elink pubmed_pubmed` for known papers | `term`, `retmax`, `sort`, `datetype/mindate` |
| arXiv | `http://export.arxiv.org/api/query?search_query=all:<q>&start=0&max_results=30&sortBy=relevance` (Atom XML) | id, title, summary, authors, `arxiv:primary_category`, categories, `arxiv:journal_ref`, `arxiv:doi`, `arxiv:comment` (e.g. "Accepted at ICML") |
| Tavily | `search` per subtopic with include_domains (pubmed, pmc, biorxiv, medrxiv, arxiv, nature, cell, science, nejm, thelancet, plos, frontiersin) → extract DOI / PMID / arXiv id → resolve | `search_depth`, `max_results`, `include_domains`, `time_range` |
| Google Scholar | **only via SerpAPI** (`https://serpapi.com/search.json?engine=google_scholar&q=…`) when `SERPAPI_KEY` is set; otherwise stage reports "skipped — no SERPAPI_KEY". Never scrape Google Scholar | `q`, `num`, `as_ylo`; results give title, link, `inline_links.cited_by.total`, publication_info |
- Everything resolves to an OpenAlex work when possible (DOI → PMID → arXiv DOI `10.48550/arXiv.<id>` → title+year search). Unresolved arXiv/Scholar items stay as their own records (id `arxiv:<id>` / `scholar:<hash>`) with the fields the source gave.
- Dedupe by DOI, PMID, arXiv id, OpenAlex id, then normalized title + year. Merge `hits` (provenance) from every source.
- Cap the pile at `maxCandidates`, keeping papers found by more sources / more queries first.

## 3. Enrichment (OpenAlex, batched ≤50 ids per request)
- Works: `id,doi,ids,display_name,publication_year,publication_date,type,type_crossref,cited_by_count,citation_normalized_percentile,fwci,counts_by_year,primary_location,best_oa_location,open_access,authorships,primary_topic,topics,keywords,language,is_retracted,referenced_works,abstract_inverted_index,grants`.
- Sources (venues): `/sources?filter=openalex_id:S1|S2…&select=id,display_name,type,host_organization_name,summary_stats,is_core,is_in_doaj,issn_l,works_count,cited_by_count`.
- Authors: first and last author (plus corresponding) → `/authors?filter=openalex_id:A1|A2…&select=id,display_name,summary_stats,works_count,cited_by_count,last_known_institutions`.
- Abstract waterfall: OpenAlex → PubMed → arXiv summary → Europe PMC.

## 4. Labels (deterministic; written into each paper's JSON)
`kind` from OpenAlex `type` + venue type + PubMed PublicationType + arXiv: review/systematic-review/meta-analysis override; venue type `conference` → conference-paper; `repository` or arXiv without journal_ref → preprint; `book`, `book-chapter`, `dataset`, `dissertation` → thesis, `editorial`/`letter` → editorial. `studyDesign` from PubMed publication types. `peerReviewed` = journal/conference venue and not preprint. `openAccess` = OpenAlex `oa_status`. Field/subfield/topic from `primary_topic`. `recency`: fresh ≤18 months, recent ≤5 y, established ≤15 y, classic older. `tags`: `method/tool` (title/keywords mention software, tool, pipeline, package, algorithm), `funded:<funder>` from grants, `retracted`.

## 5. Quality score (every component carries `how` + evidence lines with source links)
Default weights (UI-adjustable; LLM read is the lowest by design):

| Component | Weight | Value 0..1 | Evidence shown |
|---|---|---|---|
| relevance | 0.30 | max cosine of the paper (title+abstract) to the goal question and subtopic queries (Qwen3-Embedding), rescaled to 0..1 within this library; no key → keyword overlap with goals | "best match: subtopic 'X' cos 0.71 (92nd pct of 600)" |
| graph | 0.15 | links to the vault's known papers (cites / cited by / PubMed similar), 0 links = 0, 1 = 0.5, ≥2 = 1 | "cites S1 (OpenAlex referenced_works)" |
| citations | 0.18 | OpenAlex `citation_normalized_percentile` (field+year normalized); if missing: log(cited_by+1) vs library, papers < 2 years old use `fwci` or 0.5 neutral | "cited_by 1,522 · 99th percentile for field and year (OpenAlex)" |
| venue | 0.15 | 0.6·pct(source h-index within library) + 0.2·is_core + 0.1·journal/conference + 0.1·indexed (DOAJ or ISSN); repository/preprint server = 0.2 | "Nature Immunology · h-index 352 · core source · journal (OpenAlex S…)" |
| authors | 0.12 | 0.7·pct(max h-index of first/last author) + 0.3·has institution with ROR | "last author A. B. h-index 88, 412 works, Dana-Farber (ROR …)" |
| llm | 0.10 | only for top `llmReadTopK` by the other components: judge reads the abstract (full text if OA later) → (relevance + quality)/6 × (quote verified ? 1 : 0.6) | model, grades, verified quote, concerns |

- `null` value (could not assess) → that weight is redistributed proportionally over the assessed components; the paper shows "not assessed: <component>".
- Hard gates (excluded, never in the graph): retracted; duplicate; no title. Flags (shown, not excluded): no abstract, non-English.
- `total` = Σ contribution; `passed` = total ≥ threshold. Return the top `topK` by total (passed first). Passed papers are added to the citation graph with their edges to vault papers and to each other.
- Every percentile is computed within the current library and says so ("of 600").

## 6. Files and logs
- `${DATA_DIR}/library/<id>/goals.json`, `library.json` (request + summary), `papers/<paperId>.json` (one `LibPaper` each, all scored papers, not only top N).
- Trace logs in `logs/runs/<id>/` via `server/trace.ts` (api, llm, tavily, events) + `summary.md` with the goals, per-source counts, and the top N with every component.
