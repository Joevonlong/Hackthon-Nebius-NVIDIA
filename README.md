# PaperTrail

**Start from the papers you trust. Find the ones you missed, with receipts.**

PaperTrail is a paper discovery tool inside a Zettlr-style research workspace. You type your research question and add the few papers you already trust. PaperTrail builds a library of new papers from OpenAlex, PubMed, arXiv and Tavily, and grades each one with a plain-language verdict and a report card whose every number shows its evidence. You can then steer the ranking in chat ("prioritize recent clinical studies"), apply the change, add the best papers to your vault as Markdown notes linked to your seeds, see them in a graph, and export BibTeX. Built for the Nebius Healthcare / Life Sciences "Research Paper Discovery" track.

## How it works

1. **Type the question** in the Library panel. It is saved as `Notes/Question.md`.
2. **Add 5 seed papers** (DOIs or PMIDs in notes). They are the papers you trust.
3. **Build library.** A goals agent reads every note in the vault and writes the topic, goals, subtopics and keywords, with a verbatim quote from your notes as evidence for each goal. Search then runs on OpenAlex, PubMed (publication types, MeSH), arXiv and Tavily (high priority), and graph expansion follows references, citing papers and PubMed similar articles from the seeds. Papers already in the vault and retracted papers are excluded.
4. **Review verdicts and report cards.** Each paper gets a one-sentence verdict and a "Why this score" report card: a letter grade, a one-line reason and a weight for six components (relevance, graph links, citations, venue, authors, language-model read). Evidence, with source links, is folded under each row. The model read has the lowest weight by design, and its quote is checked word for word against the abstract.
5. **Chat.** A column on the right answers questions about the library and proposes weight, pass-rule or filter changes as a diff with a reason. Nothing changes until you click **Apply**; then the list re-scores in the browser and shows rank changes. Applied changes are logged.
6. **Keep.** **Add to vault** writes a literature note with front matter, the quote and `[[seed]]` links; the paper joins the graph (node size follows the grade). Export BibTeX for Zotero.

A paper passes if it is in the top X% of its library (default 25%) and above an absolute floor (default 0.50); both are adjustable in the UI and by the chat agent. Every paper is saved as one JSON file under `data/library/<libraryId>/papers/`, and every source and model call is traced under `logs/runs/<libraryId>/`.

## Measured results

Only measured numbers are listed. Numbers from the final recorded run are marked TBD until the team fills them in.

**Live Library runs** (real backend, melanoma single-cell example, 5 seed papers; local):

- A build takes **94 to 102 s**, makes **74 to 107 source calls**, and scores **599 papers**.
- The language model reads **40 abstracts**; **38 of 40 quotes (95%)** are verbatim substrings of the abstract. The earlier seed pipeline verified 32 of 35 (91%).
- Final recorded run figures: TBD-2 (from the recorded demo run / eval lane). Cost per build: TBD-10 (from the recorded demo run / eval lane).

**Hold-out test on two real reviews** (earlier seed pipeline, citation routes): hide all but 5 references (the seeds), build a pool from the seeds, count hidden references found. Ground truth is one review's reference list, so every number is a lower bound. Details: [docs/RANKING_AND_STORAGE.md](docs/RANKING_AND_STORAGE.md) section 1.

- **Recall.** The union of the citation routes reaches **16% and 42%** of the hidden references. PubMed keyword search reaches 2% and 0%; OpenAlex search reaches 1% and 6%.
- **Ranking.** Ranking by seed links puts **40% and 35%** relevant papers in the top 20, against a base rate of 5.2% and 4.5%. Citation count alone scores 0% and 25%.
- This test did not evaluate the six-component Library score or its default weights. Evaluation of the full Library score: TBD-3 (from the recorded demo run / eval lane).

## What is real

The production build uses no mock or fixture data; a failure shows an error with Retry. `?demo=1` replays a recording of a real run so the demo works without Wi-Fi. `?mock=1` exists only in dev builds. Not used: Google Scholar (no API, and we do not scrape it) and a reranker model (Token Factory has none; relevance is embedding similarity to the question and subtopics). The language model reads abstracts only. Not built: PDF and OCR ingestion, Postgres and LanceDB, vault sync.

## Architecture

```
Browser: Vue 3 + Pinia + CodeMirror 6 + d3; notes vault in IndexedDB; chat history in the browser
   | HTTP + SSE
One local server (Node 22, Hono): http://localhost:3030 (pnpm) or :3040 (Docker)
   server/library    goals agent, search (OpenAlex, PubMed, arXiv, Tavily), graph expansion,
                     enrichment, labels, scoring, LLM read, chat agent
   server/data       SQLite (Drizzle), raw cache, vectors, per-paper JSON files
   |                     |                          |
Nebius Token Factory   OpenAlex, PubMed, arXiv   Tavily
(embeddings, judge, planner)
```

Layout: `client/` (Vue app), `server/` (routes, library, sources, data, demo), `shared/` (zod contracts used by both: `library.ts`, `contracts.ts`), `docs/` (plan, specs, fixtures), `eval/` (hold-out harness). Specs: [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md) sections 13 to 15 and [docs/LIBRARY_SPEC.md](docs/LIBRARY_SPEC.md). The app runs locally (decision D-18); the Nebius Serverless deploy script is ready but has not been run.

## Models (Nebius Token Factory)

| Job | Model |
|---|---|
| Embeddings (1024 dims), relevance to the question and subtopics | `Qwen/Qwen3-Embedding-8B` |
| Judge: reads abstracts, returns grades, a reason and a quote | `nvidia/Nemotron-3_5-Lightning` |
| Planner: goals, subtopics and queries from the vault (chat model: see server config) | `nvidia/nemotron-3-super-120b-a12b` |

All model IDs are overridable in `.env.local` (see `.env.example`). Without keys, the AI steps are skipped or fall back (for example, keyword overlap instead of embeddings) and the stage reports it.

## Setup

Requires Node 22 and pnpm.

```bash
pnpm install
cp .env.example .env.local   # fill in the keys; never commit this file
pnpm dev                     # server on :3001, client on http://localhost:5173
```

Keys in `.env.local`: `TOKEN_FACTORY_API_KEY`, `TAVILY_API_KEY`, `OPENALEX_API_KEY`, `OPENALEX_MAILTO`.

**Run for the demo (local).**

```bash
pnpm build && PORT=3030 pnpm start   # http://localhost:3030
scripts/docker-local.sh              # Docker alternative: http://localhost:3040 (HOST_PORT to change)
```

**Demo mode.** Open the app with `?demo=1` (for example `http://localhost:3030/?demo=1`) to replay a recorded real Library run; no keys and no network needed. The recording is being replaced by the real run on the melanoma question (F-52); the replay is labelled as a recording. See `scripts/record-demo.ts` to record a run.

Other commands: `pnpm typecheck`, `pnpm test`, `pnpm gate` (typecheck + tests + build).

## Deploy (Nebius Serverless Endpoint, not run yet)

```bash
curl -sSL https://artifacts.nebius.cloud/cli/install.sh | bash && nebius profile create   # once
scripts/deploy.sh v1 --dry-run   # prints the commands
scripts/deploy.sh v1             # registry, linux/amd64 build + push, endpoint, waits, prints the https URL
```

The script reads the four keys from `.env.local` without printing them. Each deploy uses a new tag and endpoint name (`papertrail-<version>`) because endpoints cannot be updated in place.

## Team

Team: _TBD (names and roles)_.

## License

GPL-3.0-or-later. PaperTrail includes code and styles adapted from [Zettlr](https://github.com/Zettlr/Zettlr) (GPL-3.0); credit to the Zettlr authors and contributors.
