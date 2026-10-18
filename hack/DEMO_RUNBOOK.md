# PaperTrail · Live demo runbook (3 minutes)

Live demo 20:00 CEST. Prod URL: `<prod-url>` = _TBD, record in hack/HACKATHON.md after deploy v3_. Fallback URL: `<prod-url>/?demo=1` (replays a recorded real run in about 5 s).

Roles: **Talker** = _TBD_ · **Driver** = _TBD_ (solo: the talker drives) · **Backup** holds the recording and the clock = _TBD_. Decide at 19:00 and write the names here.

Mode decision (rule, decided at 19:30 on the venue network): run Discover **live** only if all three hold: (1) three live runs in a row finished, (2) each in under 45 s, (3) Token Factory and Tavily show no quota or key errors. Otherwise present on `?demo=1`. Mode today: _TBD at 19:30_.

## Pre-demo checklist

| When | Do | Done |
|---|---|---|
| 19:00 | `curl -fsS <prod-url>/api/health` returns OK. Open `<prod-url>/?demo=1` and confirm the top Core paper shows a verified quote (the committed recording had citation stages only; if the judge stage is missing, see Failure table row "No quote in demo mode") | [ ] |
| 19:15 | Local fallback works: `pnpm install && pnpm build && pnpm start` on the presenting laptop; open `http://localhost:3000/?demo=1` | [ ] |
| 19:15 | Recording of the full run is a local file, paused at 0:00, beat timestamps written below | [ ] |
| 19:30 | Venue network and phone hotspot both tested. Decide live vs `?demo=1` by the rule above and write it at the top | [ ] |
| 19:45 | **Warm up prod.** Open `<prod-url>/`, run Discover once with the melanoma seeds (live citation part: 7.8 s cold, 0.5 s warm). This fills the cache so the stage run is the warm one. Do not run it more than three times (OpenAlex shares a daily quota on this IP without a key) | [ ] |
| 19:50 | Clean browser profile, bookmarks bar hidden, zoom 125 to 150 percent, notifications off, chat and mail quit, no `.env` or terminal visible | [ ] |
| 19:55 | Tabs in this order: **1** `<prod-url>/` (or `?demo=1` by the mode rule) reset to the start state · **2** `<prod-url>/?demo=1` · **3** `http://localhost:3000/?demo=1` · **4** recording, paused. Tab 1 frontmost, cursor parked off the content | [ ] |
| 19:58 | Seeds pasted (5 melanoma DOIs), question entered, preset **demo**, Lens at the Evidence end. Timer ready. Hand signal for "switch to backup" agreed | [ ] |

Ask the owner of the presenting laptop before changing its settings; it is their device.

**Fallback order:** live prod (tab 1) → `?demo=1` on prod (tab 2) → local `?demo=1` (tab 3) → recording (tab 4). Lose at most about 15 seconds before stepping down one level. Never debug on stage.

## The 3 minutes, click by click

Spoken lines are written to be said, about 305 words counted with `grep`/`wc`, well under the 3:00 budget at 140 words per minute (about 420 words), which leaves room for the clicks and the holds. If running late, drop the Lens beat's last sentence first, then the Honesty beat's Bridges sentence.

### 0:00 Hook (20 s)
- **Screen:** tab 1, workspace closed on the Discover tab empty state, PubMed numbers visible in the header if present.
- **Driver:** nothing.
- **Say:** "Lena is writing a review. She trusts five papers. PubMed gives her fifteen results for her question as typed, or nine hundred ninety-nine for loose keywords. Neither is a reading list. PaperTrail starts from the papers she already trusts."

### 0:20 Workspace (15 s)
- **Screen:** file tree with `Seeds/` (5 notes), the question note, the graph with five seed nodes.
- **Click:** open the graph (toolbar Graph button), then back to the Discover sidebar.
- **Say:** "This is her vault. Five seed notes made from DOIs, her question, and a graph. It is a Zettlr-style workspace, so the notes stay hers."

### 0:35 Discover (30 s)
- **Click:** **Run discovery** (preset `demo`).
- **Screen:** step trail lights up; ghost nodes grow out of the seeds; lane counts climb; the Agent line shows the Scout.
- **Say:** "One click. We follow citations, PubMed similar articles, and a bounded Tavily scout, six tool calls at most. Models run on Nebius Token Factory. Nine hundred eighty candidates sort into lanes by how many of her seeds link to them."
- **If live and slow:** keep talking with the next sentence; the how-it-works line is the cover: "References of her seeds, papers citing two or more of them, PubMed neighbours, and the scout for new work."

### 1:05 Receipts (30 s) · the wow
- **Click:** the top card in **Core** to open the preview.
- **Screen:** paper (published 2026, 0 citations), **Paper trail** (all 5 seeds, route, API), verified quote with the check mark, **Why ranked here**.
- **Say:** "The top paper cites all five of her seeds. It came out this year and has zero citations, so ranking by citations would never show it. Here is the paper trail: which seeds, which route, which API. And this quote is checked word for word against the abstract."
- **Hold** two seconds in silence on the verified quote.

### 1:35 Honesty (15 s)
- **Click:** scroll the lane panel to the Retracted row and the Not assessable line; point at the Bridges lane header.
- **Say:** "One paper is retracted. We flag it and never recommend it. Papers with no abstract and few links say not assessable. Bridges are semantic finds with no citation link."

### 1:50 Lens (20 s)
- **Click:** drag the **Lens** slider from Evidence to Method.
- **Screen:** methods and tool papers rise inside the lanes.
- **Say:** "A lens, evidence to method. Under evidence, tool papers fall. Under method, they rise. No new calls, it re-sorts in the browser."

### 2:10 Keep (20 s)
- **Click:** **Add to vault** on the open paper; open the new note in `Discovered/`; open the **Related** tab.
- **Screen:** literature note with front matter, quote and `[[seed]]` links; node turns solid in the graph.
- **Say:** "Add to vault. A literature note with the quote and links back to her seeds. The node turns solid, and Related shows the backlinks. Export is BibTeX for Zotero."

### 2:30 Proof (15 s)
- **Screen:** keep the vault visible (no click). If the team adds a proof slide or README section, switch to it here.
- **Say:** "We tested this on two real reviews: hide all but five references and see what comes back. Our routes reach sixteen and forty-two percent of the hidden ones; keyword search reaches six percent at best. Ranking by seed links puts thirty-five to forty percent relevant papers in the top twenty, against about five at random."
- Add only if the live run completes before the demo: "Full-pipeline numbers: TBD after live run." Otherwise do not mention them.

### 2:45 Close (15 s)
- **Screen:** final screen with the URL.
- **Say:** "App on Nebius Serverless, models on Token Factory, search by Tavily. PaperTrail: find the papers you missed, with receipts."
- Timer at 3:00: stop.

## Beat table: what can fail and the recovery

| Beat | Starts | What can fail | Recovery | Recording timestamp |
|---|---|---|---|---|
| Hook | 0:00 | Wrong tab or stale state | Reload tab 1; if the seeds are gone, switch to tab 2 | _TBD_ |
| Workspace | 0:20 | Seeds or graph empty | Switch to tab 2 (`?demo=1`) which loads seeds | _TBD_ |
| Discover | 0:35 | Run slow, stalls, or errors | See Failure table | _TBD_ |
| Receipts | 1:05 | No verified quote on the card | See "No quote in demo mode" below | _TBD_ |
| Honesty | 1:35 | Retracted row not visible | Scroll the lane panel; the row is part of the recorded run | _TBD_ |
| Lens | 1:50 | Slider does nothing before the judge stage | Say "this works from the judge's facet grades"; if no grades exist, skip to Keep | _TBD_ |
| Keep | 2:10 | Add to vault fails | Open a note already in `Discovered/` and continue | _TBD_ |
| Proof / Close | 2:30 | Nothing live | Speak it; no screen needed | _TBD_ |

## If a stage fails

Lose at most about 15 seconds, then step down one level of the fallback order.

| Failure | Talker says | Driver does |
|---|---|---|
| Live run slow (5 s past the rehearsed time, about 45 s) | Continues the how-it-works sentence | At 15 s past, open tab 2 (`?demo=1`) at the Discover beat and run it (about 5 s) |
| Run errors or Token Factory/Tavily rate limit | "Let me show you the run we recorded earlier from the real pipeline." | Tab 2 (`?demo=1`). Say the same on first mention: "This replays a recorded run" |
| Judge or Scout stage missing in the stream | Keeps going; the lanes still fill from citations | Do not say "verified quote" or "scout found" unless on screen |
| No quote in demo mode (recording has only citation stages) | "The citation routes are what you see; the quotes come from the judge stage" | Show **Paper trail** and **Why ranked here** only; skip the quote hold. Then say once: "The judge stage runs live on Token Factory" only if it ran in preflight |
| Prod down or 5xx | Same recorded-run line | Tab 3 (local `?demo=1`) |
| Venue Wi-Fi down | Same line | Phone hotspot if back within 20 s, else tab 3; then tab 4 |
| Local app also fails | "I will walk you through the recording" | Tab 4 at the beat timestamp; talker narrates over it |
| Projector or screen share fails | Tells the story from the spoken lines | Fixes the connection, rejoins at the current beat |
| Timer at 2:45 | Jumps to Close | Shows the final screen with the URL |

If a judge asks why it replayed: "That run replays a recorded result from our real pipeline; happy to run it live after the pitch." Offer the live run only if preflight passed.

## After the pitch

Write one line per thing that went wrong or nearly did in a Notes section here.

## Notes

_Empty until after the pitch._

## Open items

- Rubric weights not recorded in hack/HACKATHON.md.
- `prod_url`, names for Talker, Driver and Backup, recording timestamps.
- Dry run of the timing (two timed runs, last 10 s under the limit) is not done; log runs under Rehearsals when done: _none yet_.
