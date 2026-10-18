# Decisions
D-01…D-16: see docs/PRODUCT_PLAN.md §1 (locked 13:05, D-16 run presets 13:20).
D-17 (13:35): golden-stack override — Vue + Hono instead of Next.js because Zettlr is Vue (D-02/D-03).
D-18 (14:20): MVP runs locally on the laptop (pnpm build && PORT=3030 pnpm start); Nebius deploy postponed — scripts/deploy.sh stays ready.
D-19 (14:45): Token Factory has no Qwen3-Reranker; the rerank stage falls back to embedding similarity with the question and labels it.
D-20 (15:10): Library mode — vault as one topic, multi-source search, labels, evidence-backed quality score (docs/LIBRARY_SPEC.md). Google Scholar only through SerpAPI.
D-21/D-22 (15:25): Scholar dropped, Tavily high priority; defaults top-N 30 / threshold 0.55 / abstract-only LLM read. CR-1 confirmed.
