---
name: hack-pitch
description: Prepares a hackathon team's live pitch and demo for the judges. Writes a timed pitch script mapped to the judging rubric, a Q&A bank with 30-second answers, and a live-demo runbook with preflight and recovery lines, then rehearses against the clock with a judge review. Use for pitch prep, demo day, stage demo, or judge Q&A. Not for the idea or one-liner; use hack-grill. Not for the recorded video; use hack-video.
license: MIT
---

# Hack Pitch

**Rehearse** until the pitch fits the time limit, hits every judging criterion at a named moment, and survives a failed click. Every line comes from the team's own docs and the demo's real output; read [../hack/references/principles.md](../hack/references/principles.md) first if this session has not.

## Inputs

- `hack/PITCH.md`: one-liner, persona and example person, painful moment with its cost source, why AI, wow moment, judging map, tagline. Without it, route to `hack-grill`.
- `hack/SPEC.md`: demo beats B1–B6 with Presenter says, Screen shows, Judge understands. Without it, route to `hack-spec`.
- `hack/HACKATHON.md`: judging rubric with weights, demo format and length, Q&A length, `submission_language`, `prod_url`, team. A missing time limit is asked once; until answered, assume 3:00 pitch plus 2:00 Q&A and label it `Assumed:`.
- `hack/ARCHITECTURE.md` (diagram, fake-vs-real matrix), `hack/DECISIONS.md`, and the newest files in `hack/reviews/`, for honest answers.
- Real output: the prod URL in demo mode (`?demo=1`) and `hack/demo/shots/` from the latest `scripts/smoke.sh <prod-url>` run.
- People: who talks, who clicks, whose laptop presents. Ask the captain when the team list does not say.

## Steps

1. **Set the frame.** Write the header of `hack/demo/PITCH-SCRIPT.md`: time limit, Q&A length, format (stage, remote call, or booth), talker, driver, every rubric criterion with its weight, and the spoken-word budget from [references/pitch-script.md](references/pitch-script.md). Done when every criterion is listed with its weight and the budget is a number.
2. **Write the script.** Read [references/pitch-script.md](references/pitch-script.md) when drafting: hook with the persona's painful moment, one-liner, live demo by beat with the wow at 60–70% of the runtime, how it works in one diagram and one sentence about the AI, impact, close with the one-liner and the ask. Write it in `submission_language`. Done when the spoken words fit the budget (count them, for example `wc -w` on the spoken lines) and the judging map gives every criterion a moment with a time.
3. **Source every claim.** List each number, name, and capability the script says aloud with its source: a screenshot path, a URL in demo mode, a citation in PITCH.md, or the fake-vs-real matrix. A claim without a source is cut or reworded as a plan ("we expect", with the reason), never stated as a result. Done when the Claims table in PITCH-SCRIPT.md has no unsourced row.
4. **Write the Q&A bank.** Read [references/qa-bank.md](references/qa-bank.md) when writing `hack/demo/QA.md`. Done when the standard questions plus one per rubric criterion each have an answer of at most 30 seconds drawn from the docs, a source, and the teammate who answers it.
5. **Write the runbook.** Read [references/live-demo-runbook.md](references/live-demo-runbook.md) when writing `hack/demo/RUNBOOK.md`. Before changing anything on the presenting laptop or account (notifications, display, browser profile, network), ask its owner, because it is their device; the runbook tells them what to set. Done when it holds preflight at T-30, T-10, and T-2, the demo-mode decision rule, a recovery line per beat, the backup video's local path with a timestamp per beat, and who clicks and who talks.
6. **Rehearse with a timer, at least twice.** The talker runs the script on the prod URL with the runbook while someone times each section and notes stumbles; a screen recording with audio gives exact timestamps. With no human available, run a labeled dry run instead: walk the beats on the prod URL, time the waits (page loads, model responses), and add the spoken words at 140 per minute. Log every run in PITCH-SCRIPT.md §Rehearsals. Done when two timed runs are logged and the last ends at least 10 seconds under the limit.
7. **Judge review.** Dispatch the judge role read-only with the rubric, PITCH-SCRIPT.md, the rehearsal log or recording, QA.md, and RUNBOOK.md. It scores each criterion on the event's scale with a line or timestamp as evidence, names the three fixes worth most points, and fires five questions the bank does not cover. It writes `hack/reviews/judge-pitch-<MMDD-HHMM>.md`. Claude Code: dispatch `hack-judge` in the background · Codex: spawn `hack_judge`. Done when the review file exists with a score per criterion.
8. **Fix and re-time.** Apply the judge's fixes, add the new questions to QA.md, re-run step 3 for any changed claim, and re-time the changed sections. Cut words, never beats: removing a demo beat is the human's call through the captain. Done when the final timing is logged within the limit and each judge fix is applied or rejected with a reason in §Changes.

## Deliverable

```text
Script: hack/demo/PITCH-SCRIPT.md · <n> spoken words / budget <n> · limit <m:ss> · wow at <m:ss> (<pct>%)
Rubric map: <criterion (weight) → moment @ m:ss>, one per criterion
Claims: <n> listed, <n> sourced · cut or reworded: <list or none>
Rehearsals: run 1 <m:ss> <notes> · run 2 <m:ss> <notes> · margin <s> · <human | dry run>
Q&A: hack/demo/QA.md · <n> questions · owners <names>
Runbook: hack/demo/RUNBOOK.md · mode <demo=1 | live, by rule> · backup <local path> · driver <name> · talker <name>
Judge: hack/reviews/judge-pitch-<MMDD-HHMM>.md · <criterion score list> · fixes applied <n>/<n>
Open: <decisions or tasks left for the human, or none>
```

Each line cites a file, a command output, or a timed run from this session.

## When blocked

- **PITCH.md or SPEC.md missing or unlocked:** write nothing final; route to `hack-grill` or `hack-spec` and report the gate as open.
- **A beat fails on prod during rehearsal:** report it to the integrator as red main, switch the runbook to demo mode or the backup video for that beat, and keep the beat in the script; never narrate a screen the product cannot show.
- **No backup video yet:** record one with `scripts/smoke.sh <prod-url> --capture` and copy the take onto the presenting laptop; `hack-video` replaces it with the edited cut.
- **The team wants to say a number with no source:** leave it out or say it as a hypothesis with the reasoning, and log the request in §Claims.
- **Still over time after two rehearsals:** shorten the hook, how it works, and impact first; the wow beat keeps its full time.
