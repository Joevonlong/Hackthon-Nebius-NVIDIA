# Motion, AI states, and the wow moment

Motion on the demo path does two jobs: it confirms what just happened, and it stages the one moment judges remember. Everything else stays still.

## Motion tokens

| Use | Duration | Easing |
|---|---|---|
| Hover, press, toggle | 100–150 ms | ease-out |
| State confirmation (the default) | 150 ms | ease-out |
| Entering UI: panel, dialog, result card | 200–300 ms | `cubic-bezier(0.23, 1, 0.32, 1)` |
| Exit | 60–70% of its enter | same curve |
| Moving on screen: layout morph, before → after | 300–500 ms | spring with no bounce |
| List or step stagger | 30–50 ms per item | inherits |

Animate `transform` and `opacity` only. Frequent interactions stay at 200 ms or less. Durations and the 150 ms default follow common design-system values (Material 3, IBM Carbon); the curve and the exit ratio are heuristics.

```ts
// lib/design/motion.ts — the motion library takes seconds
export const ease = [0.23, 1, 0.32, 1] as const;
export const dur = { fast: 0.15, enter: 0.25, exit: 0.16, move: 0.4 } as const;
export const stagger = 0.04;
export const spring = { type: "spring", bounce: 0, duration: 0.4 } as const;
```

Wrap the app in `<MotionConfig reducedMotion="user">` so motion components drop transform and layout animation when the operating system asks, and cover any CSS animation with `@media (prefers-reduced-motion: reduce)`.

## Reduced motion

Keep opacity and color crossfades; drop translation, scale, and parallax; count-ups land on the final value at once; streamed text still streams (it is information) but without a blinking caret. Write this per screen in the Screen map's reduced-motion column.

## AI states

Every AI step on the demo path renders all of these. In demo mode (`?demo=1`) they come from the recorded responses, so they look identical on every run.

| State | What the judge sees |
|---|---|
| Empty | The persona's story data already on screen; never a blank panel or "No data" |
| Loading, before the first token | A skeleton shaped like the final result plus a label in the persona's terms ("Reading 14 clauses…"), shown only after about 300 ms |
| Streaming | Content fills in where it will finally sit, with space reserved so nothing jumps; structured fields resolve one by one; a short step trail ("Parsed → Scored → Drafted") shows the pipeline working |
| Success | The result settles; numbers derived from the output count up to their real values; the change carries the accent once |
| Slow | After about 10 s, "Still working: <current step>"; at the request's timeout, the error state |
| Error | What happened, a Retry, the user's input preserved; when `hack-backend` provides one, an option to use the recorded result, labeled as such |
| Reduced motion | The same information, without movement |

Replay pacing: recorded responses replay at one fixed pace, tuned so a full stream lasts about 2–5 s on stage (heuristic): long enough to see the AI work, short enough not to stall the pitch. The same pace every run keeps rehearsal and video timings stable.

## The wow moment

One interaction, one beat, the climax of the demo. Stage it in five phases:

| Phase | Time | What happens | Motion |
|---|---|---|---|
| Setup | before the click | The before state is on screen and the pain is visible: the backlog, the red total, the hours | still |
| Trigger | 0 s | One obvious control, labeled with the outcome verb | press feedback, 100 ms |
| Build | 0–2.5 s | The AI works in view: steps light up in order, partial results stream into place | enter 250 ms, stagger 40 ms |
| Payoff | 2.5–3.5 s | The after replaces or sits beside the before; the key number counts up to its real value; the accent marks what changed | count-up 0.6–0.9 s, ease-out |
| Hold | 3.5 s onward | Nothing moves for at least 2 s, so the presenter can land the line and the video can cut | none |

Make the business logic visible on that screen:

- **Before and after on one screen** (split, toggle, or the old value ghosted), never on separate routes.
- **Numbers from real outputs** (a sum, a count, a delta) with a unit and a source label ("from 48 invoices"); never an invented percentage.
- **The causal chain labeled:** input → what the AI did → result, in the persona's words.
- **One accent for what changed**, used nowhere else in that beat.
- **Largest type on the screen** goes to the payoff number or verdict.

Build it with motion: `AnimatePresence` for swaps, `layout` for the before → after morph, variants with `staggerChildren` for the step trail, and `animate()` or `useSpring` for count-ups driven by the real value. Drive the phases from the stream's events, not from timers, so the live run and the demo replay behave the same.

Keep out of the demo: motion on screens off the path, looping ambient animation (loading indicators stop when content lands), anything flashing more than three times per second (WCAG 2.2 SC 2.3.1), and celebrations unless the persona's world calls for one, and then once, never looped.

Adapted from open-design's animation and state-coverage craft rules (Apache-2.0) and Emil Kowalski's design-engineering notes (MIT); see `docs/sources.md`.
