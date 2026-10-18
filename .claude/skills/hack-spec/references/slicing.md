# Slicing features

Read this when deriving features in step 3, when checking capacity in step 5, and whenever a card turns out too big.

## One feature, one visible outcome

- A feature is one outcome a judge can see, or a caller can observe, serving one beat. Its board title says what the demo shows, at most 80 characters: "Risk panel streams the five costliest clauses beside the PDF".
- Split when a title joins two outcomes that could be demoed separately, when it needs more than three checks, or when it spans two lanes.
- **Cross-lane beats split at the contract.** When B2 needs the `ai` and `fe` lanes, write one card per lane, both depending on the contract card and not on each other: the ai card returns contract-valid output for the seed input; the fe card renders the same shape from fixtures (principle "Contract first, parallel after"). The beat's end-to-end run on real AI is proven by its golden-path smoke step at a sync point, not by either card.
- **Enabling cards** take beat `—`: shared contracts and fixtures, seed data, demo mode and recordings, a spike. Before adding one, read the board: `hack-architecture` or `hack-backend` may have added it already, so reference that ID instead.
- F-00, the walking skeleton, is already on the board. The first card in each lane depends on F-00 or on a card that does.

## Priority

| P | Means | Test |
|---|---|---|
| P0 | The demo fails without it | Without it, a beat breaks or its screen looks unfinished |
| P1 | The demo is stronger with it | A second example, a smoother transition, another input type |
| P2 | Only with spare time | No beat needs it |

Every beat has at least one P0. A feature no beat needs is P2 or cut.

## Size

- **S** is up to 1 hour and **M** up to 3 hours for one builder (a person driving an agent, or one agent). The board's Size column holds it, and `scripts/hack status` sums open P0 sizes into the burn-down line the captain cuts from.
- Anything bigger splits, preferring in order: fixtures first, then real data; happy path first, then states; one input variant first; one lane per card at the contract.
- M is the ceiling because a branch should merge within about three hours (git-flow.md in the hack skill).

## Demo checks

At most three per feature, each an observable statement on the seed data that a browser, a request, or a screenshot confirms:

- "Given the seeded lease 'Harbor St 12', the panel lists five clauses with cost badges within 8 s."
- "`POST /api/analyze` with the seed PDF returns JSON that parses with the `Analysis` contract."
- "With demo mode on and the network off, B2 replays the recorded stream end to end."

Words like "works", "handles errors", "is fast", or "looks good" are not checks; rewrite them as what is seen, with a number where one applies. The checks become the DONE WHEN line of the dispatch brief and the evidence for `done`.

## fake-ok

Mark a feature `fake-ok` when a peripheral edge may be mocked: auth, payments, sending email or SMS, third-party sync, file storage, a second data source. Say what the fake is ("seeded inbox instead of Gmail OAuth"). Never mark the AI capability the pitch claims or the core of the wow beat. `hack-architecture` keeps the full fake-vs-real table, and the README discloses it.

## Critical path

The longest dependency chain, by summed size, from F-00 to the last card of the wow beat. More builders cannot shorten it; only splitting, building against fixtures, or faking an edge on it can. Aim for it to end before the 60% sync point, when every P0 beat must exist on prod (timeline.md in the hack skill). The captain dispatches critical-path cards first.

## Capacity

1. **Build hours:** from G2 (20%) to feature freeze (70%), from `scripts/hack timeline`.
2. **Builder slots:** the builds that will really run at once, one per person driving an agent or 2–4 subagents on one machine (dispatch.md in the hack skill), capped by the number of lanes with cards.
3. **Builder-hours:** slots × build hours, minus each person's sleep block (timeline.md in the hack skill, §People and sleep).
4. **Fit:** P0 hours (S = 1, M = 3) at most 60% of builder-hours; merges, fixes, sync points, and P1 take the rest (heuristic).

Worked example (the 24-hour event in timeline.md): build window 11.75 h, 3 slots, one person sleeps 4 h → 3 × 11.75 − 4 = 31 builder-hours; 60% is 18.6 h. Eight P0 cards (5 S + 3 M = 14 h) fit.

When P0 does not fit, cut in the captain's order: simplify a P0 to its demo checks, demote a P0 no beat strictly needs, mark a peripheral edge `fake-ok`. Removing a beat is the user's decision; recommend one in the G2 round, never B1 or the wow.

## Board commands

Add rows in SPEC.md order, dependencies first, so the CLI's next free IDs match. Enabling cards omit `--beat`:

```bash
scripts/hack add "Analysis schema and seed fixtures in lib/contracts" --p P0 --size S --lane be --deps F-00 --as product@joe
scripts/hack add "Analyze API returns contract-valid clauses for the seed lease" --beat B2 --p P0 --size M --lane ai --deps F-01 --as product@joe
scripts/hack add "Risk panel streams clauses beside the PDF from fixtures" --beat B2 --p P0 --size M --lane fe --deps F-01 --as product@joe
```

Read the ID each command prints, then run `scripts/hack check`. Size lives on both the board and SPEC.md; checks and `fake-ok` live only in SPEC.md.
