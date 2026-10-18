# Live-demo runbook

Read this when writing `hack/demo/RUNBOOK.md`. A live demo fails on stage for boring reasons: a notification, a stale tab, venue wifi, a slow model. The runbook removes each one in advance and gives the team a line to say when one happens anyway. The agent writes it; the presenting humans execute it on their own machine.

## Roles

| Role | Does | Never |
|---|---|---|
| Talker | Says the script, faces the judges, owns the clock | Touches the laptop mid-beat |
| Driver | Clicks exactly what Show says, one beat ahead in their head | Improvises a path not in the script |
| Backup | Holds the backup video, watches the timer, signals 30 s left | Speaks during the pitch |

Solo team: the talker drives and has rehearsed every click. Two people: the driver also holds the backup.

## Preflight

**T-30 minutes**

- [ ] Prod answers: `curl -fsS <prod_url>/api/health` and `scripts/smoke.sh <prod_url>` green, run on the venue network.
- [ ] Demo data reset by the path ARCHITECTURE.md documents for demo mode, so B1 starts from the seeded state.
- [ ] Demo-mode decision made (rule below) and written at the top of RUNBOOK.md.
- [ ] Browser: a clean profile with no extensions, bookmarks bar hidden, logged out of personal accounts. Tabs in beat order: tab 1 the app at B1 (`<prod_url>/?demo=1` when demo mode), tab 2 the architecture diagram, tab 3 the backup video.
- [ ] Zoom set so the back row can read the UI (often 125–150%); check it on the real projector or shared screen, then re-check that each beat still fits without scrolling.
- [ ] Backup video is a local file on the presenting laptop (not a stream), opened, paused at 0:00, with the beat timestamps written below.
- [ ] Network: venue wifi tested; a phone hotspot configured as the fallback and tested once.
- [ ] Power connected; display adapter tested; mirror or extend decided; output at 1920×1080 when the projector allows.

**T-10 minutes**

- [ ] Notifications off (macOS: Focus · Windows: Do not disturb); chat, mail, and calendar apps quit.
- [ ] Nothing private visible: `.env` files, terminal history, password manager, other tabs, desktop files.
- [ ] Tab 1 reloaded fresh; cursor parked off the content.
- [ ] Remote pitch: share one browser window, not the whole screen; a second device joined as a viewer to see what judges see.
- [ ] Talker has the first two sentences memorized.

**T-2 minutes**

- [ ] Tab 1 frontmost at the B1 state. Timer ready. Backup video one keystroke away.
- [ ] Driver and talker agree on the hand signal for "switch to backup".

## Demo mode or live

Run the wow beat live only when all three hold at T-30, on the venue network:

1. Three consecutive live runs of the wow beat succeeded.
2. Each finished within the time the script gives the beat.
3. The provider shows no quota, rate-limit, or key problem for the next hour.

Otherwise present in demo mode (`?demo=1`), which replays recorded outputs of the real pipeline with the same screens. The script does not change. If a judge asks, say it plainly: "This run replays a recorded result from our real model; happy to run it live after the pitch." Offer that live run only if preflight passed.

## Recovery lines

Lose at most about 15 seconds before switching (heuristic). Never debug on stage.

| Failure | Talker says | Driver does |
|---|---|---|
| Model slow (5 s past the rehearsed time) | Continues with the how-it-works sentence for this beat | Waits; at 15 s switches to the demo-mode tab at the same beat |
| Error, blank screen, wrong state | "Let me show you the run we recorded this morning." | Opens the backup video at the beat's timestamp; talker narrates over it |
| Network down | Same line as above | Hotspot if it reconnects within 20 s, otherwise the backup video |
| Projector or screen share fails | Tells the story verbally, beat by beat, from the script | Fixes the connection, rejoins at the current beat |
| Timer at limit | Jumps to the close: one-liner and ask | Shows the final screen with the URL |

## Per-beat table

Fill one row per SPEC.md beat:

| Beat | Starts at | What can fail | Recovery | Backup video timestamp |
|---|---|---|---|---|
| B1 | 0:25 | Seed data missing | Reset path, or backup | 0:12 |

The backup video's timestamps come from its storyboard or from watching it once with a stopwatch.

## After the pitch

Write one line per thing that went wrong or nearly did under §Notes in RUNBOOK.md, so the next pitch (finals, sponsor booth) avoids it.
