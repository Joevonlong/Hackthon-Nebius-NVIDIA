# Anti-slop

Judges have seen the default AI-generated look hundreds of times; a screen that looks generated reads as low effort before anyone understands the product. Aim for about 80% proven patterns and 20% distinctive choices. These rules apply to every render: the direction switcher, every built screen, and the polish pass.

## P0: fix before anyone sees it

| Area | Target |
|---|---|
| Accent | The accent from DESIGN.md, through `bg-primary`, `text-primary`, `ring-ring` |
| Hero and backgrounds | Flat surfaces; hierarchy from type and one real product visual |
| Icons | lucide icons at one stroke width, sized to the text, colored with `currentColor` |
| Cards | Either a radius or a colored side border, never both |
| Numbers | Derived from a real output or the seed data, with a unit; otherwise a visibly labeled placeholder |
| Copy | Story data and names from the persona's world, in `submission_language` |
| Display type | Headings in the display face from DESIGN.md (`font-display`) |

Searches that find the usual misses; look at every hit:

```bash
rg -n -i '#(6366f1|4f46e5|4338ca|8b5cf6|7c3aed|a855f7)\b|\b(indigo|violet|purple)-[0-9]{2,3}\b' app components lib  # Tailwind default indigo/violet
rg -n 'from-(purple|violet|indigo|fuchsia)-\S+ .*to-(blue|cyan|sky|indigo)-' app components     # two-stop "trust" gradient
rg -n '\p{Extended_Pictographic}' app components lib                                           # emoji as icons or bullets
rg -n 'border-l-[2-8]' app components                                                           # then check that card's radius
rg -n -i 'lorem|ipsum|placeholder (text|copy)|sample (text|content)|feature (one|two|three)|john doe|jane doe|acme' app components lib
```

Numbers and display type need eyes: read every number on every screen and name its source; check that each heading sets the display face.

## P1: fix before freeze

- **Accent budget:** visible at most twice per screen, typically the primary action plus the one thing that changed. Links, rings, and selected tabs count.
- **Tokens only:** colors come from semantic utilities (`bg-background`, `text-muted-foreground`). Raw hex or palette classes such as `bg-blue-500` outside the token files bypass the system; count them with `rg -c "#[0-9a-fA-F]{6}\b" app components`.
- **Structure:** open with the product doing its job on the persona's data, not hero, three equal icon cards, and a call to action.
- **Effects:** no gradient text, glow blobs, mesh backgrounds, or glass on everything. One effect at most, and only where it marks hierarchy.
- **Interaction:** name the animated properties (`transition-[transform,opacity]`), never `transition-all`; no uniform hover-scale across unrelated elements; no overshoot easing on buttons, dialogs, or tooltips.
- **Layout:** no cards nested in cards; vary section rhythm (one dense block, one breathing block).
- **Imagery:** real screenshots, assets committed to the repo, or labeled slots; never placeholder-image services or stock photos posing as the product. One icon set per page.

## P2: fix when time allows

- Decorative SVG blobs and waves with no meaning.
- A perfectly symmetric layout with no tension anywhere.
- All-caps labels without positive tracking (0.06–0.1em).
- More than three type sizes above the fold.

## Add the 20%

- **One bold move:** a type choice, a single color decision, or a proportion, such as the payoff number at display size.
- **Voice:** buttons named for the outcome in the persona's words ("Chase 3 invoices" rather than a generic submit).
- **One remembered interaction**, placed on the wow beat.
- **One insider detail** only someone who knows the persona's job would add: the right unit, a realistic ID format, a domain term.

## Tests

- **Screenshot test:** someone outside the team can tell which product a screenshot belongs to.
- **Swap test:** put a competitor's name on the screen. If it still works unchanged, it is a template; change one axis (type, color, or structure) and say which.
- **Self-critique before showing anyone:** score philosophy (a clear point of view), hierarchy, execution, specificity, and restraint from 1 to 5. Revise anything under 3 first.

Adapted from open-design's craft rules (Apache-2.0), themselves adapted from refero_skill (MIT), and the Hallmark slop test (MIT); see `docs/sources.md`.
