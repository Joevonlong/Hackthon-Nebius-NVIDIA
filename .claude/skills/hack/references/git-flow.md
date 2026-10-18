# Git flow, gates, and merging

Speed comes from small branches, one cheap gate before every merge, and a deployable `main` at all times. Nothing here waits for CI.

## Branches, commits, worktrees

- One branch per card from `origin/main`: `feat/F-03-<slug>` or `fix/F-03-<slug>`. Merge within about three hours; split bigger cards.
- Commits: `feat(F-03): stream clause summary`, `fix(F-07): …`, `chore(F-00): …`. No AI attribution trailers.
- One builder per worktree. `scripts/hack wt F-03` creates the branch and worktree and prints the path and port: `$HACK_WORKTREE_DIR/<repo>-F-03` when set (use it when the user's or project's rules prescribe a location), else `.worktrees/F-03`. Claude Code subagents dispatched with `isolation: worktree` already have one.
- Dev server port in a worktree: `3000 + card number` (F-03 → `PORT=3003`). `main` uses 3000.
- Copy `.env.local` into a new worktree; never commit it.

## Verification tiers

| Tier | Command | Budget | Required |
|---|---|---|---|
| L0 gate | `scripts/gate.sh` (typecheck, lint, build). `--fast` skips the build | ≤ 90 s | Before every merge, on the rebased branch |
| L1 smoke | `scripts/smoke.sh [base-url]` (Playwright golden path in demo mode, one screenshot per beat into `hack/demo/shots/`) | ≤ 3 min | At sync points, on prod after each deploy (Vercel deploys `main` on every push), before any manual deploy or promote, and before every merge after freeze |
| L2 rehearsal | Run the live demo script on prod with a timer | demo length | At freeze, before recording video, before judging |

Plus the card's own demo checks from SPEC.md, observed in a browser or with a screenshot. Unit tests only for pure logic whose silent failure would corrupt the demo (scoring, parsing, ranking). No UI unit tests, no coverage targets, no waiting on hosted CI.

## Merge procedure

```bash
git fetch origin && git rebase origin/main
scripts/gate.sh                      # must pass on the rebased tree
```

Then by `merge_mode` in HACKATHON.md:

- `pr`: `git push -u origin HEAD && gh pr create --fill --base main && gh pr merge --squash --delete-branch`. Self-merge is allowed after L0 for your own lane.
- `direct`: `git push origin HEAD:main`. If the push is rejected, fetch, rebase, gate again.

Afterwards: confirm the deploy (or run the app on `main`), observe your demo check, then `scripts/hack done F-03 --evidence "<sha>; gate ok; <what you saw>"`.

## Planning docs and gate locks

`hack/PITCH.md`, `hack/SPEC.md`, `hack/ARCHITECTURE.md`, `hack/DESIGN.md`, and `hack/reviews/*` are docs, not code: no card branch and no gate. The owner commits them on `main`, then `git pull --rebase origin main && git push origin main`. `scripts/hack status` reads the gates from `origin/main`, so a lock counts only once pushed. Lock commits name the decision: `docs(pitch): lock G1 (D-04)`, `docs(spec): lock G2 (D-09)`. Under `autonomy: local`, commit and give the human the push command; under `branch` and `merge`, push them like board changes. Each of these files keeps exactly one `Status:` line, because the gate check matches any line starting with `Status: locked`.

## Autonomy

`autonomy` in HACKATHON.md sets how far agents go with code without a human: `local` (commit only), `branch` (push branches; a human merges, or asks the integrator for a merge round), `merge` (push and merge after L0; the default). Board changes and planning docs go to `main` under `branch` and `merge`; under `local` the human pushes them. In every mode, ask a human first before: submitting, posting or publishing anything public, spending money beyond the stated budget, deleting data or branches you did not create, force-pushing `main`, or rotating secrets.

## Shared zone

`lib/contracts/**`, `package.json`, the lockfile, `app/layout.tsx`, global CSS and design tokens, `.env.example`, `next.config.ts`, `proxy.ts`, and anything ARCHITECTURE.md marks shared. Change them only in a small dedicated branch (`chore(F-xx): add riskScore to Clause contract`), announced in the board log, merged before the branches that depend on it. Never mix a shared-zone change into a feature branch. An enabling card whose job is shared setup (contracts, the LLM client and demo-mode proxy) is itself that dedicated branch: it lands before the cards that depend on it, and holds no beat UI.

Lockfile conflicts: take `origin/main`'s lockfile, reinstall, commit the result. Never hand-merge a lockfile.

## Red main

`main` is red when L0 fails on it, the prod deploy fails, or smoke fails on a beat that passed before.

1. Whoever notices posts `scripts/hack log "RED: <symptom> since <sha>"`.
2. The author of the breaking merge has 10 minutes to fix forward.
3. After 10 minutes the integrator runs `git revert <sha>`, pushes, and moves the card back to `doing` with the reason.

Nobody merges onto a red main except the fix or the revert.

## Freeze

- **Feature freeze (70%)**: no new feature cards. The only new rows are `Fix: …` cards for bugs and for the P0/P1 findings of the judge and polish reports. Only fixes, polish, and demo-mode work merge. Every merge also runs L1 and needs the integrator's OK in the board log.
- **Code freeze (90%)**: only fixes for a broken demo beat, each approved by the captain. The video is recorded from the frozen build. `README.md`, `hack/**` docs, and `hack/demo/media/**` keep changing until submission: commit them on `main` as `docs: …` and log them (`scripts/hack log "docs: README final <sha>"`). They do not rebuild prod, because the Vercel `ignoreCommand` skips commits that touch only `hack/` and `README.md`.
- Tag the build that was judged: `git tag demo-final && git push origin demo-final` (ask first if the repo is public).
