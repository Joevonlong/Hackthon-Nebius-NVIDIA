# hack/DESIGN.md

The one design file every builder reads; the dispatch brief points at it. It follows the open DESIGN.md format that `mkt-ui-ux-design` uses (exact tokens in YAML frontmatter, application rules in prose) and appends three sections builders need during a hackathon: Motion, Screen map, and Wow moment. Prose follows `doc_language`; token names stay English.

## Template

Values below are the Precise direction; replace them with the chosen direction's. Flow-style maps (`{ … }`) are ordinary YAML maps.

```markdown
---
version: alpha
name: "<product name from PITCH.md>"
description: "<one line on what this visual system is for>"
colors:
  background: "oklch(99% 0.002 250)"
  surface: "oklch(100% 0 0)"
  surface-muted: "oklch(97% 0.004 250)"
  text: "oklch(19% 0.012 255)"
  text-muted: "oklch(52% 0.014 255)"
  border: "oklch(92% 0.006 255)"
  accent: "oklch(55% 0.17 250)"
  on-accent: "oklch(99% 0.002 250)"
  success: "oklch(55% 0.13 150)"
  warning: "oklch(72% 0.15 70)"
  danger: "oklch(55% 0.19 27)"
typography:
  display: { fontFamily: Geist, fontSize: 56px, lineHeight: 1.05, fontWeight: 600, letterSpacing: -0.02em }
  heading: { fontFamily: Geist, fontSize: 28px, lineHeight: 1.2, fontWeight: 600, letterSpacing: -0.01em }
  body: { fontFamily: Geist, fontSize: 16px, lineHeight: 1.55, fontWeight: 400 }
  label: { fontFamily: Geist, fontSize: 13px, lineHeight: 1.4, fontWeight: 500, letterSpacing: 0.02em }
  numeric: { fontFamily: Geist Mono, fontSize: 16px, lineHeight: 1.4, fontWeight: 500 }
rounded: { sm: 6px, md: 10px, lg: 16px }
spacing: { xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 40px, 2xl: 64px }
components:
  button-primary: { background: "{colors.accent}", text: "{colors.on-accent}", rounded: "{rounded.md}" }
  card: { background: "{colors.surface}", border: "{colors.border}", rounded: "{rounded.lg}" }
---

## Overview
Direction: <name> (chosen by <human>, D-NN)    ← or "(Assumed, pending G2)"; the G2 check ignores Assumed lines; keep exactly one Direction line
<persona line> · <before → after line> · <wow beat line> · dials <variance>/<motion>/<density>
## Colors            where the accent may appear (at most twice per screen); status colors only for status
## Themes            only when a second theme exists, such as a light projector variant of a dark pick
## Typography        which scale each kind of text uses; the payoff number uses display or numeric
## Layout            container width, grid, spacing rhythm, density per screen, 1280×720 safe area
## Elevation & Depth which levels exist and what each means
## Shapes            radius and border posture from the direction
## Components        shadcn components in use and their overrides; lucide icons at one stroke width
## Do's and Don'ts   the anti-slop rules this design is most likely to break
## Motion            durations, easing, stagger, reduced-motion rule
## Screen map        table: screen (beat) × empty, loading, AI streaming, success, error, reduced motion
## Wow moment        timed sequence, data source of each number, static fallback
```

The scale steps by about 1.25 (16, 20, 25, 31, 39, 49, 61 px); keep at most six sizes and two typefaces. Omit a standard section only when nothing supports it; keep the order.

## Tokens into code

Global CSS is shared zone. shadcn names its main action color `--primary`; its `--accent` is a subtle hover tint, so the DESIGN.md `accent` maps to `--primary` and `--ring`, never to shadcn's `--accent`.

```css
@import "tailwindcss";

:root {
  --background: oklch(99% 0.002 250);      /* colors.background */
  --foreground: oklch(19% 0.012 255);      /* colors.text */
  --card: oklch(100% 0 0);                 /* colors.surface */
  --card-foreground: var(--foreground); --popover: var(--card); --popover-foreground: var(--foreground);
  --muted: oklch(97% 0.004 250);           /* colors.surface-muted */
  --muted-foreground: oklch(52% 0.014 255); /* colors.text-muted */
  --border: oklch(92% 0.006 255); --input: var(--border);
  --primary: oklch(55% 0.17 250);          /* colors.accent */
  --primary-foreground: oklch(99% 0.002 250); --ring: var(--primary);
  --secondary: var(--muted); --secondary-foreground: var(--foreground);
  --accent: var(--muted); --accent-foreground: var(--foreground);  /* shadcn hover tint, not the brand accent */
  --destructive: oklch(55% 0.19 27);       /* colors.danger */
  --radius: 10px;                          /* rounded.md */
}

@theme inline {
  /* keep shadcn's --color-* and --radius-* mappings here, plus: */
  --font-sans: var(--font-body-face);
  --font-display: var(--font-display-face);
  --text-display: 3.5rem; --text-display--line-height: 1.05; --text-display--letter-spacing: -0.02em;
  --ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
}
```

Keep `@theme inline`: it lets a scoped override (the direction switcher, a second theme) re-theme every utility. In `app/layout.tsx`, load the two faces with `next/font/google`, give them `variable: "--font-display-face"` and `variable: "--font-body-face"`, and put both class names on `<html>`. Motion constants live in one module; see motion-and-wow.md.

## Shape check

- `colors`, `rounded`, and `spacing` are flat maps; names use letters, digits, and hyphens and start with a letter or digit.
- Each `typography` entry is a map using only `fontFamily`, `fontSize`, `lineHeight`, `fontWeight`, and `letterSpacing`.
- `components` values reference tokens (`"{colors.accent}"`) and introduce no new values.
- Exact values live in the frontmatter or the Themes section, not in other prose.
- Contrast pairs checked in every theme: `text` and `text-muted` on `background` and `surface` at 4.5:1 or more, `on-accent` on `accent` at 4.5:1, borders that carry meaning at 3:1 (WCAG 2.2 SC 1.4.3, 1.4.11).
- The Overview carries the Direction line; the Screen map has a row for every demo-path beat.
- No audit notes, rejected candidates, or open questions in the file; they go in your report. Every prose sentence changes an implementation choice.
