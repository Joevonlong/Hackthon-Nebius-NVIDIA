# README template

Read this when writing or finishing `README.md`. The README is the project's landing page for judges: most open it from the submission form, look at the first screen, and decide whether to scroll. The first screen (title, hero, links, one-liner) carries who it is for and what changes.

## Template

````markdown
# <Name>

<p align="center">
  <img src="hack/demo/media/hero.gif" alt="<what the wow moment shows, one sentence>" width="800">
</p>

<p align="center">
  <a href="<prod_url>/?demo=1"><b>Live demo</b></a> · <a href="<video_url>"><b>2-minute video</b></a> · <a href="<submission_url>"><b>Devpost</b></a>
</p>

**<PITCH.md one-liner: For <persona> who <pain moment>, <name> <does X> so <outcome>.>**

Built in <hours> hours at <event> by <team names>.

## The problem

<Example person and painful moment in 2–3 sentences: when it happens, today's workaround, what it costs, with the cost's source as a link.>

## The solution

<What changes for them, as before → after in 2–3 sentences. The AI step named in plain words.>

## Demo

| <B1 beat name> | <wow beat name> | <last beat name> |
|---|---|---|
| ![<alt>](hack/demo/media/01-<slug>.png) | ![<alt>](hack/demo/media/02-<slug>.png) | ![<alt>](hack/demo/media/03-<slug>.png) |

## How it works

```mermaid
<diagram from hack/ARCHITECTURE.md>
```

<One sentence: what goes in, what the model or tool does, what comes out.>

## Features

- **<B1 name>.** <What the persona does and sees.>
- **<B2 name>.** <…>

## What's real and what's mocked

| Part | Status | Notes |
|---|---|---|
| <core AI step> | Real | <model or provider> |
| <edge, such as auth or payments> | Mocked | <what stands in for it> |
| Demo mode (`?demo=1`) | Recorded | Replays outputs recorded from the real pipeline, so the demo works without keys |

## Quickstart

```bash
pnpm install
cp .env.example .env.local   # optional: add keys for live AI; demo mode needs none
pnpm dev                     # open http://localhost:3000/?demo=1
```

## Tech stack

<Framework, model and provider, hosting, key libraries. Sponsor technology named and linked.>

## Challenges

<One or two real problems from DECISIONS.md and the board log, and what you did.>

## What's next

<The next two steps for the same persona, from SPEC.md P1/P2 and cut cards.>

## Team

- <Name> — <role> · <GitHub or profile link, only with their consent>

## License and credits

<License name, linking LICENSE.> <Third-party assets, datasets, templates, and models with their licenses. Code that existed before the event, as the rules require it to be disclosed.>
````

## Rules for each part

- **Title and one-liner.** The PITCH.md name and one-liner, verbatim, in `submission_language`. No tagline-only openers ("Reimagining X"); the persona appears in the first sentence.
- **Hero.** The GIF from `hack-video`; until it exists, the wow screenshot. Never a logo alone.
- **Links row.** Live demo with `?demo=1`, the video, the submission page. Drop a link that does not exist yet rather than pointing it at a placeholder. Static badges are optional; plain bold links read better and never break.
- **Numbers.** Every number in the README comes from PITCH.md with its source, from the demo's output, or from a cited page. A projection is labeled as one.
- **Diagram.** GitHub renders `mermaid` code blocks natively and follows the reader's theme; copy the ARCHITECTURE.md diagram and trim it to about seven nodes.
- **Real vs mocked.** Copy the fake-vs-real matrix plainly. Judges trust a team that says what is mocked; they discount one caught hiding it.
- **Quickstart.** At most three commands from a fresh clone to the demo on screen, demo mode first so judges need no keys. Use the package manager the lockfile names. Run them in a fresh clone before calling the step done.
- **Length.** A judge should reach Quickstart in about two scrolls on a laptop (heuristic). Detail beyond that belongs in `hack/ARCHITECTURE.md`, linked.
- **Language.** `submission_language` for all prose; code, commands, and identifiers stay as they are.
- **Accessibility.** Every image has alt text that says what it shows; headings in order; link text names the destination.

## Skeleton at 50%

Write the same headings with what PITCH.md and SPEC.md already say, and a labeled placeholder for everything else: `[MEDIA: three beat screenshots after freeze]`, `[LINK: video, hack-video]`, `[PROOF: cost figure from PITCH.md source]`. Placeholders are visible on purpose so nobody mistakes the skeleton for the final.
