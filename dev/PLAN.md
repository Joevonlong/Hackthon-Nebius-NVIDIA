# Plan — PaperTrail cycle 1
Status: active · preset: large · started 2026-10-21 · devkit 0.2.1

GitHub is the source of truth for tasks: milestones M1–M3, parent issues #5–#10, sub-issues #11–#30 (from the review in #4). This file holds phases, batches, roles and rules.

## Intention
```text
Intention: For biomedical and life-science PhD students and postdocs who spend weeks finding,
  sorting and trusting papers, PaperTrail is a free, open-source research agent that
  understands their intention, finds the relevant papers that are available, filters
  them by their own criteria, and builds a knowledge base they can trust (notes,
  explanations, verified quotes), so the right papers reach research faster.

Done when:
  1. Codex Security scan + Claude /security-review: no open high or critical findings;
     all P0 bugs from the review are fixed, each with a test; CI runs `pnpm gate` on every PR.
  2. On a real biomedical question, with keys, end to end:
     agent asks clarifying questions → you approve the inclusion/exclusion criteria
     → it searches iteratively and marks open-access availability
     → it screens papers with a quote per decision, and you confirm
     → kept papers become Markdown notes with an explanation and evidence,
       indexed in SQLite, and searchable.
  3. Without keys, the app still runs (degraded) and says so; no note is ever lost
     (vault sync tests pass).

Size: large (~6 weeks) · deadline none · you + parallel agents
  (builders: Sonnet; planner/reviewer: Opus); one branch + PR per task
Stack: Vue 3 + Pinia · Hono / Node 22 · SQLite (better-sqlite3) · AI SDK → Nebius Token Factory
  must: GPL-3.0; works keyless; human approves every agent write; every quote verified;
        token budget + trace per agent run
  must not: paywalled PDFs; telemetry without opt-in; push, PR or deploy without asking
Riskiest unknown: can Nemotron (Token Factory) reliably run multi-step tool calls and screen
  by criteria with good precision? → spike: yes (#18)
Out of scope (this cycle): Electron app, paid cloud, other fields than biomed,
  team sharing, Zotero sync, launch/marketing
```

## Phases
| # | Phase | Goal | Exit gate | Owner | Skill | Status |
|---|---|---|---|---|---|---|
| 0 | Frame | Intention clear | 👤 card approved | coordinator | kickoff | done (D-01) |
| 1 | Spike | Kill the riskiest unknown | #18 RESULTS.md: include precision ≥ 0.80 or a re-scope decision | builder | — | todo (M2 batch 1) |
| 2 | Define | Work cut into independent sub-issues | 👤 issue list approved | coordinator | kickoff | done (D-02, issues #5–#30) |
| 3 | Design | Contracts before parallel agent work | #19 merged: contracts + ADR, ownership disjoint per batch | architect | — | todo (M2 batch 1) |
| 4 | Build | Every sub-issue's Done-when true | Each milestone: all sub-issues closed with evidence | builder → reviewer → (verifier if `critical`) | /code-review | active (M1 done 2026-10-22, D-18: gate PASS 42269c9; GitHub tidy + PR → main waiting on the repo being unarchived) |
| 5 | Harden | It works for real | Per milestone: verifier gate + security-scan, no open high/critical; end of M3: #30 | verifier | security-scan | todo |
| 6 | Release | v0.4.0 out | 👤 tag v0.4.0, README updated (#30) | coordinator | — | todo |
| 7 | Learn | The suite gets better | `retro` done, lessons saved | coordinator | retro, lesson | todo |

Progress checks at 25 %, 50 % and 75 % of Build (end of M1 batch 2, M2 batch 2, M3 batch 1). Feature freeze before #30.

## Batches (at most 3 builders in parallel)
Run a batch only after the previous batch is merged. Sub-issues in one batch own disjoint files (see each issue's "Files it owns").

| Milestone | Batch | Sub-issues | Verifier |
|---|---|---|---|
| M1 Safe to share (due 2026-11-04) | 0 ✅ | #11 security baseline: /security-review (2026-10-21) + Codex Security (2026-10-22, 5 low, closed) | — |
| | 1 ✅ | #12 A1 lock down API (PR #32) · #13 B1 vault sync (PR #34) · #14 C1 trustworthy scores (PR #33) — all merged 2026-10-21 | #12, #13 |
| | 2 ✅ | #15 A2 untrusted data (PR #36) · #16 B2 durable storage (PR #38; open for the Docker check) · #17 D1 foundations + CI (PR #37) — merged 2026-10-21 | #15, #16 |
| | 3 ✅ | #35 A3 API follow-ups + safe remote deploy (PR #40, merged 2026-10-21) | #35 |
| | 4 ✅ | #41 A4 linear-time id parsing, read-side symlink containment, single decode (from the M1 gate re-scan, R1–R5; medium/low; PR #42, merged 2026-10-22) | at gate |
| | gate ✅ | verifier PASS 4ca4274 + final PASS 42269c9 (#41 items, keyless smoke); Docker PASS 89b47a6; Codex 2026-10-22 no high/critical (5 low → #43, M2, D-18) | always |
| M2 Research agent loop (due 2026-11-18) | 1 | #18 S1 spike · #19 X1 contracts (architect) · #20 E1 run from anywhere · #43 A5 containment hardening (low, D-18) | — |
| | 2 | #21 X2 agent runtime · #22 X3 intent stage · #23 X6 knowledge base | #21 |
| | 3 | #24 X4 find stage · #25 X5 filter stage | — |
| | gate | verifier: full loop on a real question + security-scan | always |
| M3 Knowledge base and v0.4 (due 2026-12-02) | 1 | #26 K1 explainer · #27 K2 grading UI · #28 K3 citing | — |
| | 2 | #29 R1 eval suite | — |
| | 3 | #30 H1 harden + release (alone) | #30 |

## Parallel-run rules
- **At most 3 builders at once**, each in its own git worktree (`isolation: worktree`), because more would exceed the laptop's memory and the user's review capacity.
- **≤ 3 GB RAM per builder (best effort; macOS can't enforce a hard cap):** Node commands use `NODE_OPTIONS=--max-old-space-size=2048`, vitest uses `--maxWorkers=2`, and no builder runs a second dev server unless needed, on its slot port (3101, 3201, 3301). The coordinator checks `ps -o rss,command -ax | sort -nr | head` while a batch runs and stops any process over 3 GB, because one runaway build would slow all three.
- Builder (Sonnet) commits on `feat/<issue>-<slug>`; reviewer reads every diff; verifier checks issues labelled `critical` and every milestone gate. The coordinator merges into `main` locally and asks before any push or PR.

## Roles
| Role | Agent | Source (global / project) | Model |
|---|---|---|---|
| coordinator | main session | — | Opus |
| architect | `.claude/agents/architect.md` | project (new: contracts + ADR for the agent loop) | Opus |
| builder | `.claude/agents/builder.md` | project (overrides global: stack, RAM, agentic rules) | Sonnet |
| reviewer | `~/.claude/agents/reviewer.md` | global | inherit (Opus) |
| verifier | `~/.claude/agents/verifier.md` | global | Sonnet |
| scout | `~/.claude/agents/scout.md` | global | Sonnet |

## Skills
| Skill | Use for | Source | Path |
|---|---|---|---|
| /plan | planning a sub-issue before building | built-in | — |
| /security-review | second-opinion security review | built-in | — |
| /code-review | PR review at a set effort | built-in | — |
| security-scan | Codex Security scan → triage → sub-issues → re-scan | new (nothing wraps Codex Security) | `.claude/skills/security-scan/SKILL.md` |
| next | status, resume, dispatch, save | global devkit | `~/.claude/skills/next` |
| lesson, retro | capture and apply lessons | global devkit | `~/.claude/skills/lesson`, `~/.claude/skills/retro` |

## Check command
`pnpm gate` (typecheck + 212 tests + build; 4 s on 2026-10-21, exit 0). Run it before saying anything is done. Add `pnpm eval` to milestone gates once #29 lands.

## Reference
- Grading redesign plan (input to #14 and #27): `dev/grading-plan.md`
- Review behind the issues: issue #4 and the product review report (private artifact, shared by the user on request)

## Lessons applied
- Keep the project state in files (PLAN, NOW) so any new session can resume in a minute — /Users/x/Documents/Projects/devkit/experience/lessons/2026-10-21-state-in-files.md
- Run long commands (Codex scan, builds) in the background with a timeout and a log — /Users/x/Documents/Projects/devkit/experience/lessons/2026-10-21-long-commands-hang.md
- Walking skeleton first: the M2 loop runs end to end thin before stages deepen — /Users/x/Documents/Projects/devkit/experience/lessons/2026-10-21-walking-skeleton-first.md
- Record real AI outputs once and replay them (fixtures for agent tests, the playground) — /Users/x/Documents/Projects/devkit/experience/lessons/2026-10-21-record-replay-demo.md
- Land shared contracts before parallel work splits (#19 before M2 batch 2) — /Users/x/Documents/Projects/devkit/experience/lessons/2026-10-21-contracts-before-parallel.md
- Warn before writing under `.claude/` — /Users/x/Documents/Projects/devkit/experience/lessons/2026-10-21-kickoff-warn-claude-dir-permission.md
