---
name: hack-video
description: Produces a hackathon demo video from the frozen build. Storyboards the beats, captures the golden path in demo mode with Playwright, composes title cards, captions, punch-in zooms, and an architecture animation with HyperFrames, Remotion, or ffmpeg, and exports the full MP4, a 30-second teaser, and a README hero GIF. Use for demo video, screen recording, or trailer. Not for the live pitch; use hack-pitch. Not for README text; use hack-readme.
license: MIT
---

# Hack Video

**Show** the product working: every second of the video is real footage of the frozen build in demo mode, framed by cards and captions that say who it is for and what changes. Judges often watch muted and on a phone, so captions are always on. Read [../hack/references/principles.md](../hack/references/principles.md) first if this session has not.

## Inputs

- `hack/HACKATHON.md`: video rules (maximum length, platform, aspect, language, captions), `submission_language`, `prod_url`, the clock. A missing limit is asked once; until answered, target 2:00 and label it `Assumed:`.
- `hack/PITCH.md` (persona, painful moment, one-liner, wow moment), `hack/SPEC.md` (beats B1–B6), `hack/ARCHITECTURE.md` (mermaid diagram, fake-vs-real matrix), `hack/DESIGN.md` (colors, typography, wow moment). Reuse `hack/demo/PITCH-SCRIPT.md` lines when it exists.
- The frozen build on `prod_url` with demo mode (`?demo=1`), `scripts/smoke.sh`, and `e2e/golden-path.spec.ts` (one `beat()` step per beat; capture runs also write its timings).
- Tools present on this machine: the `hyperframes` skill, the `remotion-best-practices` skill, `ffmpeg`, Node 22 or newer.

Work lives in `hack/demo/STORYBOARD.md` and `hack/demo/video/`: `raw/` (Playwright output, emptied by every run), `takes/` (kept captures), `clips/` (trimmed beats), `project/` (composition source, committed), `renders/` (outputs). Only `project/` is committed; the hero GIF and poster go to `hack/demo/media/`.

## Steps

1. **Preflight.** From 50% of the event on. Record the video rules from HACKATHON.md and which composition tools exist: the `hyperframes` skill is installed and `npx hyperframes doctor --json` reports `"ok": true`; `remotion-best-practices` is installed; `ffmpeg -version` answers. Confirm `git check-ignore hack/demo/video/takes hack/demo/video/clips hack/demo/video/renders` prints all three, else add them to `.gitignore` in a small chore commit. If the board has a `story` card for the video, claim it: `scripts/hack claim F-xx --as storyteller@<human>`. Done when the rules, the chosen tool path, and its reason are at the top of STORYBOARD.md.
2. **Storyboard.** Read [references/storyboard.md](references/storyboard.md) when writing `hack/demo/STORYBOARD.md` from SPEC.md: frame table, captions, design tokens, teaser and GIF cuts. Present it to the team as a cheap draft and continue on labeled assumptions unless they asked to review first. Done when the frame table's total is at least 10 seconds under the limit and every row has its source and caption.
3. **Capture.** Before capturing, confirm feature freeze (70%) has passed and prod serves the frozen build, because footage of a moving build is re-shot. Read [references/capture.md](references/capture.md) before recording: `scripts/smoke.sh <prod_url> --capture`, takes, per-beat trims. Done when every beat has a clip in `clips/` from a take logged with its commit SHA, and a still per clip was looked at.
4. **Captions and voice.** Write the caption track from the storyboard; add a voice-over only if the team wants one (their own voice or local TTS, see compose.md). Voice timing sets scene length. Done when every spoken or shown sentence has a timed caption within the reading limits in storyboard.md.
5. **Compose.** Read [references/compose.md](references/compose.md) and take the first path that is available: HyperFrames (through the `hyperframes` skill, entry point first), else Remotion (with `remotion-best-practices`), else ffmpeg with image cards. Fonts and colors come from DESIGN.md. Done when a draft render exists in `renders/` and matches the storyboard row by row.
6. **Render checks.** Run the checks in compose.md §Checks on the draft: duration within the limit (`ffprobe`), 1920×1080, loudness, captions readable on a phone-size still, the first frame works as a thumbnail, no private data in any still. Done when each check has its command output or a looked-at still, or is marked `not run` with the reason.
7. **QA, at most two rounds.** Dispatch the judge role read-only with the draft (or its stills at every cut), STORYBOARD.md, the rubric, and the checks. It answers "who is it for, what changes, is it real?" from the first 15 seconds, then lists findings with timestamps and severity (critical, suggestion, nitpick). It writes `hack/reviews/judge-video-<MMDD-HHMM>.md`. Claude Code: dispatch `hack-judge` in the background · Codex: spawn `hack_judge`. Fix criticals, re-render, and repeat once. Done when no critical finding is open, or two rounds are spent and the open criticals go to the human.
8. **Export.** Render the delivery files from the approved draft: `renders/<project>-full.mp4`, `renders/<project>-teaser.mp4` (30 s), `renders/<project>.srt`, `hack/demo/media/hero.gif` (at most 8 MB), and `hack/demo/media/poster.png`. Re-run step 6 on each. Done when `ls -la` shows every file and each passed its checks.
9. **Hand over the upload.** Before uploading anywhere public (YouTube, Vimeo, Loom, Devpost), ask the human, because it publishes under their account and cannot be fully taken back. Prepare a title, a description with the prod URL and repo link, the SRT, the poster as thumbnail, and the visibility the event requires (often unlisted). The human uploads; then check the link (compose.md §Checks) and record it in HACKATHON.md under Submission requirements. Done when the link answers and plays, or the package is handed over with the time left to `submit_by`.

## Deliverable

```text
Video: hack/demo/video/renders/<project>-full.mp4 · <m:ss> (limit <m:ss>) · <w>x<h> · <fps> fps · <LUFS> LUFS
Teaser: <path> · <s> s · GIF: hack/demo/media/hero.gif · <MB> MB · Poster: hack/demo/media/poster.png
Captions: burned in + <path>.srt · phone-size still <path>
Source: build <sha> (frozen) · demo mode · takes <ids> · path <HyperFrames | Remotion | ffmpeg> because <reason>
Checks: <check: command output or still path>, one per check; not run: <list and why>
QA: round 1 hack/reviews/judge-video-<MMDD-HHMM>.md (<n> critical) · round 2 <stamp or none> · known issues <list or none>
Upload: <waiting for human | URL, oEmbed 200 at hh:mm>
```

## When blocked

- **Before feature freeze, or prod not on the frozen build:** finish the storyboard and cards; capture later. Past 85% with prod still moving, capture anyway and log the SHA per take.
- **A beat fails during capture:** that is red main; report it to the integrator. Never rebuild a screen by hand or mock it for the video, because faked behavior presented as real misleads judges.
- **`smoke.sh --capture` missing or broken:** a human records the beats with a screen recorder at 1920×1080 on a clean browser profile, following capture.md §Manual fallback.
- **HyperFrames usage reads low or unknown, or a render fails twice:** report it and fall back to the next path in compose.md; the ffmpeg path always finishes.
- **No ffmpeg:** ask the human to install it with their package manager; until then, ship the raw take with the SRT.
- **Over the limit:** cut card time and transitions first, then shorten beats; the wow beat keeps its full time.
- **No rights to a music track, font, or third-party clip:** leave it out. Silence with captions is fine.
