---
name: hack-init
description: Sets up a repository for a weekend AI hackathon in minutes. Records event facts and the clock in hack/HACKATHON.md, scaffolds the golden-path app, adds the board, decision log, board CLI, 90-second gate, smoke test, and agent rules, and pushes main so the team can claim cards. Use at kickoff or to repair a broken hack setup. Not for choosing the idea; use hack-grill. Not for deploying; use hack-deploy.
license: MIT
---

# Hack init

**Scaffold** one repository the whole team and every agent can work in from minute twenty: event facts and clock, an app that runs, the board and its CLI, the gate, the smoke test, and the rules. Files are merged, never overwritten.

## Inputs

- The project folder: empty, an existing repo, or a fresh clone of the event's starter.
- Event facts: name, `start`, `submit_by` (≥ 30 min before the official deadline), `deadline`, languages, team with skills, rules page or link. Missing facts become one question round.
- Optional stack overrides from the event (required sponsor tech, Python only, mobile).

## Steps

1. **Collect facts.** Read any rules page or link the user gave. Ask for whatever is still missing in one numbered round with recommendations, using the kickoff list in [../hack/references/captain.md](../hack/references/captain.md). `start` and `submit_by` are required because the whole timeline hangs on them; everything else may be `unknown` with an owner. Done when start, submit_by, team, and lanes are known.
2. **Repository.** If the folder is not a git repository, `git init -b main`. Before creating a remote repository, ask the user for name and visibility (private unless the rules demand public), because it publishes code; then `gh repo create <name> --private --source . --remote origin`. Do not protect `main` against direct pushes: the board CLI commits there. Done when `git remote -v` shows `origin`, or the user chose to stay local.
3. **App.** If there is no `package.json`, scaffold the golden stack exactly as [../hack-architecture/references/golden-stack.md](../hack-architecture/references/golden-stack.md) says, or the event's required stack (record the override with `scripts/hack decide` after step 4). Add Playwright: `pnpm add -D @playwright/test && pnpm exec playwright install chromium`. Done when the dev server answers on port 3000.
4. **Scaffold.** From this skill's directory (the folder containing this SKILL.md), run `python3 scripts/init_project.py --target <repo> --event "<name>" --project <slug> --start <iso> --submit-by <iso> --deadline <iso> --doc-language <xx> --submission-language <xx>`. Add `--dry-run` first when the repo already has content. Resolve every "do by hand" line it prints. Done when the report lists no unresolved manual items.
5. **Fill the event file.** Complete `hack/HACKATHON.md`: lanes (one human per lane), team, judging rubric with weights, submission requirements, rules, `merge_mode` (`pr` with GitHub, else `direct`), `autonomy` (default `merge`). Run `scripts/hack timeline` and paste its output into the Timeline section. Done when rubric and submission requirements are filled, or marked unknown with the person finding out.
6. **Verify and publish main.** Run `scripts/gate.sh`. Commit `chore(F-00): hack-team scaffold`, push `main` to `origin` (the board CLI reads and writes `origin/main`), then run `scripts/hack check` and `scripts/hack status`. Done when status prints the phase from `origin/main`, or from local `main` for a local-only team.
7. **Give teammates the kit.** If anyone on the team lacks hack-team, vendor it into the repo with the kit's installer: `install.sh --project <repo>` from the kit checkout (two folders above this skill when installed by symlink or plugin). It copies skills and roles for Claude Code (`.claude/`) and Codex (`.agents/`, `.codex/`). Commit them. Done when a teammate's fresh clone lists the hack skills, or nobody needs them.
8. **Hand off.** F-00 goes to the integrator with `hack-deploy` now, in parallel with `hack-grill` in the main session. Done when F-00 is claimed and the grill has started.

## Deliverable

```text
Repo: <path> · origin: <url or local-only> · main pushed at <sha>
Clock: start <time> · submit_by <time> · deadline <time> · now in <phase>
Lanes: fe=<who> be=<who> ai=<who> infra=<who> design=<who> story=<who>
Checks: scripts/hack check → <output> · scripts/gate.sh → <ok in Ns>
Kit for teammates: <vendored at <sha> | everyone has it installed>
Next: F-00 → integrator (hack-deploy) · grill → <who> (hack-grill)
Unknowns: <facts still missing, each with an owner>
```

## When blocked

- No `python3`: install it (macOS ships it with the Command Line Tools) or have someone else run step 4; the board CLI needs it too.
- `create-next-app` or installs fail offline: scaffold from the event's starter or a teammate's machine; F-00 can still be planned.
- The repo already has `AGENTS.md`, `CLAUDE.md`, or `.gitignore`: the script merges into them. Read its "merged" list and check the result.
- Event times unknown: ask the organizers' channel; meanwhile assume the published schedule and label it `Assumed:` in HACKATHON.md.
