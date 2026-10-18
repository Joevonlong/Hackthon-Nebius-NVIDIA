# Board and CLI

`hack/BOARD.md` is the team's single source of truth for who does what. Change it only through `scripts/hack`, which commits each change straight onto `origin/main` (git plumbing, no checkout, retries on races), so it works from any branch or worktree and never conflicts with feature branches. Feature branches never edit `hack/BOARD.md`.

## Row format

```markdown
| ID | Feature | Beat | P | Size | Lane | Deps | Owner | Status | Updated | Evidence |
|----|---------|------|---|------|------|------|-------|--------|---------|----------|
| F-03 | Stream the clause-risk summary beside the PDF | B2 | P0 | M | ai | F-01 | alice | doing | 10-18 13:05 | |
```

| Column | Values |
|---|---|
| ID | `F-00`…`F-99`, never reused. `F-00` is the walking skeleton. Bugs found later are new rows titled `Fix: …`. |
| Feature | One user-visible outcome, ≤ 80 chars, written as what the demo shows. |
| Beat | `B1`…`B6` from SPEC.md, or `—` for enabling work. |
| P | `P0` demo fails without it · `P1` demo is stronger with it · `P2` only with spare time. |
| Size | `S` about 1 h · `M` about 3 h for one builder. Anything bigger is split before it reaches the board. |
| Lane | A key of `lanes` in HACKATHON.md: default `fe`, `be`, `ai`, `infra`, `design`, `story`. |
| Deps | IDs that must be `done` first, comma-separated, or `—`. |
| Status | `todo` · `doing` · `blocked` · `done` · `cut`. |
| Updated | `MM-DD HH:MM` in the event's UTC offset. |
| Evidence | Required for `done`: merged short SHA + what was observed. Reason for `blocked` and `cut`. |

A card is **ready** when it is `todo` and every dep is `done`. A `doing` card with no update for `stale_after_minutes` is **stale**.

## Commands

| Command | Effect |
|---|---|
| `scripts/hack status [--json]` | Phase, time left, next gate, gates passed, counts, claims, stale and ready cards, P0 burn-down (open P0 size vs hours to freeze) |
| `scripts/hack timeline` | Absolute phase and sync-point times |
| `scripts/hack next [--lane fe] [--as name]` | The best ready card for you: own lane first, other lanes after `steal_after_minutes` ready |
| `scripts/hack claim F-03 [--as name] [--steal] [--force]` | `todo` → `doing` with owner. Refuses when deps are open, the owner is at `max_active`, or another lane's card is not yet stealable. `--steal` takes a stale card and logs it; `--force` is the captain's override |
| `scripts/hack done F-03 --evidence "a1b2c3d; gate ok; shot hack/demo/shots/B2.png"` | → `done`. Refuses without evidence |
| `scripts/hack block F-03 --reason "..."` | → `blocked`, reason in Evidence |
| `scripts/hack release F-03` | → `todo`, owner cleared |
| `scripts/hack cut F-03 --reason "..."` | → `cut` (P0 cuts also need a decision line) |
| `scripts/hack add "title" --p P0 --lane fe [--beat B2] [--size S\|M] [--deps F-01,F-02] [--id F-NN]` | New row with the next free ID. `--beat` defaults to `—` (enabling work), `--size` to `M` |
| `scripts/hack set F-03 p=P1 size=S lane=be deps=F-01 title="..."` | Edit fields while re-scoping; `status=doing` reopens a `done` card |
| `scripts/hack event prod_url=https://x.vercel.app [key=value ...]` | Set keys in the `hack/HACKATHON.md` frontmatter (URLs, `autonomy`, `merge_mode`, limits, languages, times); refuses values that break the clock |
| `scripts/hack decide "text · why: reason"` | Append `D-NN` to `hack/DECISIONS.md` |
| `scripts/hack log "text"` | Append a line to the board log |
| `scripts/hack check` | Validate the board: columns, unique IDs, known lanes and sizes, deps that exist, evidence on `done` |
| `scripts/hack wt F-03 [--remove]` | Create (or remove) the worktree and branch for a card; prints path and port |

Owner defaults to `git config user.name`; agents pass `--as <role>@<human>`, for example `--as frontend-dev@joe`, so the board shows both.

Every command prints the row it changed and the commit it pushed. A push rejected because main moved is retried automatically on the fresh board. A push that fails for any other reason (offline, auth) leaves the board unchanged and says so; run again, or pass the global `--local` (`scripts/hack --local claim F-03`) to commit on local `main` and push later. With no `origin` remote, or before `origin/main` exists, the CLI always commits locally and says why.

## Evidence examples

- `done`: `a1b2c3d; gate ok 64s; smoke B2 ok; https://x.vercel.app/demo?step=2`
- `done` for a non-code card (design, story): `hack/DESIGN.md §Direction; screenshot hack/demo/media/direction.png`
- `blocked`: `waiting on F-01 contract field riskScore; asked captain 13:10`
- `cut`: `D-07: replaced live Slack sync with a seeded inbox (fake edge)`

## Reading the board by hand

When the CLI is unavailable, `git fetch && git show origin/main:hack/BOARD.md` is the current board. Edit it by hand only on `main`, as a single small commit, then push.
