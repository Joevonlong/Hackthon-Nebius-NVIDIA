# Freeze and red main

The rules are in [../../hack/references/git-flow.md](../../hack/references/git-flow.md) §Red main and §Freeze. This file holds the exact moves.

## Detecting red

Check after every merge you see (a `MERGED` or `SHARED` log line, or a new commit on `origin/main`), not only at sync points:

```bash
git fetch origin && git switch --detach origin/main && scripts/gate.sh
curl -s <prod_url>/api/health                # commit should be origin/main's short SHA once the deploy lands
```

Prod deploy state: on Vercel, `vercel ls --prod`; on Fly, `fly status` (details in `hack-deploy`). A smoke beat that passed in the last sync report and fails now is red. A beat that never passed is a risk, not red.

Find the breaking commit between the last green SHA (the previous sync report or the last `gate ok`) and now:

```bash
git log --oneline <green-sha>..origin/main
git bisect start origin/main <green-sha> && git bisect run scripts/gate.sh && git bisect reset   # only for several suspects
```

## The 10-minute window

1. Run `scripts/hack log "RED: <symptom> since <sha> (F-NN, <author>)"` and tell the author directly if you can reach them. Note the time.
2. Run `scripts/hack log "HOLD: merges paused, red main"`. Only the fix or the revert merges now.
3. The author fixes forward: a `fix(F-NN): …` commit on a branch from `origin/main`, gated, merged. When it lands and the gate is green, log `FIXED <sha>` and lift the hold.
4. At +10 minutes with main still red, revert. Extensions come only from the captain, as a log line.

## Revert

```bash
git fetch origin && git switch --detach origin/main
git revert --no-edit <sha>                     # a squash or ordinary commit
git revert --no-edit -m 1 <merge-sha>          # a merge commit: keep main's side
git revert --no-edit <oldest-sha>^..<newest-sha>   # several commits from one card
scripts/gate.sh
git push origin HEAD:main                      # rejected → fetch, rebase, gate, push
```

- In `pr` mode with protected `main`: `git switch -c fix/F-NN-revert && git push -u origin HEAD && gh pr create --fill --base main && gh pr merge --squash --delete-branch`. Use `--admin` only with the human's yes. Never force-push `main`.
- Confirm the deploy (health `commit` equals the revert SHA), then run `scripts/smoke.sh <prod_url>`.
- Log `scripts/hack log "REVERTED <sha> → <revert-sha>: <symptom>"` and lift the hold.

## Re-open the card

```bash
scripts/hack set F-NN status=doing evidence="reverted in <revert-sha>: <symptom>"
```

`set` keeps the owner. The author restores the work on a fresh branch from `origin/main` with `git revert <revert-sha>`, fixes it, gates, and merges again. If the owner is gone, run `scripts/hack release F-NN` so anyone can claim it. If it cannot be fixed before the next freeze, the captain decides between a cut and a `Fix:` card.

## Feature freeze (70%)

- Announce: `scripts/hack log "FREEZE feature: no new cards; every merge needs L1 + integrator OK"`. Tell the captain to stop dispatching new features.
- For each merge request, the author rebases and posts `READY F-NN <branch> gate ok <N>s; smoke ok <N>s` from their own port. You check that the diff (`git diff --stat origin/main...origin/<branch>`) is a fix, polish, or demo-mode change and touches nothing new. Then log `OK F-NN <head-sha>`. Under `merge` the author merges; otherwise you do (sync-ritual.md §Merging someone else's branch).
- After each merge: deploy, health commit, `scripts/smoke.sh <prod_url>`.

## L2 rehearsal (at freeze)

Use the demo script: `hack/demo/RUNBOOK.md` once `hack-pitch` has written it, else the SPEC beats. One person presents on the prod URL, in the mode they will use on stage, while you time each beat.

| Beat | Planned s | Actual s | Mode | Glitch | Card |
|---|---|---|---|---|---|
| B1 | 20 | 26 | live | spinner held 4 s | F-03 |

- Put the table in a freeze report, `hack/reviews/sync-<MMDD-HHMM>.md`, using the sync template plus this table.
- Over time: name the beats to trim for `hack-pitch` and the captain. A glitch on a beat that passed before is red main.
- Rehearse again before recording the video and before judging.

## Code freeze (90%)

- Announce: `scripts/hack log "FREEZE code: only captain-approved fixes to a broken demo beat"`.
- Each fix needs the captain's approval line in the log (`OK-CAPTAIN F-NN`), plus L1 and your `OK` line.
- The video is recorded from the frozen build (`hack-video`). Nobody merges while it is being recorded.

## Tag demo-final

Tag the SHA that is live on prod when judging starts:

```bash
gh repo view --json visibility -q .visibility   # PUBLIC → ask the human before pushing
git tag demo-final <sha> && git push origin demo-final
```

- Before pushing the tag to a public repo, ask the human, because a public tag publishes the judged build and moving it means a forced tag push.
- A later approved fix moves the tag only with the human's yes: `git tag -f demo-final <sha> && git push -f origin demo-final`.
- Hand the tag's SHA to `hack-deploy` so it records the matching deployment for a break-glass restore.
