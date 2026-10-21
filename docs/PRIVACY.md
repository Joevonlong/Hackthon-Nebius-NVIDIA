# Privacy: what leaves your machine and what stays

PaperTrail runs on your computer. The server you start is your own; there is no PaperTrail cloud. This page lists every outside service the code can contact. Each row cites the file that makes the call, so you can check it.

**No telemetry.** The code contains no analytics, crash reporting or usage tracking, and sends nothing to the PaperTrail authors.

## What goes to which service

| Service | When | What is sent | Needs a key | Code |
|---|---|---|---|---|
| Nebius Token Factory (models) | AI features: planning queries, embeddings, reranking, judging papers, library chat, goal extraction | Your research question, the notes and goals you wrote, paper titles and abstracts, and your chat messages, inside prompts. Your API key is sent only as the `Authorization` header to this service. | Yes (`TOKEN_FACTORY_API_KEY`); without it AI steps are skipped | `server/ai/http.ts`, `server/env.ts` (`TOKEN_FACTORY_BASE_URL`) |
| OpenAlex | Finding papers, citations, entity lookups | Search queries, DOIs and OpenAlex ids. If you set `OPENALEX_MAILTO` or `OPENALEX_API_KEY`, those are sent too. | Optional | `server/sources/openalex.ts`, `server/library/sources/` |
| PubMed (NCBI E-utilities) | Finding papers, abstracts, similar articles | Search queries and PubMed ids | No | `server/sources/pubmed.ts`, `server/library/sources/pubmed-lib.ts` |
| Europe PMC | Finding papers, citation fallback | Search queries and DOIs | No | `server/library/sources/europepmc-lib.ts`, `server/library/sources/citations-fallback.ts` |
| Tavily (web search) | Library mode web search for context | Search queries (generated from your question); your Tavily key as `Authorization` header | Yes (`TAVILY_API_KEY`); skipped without it | `server/sources/tavily.ts`, `server/library/sources/tavily-lib.ts` |
| Crossref | Fallback for DOI lookups and citations | DOIs; `CROSSREF_MAILTO` or `OPENALEX_MAILTO` if set | No | `server/discovery/seed-fallback.ts`, `server/library/sources/citations-fallback.ts` |
| arXiv | Library mode source | Search queries | No | `server/library/sources/arxiv.ts` |
| SerpAPI (Google Scholar) | Only if you set `SERPAPI_KEY` | Search queries and the key | Yes, optional | `server/library/sources/scholar.ts` |
| Google Fonts | Every time the web page loads in your browser | Your browser's IP address and user agent (a normal font request) | No | `client/index.html` |

Notes:
- Search queries to the paper sources are derived from your question and goals, so they can reveal your topic to those services. If that matters, do not use the tool for that question, or use only the sources you trust (leave the optional keys empty).
- Contact emails and API keys in URLs are removed before anything is written to the logs (`scrubUrl` in `server/trace.ts`).
- Full text is fetched only from open-access sources. Your own uploaded PDFs are read locally; only a DOI found in the first pages is used for lookups (`server/library/seed-import.ts`).

## What is stored on your machine

| What | Where | Code |
|---|---|---|
| Question folders: notes, seeds, libraries, exports | `WORKSPACE_DIR` (default `./workspace`) | `server/library/workspace.ts` |
| Libraries without a question folder | `DATA_DIR/library/<id>/` (default `./data`) | `server/library/store.ts` |
| SQLite database | `DATA_DIR/papertrail.sqlite` | `server/data/db.ts` |
| Cache of source responses (API keys and emails stripped from cache keys) | `DATA_DIR/raw/<api>/` | `server/data/http.ts`, `server/library/sources/openalex-entities.ts`, `server/library/sources/tavily-lib.ts` |
| Notes vault in the browser | IndexedDB of your browser (`idb-keyval`) | `client/src/stores/vault.ts` |
| Theme, last-opened library, chat history per library | Browser `localStorage` | `client/src/App.vue`, `client/src/stores/chat.ts`, `client/src/stores/vault.ts` |
| Run logs | `LOG_DIR/runs/<runId>/*.jsonl` (default `./logs`) | `server/trace.ts` |
| Your API keys | `.env.local` in the repo, or the settings screen. Never written to logs; never committed (`.env.local` is ignored by git). | `server/env.ts` |

Deleting these folders removes the data. Nothing is uploaded to anyone for backup.

## Logs and prompt text

Run logs help you check what the agent did. By default `llm.jsonl` and `chat.jsonl` contain **prompt and response text** (clipped), so they hold your research question and notes. Do not share them without reading them first.

Set `LOG_PROMPTS=metadata` (in `.env.local` or the environment) to keep text out: `llm.jsonl` and `chat.jsonl` then record the endpoint, model, status, timing, token counts and the size of each text field (`{"chars": 1234}`), but no prompt, response, query or reply. This is covered by the test `server/trace.test.ts`.

One exception to know about: the per-library chat history that is saved next to a library (`<library folder>/chat.jsonl`) is written by `server/library/chat.ts` and is not yet covered by `LOG_PROMPTS`.

## Questions or corrections

If a statement here does not match what the code does, open an issue. This page is meant to be checked, not trusted.
