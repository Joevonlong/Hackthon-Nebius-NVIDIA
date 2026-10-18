# Demo script

Read this when writing the beats in step 2. The script is the contract every later phase builds to: each P0 card serves a beat, each beat becomes one step of the golden-path smoke, and the storyteller turns the same beats into the pitch script and the video.

## Shape

- **3–6 beats**, `B1`…`B6`. A beat is one screen state the presenter shows for roughly 15–45 seconds.
- **Total within the demo length** from `hack/HACKATHON.md`, with about 10 seconds of slack for a slow model response (heuristic).
- **B1 names the persona and the painful moment** within the first 20 seconds, on screen: the "before", with the persona's real-looking input.
- **State the value by B2.** Later beats prove it; they never introduce it.
- **The wow beat starts at 60–70% of the runtime** (1:48–2:06 of 3:00): enough setup that the judge knows what "better" means, and enough time after it to land the outcome.
- **The last beat shows the after** in the persona's terms (time saved, risk caught, money found) and closes with one line on what comes next.
- **No login, onboarding, settings, or architecture slides** on the demo path, unless the wow itself needs them.
- **Numbers on screen are real:** from the spike, the seed data, or a cited source. Never invented metrics or user counts.

## Columns

| Beat | Time | Presenter says | Screen shows | Judge understands | Data |
|---|---|---|---|---|---|

- **Presenter says:** at most two spoken sentences, in `submission_language`. Budget about 130 spoken words per minute (heuristic), roughly 390 words for 3:00 including pauses.
- **Screen shows:** the one screen and the one action on it (click, upload, wait for the stream).
- **Judge understands:** the single thing the beat must make obvious without narration. For the wow beat, write its business logic as one sentence: input → AI step → outcome.
- **Data:** the seed records the beat needs. `hack-backend` turns them into seed and recording fixtures.

## Seed data

- One named persona, the example person from PITCH.md, the same in every beat.
- Real-looking inputs: plausible names, amounts, and dates in the event week; documents of realistic length and messiness. Synthetic or public-domain only, never real personal data.
- Choose the wow input so the AI output is visibly right and interesting (a hidden clause, a surprising match). The spike, or a run during this step, must show the model produces it; otherwise list it under open questions.

## Checks before deriving features

1. **Delete test.** Picture the demo with only B1 and the closing beat: a judge should still grasp who it helps and what changes. Picture it without those two: it should fall apart into a list of screens. If it holds up without B1, the opening is not carrying the value; rewrite it.
2. **Read-aloud timing.** Read the presenter lines aloud against a timer, or count words against the budget. Record the result next to the table in SPEC.md.
3. **One screen per beat.** A beat that needs two screens splits; two beats on the same screen with no new outcome merge.
4. **The wow runs the real core.** Demo mode may replay a recording as a fallback, but the capability the pitch claims also runs for real (principle "Fake the edges, never the core").

## Example (fictional, 3:00)

| Beat | Time | Presenter says | Screen shows | Judge understands | Data |
|---|---|---|---|---|---|
| B1 | 0:00–0:20 | "This is Mia. She keeps the books for 14 restaurants, and every Monday starts with 38 supplier invoices in one inbox." | Mia's inbox: 38 unread invoices, PDFs and phone photos mixed | Who it is for and what hurts | 38 invoices from 9 suppliers; Mia's account |
| B2 | 0:20–0:50 | "She forwards the whole pile to Tally." | One forward; invoices stream into a list as each is read | The input is the real mess, not a form | same invoices |
| B3 | 0:50–1:50 | "Every line is matched to her ledger, and anything odd is flagged with a reason." | Rows turn green as they match; three turn amber with a one-line reason | Reconciliation happens for her | ledger with 212 entries |
| B4 | 1:50–2:35 | "And here: the same delivery billed twice, under two invoice numbers." | Two invoices side by side, duplicate lines highlighted, €1,240 at stake | The AI caught what a tired human misses (invoice pile → line matching → duplicate blocked) | one planted duplicate |
| B5 | 2:35–3:00 | "Monday's pile is reconciled before ten. Next: payroll receipts." | Summary: 35 matched, 3 to review, 1 duplicate blocked | The outcome in her terms | — |

Wow: B4 at 1:50 (61%). Every number on screen comes from the seed data.
