# Capture

Read this before recording footage for the video. Capture is deterministic: the same script, the same seeded demo data, the same frozen build, so any beat can be re-shot in three minutes and match the others. Commands were checked with ffmpeg 9.0.1 and Playwright 1.58 on 2026-10-17.

## Before the first take

- Feature freeze has passed and prod serves the frozen build. Record its SHA (`git rev-parse --short origin/main`, matched against the host's deployed commit).
- `scripts/smoke.sh <prod_url>` is green without `--capture`. A red beat is red main: report it to the integrator instead of filming around it.
- Demo data is reset to the story seed by the path ARCHITECTURE.md documents for demo mode.
- The UI shows nothing private: no real names or emails, no keys, no dev banner, sample data labeled the way the app labels it.

## Take

```bash
scripts/smoke.sh <prod_url> --capture
```

The `hack-init` template runs the golden path in demo mode with a 1920×1080 viewport and an explicit 1920×1080 video size (Playwright otherwise scales video down to fit 800×800), slowed actions, a drawn cursor (Playwright video shows none), cursor glides before clicks, and holds after each beat.

Each run copies its take out of `raw/` (which Playwright empties on every run) to `hack/demo/video/takes/take-<MMDD-HHMM>.webm`, with `take-<MMDD-HHMM>.beats.json` beside it: the start and end second of every beat, from the `beat()` helper in `e2e/golden-path.spec.ts`. Capture screenshots go to `hack/demo/shots/capture/`, so the 1440×900 README shots in `hack/demo/shots/` stay untouched.

## Check the take

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate:format=duration -of default=nw=1 hack/demo/video/takes/take-<stamp>.webm
```

Expect `width=1920` and `height=1080`. Then find the beat boundaries in `take-<stamp>.beats.json`; check them, or find them when the file is missing, with a contact sheet with one tile per second (tile n, counted row by row from 0, is second n; each sheet holds 64 seconds):

```bash
ffmpeg -i hack/demo/video/takes/take-<stamp>.webm -vf "fps=1,scale=320:-2,tile=8x8" hack/demo/video/takes/take-<stamp>-sheet-%02d.png
```

Look at the sheets. Reject a take where a beat shows a spinner that never resolves, the wrong state, a layout jump, or anything private.

## Takes log

Keep it at the bottom of STORYBOARD.md:

| Take | File | Build | Good beats | Notes |
|---|---|---|---|---|
| 1 | takes/take-1019-0310.webm | a1b2c3d | B1–B3, B5 | B4 model reply cut off |

Re-take by re-running the whole capture (the golden path fits in three minutes) and keep the best take per beat. Mix beats from different takes only when they share the build SHA.

## Trim per beat

```bash
ffmpeg -ss 12.4 -to 19.8 -i hack/demo/video/takes/take-<stamp>.webm -an -r 30 \
  -c:v libx264 -crf 18 -pix_fmt yuv420p hack/demo/video/clips/B2.mp4
```

- Name clips by beat (`B2.mp4`, `B4-wow.mp4`) and write the in and out points into the frame table's Source column.
- Speed up navigation or waiting, never the wow: add `-vf "setpts=PTS/1.75"` to that trim. If the pitch claims speed, keep real time.
- Cut dead air longer than about 1.5 s by trimming it out (heuristic).
- A still for a punch-in source, the poster, or a QA check:

```bash
ffmpeg -ss 15.2 -i hack/demo/video/takes/take-<stamp>.webm -frames:v 1 hack/demo/video/clips/B4-still.png
```

Look at one still per clip before composing. A clip is done when its still shows the state the storyboard row names.

## Address bar and real browser

Playwright records the page only, without browser chrome. Put the prod URL on the title and close cards. If the event's rules require the URL or a real browser to be visible, use the manual fallback.

## Manual fallback

When `--capture` is missing or broken, a human records:

- A clean browser profile, no extensions, bookmarks bar hidden, notifications off (macOS: Focus · Windows: Do not disturb).
- Display or window at 1920×1080, browser zoom fixed for every take.
- Screen recorder at 1080p (macOS: Shift-Command-5 · Windows: Snipping Tool screen recording); a recorder that cannot hold 1080p without dropped frames records at 30 fps instead.
- Follow SPEC.md beat by beat: move the cursor on short direct paths, pause about 0.5 s before each click, hold 2–3 s on each result (heuristics).
- Copy the file to `hack/demo/video/takes/` and trim as above.

## Provenance

Log per take: build SHA, `?demo=1` or live, viewport, tool, date. If the video uses demo mode, the README and submission say that demo mode replays recorded outputs of the real pipeline.
