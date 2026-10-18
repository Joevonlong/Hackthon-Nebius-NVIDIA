<!-- hack-team:begin -->
## Hackathon rules (hack-team)

This repository is a weekend hackathon project run with the hack-team kit. Speed matters more than ceremony, and `main` must be demoable at every moment.

- **Start here.** Run `scripts/hack status`, then use the `hack` skill to pick the next step. Event facts, clock, team, and autonomy live in `hack/HACKATHON.md`; who does what lives in `hack/BOARD.md`; the product lives in `hack/PITCH.md`, `hack/SPEC.md`, `hack/ARCHITECTURE.md`, `hack/DESIGN.md`.
- **Claim before work.** `scripts/hack claim F-NN`; finish with `scripts/hack done F-NN --evidence "<sha>; <what you observed>"`. Never edit `hack/BOARD.md` by hand or in a feature branch.
- **One branch per card.** `feat/F-NN-<slug>` from `origin/main`; parallel builders each use `scripts/hack wt F-NN`. Commits look like `feat(F-NN): …`. No AI attribution trailers.
- **Gate before merge.** Rebase on `origin/main`, then `scripts/gate.sh` (≤ 90 s). `scripts/smoke.sh` runs at sync points, before prod deploys, and before every merge after feature freeze. No waiting on hosted CI.
- **Stay in your lane.** The ownership map is in `hack/ARCHITECTURE.md`. The shared zone (`lib/contracts/**`, `package.json` and the lockfile, `app/layout.tsx`, global CSS and tokens, `.env.example`, `next.config.ts`, `proxy.ts`) changes only in a tiny separate branch merged first. Lockfile conflicts: reinstall, never hand-merge.
- **Red main.** Fix within 10 minutes or revert. Nobody merges onto red except the fix.
- **Demo first.** P0 cards serve demo beats. Polish only the demo path. Never invent metrics, users, or results.
- **Time-box.** At 1.5× a card's size, stop and report with `STATUS: blocked` or `STATUS: needs-decision`.
- **Ask a human first** before submitting, publishing or posting anything public, spending money, deleting data or branches you did not create, force-pushing `main`, or rotating secrets.
- **Ports.** `main` runs on 3000; the worktree for F-NN runs on 3000 + NN.
- **Language.** `hack/*.md` uses `doc_language`; README, video, and submission use `submission_language` (both in `hack/HACKATHON.md`).
<!-- hack-team:end -->
