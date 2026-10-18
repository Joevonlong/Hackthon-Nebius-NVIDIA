---
name: hack-architecture
description: Designs a hackathon app's architecture during planning. Confirms or overrides the golden stack, maps folders to lanes, lands zod contracts and fixtures before lanes split, draws the diagram, decides what is faked versus real, runs 30-minute spikes, and writes hack/ARCHITECTURE.md. Use for stack, ownership, contracts, or spikes. Not for the AI pipeline, demo mode, or seed data; use hack-backend.
license: MIT
---

# Hack architecture

**Decide** the app's shape once, early, so every lane can build in parallel without touching the same files. That means the golden stack or a recorded override, one owner per folder, and contracts with fixtures on `main` before the first feature card is claimed. It applies the [principles](../hack/references/principles.md), above all "Contract first, parallel after" and "Fake the edges, never the core".

## Inputs

- **The locked pitch.** `hack/PITCH.md` gives the customer, the example person, the wow moment, the spike result, and what is out of scope.
- **The beats in `hack/SPEC.md`.** `hack-spec` writes them in parallel with this skill, so reconcile with whatever exists when you start.
- **Event facts** from `hack/HACKATHON.md`: required or sponsor tech, `lanes`, team skills, hours, the budget for paid services, `doc_language`, and `submission_language`.
- **The F-00 app** from `hack-init`, plus the deploy target if `hack-deploy` has already run.
- **When it runs.** This is the architect's skill, run in plan (12–20% of the clock). `hack-backend` follows with the AI pipeline, API, and data.

## Steps

1. **Frame the constraints.**
   - Before designing, confirm `hack/PITCH.md` carries `Status: locked`. A design built on an unlocked pitch is redone when the pitch moves, so if the line is missing, route to `hack-grill` and stop.
   - For each beat, list what the server must do: the input, the AI call, stored data, and external APIs. Add the tech the event requires.
   - Done when you have a beat → server-needs table. If SPEC.md has no beats yet, build the list from the pitch's demo story and label it `Assumed:`.
2. **Confirm or override the stack.**
   - Read [references/golden-stack.md](references/golden-stack.md) when choosing the stack, data rung, deploy target, or a Python sidecar.
   - Keep the golden path unless one of these forces a change: an event rule, a judging criterion, or a Python-only library the core needs. Pick the lowest data rung that survives the demo.
   - Record every override, the data rung, and the deploy target with `scripts/hack decide "<choice> · why: <reason>" --as architect@<human>`.
   - Before choosing anything that needs a paid plan, a new account, or spend beyond the event budget, ask a human. Money and accounts are human decisions.
   - Done when every Stack line in the doc reads either "golden" or a D-NN.
3. **Map folders to owners.**
   - Start from the golden folder layout and assign every glob to exactly one lane from `lanes`.
   - Copy the shared zone from [../hack/references/git-flow.md](../hack/references/git-flow.md) §Shared zone, plus anything else this app shares.
   - List the collision-prone files: the home page that several beats render on, navigation, `globals.css`, any registry or index file. Give each one a rule: split it into feature components, make it owner-only, or change it only through a shared-zone branch.
   - Done when no glob has two owners and every collision-prone file has an owner or a rule.
4. **Draw the diagram.**
   - Use one Mermaid `flowchart LR` with at most 12 nodes. Include the screens, route handlers, the LLM behind `LLM_BASE_URL`, the data store, the demo recordings, and external APIs. Draw faked nodes dashed. Labels are in `doc_language`.
   - Done when the block renders in a Markdown preview and every node appears in either the ownership map or the fake-vs-real matrix.
5. **Land the contracts first.**
   - Read [references/contracts.md](references/contracts.md) when writing schemas, fixtures, or route stubs.
   - Check the board for an existing contracts card first, since `hack-spec` may have added one. If there is none, add it: `scripts/hack add "Contracts, fixtures, and route stubs in lib/contracts" --p P0 --size S --lane be --deps F-00 --as architect@<human>`. Then claim it.
   - The card's branch holds four things:
     - the zod schemas with their inferred types
     - fixtures built around the named persona
     - route stubs that return those fixtures
     - every library the lanes will need, installed in this one lockfile change
   - Before any `fe`, `be`, or `ai` card is claimed, merge this branch to `main`. Every lane imports these types, and a late contract change breaks every open branch at once.
   - Done when the card is `done` with evidence: the merged SHA, `scripts/gate.sh` passing, and one stub answering a `curl` with fixture JSON.
6. **Decide what is fake.**
   - Fill the fake-vs-real matrix with one row per capability: real, seeded, faked, or cut. Each row that is not real gets the line the README will use to disclose it.
   - The AI capability the pitch claims is real. Demo-mode replays of recorded real outputs count as real, as long as the README discloses them.
   - Before marking anything on the core as seeded or faked, ask a human. It changes what the pitch may claim.
   - Done when every diagram node has a row and every non-real row has its disclosure line.
7. **Spike the unknowns.**
   - For each unproven assumption the core rests on, run a spike of at most 30 minutes. Typical unknowns: model quality on real input, an API's limits or auth, a library on the deploy target.
   - Work in a scratch folder outside the repo, or on a `spike/<slug>` branch that is never merged.
   - Independent spikes run in parallel as research helpers ([../hack/references/dispatch.md](../hack/references/dispatch.md)). Claude Code: background subagents · Codex: one batch of spawned subagents.
   - A failed or timed-out spike becomes a decision: switch approach, fake an edge, or narrow the beat.
   - Done when each spike has a one-line result in the Spikes section, backed by evidence (output, latency, cost), and each failure has a D-NN.
8. **Write ARCHITECTURE.md.**
   - Read [references/architecture-template.md](references/architecture-template.md) when creating or updating `hack/ARCHITECTURE.md`.
   - Write prose in `doc_language`; code identifiers stay in English. Leave the AI pipeline section to `hack-backend` with a pointer.
   - Treat the doc as a reversible draft: label unconfirmed choices `Assumed:` and keep going.
   - Commit and push it on `main` as a planning doc ([../hack/references/git-flow.md](../hack/references/git-flow.md) §Planning docs and gate locks).
   - Done when a search for `TBD`, `TODO`, and `<` placeholders finds hits only in the hack-backend sections.
9. **Hand off.**
   - Ask `hack-backend` to fill the AI pipeline, API, and Data sections from the merged contracts.
   - Give `hack-deploy` the target and data rung: `scripts/hack log "arch: deploy <target>, data rung <n> (D-NN)"`.
   - Tell the captain which contracts card gates the build.
   - Done when the log line appears in `scripts/hack status` and `hack-backend` has its brief.

## Deliverable

```text
Architecture: hack/ARCHITECTURE.md · commit <sha> · Assumed: <n> lines
Stack: golden | overrides D-NN, D-NN · data rung <0|1|2> · deploy <Vercel | Fly.io> (D-NN)
Contracts: F-<nn> merged at <sha> · gate ok in <n>s · curl <route> → <fixture name>
Ownership: <n> globs across <lanes> · shared zone + <extra paths> · collision rules <n>
Fake vs real: real <list> · seeded <list> · faked <list> · README lines drafted <n>
Spikes: <slug> → <result, evidence> | none
Next: hack-backend fills AI pipeline · builders claim after G2 and F-<nn> · hack-deploy target <x>
```

Every line cites a file, a SHA, or a command's output from this session.

## When blocked

- **The pitch is not locked.** Route to `hack-grill`. Do not design for a draft pitch.
- **No SPEC beats yet.** Design from the pitch's demo story, label it `Assumed:`, and reconcile once SPEC.md lands.
- **Unknown sponsor or event tech.** Search the web for the current docs and quickstart, then spike it (step 7). Name the docs you used in the Stack line.
- **The core spike fails.** Return `STATUS: needs-decision` with two options, such as narrowing the beat or changing the approach. Never fake the core silently.
- **Two lanes need one file.** Split it by feature or move it into the shared zone. Never leave it with two editors.
- **The event mandates another stack** (Python only, mobile, a sponsor SDK). Keep contracts-first and the ownership rules, express the schemas in that stack (pydantic, for example), and record the change with `scripts/hack decide`.
- **Running as a subagent.** You cannot ask the user. Finish the reversible steps, then return paid choices and core-fake choices as `needs-decision` ([../hack/references/dispatch.md](../hack/references/dispatch.md) §Report contract).
