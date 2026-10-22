# PaperTrail — rules for contributors and coding agents

PaperTrail is a free, open-source (GPL-3.0-or-later) research agent for students and researchers: it understands the user's research intention, finds the relevant papers that are available, filters them by the user's own criteria, and builds a knowledge base of notes with verified quotes. First users: biomedical and life-science PhD students and postdocs.

Read first: `dev/PLAN.md` (phases, batches, roles), `dev/DECISIONS.md`, the GitHub issue you are working on, and the contracts in `shared/`. `CLAUDE.md` is a link to this file.

## Stack
Vite + Vue 3 + Pinia + CodeMirror 6 + d3 (`client/`) · Hono on Node 22 (`server/`) · zod contracts (`shared/`) · AI SDK and an OpenAI-compatible client → Nebius Token Factory · SQLite (better-sqlite3) · pnpm · TypeScript 5.9. Includes code adapted from Zettlr (GPL-3.0), so the project cannot be relicensed.

## Commands
- Install: `pnpm install --config.strict-dep-builds=false` (plain install stops on esbuild's ignored build script).
- Check: `pnpm gate` (typecheck + tests + build). Run it before saying anything is done.
- Dev: `pnpm dev` (server :3001, client :5173). Production: `pnpm build && pnpm start`.

## Rules
- **Keys** come from `.env.local` (see `.env.example`) or the settings screen. Never print, log or commit them, because the repo is public.
- **Keyless first-class:** without keys, AI functions return null or [] and the UI says what is degraded, because many students start without keys.
- **Measured numbers only** in UI copy, README and docs; label anything illustrative, because trust is the product.
- **Stay in your issue's "Files it owns".** Up to three agents work in parallel on disjoint files; list anything else under `Noticed:`.
- **Contracts in `shared/` change only through an issue that owns them** (usually the architect's), because every module depends on them.
- **New dependencies:** add them with `pnpm add` and name them in your report, because `package.json` conflicts are resolved at merge.
- **Every bug fix has a test that fails before the fix.** Tests run offline and keyless: record real AI outputs as fixtures instead of calling models.
- **User data is sacred:** writes are atomic, edits are never dropped silently, and migrations keep old libraries and notes readable.
- **Security:** the server listens on loopback only by default; external URLs pass `safeUrl()`; paper and web text is untrusted input.
- Match the surrounding code (naming, comment density, idioms) and don't reformat files you don't change.

## Agentic AI rules
- **Typed tools with budgets:** every agent step is a zod-typed tool call with a timeout, an AbortSignal and a per-run token, call and time budget, because an unbounded loop spends the user's money.
- **Human in the loop for writes:** tools that change notes, criteria, weights or screening decisions return a Proposal the user applies, because the user owns their knowledge base.
- **Receipts:** every quote shown as evidence is verified word for word against its source text, with the source and position; unverifiable claims are dropped or flagged.
- **Untrusted input:** paper, PDF and web text goes into prompts inside delimiters and marked as data, never as instructions (prompt injection).
- **Open access only:** fetch full text only from open-access sources (Unpaywall, Europe PMC, arXiv); never paywalled PDFs.
- **Traced:** every model and source call is logged under `logs/runs/<id>/` without keys; `LOG_PROMPTS=metadata` keeps prompt text out.
- **Measured:** an agent change that affects results reports its effect on the eval (`eval/`), because "it seems better" is not evidence.

## Git
- One branch per issue: `feat/<issue>-<slug>`; commit messages `feat(#<issue>): …` or `fix(#<issue>): …`.
- Don't push, open PRs, tag or deploy unless the maintainer asks.

<!-- devkit:start -->
## Dev system (devkit)
- Plan: dev/PLAN.md · Now: dev/NOW.md · Decisions: dev/DECISIONS.md · Tasks: GitHub milestones M1–M3, parents #5–#10, sub-issues #11–#30.
- Start a session with /next; end it with /next save.
- Check command: `pnpm gate`. Done means it passes and the issue's Done-when checks were seen working.
- Talk: short chunks, headings, key point in bold, tables over paragraphs; one-line status; at most 4 numbered questions with a recommended answer; reply in the user's language.
- Roles: coordinator (main, Opus), architect (Opus), builder (Sonnet), reviewer, verifier (Sonnet), scout. Reviewer and verifier never fix what they check.
- Parallel: at most 3 builders, each in its own worktree, ≤ 3 GB RAM each (`NODE_OPTIONS=--max-old-space-size=2048`, vitest `--maxWorkers=2`, slot ports 3101/3201/3301). Verifier on every milestone gate and on issues labelled `critical`.
- Commits: builder commits on its issue branch; the coordinator merges it after review (and verify when critical) and commits dev/ updates. Push only when the user asks.
- Rules from lessons:
  - Keep state in dev/PLAN.md and dev/NOW.md, because sessions end and the user returns with "continue".
  - Run long commands in the background with a time limit and a log, because a hang freezes the session.
  - Land `shared/` contracts before a parallel batch starts, because parallel builders against moving contracts collide.
  - Record real AI outputs once and replay them in tests and the playground, because live calls are slow, cost money and flake.
<!-- devkit:end -->
