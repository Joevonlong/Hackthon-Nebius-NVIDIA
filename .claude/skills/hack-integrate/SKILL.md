---
name: hack-integrate
description: Keeps a hackathon team's main branch demoable from the first merge to judging. Runs the sync points at 30/40/50/60%, merges ready branches in critical-path order, smokes main and prod, writes the sync report with an honest P0 burn-down, runs feature and code freeze, and reverts a red main. Not for building a card; use hack-build. Not for host setup, deploys, or demo-day ops; use hack-deploy.
license: MIT
---

# Hack Integrate

**Main** is the product. At every sync point the integrator merges what is ready in the right order, proves the demo path still works on `main` and on prod, and hands the captain a burn-down honest enough to cut scope by. After feature freeze the same loop runs on every merge.

Read [../hack/references/git-flow.md](../hack/references/git-flow.md), [../hack/references/timeline.md](../hack/references/timeline.md) §Sync points, and [../hack/references/captain.md](../hack/references/captain.md) §Cut rules once per session. This skill applies them.

## Inputs

- `scripts/hack status` and `scripts/hack status --json`: phase, gates, Doing/Stale/Blocked, P0 burn-down, and prod. `scripts/hack timeline` gives the sync-point times.
- `hack/HACKATHON.md`: `autonomy`, `merge_mode`, `prod_url`, team and lanes.
- `hack/SPEC.md` (beats B1–B6, critical path) and `hack/ARCHITECTURE.md` (ownership map, shared zone, deploy target).
- Ready work: `READY` lines in the board log, open PRs (`gh pr list --state open --json number,headRefName,title,isDraft`), and `git fetch --prune origin && git branch -r --no-merged origin/main`.
- An integrator workspace on `origin/main`, port 3000 (sync-ritual.md §Workspace).

## Steps

1. **Read the clock and the board.** Run `scripts/hack status`. Note the phase, `P0 done/total`, P0 work left, hours to freeze, and stale, blocked, and prod state. Ping the owner of every stale card on the board log. Done when the status output is saved for the report.

2. **Build the merge queue.** List every ready branch: pushed, gate reported, builder said done or READY. Order it: shared-zone and contract branches first, then the critical path (branches that unblock waiting cards, then P0 in beat order), then P1 and P2. Each entry gets a merger. Under `merge`, builders merge their own, and you merge only branches reported ready but left unmerged. Under `branch`, builders only push, and you merge others' ready branches after L0 once a human has asked for this merge round. Without that ask (for example overnight), the queue goes in the report for the human to review. Under `local`, nobody merges and the queue goes in the report. Done when the ordered queue, with a merger for each entry, is written down.

3. **Merge in order.** Read [references/sync-ritual.md](references/sync-ritual.md) §Merging someone else's branch when merging. Before merging anything, `scripts/gate.sh` must pass on fresh `origin/main`, because nobody merges onto a red main except the fix or the revert. Merge one branch at a time onto a fresh fetch. Skip a branch that conflicts, and log a `REBASE` line for its owner. Close each card you merge with the builder's evidence plus your SHA. Done when every queued branch is merged or skipped with a logged reason.

4. **Smoke main, then deploy.** At fresh `origin/main`, run `scripts/gate.sh` and `scripts/smoke.sh` (local, port 3000). Then deploy `main` with the `hack-deploy` skill. A Vercel Git push has already deployed it; Fly needs `fly deploy`. Wait until `<prod_url>/api/health` reports `origin/main`'s short SHA as `commit`, then run `scripts/smoke.sh <prod_url>` last, so the beat screenshots show prod. Before any explicit prod deploy, L1 must pass on that tree, because judges only ever see prod. Done when you have the gate line, the local smoke line, the matching health commit, and the prod smoke line.

5. **Write the sync report.** Use the template in sync-ritual.md: `hack/reviews/sync-<MMDD-HHMM>.md` with burn-down, beats on prod with screenshot paths, red-main incidents, risks, and recommended cuts. Copy the prod screenshots into `hack/demo/shots/sync-<MMDD-HHMM>/` so the next smoke does not overwrite them. Commit the report straight onto `main` (planning-doc route, no gate; `vercel.json` skips the build for `hack/`-only commits). Under `local`, commit only and give the human the push command. Done when the report is on `origin/main` (or committed locally) and its path is in hand.

6. **Hand the burn-down to the captain.** Send at most 20 lines: verdict first (fits, or over by X h), then main and prod status, smoke per beat, incidents, and recommended cuts in captain.md order. A cut that removes a P0 or a beat is the captain's or the user's call, so phrase it as one numbered question with a recommended answer. Done when the message, ending with `STATUS:`, has been sent.

7. **Guard main between syncs.** Read [references/freeze-and-red-main.md](references/freeze-and-red-main.md) when L0 fails on main, a prod deploy fails, or a beat that passed before fails smoke. Log `RED`, hold other merges, give the author 10 minutes to fix forward, then revert and re-open the card. Done when every `RED` line in the board log has a matching `FIXED` or `REVERTED` line.

8. **Run the freeze.** At 70%, announce feature freeze. From then on, every merge needs L1 plus your `OK F-NN` line in the board log, and you facilitate the L2 rehearsal on prod: time the live demo against the SPEC beats. At 90%, announce code freeze; only captain-approved fixes to a broken demo beat merge. Tag the judged build `demo-final`. Before pushing the tag to a public repo, ask the human, because a public tag publishes that build and moving it later needs a forced push. Everything is in freeze-and-red-main.md. Done when both freeze lines are logged, the rehearsal timings are in a report, and `demo-final` points at the judged SHA.

## Deliverable

```text
Sync <pct>% · <MM-DD HH:MM> · hack/reviews/sync-<MMDD-HHMM>.md (<sha>)
Merged: F-03 <sha>, F-05 <sha> · skipped: F-07 (conflict, REBASE logged) · queue left: <n>
Main: origin/main <sha> · gate ok <N>s · smoke ok <N>s (local :3000)
Prod: <prod_url> · health commit <sha> · smoke ok <N>s · B1 ok · B2 ok · B3 FAIL (F-06)
Burn-down: P0 <done>/<total> · <h> h left vs <h> builder-hours to 70% · fits | over by <h> h
Incidents: RED <sha> → FIXED <sha> in <m> min | REVERTED <sha> | none
Recommended cuts: <card → cut/simplify/fake · saves <h> h> | none
Freeze: not yet | feature since HH:MM | code since HH:MM · L2 <s>/<planned s> · demo-final <sha | not tagged>
STATUS: done | blocked | needs-decision
```

Every line cites command output, a URL, or a screenshot from this session.

## When blocked

- **Main is red at sync time:** handle the red main first (freeze-and-red-main.md), merge nothing else, and run the sync once main is green. Report the delay.
- **The prod deploy fails:** follow `hack-deploy`'s When blocked. Smoke main locally meanwhile, and mark prod `unknown` in the report.
- **A beat fails that never passed:** that is not red main. List it under Risks with its owning card.
- **A branch conflicts with main:** do not resolve another lane's code. Run `scripts/hack log "REBASE F-NN: conflicts with <sha> in <paths>"` and move on.
- **`gh` is not authenticated, or protection blocks the merge:** ask the human to run `gh auth login` or to merge. Never use `--admin` or force-push `main` without the human's yes.
- **The sync runs long:** finish the merge in flight, then smoke and report. A sync report 15 minutes late beats a perfect one an hour late.
- **The burn-down is over:** recommend cuts in captain.md §Cut rules order. Only the user removes a beat.
