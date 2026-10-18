# Principles

Every hack skill and role follows these. Skills cite them by bold name. Each one changes a concrete decision.

1. **Narrow beats broad.** One named customer, one painful moment, one before/after. A judge can repeat the pitch in one sentence after 30 seconds. When in doubt, narrow the customer before narrowing the features.
2. **Demo-driven development.** The demo script is written before code. Every P0 feature exists because a demo beat needs it; anything no beat needs is P2 or cut.
3. **Deploy in hour one.** A walking skeleton (F-00) runs on a public URL before feature work. Deploy problems found at hour 20 kill demos.
4. **Always-demoable main.** After F-00, `main` is deployable at every moment. A merge that breaks it is fixed within 10 minutes or reverted.
5. **Contract first, parallel after.** Shared types, schemas, and fixture data land before lanes split, so the frontend builds against fixtures while the backend builds the real thing.
6. **Fake the edges, never the core.** The AI capability the pitch claims is real. Peripheral parts (auth, payments, third-party sync) may be mocked, and the README says which.
7. **Polish the path.** Only the demo path gets empty, loading, streaming, and error states, motion, and final copy. Screens off the path stay rough or do not exist.
8. **Cut scope, not quality.** When behind, cut P1 and P2 or simplify a feature; never ship a beat that breaks or looks unfinished.
9. **Time-box everything.** Every phase and card has a budget. At 1.5× budget the owner stops and escalates: cut, fake, or simplify.
10. **Facts are the agent's job, decisions are the human's.** Agents look things up and run experiments; humans choose the customer, the wow moment, the visual direction, and anything public or paid. Reversible work continues on a labeled assumption instead of waiting.
11. **Evidence over claims.** Done means seen working in this session: a command's output, a screenshot, a URL that answered. A report without evidence is a draft.
12. **Judges are users too.** They see dozens of projects in a day. The first 10 seconds of the page, the video, and the README say who it is for and what changes for them.

## What this rules out

- Writing a PRD, user stories, or a backlog bigger than the demo needs.
- Full CI, coverage targets, UI unit tests, or review-per-card ceremonies.
- A second repository, a monorepo split, or microservices.
- Auth, settings pages, onboarding, or admin screens unless a demo beat needs them.
- Invented metrics, testimonials, or user counts in the pitch, page, video, or README.
- Waiting for a human on anything reversible.

## Human decisions (the only ones)

| Decision | When | Skill |
|---|---|---|
| G1 pitch lock: customer, pain moment, wow moment, name | end of grill | `hack-grill` |
| G2 scope lock: P0 list and visual direction | end of plan | `hack-spec`, `hack-design` |
| Cuts that remove a demo beat | any time | `hack` (captain) |
| Anything public, paid, destructive, or irreversible | any time | any |
| G3 submission | end | `hack-readme` |
