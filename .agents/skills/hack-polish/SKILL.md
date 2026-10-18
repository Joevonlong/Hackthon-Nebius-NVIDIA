---
name: hack-polish
description: Runs a judge's-eye polish pass on a hackathon demo path after feature freeze. Screenshots every beat at projector sizes, checks the 5-second read, visual craft, AI loading and error states, and copy, ranks findings P0–P3, and lands P0/P1 fixes with before/after shots. Use for "polish the demo" or "does this look good enough". Not for choosing the look (use hack-design) or the pitch and video (use hack-pitch, hack-video).
license: MIT
---

# Hack Polish

**Judge-eye** the demo path: look at every beat the way a judge meets it, on a projector, without narration, among dozens of other projects, and fix only what would confuse or underwhelm them while the freeze window lasts. Screens off the path are out of scope.

Read [../hack/references/principles.md](../hack/references/principles.md) once per session; this skill applies **Polish the path**, **Cut scope, not quality**, and **Evidence over claims**.

## Inputs

- `hack/DESIGN.md` (direction, tokens, Screen map, Wow moment), `hack/SPEC.md` (beats B1–B6), `hack/PITCH.md` (persona, one-liner).
- `hack/HACKATHON.md`: judging rubric, `prod_url`, `submission_language`, `autonomy`, `merge_mode`.
- The build: `prod_url`, or `main` running locally when prod is behind, always in demo mode (`?demo=1`).
- `scripts/smoke.sh`, `scripts/gate.sh`, `scripts/hack`, and earlier `hack/reviews/polish-*.md` whose open findings you re-check.

## Steps

1. **Confirm the window.** Run `scripts/hack status`. The pass belongs to harden (70–85%), after feature freeze is announced; earlier, run it as a dry run that files cards instead of fixing. Note the time to the end of harden (85%) and to code freeze (90%). Done when phase, both times, and the build's commit SHA head the report draft.

2. **Shoot the path.** Run `scripts/smoke.sh <url>`; it walks the golden path in demo mode and writes one screenshot per beat to `hack/demo/shots/`. Then capture every beat at 1280×720 and 1920×1080 into `hack/demo/shots/polish-<MMDD-HHMM>/`, plus the wow beat mid-build and settled, and each AI state the screen map lists (loading, streaming, error) that smoke does not stop on. If `smoke.sh` takes no viewport option, use any browser-automation capability (for example `npx playwright screenshot --viewport-size="1280,720" <url> <file>`). Open every image; retake blank or mid-transition shots. Done when every beat has both sizes, and anything not captured is listed with the reason.

3. **Read it as a judge.** Read [references/judge-eye.md](references/judge-eye.md) when judging the shots, and run its tests on the 1280×720 set: five-second read, logic without narration, wow as the climax, first ten seconds, back of the room, and rubric coverage. Done when each beat has a one-line verdict and a pass or fail on each test.

4. **Check the craft.** Read [references/polish-checklist.md](references/polish-checklist.md) when checking craft, and walk each beat in the running build as well as the shots: hover, focus, console, layout shift, reduced motion. Run the searches in [../hack-design/references/anti-slop.md](../hack-design/references/anti-slop.md). Done when every checklist area has a result per beat or `n/a`.

5. **Rank the findings.** **P0** breaks a beat or leaves a judge confused or doubting the claim. **P1** visibly weakens a beat. **P2** is friction or inconsistency a judge might notice. **P3** is a nitpick. Each finding names the beat, element, and state, the evidence (screenshot path or console line), a concrete fix, and a size (S up to 30 minutes, M up to 90). Done when every finding has a location, evidence, a fix, and a size, and the list is sorted.

6. **Get a judge's score (optional, recommended).** Dispatch the judge role read-only with the 1280×720 shots in beat order, the rubric, and DESIGN.md, but not the build transcript, and ask for the critique scoring in judge-eye.md. Claude Code: dispatch the `hack-judge` agent in the background · Codex: spawn `hack_judge`. Fold each MUST_FIX into your list at P0 or P1. Done when the scores and MUST_FIX list are in the report, or it says `skipped: <reason>`.

7. **Write the report.** Save `hack/reviews/polish-<MMDD-HHMM>.md`: header from step 1, judge's-eye verdicts, findings by severity with screenshot paths, judge score, and a fix plan within the time left. Copy the shots it cites into `hack/demo/media/polish/` so teammates and the judge can open them; `hack/demo/shots/` is not committed. Commit it on `main` and push, as planning docs and reviews are ([../hack/references/git-flow.md](../hack/references/git-flow.md) §Planning docs and gate locks). Done when the report is committed and every cited path exists.

8. **Fix by budget.** After freeze, fix P0 and P1 only; P2 and P3 stay in the report. Per fix: add a `Fix: …` row, the one kind of new row the board takes after freeze (`scripts/hack add "Fix: …" --beat B3 --p P0 --size S --lane design`), claim it, and work on `fix/F-xx-<slug>` with commits like `fix(F-xx): label payoff number with unit`. Token or global CSS changes are shared zone and get their own small branch. Before merging any fix after freeze, `scripts/gate.sh` and `scripts/smoke.sh` pass and the integrator OKs it in the board log, because a polish fix that breaks a beat costs more than it gains ([../hack/references/git-flow.md](../hack/references/git-flow.md)). Stop starting P1 fixes at 85%; after code freeze (90%), only fixes for a broken beat, with the captain's approval. Done when every P0 is fixed or accepted by the captain with a decision line, and each fixed card is `done` with evidence.

9. **Re-shoot and close.** Run smoke on the deployed result, capture each fixed element again at the same size and state, and pair before and after in the report, marking each finding fixed, open, or accepted. Done when every fixed finding has a before path, an after path, and the smoke result line.

## Deliverable

```text
Polish <MMDD-HHMM> · build <sha> on <url>?demo=1 · <hh:mm> to end of harden · <hh:mm> to code freeze
Shots: <n> beats × 1280×720 + 1920×1080 → hack/demo/shots/polish-<MMDD-HHMM>/ · not captured: <list | none>
Judge's eye: five-second <n>/<N> · logic unnarrated <n>/<N> · wow is the climax: <yes | no, why>
Findings: P0 <n> · P1 <n> · P2 <n> · P3 <n> → hack/reviews/polish-<MMDD-HHMM>.md
Judge score: <composite>/10 · MUST_FIX <n> · ship bar met: <yes | no> (or skipped: <reason>)
Fixed: F-xx <title> · <sha> · smoke <result line> · before <path> → after <path>
Open: <P0/P1 not fixed, each with the captain's decision>
```

Every line cites a screenshot, a command's output, or a file from this session.

## When blocked

- **Prod is down or demo mode fails:** that is a P0 for the integrator (`hack-deploy`, `hack-integrate`); review `main` locally meanwhile and say which URL you used.
- **Smoke fails on a beat that passed before:** main is red; follow the red-main procedure in git-flow.md and leave that beat until it is green.
- **No screenshot capability:** ask a human for the captures, or review from the code and supplied screenshots, and label those checks `by inspection`.
- **A finding needs a new screen or feature:** it is not polish. Hand it to the captain as a scope decision.
- **A finding contradicts DESIGN.md:** DESIGN.md wins unless following it causes a P0; then change DESIGN.md first, with a decision line.
- **The fix budget is spent:** stop, list what remains by severity, and never start a fix that cannot pass smoke before code freeze.
