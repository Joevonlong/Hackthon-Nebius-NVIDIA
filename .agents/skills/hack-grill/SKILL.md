---
name: hack-grill
description: Narrows a hackathon idea to one named customer, one painful moment, and one wow moment, and locks it in hack/PITCH.md at the G1 pitch gate. Use to brainstorm or pick an idea, score ideas against the judging rubric, or grill a pitch until it is narrow enough to build in a weekend. Not for the demo script or feature list; use hack-spec. Not for the stage pitch or Q&A; use hack-pitch.
license: MIT
---

# Hack Grill

**Narrow** a theme and a handful of loose ideas into one pitch a judge can repeat after 30 seconds: a named customer, a painful moment in their week, and an AI-powered before/after that reads from one screen and fits the hours left. Every later phase builds on this pitch, so the skill asks the user in rounds and runs in the main session.

## Inputs

- **Event facts** from `hack/HACKATHON.md`: theme, tracks and prizes, judging rubric with weights, sponsor or required tech, rules, team skills and hours, `start`, `submit_by`, `doc_language`, `submission_language`, and any API budget. If the file is missing, route to `hack-init` and stop.
- **The clock** from `scripts/hack timeline`: the grill window runs from 4% to 12% (G1), G2 is at 20%, feature freeze at 70%. Read [../hack/references/timeline.md](../hack/references/timeline.md) when the event is 8 hours or shorter.
- **The team's ideas** so far, in any form. None is fine.
- **An existing `hack/PITCH.md`.** Resume from it. If it already says `Status: locked`, any change is a post-G1 change: state its cost in hours against time left and continue only after the user accepts the trade.
- **Principles** in [../hack/references/principles.md](../hack/references/principles.md). This skill leans hardest on "Narrow beats broad", "Facts are the agent's job, decisions are the human's", and "Judges are users too".

Write `hack/PITCH.md` in `doc_language`. Give the one-liner, name, and tagline also in `submission_language` when it differs, because the storyteller copies them. Reply to the user in their language.

## Steps

1. **Load the event and open the draft.** Read the event facts and run `scripts/hack timeline`. Create `hack/PITCH.md` from [references/pitch-template.md](references/pitch-template.md) with `Status: draft`, so every answer survives lost context. Done when you can state, each from a file or command output, the grill deadline, the build hours from G2 to freeze, the two highest-weighted judging criteria, and any required sponsor tech.
2. **Diverge and score when there is no single idea.** With no idea or several, read [references/idea-scoring.md](references/idea-scoring.md): generate 5–10 candidates that include every idea the team brought, run the kill tests, score the survivors, and present the top three in one round with a recommendation. For a close call, dispatch the judge role read-only to pre-score the top two against the rubric. With exactly one idea, run the kill tests on it anyway. Done when the user has picked one idea, it passes every kill test, and the "Ideas considered" table in PITCH.md records the scores and the kills.
3. **Grill in rounds.** Read [references/grill-tree.md](references/grill-tree.md) before the first round. Ask the frontier of the design tree as numbered questions, at most four per round, each with your recommended answer. Facts are your job: read the docs, search the web, or dispatch a read-only research subagent (competitors, API limits and pricing, datasets, how the persona works today), and ask the rest of the frontier while a lookup runs. Decisions are the user's: put each one to them and wait. Answer every broad reply with a narrowing follow-up. After each round, write the answers into PITCH.md and recompute the frontier. Done when every node is settled by the user or, for nodes off the human list, labeled `Assumed:`, and PITCH.md reflects every answer.
4. **Spike the riskiest assumption.** As soon as the job and why-AI nodes settle, name the one assumption that sinks the demo if false (usually: the model gives good-enough output on realistic input) and run or dispatch a spike of at most 30 minutes in a scratch directory outside the app, while the rounds continue. Before calling a paid API beyond the budget in HACKATHON.md, ask the user, because spending is on the human list. On a fail, the next round re-narrows the job or the wow instead of faking the core. Done when PITCH.md records the input, the command or prompt, the observed output, and pass or fail.
5. **Run the 30-second test.** Give a fresh reader only the one-liner: dispatch the judge role read-only with no other context, or ask a teammate. The reader states who the customer is, what hurts, and what changes; on a miss, narrow the one-liner and test again with a new reader. Done when their words match PITCH.md on all three and are quoted in its "30-second test" line.
6. **Lock the pitch (G1).** Present one final round: one-liner, customer, painful moment, wow moment, demo story, out-of-scope list, name, and every `Assumed:` line, asking "approve, or what changes?". Before writing `Status: locked`, the user explicitly approves in this session, because every later phase builds on the pitch and a change after G1 costs hours of rework; silence is not approval. Then run `scripts/hack decide "G1 pitch lock: <one-liner> · why: <main reason>" --as product@<human>`, replace the Status line with `Status: locked (<human>, <MM-DD HH:MM>, D-NN)` using the ID the CLI printed, commit `hack/PITCH.md` on `main` (`docs(pitch): lock G1 (D-NN)`), rebase on `origin/main`, and push, because `scripts/hack status` reads the gates from `origin/main`. Under `autonomy: local`, give the user the push command instead. Done when `scripts/hack status` reports the G1 pitch lock as passed.
7. **Hand off.** Tell the captain or user that the plan phase starts now, in parallel: `hack-spec` (product), `hack-architecture` then `hack-backend` (architect), and `hack-design` (designer), all reading PITCH.md. Done when each next skill is named with its owner.

## Running without the user

A subagent cannot ask the user. If that is your situation, do not wait: return the current round and the PITCH.md path to the caller as a `needs-decision` report ([../hack/references/dispatch.md](../hack/references/dispatch.md)) and leave `Status: draft`. Claude Code: an Agent Teams teammate pane can ask the user directly · Codex: subagents cannot ask, so run this skill in the main session.

## Time box

The grill owns the window from 4% to 12%. Narrow instead of extending. When the deadline arrives with the frontier still open, ask one last round with only the human-list decisions (customer, painful moment, wow moment, name), take your recommendation for everything else as `Assumed:`, and go to G1. If the lock still slips, tell the captain the exact delay so it moves the later phase boundaries ([timeline.md §Re-planning](../hack/references/timeline.md)).

## Deliverable

```text
Pitch: hack/PITCH.md · Status: locked (<human>, <MM-DD HH:MM>, D-NN) · commit <sha> · status shows G1 passed
One-liner: For <persona> who <pain moment>, <name> <does X> so <outcome>.
Ideas: <n> generated · killed <idea: kill test> · picked <idea> <score>/5 · judge pre-score: <path | not run>
Rounds: <n> · facts looked up: <fact — source> · assumed: <lines | none>
Spike: <assumption> → <pass | fail> · <input> → <observed output> (<minutes> min)
30-second test: <reader> said "<their words>" → pass
Clock: grill window ended <HH:MM> · locked <HH:MM> (<on time | +<mm> min, narrowed by …>)
Next: hack-spec · hack-architecture → hack-backend · hack-design
```

Every line cites a file, a command's output, or the user's words from this session.

## When blocked

- **No judging rubric in HACKATHON.md:** read the rules page when a link is there; otherwise ask in the first round. Until it is answered, score with the idea-scoring defaults labeled `Assumed:`.
- **The team splits between two ideas:** dispatch the judge role on both, then recommend the one with the more nameable customer and the cheaper wow. The user still decides.
- **The spike fails, or the wow needs more than a day of infrastructure:** re-narrow (a smaller input domain, a different wow screen) or fall back to the runner-up from step 2. The core claim stays real ("Fake the edges, never the core").
- **The user is unavailable at G1:** leave `Status: draft` and tell the captain. F-00 and research continue; the plan phase starts at the lock, because hack-spec refuses an unlocked pitch.
- **`scripts/hack` is missing or fails:** append the decision to `hack/DECISIONS.md` by hand in its format, and route to `hack-init` to restore the scripts.
