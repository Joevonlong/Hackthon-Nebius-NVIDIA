# Timeline

Phases are shares of the window from `start` to `submit_by` in `hack/HACKATHON.md`. `scripts/hack timeline` prints the absolute times; `scripts/hack status` prints the current phase.

| Phase | Share | Exit condition |
|---|---|---|
| kickoff | 0–4% | Event facts in HACKATHON.md, repo scaffolded, lanes assigned, F-00 deploy started |
| grill | 4–12% | **G1 pitch lock**: PITCH.md `Status: locked` |
| plan | 12–20% | **G2 scope lock**: SPEC.md `Status: locked`, DESIGN.md direction chosen, contracts merged, F-00 `done` |
| build | 20–70% | Sync points at 30, 40, 50, 60%. All P0 cards done or cut by 70% |
| harden | 70–85% | **Feature freeze** at 70%. Polish pass, judge demo review, demo mode verified on prod |
| ship | 85–95% | **Code freeze** at 90%. Video rendered, README final, pitch rehearsed |
| submit | 95–100% | **G3**: a human submits by `submit_by`; the official `deadline` is the hard stop |

## Worked examples

**24-hour event** (Sat 10:00 → Sun 10:00, `submit_by` Sun 09:30; window 23.5 h):
kickoff 10:00–10:56 · grill → 12:49 · plan → 14:42 · build → 02:27 (syncs 17:03, 19:24, 21:45, 00:06) · freeze 02:27 · harden → 05:58 · code freeze 07:09 · ship → 08:19 · submit → 09:30.

**36-hour event** (Fri 18:00 → Sun 06:00, `submit_by` Sun 05:00; window 35 h):
kickoff → 19:24 · grill → 22:12 · plan → Sat 01:00 · build → Sat 18:30 · freeze Sat 18:30 · harden → Sat 23:45 · code freeze Sun 01:30 · ship → Sun 03:15 · submit → Sun 05:00.

**Short event** (8 hours or less): merge grill into kickoff (30 min total), plan in 30 min with one designer pass, one sync point at 50%, freeze at 75%, no video unless required (record a screen capture instead).

## Sync points

At each sync point the integrator runs `hack-integrate` and the captain re-scopes:

- 30%: contracts and F-00 proven on prod; every lane has merged something.
- 40%: first demo beat works end to end on prod (real AI, not fixtures).
- 50%: half the P0 beats work on prod. Storyteller starts the README skeleton and storyboard. If fewer than a third of P0 cards are done, cut now.
- 60%: all P0 beats exist on prod, even if rough. Anything not started is cut or faked.

## People and sleep

- Nobody owns a P0 card alone overnight. Hand off with a board log line and a pushed branch.
- Before sleeping, a human may leave agents working on cards that are reversible and bounded: set `autonomy: branch` in HACKATHON.md so agents push branches but do not merge, and review them on waking.
- Sleep is scheduled, not skipped: in a 24–36 h event, each person sleeps 3–5 h in the build phase, staggered so one human is awake at each sync point.
- The person who pitches sleeps before the ship phase.

## Re-planning

When the clock slips, move the remaining phase boundaries, never the freeze or `submit_by`. A late G2 shortens build; it never shortens harden and ship below 15% and 10% of the window. Record the new times as a decision (`scripts/hack decide`).
