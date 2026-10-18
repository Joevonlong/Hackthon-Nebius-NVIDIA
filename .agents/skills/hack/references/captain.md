# Captain loop

The captain owns the clock, the scope, the board, and the three human gates. In Claude Code this is the `hack-captain` agent or any session that ran `hack`; in Codex it is the session that ran `$hack`. With one human on the team, the captain also builds; otherwise it dispatches and integrates.

## Kickoff (0–4%)

1. Collect event facts in one question round: event name, `start`, official `deadline`, our `submit_by` (≥ 30 min before the deadline), theme and tracks, judging criteria and weights, sponsor or required tech, submission requirements (video length, repo public, demo URL), team members with skills and hours available, budget for paid APIs. Paste-in rules pages are better than memory; read them yourself when given a link.
2. Run `hack-init`. Assign lanes from the team's skills; one human per lane, agents per card.
3. Start F-00 now, in parallel with the grill: dispatch the integrator with `hack-deploy` to get the skeleton live on a public URL.

## Grill and plan (4–20%)

- Run `hack-grill` in the main session; it needs the user. Meanwhile dispatch read-only research helpers for facts the grill raises (competitors, API limits, datasets) and fold their findings into the next round.
- After G1, dispatch in parallel: product → `hack-spec`, architect → `hack-architecture` then `hack-backend`, designer → `hack-design` (direction prototypes). Merge the contracts branch first.
- G2: show the user the P0 list with sizes against the build hours available and the direction switcher, in one round. Record both as decisions.

## Build loop (20–70%)

Every 30–45 minutes, and whenever a helper reports:

1. `scripts/hack status`. Main red → that is the only priority (git-flow.md §Red main).
2. Unblock: answer `needs-decision` reports (ask the user only for decisions on the human list in principles.md), re-scope blocked cards, merge shared-zone branches.
3. Dispatch: one ready card per idle builder, own lane first, with the brief from dispatch.md. Critical-path cards first.
4. Stale claims: ping the owner; after `stale_after_minutes` with no answer, `release` or `--steal`.
5. At sync points (30/40/50/60%) hand the integrator `hack-integrate`, then re-scope from its burn-down.

## Cut rules

At each sync point, compare remaining P0 size (S = 1 h, M = 3 h; the Burn-down line of `scripts/hack status`) with builder-hours left until freeze at 70%. If it does not fit, in this order: cut P2 and P1 cards; simplify a P0 card to its demo check; fake a peripheral edge ("Fake the edges, never the core"). Removing a demo beat needs the user. Record every cut with `scripts/hack decide`.

## Harden, ship, submit (70–100%)

- 70%: announce feature freeze in the board log. Dispatch designer → `hack-polish`, judge → demo review against the rubric, integrator → demo mode on prod and L1.
- 75–85%: fix only what the judge and polish reports rank P0/P1. Run the L2 rehearsal.
- 85%: storyteller finishes `hack-video`, `hack-readme`, `hack-pitch`; judge reviews the submission.
- 90%: code freeze. 95%: the human submits (G3). Never submit for them.

## Talking to the user

- Status on request, at every sync point, and at every gate, in the `hack` deliverable format.
- Questions in rounds: numbered, each with a recommendation, at most four per round, only decisions that are theirs.
- Silence is not consent for the human-only list. For everything else, proceed on the recommendation, label it `Assumed:` in the board log, and keep moving.
