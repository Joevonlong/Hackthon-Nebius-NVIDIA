# PaperTrail · Live demo runbook (3 minutes, Library flow)

Rewritten for CR-1 to CR-3 (Library replaces Discover; chat and report cards; no mock; real run recorded as the replay). Live demo 20:00 CEST.

Where it runs: **local on the presenting laptop** (decision D-18). Primary URL `http://localhost:3030` (`pnpm build && PORT=3030 pnpm start`); Docker alternative `http://localhost:3040` (`scripts/docker-local.sh`). Replay URL: the same address with `/?demo=1` (a recording of a real run, no keys and no network needed). Models run on Nebius Token Factory, so a live build needs internet. `.env.local` holds the keys and is never shown.

Numbers in this file are measured or marked `TBD-n`; the registry is in hack/PITCH.md. Never say a TBD number on stage.

Roles: **Talker** = _TBD_ · **Driver** = _TBD_ (solo: the talker drives) · **Backup** holds the recording and the clock = _TBD_. Decide at 19:00 and write the names here.

## Mode decision (the build takes 94 to 102 s, measured)

A live build alone is about half the 3-minute slot, so the pitch runs on the **replay** (`/?demo=1`) of a recorded real run. Say once, early: "This replays a recorded real run; the live one takes about a minute and a half." Run the **live** build only in a longer slot (Q&A, table visit) or if the organizers give more than 5 minutes, and only if all hold: (1) three live builds in a row finished, (2) each in under 120 s, (3) no quota or key errors from Token Factory, Tavily, OpenAlex or PubMed. Mode today: _TBD at 19:30_. Replay length: `TBD-4 (from the recorded demo run / eval lane)`.

## Pre-demo checklist

| When | Do | Done |
|---|---|---|
| 19:00 | App up on the laptop: `curl -fsS http://localhost:3030/api/health` returns OK (or :3040 for Docker). Open `/?demo=1` and confirm the question box is filled, the Goals card shows note quotes, report cards open, and chat has a proposal ready | [ ] |
| 19:10 | Clean state check: vault holds the 5 seed notes and the Question note; Library panel empty; chat history empty (history persists in the browser, clear it for the stage run) | [ ] |
| 19:15 | The recording of the full run is a local video file, paused at 0:00, beat timestamps written in the beat table | [ ] |
| 19:30 | Network check: venue Wi-Fi and phone hotspot both reach the Token Factory host. Decide live vs replay by the rule above and write it at the top | [ ] |
| 19:40 | **One full live build** on the laptop to prove keys and quotas end to end (94 to 102 s expected; 74 to 107 source calls). Check for no error banner. Do not repeat more than twice: OpenAlex and Tavily have call limits | [ ] |
| 19:50 | Clean browser profile, bookmarks bar hidden, zoom 125 to 150 percent, notifications off, chat and mail quit, no `.env.local` or terminal visible, dark or light theme chosen and kept | [ ] |
| 19:55 | Tabs in this order: **1** `/?demo=1` at the start state (the pitch tab) · **2** the live app `/` with the question box empty and 5 seeds in the vault · **3** the same replay URL on the Docker port (if used) · **4** recording, paused. Tab 1 frontmost, cursor parked off the content | [ ] |
| 19:58 | Timer ready. Hand signal for "switch to backup" agreed | [ ] |

Ask the owner of the presenting laptop before changing its settings; it is their device.

**Fallback order:** replay (tab 1) → live app (tab 2, only if preflight passed) → Docker replay (tab 3) → recording (tab 4). Lose at most about 15 seconds before stepping down one level. Never debug on stage.

## The 3 minutes, click by click

Spoken lines are written to be said: 291 words counted with `wc -w`, at 140 words per minute about 2:05, which leaves about 55 seconds for the clicks and the two holds. If running late, drop the last sentence of the Review beat first, then the Proof beat.

### 0:00 Hook (20 s)
- **Screen:** tab 1, the workspace with the Library panel empty and the question box visible.
- **Say:** "Lena is writing a review of single-cell studies in melanoma. She trusts five papers. Keyword search gives her a long list and no reasons. PaperTrail starts from what she already trusts, and shows its work."
- Optional, only if TBD-1 is filled: add the PubMed count for her question.

### 0:20 Question and seeds (20 s)
- **Click:** the question box (it already holds the typed question, final wording `TBD-5`); then the graph button to show the five seed nodes; back to the Library panel.
- **Say:** "Here is her question. Her five papers are notes in her vault, and they are the first nodes in the graph. One click."
- **Click:** **Build library**.

### 0:40 Build (35 s)
- **Screen:** the Goals card fills in with a quote from her own notes beside each goal (`TBD-6`: number of goals and subtopics); source rows count up for OpenAlex, PubMed, arXiv and Tavily; papers appear; the graph grows.
- **Say:** "First, an agent reads all her notes and writes the goals, with a quote from her own notes beside each one. Then it searches OpenAlex, PubMed, arXiv and Tavily, and follows citations out from her five papers. A build scores about six hundred papers in under two minutes. This is a recording of a real run."
- **If live and slow:** keep talking with the next sentence; do not apologize.

### 1:15 Review: verdicts and report cards (35 s) · the receipts
- **Click:** the top paper in the list, then **Why this score**; open the Evidence fold on one row (citations or LLM read).
- **Screen:** the one-sentence verdict (`TBD-7`: top paper, year, total, grade), the report card with a letter grade and weight per row, the source number under a row, the verified quote.
- **Say:** "Every paper gets a plain sentence and a report card: relevance, graph links, citations, venue, authors, and the model's own read, which has the smallest weight on purpose. Open a row and the evidence is there with its source. In our live runs the model read forty abstracts, and thirty-eight quotes matched the abstract word for word."
- **Hold** two seconds in silence on the verified quote.
- Do not claim the 38 of 40 for the recorded run unless TBD-2 confirms it.

### 1:50 Chat: steer the ranking (30 s) · the wow
- **Click:** the chat column on the right; type or paste `prioritize recent clinical studies`; send. When the proposal appears, click **Apply**.
- **Screen:** the proposal as a diff (weights, filters) with its rationale; after Apply, the list re-ranks in the browser and shows rank moves (`TBD-9`: who moved).
- **Say:** "Now she steers. 'Prioritize recent clinical studies.' The agent proposes new weights and says why. Nothing changes until she clicks Apply. Applied, and the list re-ranks in her browser. She can see who moved."
- **Hold** two seconds on the new top paper.

### 2:20 Keep and export (20 s)
- **Click:** **Add to vault** on the open paper; open the new note; open the graph; open **Export BibTeX**.
- **Screen:** literature note with front matter, quote and `[[seed]]` links; the new node in the graph (size follows the grade); the BibTeX file (`TBD-11`: entries).
- **Say:** "She adds the paper to her vault: a Markdown note with the quote and links to her seeds. It joins the graph. One click exports BibTeX for Zotero."

### 2:40 Proof and close (20 s)
- **Screen:** keep the graph visible (no click).
- **Say:** "We tested the citation approach on two real reviews: hide all but five references, see what comes back. Our routes reached sixteen to forty-two percent of the hidden ones; keyword search, six at best. Models run on Nebius Token Factory, search on Tavily, and it all runs on this laptop. PaperTrail: find the papers you missed, with receipts."
- Add only if TBD-3 is filled: one sentence on the evaluation of the full Library score.
- Timer at 3:00: stop.

## Beat table: what can fail and the recovery

| Beat | Starts | What can fail | Recovery | Recording timestamp |
|---|---|---|---|---|
| Hook | 0:00 | Wrong tab or stale state | Switch to tab 1 and reload it | _TBD_ |
| Question and seeds | 0:20 | Question box empty or seeds missing | Reload tab 1 (`/?demo=1` loads the recorded state) | _TBD_ |
| Build | 0:40 | Replay stalls; or live run errors (key, quota, network) | Reload tab 1 and click Build again; if the error persists, tab 3, then tab 4 | _TBD_ |
| Review | 1:15 | Report card shows no verified quote | Say nothing about the quote; point at the evidence rows (numbers and source links) instead | _TBD_ |
| Chat | 1:50 | No proposal, or the chat returns an error | Click **Retry**; if still failing, open the chat history from the recording (tab 4) and narrate | _TBD_ |
| Keep and export | 2:20 | Add to vault or export fails | Open a note already in the vault and the graph; say "export is BibTeX for Zotero" | _TBD_ |
| Proof and close | 2:40 | Nothing live | Speak it; no screen needed | _TBD_ |

## If a stage fails

Lose at most about 15 seconds, then step down one level of the fallback order. Errors show a message with Retry (the app has no silent fallback to fake data), so a visible error is real: do not read it out.

| Failure | Talker says | Driver does |
|---|---|---|
| Live build slow (past 120 s) | Continues the how-it-works sentence | At 15 s past the rehearsed time, switch to tab 1 (replay) |
| Build errors, or Token Factory or Tavily rate limit | "Let me show you the run we recorded earlier from the real pipeline." | Tab 1 (`/?demo=1`) |
| Chat call fails or times out | "I will show you what it proposed in our recording." | Retry once; then tab 4 at the Chat timestamp |
| One source row shows an error (for example arXiv) | Keeps going: "One source was slow; the others carry the library." | Nothing; the pile is built from the other sources |
| App down | Same recorded-run line | Tab 3, then tab 4 |
| Venue Wi-Fi down | Same line | Phone hotspot if back within 20 s, else the replay (it needs no network) |
| Projector or screen share fails | Tells the story from the spoken lines | Fixes the connection, rejoins at the current beat |
| Timer at 2:45 | Jumps to the close | Shows the graph |

If a judge asks why it replayed: "That replays a recorded real run from this same app; the live build takes about a minute and a half, and I am happy to run it now." Offer the live run only if the preflight passed.

## Open decisions for the captain (do not leave to stage)

1. **Nebius deployment.** The track deliverable says "deploy a working app on Nebius". We run locally (D-18). Decide by 17:30: deploy once with `scripts/deploy.sh` (needs the Library flow build and the keys as endpoint env vars), or state plainly that the app runs locally and only the models are on Token Factory. The submission text is written for the second case and says so.
2. **Chat model.** Confirm which Token Factory model serves the chat agent before the pitch names it.
3. **Rubric.** Not recorded in hack/HACKATHON.md.

## After the pitch

Write one line per thing that went wrong or nearly did.

## Notes

_Empty until after the pitch._

## Rehearsals

_None yet. Two timed runs, last one under 3:00 with 10 s to spare; log them here._
