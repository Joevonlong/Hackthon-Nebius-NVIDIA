---
name: hack-readme
description: Writes a hackathon project's GitHub README as the judges' landing page, plus the Devpost-style submission text. Covers the one-liner, problem, demo GIF and screenshots by beat, how it works, real vs mocked, a three-command quickstart, verified links, and a submission checklist the human submits from. Use for README, Devpost, submission form, or project page. Not for the demo video or GIF; use hack-video. Not for the live pitch; use hack-pitch.
license: MIT
---

# Hack README

**Answer** a judge's three questions within the first screen of the repository: who it is for, what changes for them, and is it real. The README and the submission text reuse the same words, every claim traces to the team's docs or the demo's real output, and the human presses submit. Read [../hack/references/principles.md](../hack/references/principles.md) first if this session has not.

## Inputs

- `hack/PITCH.md` (one-liner, persona and painful moment, before and after, why AI, name and tagline) and `hack/SPEC.md` (beats B1–B6, P1/P2 features).
- `hack/ARCHITECTURE.md` (mermaid diagram, stack, fake-vs-real matrix), `hack/DECISIONS.md` and the board log (challenges), `hack/BOARD.md` (what shipped, what was cut), `hack/DESIGN.md` (colors for any visuals).
- `hack/HACKATHON.md`: submission requirements and form fields, rules on repo visibility and pre-existing code, tracks and sponsor technology, `submission_language`, `prod_url`, `repo_url`, team, `submit_by`.
- Media: `hack/demo/shots/` from `scripts/smoke.sh <prod_url>`; `hack/demo/media/hero.gif` and `poster.png` from `hack-video`; the video link once the human has uploaded it.
- Repository facts: `package.json` scripts, `.env.example`, `LICENSE`, the first commit (`git log --reverse --format='%h %ad %s' | head -3`).

## Steps

1. **Skeleton at 50%.** From PITCH.md and SPEC.md write `README.md`: title, one-liner, problem, solution, features by beat, quickstart, and a labeled placeholder for every missing piece (`[MEDIA: hero GIF from hack-video]`, `[LINK: video]`). Merge it as a docs-only change. Done when the skeleton is on `main` and each placeholder names who fills it.
2. **Final README in the ship window.** Read [references/readme-template.md](references/readme-template.md) when filling it: hero, links row, problem, solution, demo, how it works, features by beat, real vs mocked, quickstart in at most three commands including demo mode, stack, challenges, what's next, team, license and credits. Write it in `submission_language`. Done when no placeholder remains except ones listed as open in the deliverable.
3. **Media.** Read [references/media.md](references/media.md) when choosing and preparing images: three beat screenshots at 1440×900 in demo mode, the hero GIF, alt text, light and dark themes, the size budget. Done when `du -h hack/demo/media/*` is within budget and each referenced image was looked at.
4. **Submission text.** Read [references/submission.md](references/submission.md) when writing `hack/demo/SUBMISSION.md`: tagline, the Devpost-style story sections, built-with tags, links, and the event's own fields from HACKATHON.md. Done when every field of the event's form has paste-ready text with its character count against the limit.
5. **Verify links and claims.** Check every URL in README.md and SUBMISSION.md with `curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" -L <url>`; the video with the YouTube oEmbed check in submission.md; the repo's visibility with `gh repo view --json visibility -q .visibility` against the rules; the quickstart by running it in a fresh clone and opening `?demo=1`. Trace each number and capability to a doc, a screenshot, or a cited source, as in `hack-pitch`. Done when a link table with status codes and a claims table with sources, both from this session, sit in SUBMISSION.md §Checks.
6. **Judge, 60 seconds.** Dispatch the judge role read-only with the rendered README (the GitHub page, or the file if the repo is private) and the rubric. It reads for 60 seconds, answers "who is it for, what changes, is it real?", scores the submission against the rubric, and lists fixes. It writes `hack/reviews/judge-submission-<MMDD-HHMM>.md`. Claude Code: dispatch `hack-judge` in the background · Codex: spawn `hack_judge`. Done when its three answers match PITCH.md and its fixes are applied or rejected with a reason.
7. **Merge.** README.md and `hack/demo/**` are docs: merge them by `merge_mode` after the L0 gate; after code freeze, with the captain's OK in the board log (`scripts/hack log "docs: README final <sha>"`). Done when `main` on the remote shows the final README and its images render.
8. **G3: hand over the submission.** Before making the repo public, submitting the form, or tagging a public repo, ask the human, because each is public and a submission cannot be taken back after the deadline. Give them SUBMISSION.md's checklist with each requirement's status and evidence, the paste-ready fields, and the time left to `submit_by`. The human submits; then log it with `scripts/hack log "G3 submitted <url>"` and add the submission URL to HACKATHON.md Links. Done when the human confirms the submission URL, or the checklist is handed over with the time left.

## Deliverable

```text
README: README.md at <sha> · first screen: one-liner, hero GIF, links row · open placeholders: <list or none>
Media: hack/demo/media/ · hero.gif <MB> · shots <files and sizes> · total <MB> (budget 15 MB)
Submission: hack/demo/SUBMISSION.md · tagline <n>/60 chars · fields <n> filled / <n> required
Links: <url → status>, one per link · video oEmbed <code> · repo visibility <PUBLIC|PRIVATE> (rules: <...>)
Quickstart: fresh clone <path> · <commands> → <what answered>
Claims: <n> listed, <n> sourced · removed: <list or none>
Judge: hack/reviews/judge-submission-<MMDD-HHMM>.md · who: <answer> · what changes: <answer> · real: <answer>
G3: <waiting for human, <hh:mm> left to submit_by | submitted <url> at <time>>
```

Each line cites a command output, a file, or a looked-at page from this session.

## When blocked

- **PITCH.md or SPEC.md unlocked at 50%:** write the skeleton from the latest drafts and label each section `Draft:`; revisit after G1 and G2.
- **No hero GIF or video yet:** use the wow screenshot as the hero and keep `[LINK: video]` as an open item; never link a video that is not uploaded.
- **A link fails:** prod down is red main for the integrator; a private video or repo goes to the human with the exact setting to change. Do not submit around it.
- **The rules want a public repo and it is private:** list it as a G3 checklist item for the human; first scan the full history (every commit, not only the current tree) for committed keys and `.env` files, and report what you find, because making it public exposes every past commit.
- **A claim has no source:** remove it or label it as a plan. Missing proof stays a visible placeholder, never an invented number.
- **Form fields unknown:** use the Devpost-style set in submission.md and ask the captain for the form link.
