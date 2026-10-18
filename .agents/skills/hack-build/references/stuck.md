# Stuck

A builder who stays silent while blocked costs the team more than a cut ever does. Work down this ladder in order, give each rung about 10 minutes at most, and log every rung you use.

## Timebox

| Size | Budget | Check at 1× | Stop at 1.5× |
|---|---|---|---|
| S | 60 min | 60 min | 90 min |
| M | 180 min | 180 min | 270 min |

- A TIMEBOX in the brief overrides the table. The clock starts at your claim. `scripts/hack status` shows minutes since the card's last update under Doing.
- **At 1×:** if your slice has not reached step 3 of slice-loop.md §Slice order, start the ladder now at rung 1.
- **At 1.5×:** stop building and go straight to rung 4. Cut rules are the captain's tool ([../../hack/references/captain.md](../../hack/references/captain.md) §Cut rules), and the captain can only use them if you surface the overrun.

## Ladder

1. **Cut to the demo check.** Re-read the SPEC demo check word for word. Drop everything the judge will not see on the demo path: settings, second variants, edge cases, non-demo states, refactors. Keep the states on the demo path. Log it with `scripts/hack log "F-03 cut to demo check: dropped <what>"`.

2. **Fake the edge.** Replace the hard external part with a stand-in behind the same contract: seeded data from `lib/demo/seed.ts`, a recorded AI reply in `lib/demo/recordings`, or a fixed list in place of a third-party sync. The UI and the contract stay real, so the live version can be swapped in later without touching other lanes. A fake that only feeds demo mode is your call; record it as `Assumed:`. A fake that changes what the live demo claims (live becomes canned) is the captain's call, so report `STATUS: needs-decision` with a recommendation.

3. **Ask for a contract change.** If the contract itself is the obstacle, follow slice-loop.md §Contract change requests. Build an adapter in your lane so your card keeps moving while the decision is pending.

4. **Hand back.** Leave the card where the next person can pick it up in minutes:

   ```bash
   git add <paths> && git commit -m "feat(F-03): wip <what works>"
   git push -u origin HEAD                      # skip under autonomy: local
   scripts/hack block F-03 --reason "<what is stuck>; tried <x, y>; WIP <branch>@<sha>; needs <decision or help>"
   ```

   Then report `STATUS: blocked` with what works, what does not, the exact next step, and the WIP branch. If you were dispatched with a size or timebox, add how far over it you are. Keep the worktree unless you are told to remove it. Whoever takes over runs `scripts/hack wt F-03`, which reuses the pushed branch.

## Never sit blocked silently

- **Waiting on another card:** build against its contract fixtures. If you truly need its runtime behaviour, block with a reason that names the card, then run `scripts/hack next` for other work. Blocked cards do not count toward `max_active`.
- **Waiting on a human** (a key, an account, a decision): put the question in your report as one numbered line with a recommended answer. Human-only setup becomes a `Manual:` card ([../SKILL.md](../SKILL.md) §When blocked). Reversible choices continue on the recommended answer, labeled `Assumed:`.
- **No answer within 15 minutes:** continue on your recommendation if it is reversible. Otherwise block and take the next card.

## Common traps

| Symptom | Likely cause | Fix |
|---|---|---|
| Gate passes on your branch, fails after rebase | A contract or shared file changed on main | `git log --oneline origin/main -- lib/contracts`, then adapt to the new contract |
| Port already in use | Your own stale dev server, or the wrong port | `lsof -i :<port>`; stop only your own process; F-NN always uses 3000 + NN |
| `pnpm install` changes the lockfile | Dependency drift | Take `origin/main`'s lockfile and reinstall; new dependencies go on a shared branch |
| Env var undefined in the worktree | `.env.local` not copied | Copy it from the main checkout; never print or commit its values |
| Live AI call slow or rate-limited | Provider limits | Verify in demo mode, record one live reply when the limit resets, note it under `Assumed:` |
| Works locally, fails on prod | A `NEXT_PUBLIC_` value is read at build, an env var is missing on the host, or the function timed out | Tell the integrator; `hack-deploy` covers host env and timeouts |
| `gh pr merge` refused | Branch protection or required checks | Do not use `--admin`. Report it to the integrator and the captain |
