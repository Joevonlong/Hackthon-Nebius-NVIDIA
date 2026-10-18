# Direction switcher

One route, three directions, flipped with `?direction=` and a floating bar. The human compares real screens with real story data instead of mood boards, and the winner drops straight into code, because each direction is a set of CSS variables plus at most one layout variant.

## Budget: 20–30 minutes

1. **Token sets (5 min).** One `[data-direction="<id>"]` block per direction in a prototype stylesheet. It redefines the shadcn variables (`--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--border`, `--primary`, `--primary-foreground`, `--ring`), `--radius`, and the font variables. This works because global CSS uses `@theme inline`.
2. **Posture (15 min).** Directions differ in structure, not only color: radius, border weight, density, type scale, and on the wow screen one layout variant per direction where the posture calls for it (a dense table, spacious cards, an editorial column).
3. **Switcher and screenshots (5–10 min).**

## Wiring

- **Where:** mount on the existing demo routes for the opening and wow beats, keeping their data loading and `?demo=1`. Use a throwaway `/prototype/directions` route only when those routes do not exist yet.
- **Branch:** work in your design card's worktree (`scripts/hack wt F-xx`). This branch is the throwaway: push it, never merge it. The tokens reach main through a separate small branch.
- **Fonts:** load every candidate face with `next/font/google`, each with its own `variable`; each direction block points `--font-display-face` and `--font-body-face` at its pair.

```tsx
// the beat's page (server component)
export default async function Page({ searchParams }: { searchParams: Promise<{ direction?: string }> }) {
  const { direction = "precise" } = await searchParams;
  return (
    <div data-direction={direction} className="min-h-dvh bg-background font-sans text-foreground">
      {direction === "operator" ? <WowDense story={story} /> : <WowCards story={story} />}
      <Suspense><DirectionSwitcher ids={["precise", "operator", "editorial"]} /></Suspense>
    </div>
  );
}
```

```tsx
"use client";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

const SHOW = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DESIGN_SWITCHER === "1";

export function DirectionSwitcher({ ids }: { ids: string[] }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const current = params.get("direction") ?? ids[0];
  const go = (step: number) => {
    const next = new URLSearchParams(params.toString()); // keeps demo=1 and other params
    next.set("direction", ids[(ids.indexOf(current) + step + ids.length) % ids.length]);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  useEffect(() => {
    if (!SHOW) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!SHOW) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-neutral-950/90 px-2 py-1 text-sm text-white shadow-lg">
      <button aria-label="Previous direction" onClick={() => go(-1)}><ChevronLeft className="size-4" /></button>
      <span>{current}</span>
      <button aria-label="Next direction" onClick={() => go(1)}><ChevronRight className="size-4" /></button>
    </div>
  );
}
```

The bar is deliberately off-system (near-black pill) so nobody mistakes it for part of a direction. `useSearchParams` needs the `<Suspense>` boundary during static rendering. The bar never renders in a production build unless `NEXT_PUBLIC_DESIGN_SWITCHER=1`, which you set only on the prototype's preview deployment, so a stray merge cannot ship it.

## Screenshots

Capture each direction × screen at 1440×900 in demo mode, with motion settled and the wow screen in its payoff state: a short Playwright script that clicks the trigger and waits, or the matching `beat()` steps from `e2e/golden-path.spec.ts` once they exist.

```bash
for d in precise operator editorial; do for b in B1 B4; do   # B1 opens the demo; B4 is the wow beat here
  npx playwright screenshot --viewport-size="1440,900" --wait-for-timeout=2500 \
    "http://localhost:<port>/<path-for-$b>?demo=1&direction=$d" "hack/demo/media/direction-$d-$b.png"
done; done
```

Open every image before showing it; retake blank, mid-animation, or wrong-screen shots.

## Presenting the choice

One message, so the human decides in one look:

```text
Pick a direction for <product> (← → flips them at <url>?demo=1):
A Precise   — quiet, software-native; fits <persona> as a <role>. shots: …-precise-B1.png, …-precise-B4.png
B Operator  — dark, dense, numbers first; makes the B4 payoff feel like a control room. shots: …
C Editorial — serif, calm, reads like a briefing; strongest for a reading-heavy persona. shots: …
Recommend B: the wow beat is a number changing, and B gives it the most weight. Mixing is fine ("A's type, B's density").
```

## After the pick

- **Winner:** tokens into DESIGN.md and the shared-zone token branch. Rewrite the winning wow-screen layout properly in the real component; prototype code is not production code.
- **Losers:** stay on the pushed prototype branch; nothing of them lands on main.
- **Switcher:** off main. If the team wants it later for a second look at the wow screen, it stays behind the production gate above.

Pattern adapted from the `prototype` skill in mattpocock/skills (UI variants behind a URL parameter with a floating switcher); see `docs/sources.md`.
