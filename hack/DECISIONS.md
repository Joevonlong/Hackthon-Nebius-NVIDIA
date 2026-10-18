# Decisions
D-01…D-16: see docs/PRODUCT_PLAN.md §1 (locked 13:05, D-16 run presets 13:20).
D-17 (13:35): golden-stack override — Vue + Hono instead of Next.js because Zettlr is Vue (D-02/D-03).
D-18 (14:20): MVP runs locally on the laptop (pnpm build && PORT=3030 pnpm start); Nebius deploy postponed — scripts/deploy.sh stays ready.
D-19 (14:45): Token Factory has no Qwen3-Reranker; the rerank stage falls back to embedding similarity with the question and labels it.
