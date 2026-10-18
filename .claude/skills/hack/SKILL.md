---
name: hack
description: Runs a weekend AI hackathon from kickoff to submission. Reads the event clock and the in-repo board, reports phase, time left, and who is doing what, names the next skill or role, and carries the captain loop for the lead session. Use for "where are we", "what next", or to lead the team. Not for normal product work outside a hackathon; use the regular engineering skills.
license: MIT
---

# Hack

**Route** every hackathon moment to the one skill or role that moves the demo forward, and keep the clock, the scope, and the board honest. Read [references/principles.md](references/principles.md) once per session; every other hack skill assumes it.

## Inputs

- The repository root. `hack/HACKATHON.md` and `hack/BOARD.md` exist after `hack-init`.
- Optional: what the user just asked ("status", "next", "lead", a phase name).

## Steps

1. **Read state.** If `hack/HACKATHON.md` is missing, route to `hack-init` and stop. Otherwise run `scripts/hack status` and read its output: phase, time left to `submit_by`, next gate, board counts, active claims, stale claims, ready cards. Done when you can state phase, time left, and the next gate in one line each.
2. **Check the gates.** Compare the phase with the files present. G1 pitch lock means `hack/PITCH.md` carries `Status: locked`; G2 scope lock means `hack/SPEC.md` carries `Status: locked` and `hack/DESIGN.md` has a `Direction:` line naming a human-chosen direction (an `Assumed` one does not count); F-00 must be `done` before build work starts. A phase past its window with its gate open is the first thing to report. Done when each passed gate is confirmed by a file and each open one is named.
3. **Route.** Pick from the table below by phase, then by the most urgent open item: a red main, a missed gate, a P0 card unclaimed past `steal_after_minutes`, or a stale claim. Read [references/timeline.md](references/timeline.md) when the phase is unclear or the schedule needs re-planning. Done when you have one primary next action and at most two parallel ones, each naming a skill or role and an owner.
4. **Act or hand off.** When the user asked you to lead, follow [references/captain.md](references/captain.md). When dispatching helpers, use [references/dispatch.md](references/dispatch.md) for the brief and the runtime-specific way to start them. Otherwise run the routed skill now, or tell the user which skill to run and why. Done when the next action has started or the user has the exact command to start it.

| Phase (share of the window) | Primary skill | Role |
|---|---|---|
| kickoff 0–4% | `hack-init`, then `hack-deploy` for F-00 | captain, integrator |
| grill 4–12% | `hack-grill` (main session; it asks the user) | product |
| plan 12–20% | `hack-spec`, `hack-architecture`, `hack-backend`, `hack-design` in parallel | product, architect, designer |
| build 20–70% | `hack-build` per card; `hack-integrate` at sync points (30, 40, 50, 60%) | frontend-dev, backend-dev, integrator |
| harden 70–85% | `hack-polish`, `hack-integrate` (freeze), `hack-deploy` (demo mode) | designer, integrator, judge |
| ship 85–95% | `hack-video`, `hack-readme`, `hack-pitch` | storyteller, judge |
| submit 95–100% | `hack-readme` (submission), then the human submits | captain |

The storyteller starts `hack-readme` and the storyboard at 50% from `hack/SPEC.md`, so the ship phase only finishes them.

## Deliverable

```text
Phase: <phase> · <hh:mm> left to submit_by · next gate: <G1|G2|freeze|code freeze|G3> at <time>
Board: <n> P0 done / <n> P0 total · doing <n> · blocked <n> · stale <ids or none>
Main: <green|red since hh:mm> · prod: <url or not deployed>
Next: <skill or role> — <one-line reason> (owner: <name>)
Parallel: <up to two more, or none>
Risks: <cut candidates or gate risks, or none>
```

Each line cites `scripts/hack status` output or a file you read in this session.

## When blocked

- `scripts/hack` is missing or fails: read `hack/BOARD.md` directly, report the board by hand, and route to `hack-init` to restore the scripts.
- No `start` or `submit_by` in `HACKATHON.md`: ask the user for both before routing. The whole timeline depends on them.
- The user asks for work no phase covers, such as a new idea after G1: name the cost in hours against time left, and continue only after the user accepts the trade.
