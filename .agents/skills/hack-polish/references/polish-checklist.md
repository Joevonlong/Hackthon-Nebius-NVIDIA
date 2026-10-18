# Polish checklist

Walk every demo-path beat through each area, on the 1280×720 and 1920×1080 shots and in the running build in demo mode. Record a result per beat: pass, a finding with its evidence, or `n/a`. Values marked heuristic are defaults to question; the rest cite a standard. DESIGN.md may tighten any of them.

## Read and hierarchy

| Area | Check | Pass when |
|---|---|---|
| Type | Faces and sizes | Two typefaces at most; six sizes at most on a screen; three or fewer sizes above the fold; scale steps about 1.2–1.25 (heuristic) |
| Type | Display and labels | Latin display text tracked about −0.02em; all-caps labels at 0.06–0.1em; headlines wrap without a one-word last line (`text-wrap: balance`) |
| Type | Numbers | Figures that change or line up use `tabular-nums`; the payoff number is the largest type on its screen |
| Spacing | Rhythm | Every gap is a token step (4/8 px based); equal elements have equal gaps; edges align to one grid; nothing touches the viewport edge at 1280 |
| Color | Discipline | Neutrals cover most of the screen; the accent is visible at most twice per screen; status colors appear only for status; no raw hex or palette classes outside the token files |
| Contrast | Floor | Body text 4.5:1, large text and meaningful UI edges 3:1 (WCAG 2.2 SC 1.4.3, 1.4.11) |
| Contrast | Projector margin | Key text (the headline, the payoff number, labels a judge must read) at 7:1 (WCAG 2.2 SC 1.4.6, AAA), because projectors wash contrast out (heuristic); no weights under 400 for body; no meaning carried by a hairline alone |
| Size | Back of the room | At 1280×720, nothing a judge must read is under 14 px and key labels are 18 px or more (heuristic) |

## States and motion

| Area | Check | Pass when |
|---|---|---|
| AI loading | Before the first token | A layout-shaped skeleton with a label in the persona's words, not a bare spinner |
| AI streaming | While content arrives | Text and fields fill in place with space reserved; the step trail shows progress; pace matches DESIGN.md's replay pace |
| AI error | Forced failure | Plain cause, a Retry, input preserved; the presenter knows the recovery line from the runbook |
| Empty | First load in demo mode | Story data is already present; no blank panel, "No data", or zero-state illustration on the path |
| Motion | Purpose | Motion confirms a change or stages the wow beat; nothing loops after content lands; durations and easing match DESIGN.md's Motion section |
| Motion | Implementation | Only `transform` and `opacity` animate; no `transition-all`; nothing flashes more than three times per second (WCAG 2.2 SC 2.3.1) |
| Motion | Reduced motion | With the operating system's reduced-motion setting on, every beat still tells its story, without movement (`prefers-reduced-motion`) |
| Wow | Staging | Setup, trigger, build, payoff, and hold are all visible; the hold lasts at least 2 s (heuristic) |

## Words and identity

| Area | Check | Pass when |
|---|---|---|
| Copy | Content | No lorem, filler, or "sample" text; names, records, and amounts come from the story data; language is `submission_language` |
| Copy | Actions | Buttons name the outcome; one action keeps one name across beats ("Draft reply" leads to "Reply drafted") |
| Copy | Numbers | Every number has a unit and a source, or comes straight from the AI output on screen; nothing is invented |
| Copy | Proofreading | Every visible string read once aloud: typos, truncation, stray debug text, "undefined", "NaN", `[object Object]` |
| Identity | Name and pitch | Product name and one-liner match PITCH.md on the opening screen |
| Identity | Tab and share | Favicon is the product's own; `<title>` names product and value; Open Graph title, description, and image render for the prod URL (judges open links from the submission) |

## Interaction and build

| Area | Check | Pass when |
|---|---|---|
| Pointer | Affordance | Clickable things show a pointer and a hover state; non-clickable things do neither |
| Keyboard | Focus | Focus rings are visible and appear instantly; tab order follows the beat |
| Controls | Feedback | The trigger responds within about 100 ms (heuristic) and cannot double-submit; disabled states look disabled |
| Console | Clean | No errors or warnings on the path in the production build: no hydration warnings, no 404 assets, no failed fetches |
| Stability | Layout shift | Nothing jumps when fonts load, images arrive, or AI content streams (fonts through `next/font`, sized media, reserved space) |
| Viewport | 1280×720 | No horizontal scroll; the primary action is visible without scrolling; nothing important hides under the fold |
| Viewport | 1920×1080 | Content does not float in a sea of whitespace: a max-width container and type that scales up |
| Dev residue | Clean stage | No framework dev indicator or error overlay, no direction switcher, no debug JSON, no "localhost" text, no test accounts on screen |
| Off-path | Dead ends | Nothing on the path links to an unbuilt screen; such links are removed, not left to 404 |

## Anti-slop

Run the searches and the P0 and P1 rules from hack-design's anti-slop reference (linked from step 4 of this skill) on the demo-path code and screens. Any P0 hit there is a P0 finding here.
