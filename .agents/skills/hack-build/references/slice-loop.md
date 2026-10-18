# Slice loop

How to turn one card into the thinnest working path. Each step should be demoable on its own. Stop at the first step that makes the demo checks true and covers the states the demo path shows.

## Slice order

1. **Fixture path.** The page or component renders the contract fixture (from `lib/contracts/`), parsed with the contract's zod schema. Use no network and no AI yet.
2. **Trigger.** Wire the user action (button, form, upload) to the route handler or server action named in ARCHITECTURE.md. It still returns the fixture.
3. **One real end.** Replace the fixture with the real call or real data behind the same contract. For AI calls, put demo mode in front: `DEMO_MODE=1` or `?demo=1` replays `lib/demo/recordings`, and one live run with `DEMO_RECORD=1` records the reply for the demo.
4. **Demo-path states.** Cover empty (filled with story data from `lib/demo/seed.ts`), loading, streaming where the screen map shows it, success, and error, as DESIGN.md's screen map describes them.
5. **The visible detail.** Add the one touch the demo check names (a number with its unit, a highlight, a transition) and nothing more. Hand the rest of the polish to `hack-polish`.

A slice that does not appear in the demo path is out of scope, even if it is "nearly free".

## Commit cadence

- Commit at every green step. Each step should take 30 minutes or less; when one runs longer, cut it smaller.
- Run `scripts/gate.sh --fast` before each commit and the full `scripts/gate.sh` before merging.
- Messages: `feat(F-03): render clause list from fixture`, `fix(F-03): handle empty upload`. No AI attribution trailers.
- Stage by path. Never stage `.env.local`, `hack/BOARD.md` (only `scripts/hack` changes it), or screenshots.
- Unless `autonomy` is `local`, push the branch at least once an hour (`git push -u origin HEAD`). It is a free backup, and it lets someone who steals a stale card start from your work.

## Lane boundaries

- Touch only your lane's globs from the ARCHITECTURE.md ownership map, plus new files inside them.
- Before merging, check `git diff --stat origin/main...HEAD`. Every path must be in your lane. Move any stray hunk out with `git restore --source origin/main -- <path>`.
- Never edit another lane's files, even for a one-line fix. Run `scripts/hack log "NEED <lane>: <what> for F-03"` and suggest a `Fix:` card in your report.
- Never touch the shared zone ([../../hack/references/git-flow.md](../../hack/references/git-flow.md) §Shared zone) inside your card branch.

## Shared-zone changes

A contract field, a dependency (`pnpm add`), a token, `app/layout.tsx`, or `.env.example` goes in its own tiny branch, merged before your card:

```bash
git commit -m "feat(F-03): wip <state>"            # park your work
git switch -c feat/F-03-shared-<slug> origin/main
# make the one shared change; pnpm add <pkg> also happens here
scripts/gate.sh
git commit -m "chore(F-03): add riskScore to Clause contract"
# merge per merge_mode (../../hack/references/git-flow.md §Merge procedure)
scripts/hack log "SHARED F-03: riskScore on Clause contract (<sha>)"
git switch feat/F-03-<slug> && git fetch origin && git rebase origin/main
```

- When you change a contract, update its fixture in the same commit, so every lane's fixture path keeps working.
- Lockfile: never hand-merge it. On conflict, take `origin/main`'s lockfile, run `pnpm install`, and commit.
- Under `autonomy: branch` or `local`, push or commit the shared branch, log it as READY, and keep building with an adapter in your lane until it lands.

## Contract change requests

The contract in `lib/contracts/` is the agreement between lanes. When code and contract disagree, the contract wins.

| Situation | Action |
|---|---|
| You need a new optional field, or a new type nobody else uses | Make it yourself through the shared-zone route above, fixture included |
| You need a rename, a new required field, or a type change | Do not edit. Write an adapter in your lane, run `scripts/hack log "CONTRACT? F-03 wants <change>"`, and report `STATUS: needs-decision` |
| The other side's code does not match the contract | Code to the contract, run `scripts/hack log "CONTRACT MISMATCH <card>: <field> is <x>, contract says <y>"`, and put it under `Noticed:` |

The `needs-decision` question has one line and a recommendation. Example: `1. Change Clause.risk from string to integer 0–100? Recommended: yes; the B3 gauge needs a number. Adapter in components/clause/risk.ts until then.`

## UI cards

- Use DESIGN.md tokens only (Tailwind theme variables, shadcn theme). Never use raw hex colors or one-off font sizes.
- Every screen you touch covers its screen-map states on the demo path. A missing state is a missing feature, not polish.
- Look at 1280×720 as well as your own screen. Projectors are small, and judges read from far away.

## AI cards

- Keep all model calls server-side, in route handlers or server actions. Keys come from the server env, never from a `NEXT_PUBLIC_` variable.
- The card is done only when it works both ways: demo mode replays a committed recording, and live mode makes the real call. Verify both.
- Stream when the screen map shows a streaming state, so the first token reaches the screen fast.
- Validate model output with the contract's zod schema. On failure, show the error state rather than a broken screen.
