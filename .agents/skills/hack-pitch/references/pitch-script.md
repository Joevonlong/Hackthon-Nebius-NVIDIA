# Pitch script

Read this when drafting or re-timing `hack/demo/PITCH-SCRIPT.md`. The script is the demo script from SPEC.md wrapped in a hook, a how-it-works moment, and a close, sized to the event's time limit. Examples reuse the fictional Tally invoice demo from `hack-spec`'s demo script example.

## Word budget

Spoken pace for a pitch with a live demo is about 130–150 words per minute (heuristic; nervous speakers speed up, so plan at the low end). Silent seconds, such as a model streaming or a page loading, carry no words.

```text
budget = (limit in seconds − silent seconds − 10 s margin) × 130 / 60
```

| Limit | Budget with no silence |
|---|---|
| 2:00 | about 240–280 words |
| 3:00 | about 370–430 words |
| 5:00 | about 630–730 words |

When the draft is over budget, cut words from the hook, how it works, and impact. The demo beats keep their time.

## Structure

Shares are of the total pitch time; scale them to the limit.

| Section | Share | At 3:00 | Content |
|---|---|---|---|
| Hook | ~8% | 0:00–0:15 | The example person's painful moment in one sentence: who, when, what it costs (cost with its source from PITCH.md) |
| One-liner | ~5% | 0:15–0:25 | PITCH.md one-liner, verbatim, in `submission_language` |
| Live demo | ~55% | 0:25–2:05 | SPEC.md beats in order; the wow starts at 60–70% of the total runtime (about 1:48–2:06 of 3:00) |
| How it works | ~12% | 2:05–2:25 | One diagram from ARCHITECTURE.md and one sentence about the AI |
| Impact | ~10% | 2:25–2:45 | Before and after for the persona; only real or cited numbers |
| Close | ~5% | 2:45–3:00 | The one-liner again, then one ask |

When the event's demo format puts the demo first (a booth or a judge walking up), open with B1 and fold the hook into its line.

## Writing each section

- **Hook.** A person, a moment, a cost: "Every Monday, Mia opens 38 supplier invoices before she can pay anyone." No questions to the audience, no market-size slide.
- **Demo beats.** Copy Presenter says from SPEC.md, then tighten. Narrate the outcome, not the click ("Mia forwards the pile" rather than "I click Forward"). Act first, then speak while the result is on screen.
- **Wow beat.** Say one setup line, act, then stay silent for about two seconds while the result lands (heuristic). Name the business logic once: input → AI step → outcome.
- **How it works.** One sentence on the shape: "We send <input> to <model or tool>, which <does X>; <component> then <does Y>." Then one sentence on honesty: "<core> is real; <edges> are mocked for the demo." Show the diagram for at most about 15 seconds.
- **Impact.** Restate the before and after from PITCH.md in the persona's units (minutes, euros, errors caught). Numbers come from the demo's output, the spike, or a cited source. A projection is labeled as one and carries its reasoning.
- **Close.** One-liner, then one ask: try the URL, the track or sponsor prize you are going for, or the next step you want. Hold the last screen with the URL until the timer stops.
- **Language.** `submission_language`, short sentences, no jargon the judges have not heard, the persona's name used every time instead of "the user".

## Judging map

Every rubric criterion gets a moment. A criterion with no moment is the first fix.

| Criterion (weight) | Moment | Time | Line or screen that proves it |
|---|---|---|---|
| Impact (30%) | Hook + Impact | 0:00, 2:25 | "38 invoices every Monday" (PITCH.md cost source) |
| Technical depth (25%) | Wow + How it works | 1:50, 2:05 | Duplicate caught live; pipeline diagram |
| Use of sponsor tech | How it works | 2:10 | Sponsor model name said once and visible on screen |

Sponsor or required technology must be both said and visible: a screen, a log line, or the diagram node that names it.

## Claims table

| Claim as spoken | Source | Said at |
|---|---|---|
| "three flagged for review" | hack/demo/shots/B5.png | 2:40 |

## Script format

One table per section so the driver can follow along:

| Time | Say (verbatim) | Show (screen and action) | Criterion |
|---|---|---|---|
| 0:25 | "She forwards the whole pile to Tally." | Click Forward; invoices stream in | Technical depth |

Below the tables keep: §Claims, §Rehearsals (run, date, total, per-section times, stumbles, failures), §Changes (judge fix → applied or rejected, with the reason).

## Short versions

Write two cut-downs below the main script, because judges walk up at booths and hallways:

- **30 seconds:** hook, one-liner, the wow screen, the URL.
- **90 seconds:** hook, one-liner, B1, the wow beat, close.

Both reuse the main script's sentences; no new claims.
