# Sync ritual

Sync points are at 30, 40, 50, and 60% (`scripts/hack timeline`). The budget is about 20 minutes: 10 for merging, 5 for smoke and deploy, 5 for the report. After feature freeze the merge, smoke, and OK loop runs per merge instead (freeze-and-red-main.md).

## Workspace

Work in a clean, detached checkout of `origin/main` on port 3000, never in a builder's worktree:

```bash
git worktree add --detach .worktrees/main origin/main   # once; $HACK_WORKTREE_DIR/<repo>-main if that is set
cd .worktrees/main && pnpm install                       # copy .env.local from the main checkout
git fetch --prune origin && git switch --detach origin/main   # before every check
```

Claude Code: an integrator dispatched with worktree isolation can use its own worktree the same way. · Codex: create `.worktrees/main` as above and work only there.

## Merging someone else's branch

Gate the exact result you will merge, without rewriting the builder's branch:

```bash
git fetch --prune origin && git switch --detach origin/main
git merge --squash origin/feat/F-03-clause-list   # conflict → git merge --abort, log REBASE, skip
scripts/gate.sh
```

Then, by `merge_mode`:

- `pr`: discard the local squash (`git reset --hard origin/main`), then run `gh pr merge <number> --squash --delete-branch --match-head-commit <head-sha>`, where `<head-sha>` is `git rev-parse origin/feat/F-03-clause-list`. `--match-head-commit` refuses to merge if the builder pushed after you gated.
- `direct`: `git commit -m "feat(F-03): <card title>" && git push origin HEAD:main`. If the push is rejected, fetch and redo.

If only the lockfile conflicts in `direct` mode: `git checkout --ours pnpm-lock.yaml && pnpm install && git add pnpm-lock.yaml`. During the squash, "ours" is `origin/main`. In `pr` mode, log `REBASE` for the owner instead.

After each merge, close the card with the builder's evidence plus yours: `scripts/hack done F-03 --evidence "<sha>; gate ok <N>s; merged by integrator; <builder's screenshot path>"`. Then fetch again before the next branch.

## Queue order

1. **Shared zone and contracts.** A branch is in this group if `git diff --name-only origin/main...origin/<branch>` lists any shared-zone path ([../../hack/references/git-flow.md](../../hack/references/git-flow.md) §Shared zone).
2. **Critical path.** First, branches whose card appears in a waiting card's Deps column. Then P0 branches in beat order, B1 to B6.
3. **P1, then P2.** Nothing from this group after code freeze.

## Burn-down

Take the numbers from `scripts/hack status --json` (`p0_done`/`p0_total` as well):

- `p0_hours_left`: open P0 size, with S = 1 h and M = 3 h from the Size column. Doing cards count at full size, so this figure is conservative.
- `hours_to_freeze`: hours until 70%, per builder.

Capacity = `hours_to_freeze` × builders actually building this interval (humans plus parallel agent builders) × 0.7. The 0.7 is a focus-factor heuristic; label it as one. The verdict is **fits** when `p0_hours_left` ≤ capacity, else **over by X h**.

Also compare against the [../../hack/references/timeline.md](../../hack/references/timeline.md) §Sync points expectation for this sync point. Missing it is a risk even if the arithmetic fits.

Recommended cuts follow [../../hack/references/captain.md](../../hack/references/captain.md) §Cut rules order. Give each cut the hours it saves and its demo impact. Removing a beat is the user's call.

## Report template

```markdown
# Sync <pct>% · <MM-DD HH:MM>

Status: green | red | degraded · origin/main <sha> · prod <prod_url> (health commit <sha>)
Expectation (timeline.md): <text> → met | not met: <what is missing>

## Burn-down

| Metric | Value |
|---|---|
| P0 done | <n>/<total> |
| P0 work left | <h> h (S = 1 h, M = 3 h) |
| Builder-hours to freeze | <h> h × <builders> × 0.7 = <h> h (heuristic) |
| Verdict | fits / over by <h> h |

## Beats on prod

| Beat | Smoke | Screenshot | Cards |
|---|---|---|---|
| B1 | ok | hack/demo/shots/sync-<MMDD-HHMM>/B1.png | F-02 |

## Merged since last sync
- F-03 <sha> by <owner | integrator>

## Waiting or skipped
- F-07: REBASE, conflicts with <sha> in <paths>; owner pinged at HH:MM

## Red-main incidents
- HH:MM RED <symptom> since <sha> → FIXED <sha> in <m> min | REVERTED <sha>, F-NN back to doing

## Risks
- <risk> · owner · the early signal we will watch

## Recommended cuts (captain decides)
1. <card> → cut | simplify | fake · saves <h> h · demo impact: <none | what changes>

## Evidence
L0: <gate line> · L1 local: <smoke line> · L1 prod: <smoke line>
```

## Handing it over

- Lead with the verdict, then anything that needs a decision, as one numbered question with a recommended answer ([../../hack/references/dispatch.md](../../hack/references/dispatch.md) §Report contract).
- Over budget, or a missed expectation, means the captain re-scopes now, not at the next sync.
