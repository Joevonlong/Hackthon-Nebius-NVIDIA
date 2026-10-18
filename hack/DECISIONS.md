# Decisions
D-01…D-16: see docs/PRODUCT_PLAN.md §1 (locked 13:05, D-16 run presets 13:20).
D-17 (13:35): golden-stack override — Vue + Hono instead of Next.js because Zettlr is Vue (D-02/D-03).
D-18 (14:20): MVP runs locally on the laptop (pnpm build && PORT=3030 pnpm start); Nebius deploy postponed — scripts/deploy.sh stays ready.
D-19 (14:45): Token Factory has no Qwen3-Reranker; the rerank stage falls back to embedding similarity with the question and labels it.
D-20 (15:10): Library mode — vault as one topic, multi-source search, labels, evidence-backed quality score (docs/LIBRARY_SPEC.md). Google Scholar only through SerpAPI.
D-21/D-22 (15:25): Scholar dropped, Tavily high priority; defaults top-N 30 / threshold 0.55 / abstract-only LLM read. CR-1 confirmed.
D-23 (15:35): Library replaces Discover in the UI; seeds in notes = knownPapers; /api/runs kept server-side without UI; demo replays a Library recording.
D-25..D-29 (16:20): CR-2 confirmed with recommended defaults — see PRODUCT_PLAN §14.
D-30 (16:28): CR-3 confirmed — no mock in production, question box, real run recorded as demo; topic melanoma single-cell.
D-31/D-32 (16:15): no Nebius deploy (local only); judge fixes J-2..J-5 confirmed.
D-33..D-36 (16:30): CR-5 confirmed — question folders with own seeds, empty vault, tiles+table, history per question, uploads incl. PDF.
D-38 (17:15): LLM off-topic gate (relevance ≤1/3 cannot pass).
D-39 (17:50): CR-10 — graph draws citation edges (OpenAlex referenced_works + any-id seed matching); Europe PMC references fill in when OpenAlex is rate-limited; final graph screenshot test after all merges.
D-40 (17:58): CR-11 — "why this score" = donut of contributions + value bars on the report card, small donut in the popover, mini stacked bar on tiles/rows.
D-41 (18:05): CR-12 — graph library nodes coloured by score on a blue ramp (dark = high/big, light = low/small), plus size.
D-42 (18:15): CR-14 — citations fall back to Europe PMC / Crossref cited-by (library year-percentile), venue to cached OpenAlex sources by ISSN/name; authors stay not assessed.
