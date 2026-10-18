# Dispatch

How the lead session hands work to helpers in Claude Code and Codex. The board stays the source of truth in every mode; a runtime task list only mirrors it.

## Roles

| Role | Claude Code agent | Codex agent | Skills it uses |
|---|---|---|---|
| captain | `hack-captain` | `hack_captain` | hack, hack-init, hack-integrate |
| product | `hack-product` | `hack_product` | hack-grill, hack-spec |
| architect | `hack-architect` | `hack_architect` | hack-architecture, hack-backend |
| designer | `hack-designer` | `hack_designer` | hack-design, hack-polish |
| frontend-dev | `hack-frontend-dev` | `hack_frontend_dev` | hack-build |
| backend-dev | `hack-backend-dev` | `hack_backend_dev` | hack-build, hack-backend |
| integrator | `hack-integrator` | `hack_integrator` | hack-integrate, hack-deploy |
| storyteller | `hack-storyteller` | `hack_storyteller` | hack-pitch, hack-video, hack-readme |
| judge | `hack-judge` | `hack_judge` | read-only review against the rubric |

In plugin mode, Claude Code shows agents as `hack-team:hack-<role>`.

## Pick a mode

1. **Several humans**: each person runs Claude Code or Codex in their own clone and lane. Coordinate through the board only.
2. **Claude Code, Agent Teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): "Spawn a teammate using the hack-frontend-dev agent type to build F-03" plus the brief. Teammates can talk to the user in their pane, so product and designer roles can run here.
3. **Claude Code, subagents**: dispatch the role with the brief, in the background; builders get `isolation: worktree`. Subagents cannot ask the user anything.
4. **Codex, subagents**: "Spawn hack_frontend_dev for F-03 and hack_backend_dev for F-04 in parallel" plus one brief each. Codex returns when all finish, so dispatch one batch per sync interval. Builders run `scripts/hack wt F-xx` first and work only inside that path.

Parallelism limit: at most one builder per card, and no more builders than lanes with ready cards. Two to four builders is the useful range for one machine.

## Brief

Paste this, filled in, into every dispatch. Point at files; do not paste their contents.

```text
ROLE: frontend-dev
GOAL: F-03 <title> — demo beat B2
WORKDIR: run `scripts/hack wt F-03` unless the runtime already isolated you
READ: AGENTS.md (hack block); hack/SPEC.md §F-03; lib/contracts/<file>; hack/DESIGN.md
DONE WHEN: <the card's demo checks from SPEC.md>
VERIFY: scripts/gate.sh; screenshot of B2 at http://localhost:3003
TIMEBOX: <minutes>; at 1.5× stop and report
DON'T TOUCH: <other lanes' globs>; the shared zone without a separate branch
MERGE: autonomy=<…>, merge_mode=<…> from hack/HACKATHON.md
REPORT: ≤ 20 lines, ending with STATUS: done | blocked | needs-decision
```

## Report contract

Every helper ends with at most 20 lines:

```text
F-03 · merged 9f1c2ab · gate ok 71s · B2 screenshot hack/demo/shots/F-03-B2.png
Board: done (evidence posted)
Noticed: empty state for zero clauses is missing (not in scope; suggest Fix card)
Assumed: riskScore 0–100 integer (contract says number)
STATUS: done
```

`needs-decision` reports end with the decision as one numbered question and a recommended answer, so the lead can ask the user in the grilling format.

## After a report

Trust files over reports. Before telling the user a card is done, check the board row, the merged commit on `origin/main`, and the evidence path. A report that claims done without evidence goes back to its author.
