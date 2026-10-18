# Storyboard

Read this when writing `hack/demo/STORYBOARD.md`. The storyboard is the cheap, reviewable version of the video: a frame table anyone can correct in a minute, written from SPEC.md at 50% and finished against real footage after freeze.

## Header

```markdown
# Storyboard · <project>

This video tells hackathon judges that <PITCH.md one-liner>.
Limit <m:ss> (HACKATHON.md) · target <m:ss> · 1920×1080, 16:9 · <submission_language> · captions burned in
Voice: <captions only | team voice-over | local TTS> · Music: <none | licensed track and its license>
Look: display <font>, body <font>, background <colors.background>, text <colors.text>, accent <colors.accent> (DESIGN.md)
Build: <sha, filled at capture> · Path: <HyperFrames | Remotion | ffmpeg> because <reason>
```

## Structure

Shares hold for 1:30–3:00; scale to the target.

| Section | At 2:00 | Content |
|---|---|---|
| Title and problem | 0:00–0:15 | Product name, then the example person's painful moment with its cost (PITCH.md, with source) |
| Solution | 0:15–0:22 | The one-liner on screen and in the caption |
| Product, beat by beat | 0:22–1:30 | Footage of B1–B6 in order; punch-in zooms on the wow beat |
| How it works | 1:30–1:45 | The ARCHITECTURE.md diagram drawn node by node, the AI node highlighted, one sentence on what is real |
| Impact and close | 1:45–2:00 | Before and after in the persona's units, prod URL in large type, a QR code to it, team names |

- The first 10 seconds say who it is for and what changes (principle **Judges are users too**). The first frame works as a thumbnail: product name and the persona's outcome on a DESIGN.md background, never a black frame.
- The value lands by the second section; everything after is evidence. The wow beat sits at about 60–70% of the runtime, as in the live pitch.
- One idea per shot. A row whose purpose cannot be traced to the one-liner is cut.

## Frame table

| # | Time | Beat | Visual | On-screen text | Narration / caption | Transition | Source |
|---|---|---|---|---|---|---|---|
| 1 | 0:00–0:04 | Title | Name on background | "Tally" + tagline | — | cut | card |
| 2 | 0:04–0:15 | Problem | Mia's inbox, 38 unread | "38 invoices every Monday" | "Mia keeps the books for 14 restaurants…" | push left | clips/B1.mp4 0:00–0:11 |
| 7 | 1:12–1:24 | B4 wow | Duplicate lines, punch-in 1.7× | "€1,240 billed twice" | "…the same delivery, billed twice." | zoom out | clips/B4.mp4 0:03–0:15 |

Examples are the fictional Tally demo from `hack-spec`. Source is a card, or a clip with in and out points. Times are placeholders until real clips and any voice-over exist; audio sets the final timing.

## Captions

- Always burned in, because judges watch muted; also export an SRT for the upload platform.
- At most 2 lines and about 42 characters per line, and at most about 20 characters per second of display time (Netflix English timed-text style guide).
- Caption text about 48–56 px at 1080p, roughly 5% of frame height, so it reads on a phone (heuristic). Headlines on cards about 64–120 px.
- Bottom safe area by default; move to the top when the action on screen is at the bottom. Never cover the element the beat is about.
- Captions say what the viewer sees or just saw, in `submission_language`. Numbers in captions come from the footage or a cited source.

## Voice

- Voice-over is optional; captions alone are fine. About 2.5 spoken words per second (150 per minute) leaves room for the picture (heuristic).
- Write it as spoken sentences; act first on screen, then say what happened.
- A teammate's voice needs their consent. A TTS voice is disclosed where the event asks. Never imitate a recognizable person.

## Punch-ins and pacing

- Zoom by subject (heuristic): a panel about 1.4×, a row about 1.7×, a single value about 2×. Zoom in before the moment, hold through it, zoom out.
- Speed up navigation and waiting about 1.5–2×; keep the wow at 1×. If speed is part of the claim, show real time.
- Cut dead air longer than about 1.5 s (spinners, hesitation).
- Pick one signature move (a zoom, a highlight sweep) and use it once, at the wow.

## How-it-works animation

- Draw the ARCHITECTURE.md mermaid diagram in data-flow order, at most about 7 nodes on screen.
- Highlight the AI step in `colors.accent`; label sponsor or required technology by name when the rubric rewards it.
- One caption sentence: what goes in, what the model does, what comes out, and that the core is real while named edges are mocked.

## Teaser and GIF

- **Teaser, 30 s:** problem (5 s), one-liner (3 s), the wow beat (15 s), URL and QR (7 s). Same captions, no new claims.
- **Hero GIF, 6–10 s loop:** the wow moment only, no audio, about 960 px wide, at most 8 MB. Start and end on similar frames so the loop does not jump.
- **Poster:** a still of the wow screen or the title card, 1920×1080, used as the video thumbnail and the README fallback.

## Review

Show the table to the team as a draft; work continues on labeled assumptions. After capture, replace placeholder times with real in and out points and note the take each clip came from.
