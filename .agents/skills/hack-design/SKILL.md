---
name: hack-design
description: Sets the look of a hackathon demo. Renders three contrasting visual directions behind a switcher, records the human's pick in hack/DESIGN.md, wires tokens into Tailwind and shadcn, maps every demo screen and AI state, and choreographs the wow moment. Use for design direction, theme, or "make it beautiful". Not for polishing built screens (use hack-polish), demo beats (use hack-spec), or building features (use hack-build).
license: MIT
---

# Hack Design

**Direction** is chosen once, by a human, from real renders: three contrasting looks for the opening and wow screens, one pick, then tokens, a screen-and-state map, and a staged wow moment that every builder follows. Judges watch dozens of demos on a projector, so a striking look and business logic they can read without narration decide the first 10 seconds.

Read [../hack/references/principles.md](../hack/references/principles.md) once per session; this skill applies **Polish the path**, **Facts are the agent's job, decisions are the human's**, and **Judges are users too**.

## Inputs

- `hack/PITCH.md` (locked at G1): persona, pain moment, wow moment, product name.
- `hack/SPEC.md`: demo beats B1–B6 and their P0 cards. It is written in parallel; until it is locked, use the pitch's beat sketch and mark the affected rows `Assumed`.
- `hack/HACKATHON.md`: judging rubric, sponsor or brand constraints, `doc_language` (DESIGN.md prose), `submission_language` (UI copy), `autonomy`, `merge_mode`.
- The F-00 app (Next.js App Router, Tailwind v4, shadcn/ui, motion, lucide) and story data: seed fixtures in `lib/contracts/` and the recorded AI responses `hack-backend` prepares for `?demo=1`, or the contract fixtures until those land.
- Your board card: claim it with `scripts/hack claim F-xx --as designer@<human>`; if SPEC has none, add one (lane `design`, beat `—`, P0).
- Optional: a design library, brand guide, or DESIGN.md the user names. It replaces the built-in directions as the source of candidates.

## Steps

1. **Read the story.** Write three lines: who is on screen (the persona, named as in the story data), the before → after the screens must show, and which beat is the wow. List the constraints: sponsor brand or required UI kit, the venue display (assume a 1280×720 or 1920×1080 projector unless HACKATHON.md says otherwise), and languages. Done when the three lines and the constraint list are written; they open DESIGN.md's Overview in step 5.

2. **Shortlist three directions.** Read [references/directions.md](references/directions.md) when choosing. Pick three that fit the persona and contrast on at least two axes, set each one's taste dials, and recommend one with a reason tied to the persona or the rubric. When the user named a library or brand, build the three from it instead. Read [references/anti-slop.md](references/anti-slop.md) when rendering anything, from this step to submission. Done when three directions, each with palette, type pair, dials, and fit reason, plus one recommendation, are written.

3. **Render them behind a switcher.** Read [references/direction-switcher.md](references/direction-switcher.md) when building it. Render the opening screen and the wow-beat screen in each direction, with story data in demo mode, behind `?direction=` and the floating switcher, on a branch that is never merged. Time-box 20–30 minutes; at 45 minutes stop and show what renders. Capture every direction × screen at 1440×900. Done when six screenshots exist in `hack/demo/media/` and the switcher URL loads.

4. **Get the pick.** Before writing DESIGN.md, the user picks a direction, because every screen and token is built on it. Show the six screenshots, the switcher URL, and your recommendation in one question round; the captain may fold this into the G2 round with the P0 list. A hybrid answer ("B's type with C's palette") becomes a named direction. Record it with `scripts/hack decide "Direction: <name> · why: <reason>"`. If no human is reachable, continue on the recommendation labeled `Assumed`, record that, and say so in the deliverable; an assumed direction does not pass G2 until a human confirms it, and `scripts/hack status` ignores a `Direction:` line that contains "Assumed". A subagent in either runtime cannot ask the user, so it continues as `Assumed` and puts the question round in its report for the lead to ask at G2. Done when a D-NN line names the direction and who chose it, or `Assumed`.

5. **Write `hack/DESIGN.md`.** Read [references/design-md.md](references/design-md.md) when writing it. The chosen direction's tokens go in the frontmatter; the Overview opens with `Direction: <name> (chosen by <human>, D-NN)`, or `Direction: <name> (Assumed, pending G2)` until a human picks, and the three story lines; Do's and Don'ts carry the anti-slop rules this design is most likely to break. Done when the file passes the reference's shape check.

6. **Put the tokens in code.** Map the tokens into Tailwind v4 theme variables and the shadcn theme in global CSS, the fonts in `app/layout.tsx`, and the motion constants in one module, as design-md.md shows. These are shared-zone files: one small dedicated branch from `origin/main` (`chore(F-xx): design tokens`), announced with `scripts/hack log`, passed through `scripts/gate.sh`, and merged before UI cards build on it ([../hack/references/git-flow.md](../hack/references/git-flow.md)). Done when the merge SHA, the gate's result line, and a screenshot of the opening screen on main in the new tokens exist.

7. **Map screens × states.** Fill DESIGN.md's Screen map: one row per demo-path screen (B1–B6), one column per state: empty (filled with story data), loading, AI streaming, success, error, reduced motion. Each cell says what the judge sees, in words. Read [references/motion-and-wow.md](references/motion-and-wow.md) when filling the AI-state cells. Add a board card for any state no SPEC card covers (`scripts/hack add "…" --beat B3 --p P0 --size S --lane fe`). Done when every cell is filled or `n/a` with a reason, and every gap has a card ID.

8. **Choreograph the wow.** With the same reference, write the wow beat as a timed sequence (setup, trigger, build, payoff, hold) with durations, the business logic it makes visible (before and after on one screen, numbers derived from real outputs with units and sources, a label on each step), and its reduced-motion version. Done when DESIGN.md's Wow moment section has the timeline, each number's data source, and the static fallback.

9. **Clean up and hand off.** Push the prototype branch and leave it unmerged as the record of the losing directions; main carries no switcher, or one gated off in production. Mark the card done: `scripts/hack done F-xx --evidence "<token sha>; gate ok; hack/DESIGN.md; hack/demo/media/direction-<id>-<beat>.png"`. Done when the board row shows `done` with that evidence.

## Deliverable

```text
Direction: <name> · chosen by <human> | Assumed (pending G2) · D-NN · candidates: <a>, <b>, <c>
Switcher: <branch> · <url>?demo=1&direction=<id> · shots: hack/demo/media/direction-*.png (<n>)
DESIGN.md: hack/DESIGN.md · shape check: <ok | fixed: …>
Tokens: <sha> on main · gate: <result line> · shot: <path>
Screen map: <n> screens × 6 states · Assumed rows: <n> · gap cards: <F-ids | none>
Wow: B<n> · <setup → payoff in one line> · <total seconds> · reduced motion: <what changes>
Anti-slop: <checks run> · hits fixed: <list | none>
Board: F-xx done · <evidence string>
```

Every line cites a file, a command's output, or a screenshot from this session.

## When blocked

- **No locked PITCH.md:** the persona drives every choice, so route to `hack-grill`. If the captain wants a head start, prepare token sets only, labeled `Assumed`.
- **F-00 is not live yet:** render the directions on a throwaway route in a local skeleton, or as static pages with the same story data; do not wait more than 30 minutes for F-00.
- **No screenshot capability:** hand the human the switcher URL to flip through and mark the shots `not captured`.
- **A sponsor or brand fixes the palette:** keep those colors in all three directions and vary type, density, radius, and layout posture instead.
- **The pick arrives after build started:** tokens are CSS variables, so swap them in one shared-zone branch; layout-posture changes become cards for the captain to size.
- **Over the time box (1.5×):** stop, show what renders, and recommend. A chosen direction at 80% fidelity beats a perfect switcher.
