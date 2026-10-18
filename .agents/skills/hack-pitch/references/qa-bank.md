# Q&A bank

Read this when writing `hack/demo/QA.md`. Judges ask the same handful of questions at almost every event; a team that answers them in 30 seconds with evidence scores on presentation and on the criterion behind the question.

## Answer shape

- **At most 30 seconds,** about 75 words at 150 words per minute.
- **First sentence answers the question.** Then one piece of evidence (a screen, a number with its source, a file). Then one sentence back to the persona or the wow.
- **Drawn from the docs.** Each answer names its source: PITCH.md, ARCHITECTURE.md, DECISIONS.md, BOARD.md, a review, or a cited page. No new claims in Q&A.
- **Honest limits.** "We haven't measured that yet; this weekend we checked <what>, and next we would <how>." Never invent an accuracy figure, a user, or a customer conversation.
- **One owner per answer,** the teammate who knows it best. The talker hands off by name.

## Standard questions

| # | Question | Answer from | What a strong answer contains |
|---|---|---|---|
| 1 | Who pays for this? | PITCH.md persona and before/after | Who buys (may differ from who uses), the cost of the pain from PITCH.md, a pricing idea labeled as a hypothesis |
| 2 | Why does this need AI? | PITCH.md §Why AI, ARCHITECTURE.md AI pipeline | What the model does that rules or a form cannot, and why pasting into a chat assistant does not do it |
| 3 | What is real and what is mocked? | ARCHITECTURE.md fake-vs-real matrix | The matrix, read plainly; demo mode replays recorded outputs of the real pipeline, and you can run it live |
| 4 | How accurate is it? What about hallucinations? | Spike result in PITCH.md, any eval the team ran, guardrails in ARCHITECTURE.md | The real check you ran, with its count (fictional shape: "we tried it on 20 invoices; 17 matched, 3 went to review"), the guardrail (schema validation, citations, human review), the plan to measure more |
| 5 | Where does user data go? | ARCHITECTURE.md (providers, storage), `.env.example` | Which third parties receive data, what is stored and where, that the demo uses synthetic data |
| 6 | How is this different from <competitor or a chat assistant>? | Research notes, PITCH.md | One sentence on the narrow persona and moment, one on the workflow the product owns that a general tool does not |
| 7 | What's next? | SPEC.md P1/P2, cut cards on BOARD.md | The next two steps for the same persona, not a platform vision |
| 8 | What was technically hardest? | DECISIONS.md, board log, red-main notes | One real problem, what you tried, what worked |
| 9 | What did you build this weekend and what existed before? | HACKATHON.md rules, `git log --reverse --format='%h %ad %s' \| head` | The first commit's time, what came from templates or libraries, anything pre-existing disclosed per the rules |
| 10 | Does it scale? What does a request cost? | ARCHITECTURE.md, the provider's pricing page | The first bottleneck you know of, cost per run computed from the provider's published pricing with the link, what you would change at 100× |

Also prepare, when they apply:

- **"Can I try it?"** The prod URL, demo mode, and whether live AI works for visitors (quota, rate limits).
- **"Why this persona?"** PITCH.md §Customer, why them first.
- **"How did you use <sponsor>?"** Exactly which call or component uses it, and where it is visible.

## Event-specific questions

- One question per rubric criterion: phrase what a skeptical judge would ask to test it ("What makes this technically hard?" for technical depth).
- Every doubt raised in the newest judge review in `hack/reviews/`.
- Anything the fake-vs-real matrix marks as mocked: expect "so does it actually work?" and answer with the real part.

## QA.md format

```markdown
# Q&A · <project>

| # | Question | 30-second answer | Source | Owner |
|---|---|---|---|---|
| 1 | Who pays for this? | "<answer>" | PITCH.md §Customer | <name> |
```

Write answers in `submission_language`, as spoken sentences rather than bullet notes.

## Practice

- One teammate fires questions in random order; the owner answers against a 30-second timer.
- Mark answers that ran long or needed a second try, and tighten them.
- The judge role adds five questions the bank does not cover after the rehearsal review; add each with an answer.
