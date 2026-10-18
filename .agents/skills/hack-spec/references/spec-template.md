# SPEC.md template

Read this when creating `hack/SPEC.md` in step 1 and when finishing it in step 6. Write in `doc_language`, with presenter lines in `submission_language`. Each feature gets its own `### F-NN` section, because dispatch briefs point builders at `hack/SPEC.md §F-NN`.

```markdown
# Spec: <name>

Status: draft

Pitch: hack/PITCH.md (locked, D-NN) · Demo length: <m:ss> · G2: <MM-DD HH:MM> · 60% sync: <MM-DD HH:MM> · Feature freeze: <MM-DD HH:MM>

## Demo script

| Beat | Time | Presenter says | Screen shows | Judge understands | Data |
|---|---|---|---|---|---|
| B1 | 0:00–0:20 | <line> | <screen and action> | <one thing> | <seed records> |

Wow: B<n> at <m:ss> (<pct>%) · Read-aloud: <m:ss> · Delete test: <pass | B1 rewritten>

## Features

| ID | Feature | Beat | P | Lane | Size | Deps | fake-ok |
|---|---|---|---|---|---|---|---|
| F-01 | <title exactly as on the board> | B1 | P0 | fe | S | F-00 | no |

### F-01: <title>

- Serves: B1 · <what the judge sees>
- Checks:
  1. Given <seed data>, <observable result>.
  2. <observable result>
- Fake: <what is mocked, or "none: real">
- Notes: <Assumed: …, or none>

## Critical path

F-00 → F-<nn> → F-<nn> → F-<nn> (wow, B<n>) = <h> h · earliest end <MM-DD HH:MM> · 60% sync <MM-DD HH:MM>

## Capacity

P0: <n> cards, <h> h (<n> S, <n> M) · slots: <n> · build hours: <h> · sleep: −<h> · builder-hours: <bh> · 60%: <h> h · <fits | over by <h> h>

Cuts made: <feature: change, or none>

## Out of scope

- <from PITCH.md>
- <cut while planning>: <why>

## Fake vs real

Real: <the AI capability and the wow core>. Faked edges: <edge (F-NN)>. Full table: hack/ARCHITECTURE.md.

## Open questions and assumptions

- Assumed: <assumption> · <who can confirm>
```

## The Status line

Keep exactly one Status line, directly under the title. `scripts/hack status` reports the G2 spec lock as passed when any line of the file on `origin/main` starts with `Status: locked`, so never write that phrase at the start of any other line.

At G2 the line becomes `Status: locked (<human>, <MM-DD HH:MM>, D-NN)`, using the approver's handle from `team` in HACKATHON.md and the ID `scripts/hack decide` printed.

## After the lock

- Scope changes go through the captain: `scripts/hack set F-NN …` or `scripts/hack cut F-NN --reason "…"`, plus `scripts/hack decide` for any P0 change. Then update the Features table and the feature's section to match the board.
- New cards found during build (bugs, missing states) are added by whoever finds them as `Fix: …` rows; add a `### F-NN` section only when a builder needs checks to work from.
- The demo script stays the reference for `e2e/golden-path.spec.ts`, the storyboard, and the pitch script; when a beat changes, say so in the board log so those owners follow.
