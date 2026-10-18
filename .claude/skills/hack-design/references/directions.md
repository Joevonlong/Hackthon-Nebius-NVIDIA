# Directions

Five built-in directions to shortlist from when the user has no brand or design library of their own. Each is a complete starting point: an OKLCH palette, a type pair, a layout posture, and the personas it suits. Bind the values as given, then let the brand override only the accent.

## Choosing three

- **Fit first.** Every candidate must suit the persona in PITCH.md and the room the product lives in (an operator's console, a parent's phone, a newsroom).
- **Then contrast.** The three differ on at least two axes: light or dark, display face (serif, sans, mono), density, and shape posture (radius, border weight). Three light sans directions with different accents are one direction.
- **Shape the set** as one safe fit, one adjacent mood that still fits, and one stretch that could make the demo memorable. Recommend the one that makes the wow beat read best, not the safest.
- **Brand present:** keep the brand's colors in all three and vary type, density, and posture. Replace only `accent` and `on-accent`, then recheck contrast.

## Palettes

Hand off as `oklch(L% C H)`. `on-accent` is text or icons placed on an accent fill.

| Direction | bg | surface | fg | muted | border | accent | on-accent |
|---|---|---|---|---|---|---|---|
| Editorial | 97.5% 0.005 85 | 99.5% 0.003 85 | 21% 0.018 65 | 47% 0.014 65 | 88% 0.008 85 | 48% 0.14 25 | 99% 0.003 85 |
| Precise | 99% 0.002 250 | 100% 0 0 | 19% 0.012 255 | 52% 0.014 255 | 92% 0.006 255 | 55% 0.17 250 | 99% 0.002 250 |
| Warm | 98.5% 0.004 150 | 100% 0 0 | 22% 0.02 165 | 48% 0.018 165 | 91% 0.008 150 | 54% 0.12 175 | 99% 0.004 150 |
| Operator (dark) | 15% 0.01 250 | 19% 0.012 250 | 93% 0.006 250 | 70% 0.014 250 | 28% 0.014 250 | 80% 0.15 80 | 15% 0.01 250 |
| Loud | 97% 0.003 100 | 100% 0 0 | 16% 0.02 100 | 40% 0.02 100 | 16% 0.02 100 | 88% 0.2 130 | 16% 0.02 100 |

Add `success`, `warning`, and `danger` per direction in DESIGN.md, each checked against its background. Loud's lime accent is a fill under dark text, never a text color on paper.

## Type pairs

All load through `next/font/google`. Non-variable families (IBM Plex, Instrument Serif) need an explicit `weight` list.

| Direction | Display | Body | Numbers and IDs |
|---|---|---|---|
| Editorial | Newsreader, 500–600 | Public Sans | Public Sans with `tabular-nums` |
| Precise | Geist, 600 | Geist | Geist Mono |
| Warm | Bricolage Grotesque, 700 | Figtree | Figtree with `tabular-nums` |
| Operator | IBM Plex Sans, 600 | IBM Plex Sans | IBM Plex Mono |
| Loud | Instrument Serif, 400 at extreme sizes | JetBrains Mono (mono as body, on purpose) | JetBrains Mono |

When the UI copy is Chinese, Japanese, or Korean, pair the display face with a Noto Sans CJK family, set CJK headings at line-height 1.3–1.4, and drop negative tracking on them.

## Posture and fit

| Direction | Posture | Suits |
|---|---|---|
| Editorial | Large serif headlines, generous whitespace, borders and rules instead of shadows and rounded cards; small uppercase kickers with positive tracking; one decisive image or figure per screen | Research, journalism, policy, learning content, reports, civic tools; personas who read and judge text |
| Precise | Hairline borders, shadows only on menus and dialogs, display tracking about −0.02em, tabular numerals, one product visual or chart that explains the product; color reserved for actions and status | Developer tools, AI agents and infrastructure, B2B SaaS, productivity |
| Warm | Radii 12–18 px on a crisp grid, strong weight contrast, color separating panels and states, soft elevation only on interactive cards, real people's data | Consumers, health, education, family, marketplaces, accessibility |
| Operator | Dense tables with hairlines and no striping, status pills with tinted backgrounds, mono for IDs and numbers, small radii (4–6 px), no hero imagery; the product is the hero | Security, finance operations, logistics, monitoring, ML and data ops, control rooms |
| Loud | Oversized serif display, visible grid, full-strength 1.5–2 px borders, asymmetric 70/30 columns, radius 0–2 px, no shadows or gradients, underlined links | Creative tools, music and art, culture, youth social, manifesto-style pitches |

Dark directions lose contrast on many projectors because the black level lifts (heuristic). If the pick is dark, add a light variant under DESIGN.md's Themes and test both on the venue screen when you can.

## Taste dials

Three numbers, 1–10, set per direction and written in DESIGN.md's Overview. They settle layout, motion, and density arguments before they start.

| Dial | Low (1–3) | Middle (4–6) | High (7–10) |
|---|---|---|---|
| `DESIGN_VARIANCE` | Symmetric, centered grid | One asymmetric split and one oversized element per screen | Broken grid, overlaps, extreme scale contrast |
| `MOTION_INTENSITY` | State feedback only | Feedback plus a staged wow beat and number count-ups | Plus layout morphs and shared-element transitions between beats |
| `VISUAL_DENSITY` | One idea per screen, big type | A working screen with two or three panels | Tables, many numbers, mono everywhere |

Starting values (variance / motion / density): Editorial 6/3/3 · Precise 4/5/4 · Warm 5/6/3 · Operator 3/4/7 · Loud 9/6/3.

Hackathon adjustments (heuristics): keep density at 6 or below on any screen a judge reads from a projector, except Operator, where density is the point and type grows instead. Spend the motion budget on the wow beat; every other screen stays at feedback-level motion.

Adapted from open-design's direction library (Apache-2.0) and the taste-skill dial model (MIT); see `docs/sources.md`.
