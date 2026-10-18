---
name: hack-build
description: Builds one hackathon feature card from claim to done. Claims it on the board, opens an isolated worktree and port, builds the thinnest vertical slice against contract fixtures, passes the gate, screenshots each demo check, merges, and reports. Use for "build F-03", "take the next card", or "work my lane". Not for merging others' branches or sync points; use hack-integrate. Not for AI pipeline design; use hack-backend.
license: MIT
---

# Hack Build

**Slice**: one card becomes one thin vertical path that makes its SPEC demo check true on `main`. It is built against contract fixtures, gated, observed in a browser, merged, and closed with evidence. The gate is the reviewer and the demo check is the verifier, so nothing waits on CI or on a second reader.

Read [../hack/references/git-flow.md](../hack/references/git-flow.md) and [../hack/references/board.md](../hack/references/board.md) once per session. This skill applies them in order.

## Inputs

- A dispatch brief ([../hack/references/dispatch.md](../hack/references/dispatch.md) §Brief) with GOAL, DONE WHEN, TIMEBOX, DON'T TOUCH, and MERGE. With no brief, step 1 picks the card.
- `hack/HACKATHON.md`: `autonomy`, `merge_mode`, `max_active`, `prod_url`.
- `hack/SPEC.md` §F-NN (its demo checks), the `lib/contracts/` files and fixtures the card uses, the ownership map in `hack/ARCHITECTURE.md`, and `hack/DESIGN.md` (tokens and screen map) for UI cards.
- For AI cards, demo mode: `DEMO_MODE=1` or `?demo=1` replays `lib/demo/recordings`, the seed is `lib/demo/seed.ts`, and `DEMO_RECORD=1` records new replies.
- Your owner name `<role>@<human>`, for example `frontend-dev@joe`.

## Steps

1. **Pick and claim.** Use the brief's card, or run `scripts/hack next --lane <lane> --as <owner>` and take the top line. Then run `scripts/hack claim F-NN --as <owner>`. Before writing any code, the claim must succeed, because the board is the only lock that stops two builders from taking one card. If it refuses (open deps, `max_active`, or another lane's card not yet stealable), take the next suggestion. Never pass `--force`; that is the captain's override. The timebox runs from the claim. Done when the CLI prints `doing: F-NN …` with your owner name.

2. **Open the workspace.** Claude Code: a subagent dispatched with worktree isolation already has one (`git rev-parse --git-dir` differs from `git rev-parse --git-common-dir`); create the card branch there with `git fetch origin && git switch -c feat/F-NN-<slug> origin/main`. · Codex: run `scripts/hack wt F-NN` and work only inside the path it prints, never in the main checkout. Humans follow the Codex line. Then run `pnpm install`. Make sure `.env.local` is present: `wt` copies it, and otherwise copy it from the main checkout (the first path in `git worktree list`). Start `PORT=<3000+NN> pnpm dev`, so F-03 runs on 3003 and F-12 on 3012. Done when `curl -s localhost:<port>/api/health` returns `"ok":true` from the worktree.

3. **Read pointers only.** Read the SPEC demo checks for F-NN and copy them word for word as your done list. Then read the contract types and fixtures, your lane's globs and the shared zone in the ARCHITECTURE ownership map, and, for UI cards, the DESIGN.md tokens and the screen-map rows for every screen you touch. Skip everything else. Done when you can list the demo checks, the files you will touch (all inside your lane's globs), and the fixtures you will build against.

4. **Build the thinnest slice.** Read [references/slice-loop.md](references/slice-loop.md) when building. It covers slice order, commit cadence, lane boundaries, shared-zone changes, and contract change requests. UI cards use tokens only and cover every screen-map state on the demo path. AI cards work in demo mode and live. Done when each demo check is true at `localhost:<port>` in demo mode, and live as well for AI cards.

5. **Rebase and verify.** Run `git fetch origin && git rebase origin/main`, then `scripts/gate.sh` on the rebased tree. Then observe every demo check in a browser at `http://localhost:<port>` (add `?demo=1` where the check uses demo data). Save one screenshot per check as `hack/demo/shots/F-NN-<beat>.png` in the main checkout, because the worktree is deleted at cleanup. Use the runtime's browser capability; without one, a short Playwright script calling `page.screenshot` works. Before merging, the gate must print `gate ok in Ns` on the rebased tree and every demo check must have a screenshot, because the gate is the only reviewer and the screenshot is the only proof. Done when you have the gate line and one screenshot path per check.

6. **Merge.** Follow `autonomy` and `merge_mode` (git-flow.md §Merge procedure, §Autonomy):
   - `merge` + `pr`: `git push -u origin HEAD && gh pr create --fill --base main && gh pr merge --squash --delete-branch`.
   - `merge` + `direct`: `git push origin HEAD:main`. If the push is rejected, fetch, rebase, and gate again.
   - `branch`: push the branch and run `scripts/hack log "READY F-NN <branch> gate ok <N>s"`. Leave the card `doing`, because whoever merges it (git-flow.md §Autonomy) closes it. Skip steps 7 and 8.
   - `local`: commit only, skip steps 7 and 8, and report the branch and the push command.

   Before merging after feature freeze (70%), `scripts/smoke.sh` must pass on your port and the board log must have the integrator's `OK F-NN` line, because every post-freeze merge must keep the demo path working. Done when `git log origin/main --oneline -3` shows your commit, or the READY line is posted.

7. **Confirm on main.** When the host deploys `main` (Vercel does this on every push), wait until `<prod_url>/api/health` reports your merged short SHA as `commit`, then observe one demo check there. When `main` is not auto-deployed, run `git switch --detach origin/main` in the worktree and observe on your port. Done when one demo check has been seen on prod or on `origin/main` at your SHA.

8. **Close the card.** Run `scripts/hack done F-NN --evidence "<sha>; gate ok <N>s; <what you saw where>; hack/demo/shots/F-NN-<beat>.png"`. Do not fix bugs outside the card. List each one under `Noticed:` with a suggested `scripts/hack add "Fix: …" --p P1 --lane <lane> --size S` line, and the captain decides. Done when the board row shows `done` with that evidence.

9. **Clean up.** Stop the dev server. Claude Code: leave the isolated worktree to the runtime; the merged branch holds the work. · Codex: from the main checkout, run `scripts/hack wt F-NN --remove`. Under `local` or `branch` autonomy, keep the worktree until the branch is merged. Done when `git worktree list` no longer shows the path, or the report says why it was kept.

10. **Report.** Use the dispatch.md §Report contract format: at most 20 lines, ending with `STATUS:`. Done when the report below has been sent to whoever dispatched you, or to the user.

At 1.5× the timebox (the brief's TIMEBOX, else S = 60 min and M = 180 min), stop building and read [references/stuck.md](references/stuck.md). Never sit blocked silently.

## Deliverable

```text
F-NN · merged <sha> (<PR url> | direct | READY <branch>) · gate ok <N>s on rebased tree
Check 1: <demo check> → seen at <url> · hack/demo/shots/F-NN-<beat>.png
Check 2: <demo check> → seen at <url> · hack/demo/shots/F-NN-<beat>.png
Main: <prod_url>/api/health commit=<sha> | origin/main on :<port>
Board: done · "<evidence string>" | doing (awaiting merge)
Workspace: <path> removed | kept (<reason>)
Time: <minutes> of <budget> min
Noticed: <bug outside scope> → scripts/hack add "Fix: …" --p P1 --lane <lane> --size S
Assumed: <assumption, e.g. riskScore is an integer 0–100> | none
STATUS: done | blocked | needs-decision
```

Every line cites command output, a URL, or a screenshot from this session.

## When blocked

- **Past 1.5× the timebox, or stuck for 15 minutes:** read [references/stuck.md](references/stuck.md). It walks you through cutting to the demo check, faking the edge, asking for a contract change, or handing back with a pushed WIP branch and a block reason.
- **The contract does not fit:** read slice-loop.md §Contract change requests. Build an adapter in your lane meanwhile.
- **A dependency is not merged:** build against its contract fixtures. Waiting is never the plan.
- **The gate fails on `origin/main` itself:** main is red. Run `scripts/hack log "RED: <symptom> since <sha>"`, do not merge, and keep building on your branch. The integrator handles it ([../hack-integrate/SKILL.md](../hack-integrate/SKILL.md)).
- **Lockfile conflict while rebasing:** take `origin/main`'s lockfile, run `pnpm install`, and commit the result. Never hand-merge it.
- **A human-only step (API key, OAuth app, account):** run `scripts/hack add "Manual: <what the human does>" --p P0 --lane <lane> --size S`. Merge the demo-mode path, then block the live part on that card. Agents never type credentials.
- **No way to observe the demo check:** the card is not done. Report `STATUS: blocked` and say what is unobserved.
