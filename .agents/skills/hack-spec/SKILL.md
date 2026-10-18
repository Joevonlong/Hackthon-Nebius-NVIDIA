---
name: hack-spec
description: Turns a locked hackathon pitch into a timed demo script, then into P0/P1/P2 vertical-slice features tied to demo beats and sized against the build hours, written to hack/SPEC.md and added as board rows for the G2 scope lock. Use for the demo script, feature list, MVP scope, or cutting scope to fit. Not for stack or contracts; use hack-architecture. Not for visual direction; use hack-design.
license: MIT
---

# Hack Spec

**Script** the demo before anything is built: three to six timed beats a judge watches, then only the features those beats need, each a vertical slice one builder merges within three hours. Every card, smoke step, and video scene later points back to a beat written here.

## Inputs

- **The locked pitch**, `hack/PITCH.md`: customer and example person, painful moment, wow moment, demo story sketch, spike result, judging map, out of scope.
- **Event facts** from `hack/HACKATHON.md`: demo or pitch length (when unstated, `Assumed: 3:00`, confirmed in the G2 round), submission requirements, team and hours, `lanes`, `doc_language`, `submission_language`.
- **The clock and the board** from `scripts/hack timeline` and `scripts/hack status`: G2 at 20%, the 60% sync point, feature freeze at 70%, F-00, and any enabling cards `hack-architecture` or `hack-backend` already added.
- **Parallel plan docs**, when present: `hack/ARCHITECTURE.md` (contracts, fake vs real) and `hack/DESIGN.md` (the wow screen). They are written at the same time and consume this skill's beats; reconcile with whatever exists when you start.
- **An existing `hack/SPEC.md`.** Resume from it. If it says `Status: locked`, a change is re-scoping through the captain: `scripts/hack set` or `cut`, a decision line, and SPEC.md updated to match the board.
- **Principles** in [../hack/references/principles.md](../hack/references/principles.md), above all "Demo-driven development", "Fake the edges, never the core", and "Cut scope, not quality".

Write SPEC.md in `doc_language` and the presenter lines in `submission_language`, because hack-pitch and hack-video reuse them. Reply to the user in their language.

## Steps

1. **Check the gate and load.** Before writing any spec, confirm `hack/PITCH.md` carries `Status: locked`, because a spec built on an unlocked pitch is rewritten when the pitch moves; if it does not, route to `hack-grill` and stop. Run `scripts/hack timeline` and create `hack/SPEC.md` from [references/spec-template.md](references/spec-template.md) with `Status: draft`. Done when you have quoted the pitch's Status line and stated the demo length, the G2 time, the 60% sync time, and the freeze time from the command output.
2. **Write the demo script first.** Read [references/demo-script.md](references/demo-script.md). Write beats `B1`… (3–6), each with what the presenter says, what the screen shows, what the judge should understand, and the seed data it needs. B1 states the persona and the painful moment; the wow beat starts at 60–70% of the runtime; the whole story runs on realistic seed data around the example person from PITCH.md. The script is a reversible draft: continue on it and label unconfirmed choices `Assumed:`. Done when the table is in SPEC.md, a read-aloud or word count fits the demo length, and the delete test passes.
3. **Derive features as vertical slices.** Read [references/slicing.md](references/slicing.md). For each beat, list the user-visible outcomes it needs. Each becomes a feature with a priority (P0, P1, P2), a lane from `lanes`, deps, a size S (≤ 1 h) or M (≤ 3 h), at most three demo checks written as observable statements on the seed data, and `fake-ok` where a peripheral edge may be mocked. Split anything bigger than M. Add enabling cards (contracts, seed data, demo mode) with beat `—`, reusing any already on the board. Done when every beat has at least one P0, every P0 serves a beat, every feature has every field, and nothing is larger than M.
4. **Mark the critical path.** Find the longest dependency chain by summed size from F-00 to the last card of the wow beat. Done when the chain and its hours are in SPEC.md and they end before the 60% sync point, or the overrun is shortened (split, fixtures first, fake an edge off the core) or carried into the G2 round.
5. **Check capacity.** Compare the sum of P0 sizes (S = 1 h, M = 3 h) with the builder-hours until freeze, computed as [references/slicing.md](references/slicing.md) §Capacity describes. If P0 does not fit, cut before locking, in the captain's order ([../hack/references/captain.md](../hack/references/captain.md) §Cut rules): simplify a P0 to its demo checks, demote a P0 no beat strictly needs, mark a peripheral edge `fake-ok`. Removing a beat is the user's decision and goes into the G2 round. Done when the Capacity line in SPEC.md shows P0 hours, builder-hours, and either a fit or the beat cut you will recommend.
6. **Finish SPEC.md.** Fill every remaining template section: out of scope (the pitch's list plus today's cuts), the fake-vs-real summary pointing at `hack/ARCHITECTURE.md`, and open questions. Done when a search of SPEC.md for `TBD`, `TODO`, `etc.`, and unfilled template placeholders finds nothing.
7. **Add the board rows.** Run one `scripts/hack add "<title>" --beat B2 --p P0 --size M --lane fe --deps F-01 --as product@<human>` per feature, in SPEC.md order with dependencies first; enabling cards omit `--beat`, which defaults to `—`. Show each command and the `added:` row it printed. When a printed ID differs from SPEC.md (a parallel role added a row meanwhile), change SPEC.md to match, because the board is the source of truth. Rows start as `todo` and stay reversible with `set` or `cut`. Done when `scripts/hack check` passes and every SPEC.md feature has a board row with the same ID, beat, priority, size, lane, and deps.
8. **Lock scope (G2).** Put one round to the user: the P0 list with sizes, the critical path, the capacity math, the cuts made, and your recommendation (approve, or one named cut). The captain may merge this round with `hack-design`'s direction pick. Before writing `Status: locked`, the user approves the P0 list in this session, because it fixes what every builder works on until freeze. Then run `scripts/hack decide "G2 scope: P0 = <ids> (<h> h vs <bh> builder-h) · why: <reason>" --as product@<human>`, replace the Status line with `Status: locked (<human>, <MM-DD HH:MM>, D-NN)`, commit `hack/SPEC.md` on `main` (`docs(spec): lock G2 (D-NN)`), rebase on `origin/main`, and push, because `scripts/hack status` reads the gates from `origin/main`; under `autonomy: local`, give the user the push command instead. Done when `scripts/hack status` reports the G2 spec lock as passed.
9. **Hand off.** Tell the captain: `hack-architecture` and `hack-design` take the beats now; each beat becomes one `beat("B<n>", …)` step in `e2e/golden-path.spec.ts`; builders claim cards after G2 with F-00 done, critical-path cards first; the storyteller starts the storyboard from these beats at 50%. Done when the captain or user has these next actions.

## Running without the user

A subagent cannot ask the user, and this skill is often dispatched to the product role. Run steps 1–7, then return the G2 round to the caller as a `needs-decision` report ([../hack/references/dispatch.md](../hack/references/dispatch.md)) and leave `Status: draft`; the captain asks the user and finishes step 8.

## Deliverable

```text
Spec: hack/SPEC.md · Status: locked (<human>, <MM-DD HH:MM>, D-NN) · commit <sha> · status shows G2 spec lock passed
Demo: <n> beats · read-aloud <m:ss> of <m:ss> · wow B<n> at <m:ss> (<pct>%) · delete test: <pass>
Features: P0 <n> (<h> h) · P1 <n> · P2 <n> · enabling <ids> · fake-ok <ids>
Critical path: F-00 → … → F-<nn> (wow) = <h> h · ends ~<HH:MM> vs 60% sync <HH:MM>
Capacity: P0 <h> h vs <bh> builder-h to freeze <HH:MM> · <fits | over by <h> h> · cuts: <list | none>
Board: added F-<aa>…F-<bb> · scripts/hack check: <result line>
Assumed: <lines | none>
Next: hack-architecture, hack-design consume beats · build after G2 with F-00 done
```

Every line cites a file or a command's output from this session.

## When blocked

- **The pitch is not locked:** route to `hack-grill`. Do not draft beats on a draft pitch.
- **P0 does not fit even after cuts:** ask in the G2 round which beat to drop, recommending the one with the least judging weight (never B1 or the wow), or narrowing the job further. The harden and ship phases are not a source of build hours ([timeline.md §Re-planning](../hack/references/timeline.md)).
- **The wow depends on an unproven capability** (no spike, or a failed one): add a 30-minute spike card at the head of the critical path, beat `—`, and name the fallback wow under open questions.
- **ARCHITECTURE.md or DESIGN.md conflicts with a beat:** change the beat or mark the edge `fake-ok`, keep the core real, record it with `scripts/hack decide`, and tell that role. If the conflict changes the wow moment, it is a G1 item: put it to the user in the G2 round.
- **A lane is not in HACKATHON.md:** the CLI rejects it; use an existing lane or ask the captain to add one.
- **`scripts/hack` is missing or fails:** write SPEC.md, list the exact `add` commands under open questions, and route to `hack-init`.
