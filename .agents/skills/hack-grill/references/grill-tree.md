# Grill tree

Read this before the first grill round. It lists the decisions a hackathon pitch needs, which ones hang off which, and when each counts as settled.

## How a round works

- The **frontier** is every unsettled node whose prerequisites are settled. Ask it in one round, at most four questions; when more are open, ask first the ones with the most nodes below them.
- A question whose answer depends on another question still open in the same round waits for the next round.
- Number each question and give it a bold title. Offer two or three concrete options when they help, then give your recommendation with a one-line reason on its own line. Separate questions with a horizontal rule. A filled example:

```text
❓ **Q1** - **Customer**: Who is the one person the demo is for?
(a) restaurant owners · (b) solo bookkeepers serving 10–20 restaurants · (c) accounting firms

➡️ (b): they reconcile supplier invoices by hand every Monday, and one bookkeeper is easy to stage.

---

❓ **Q2** - **Painful moment**: …
```

- Facts are yours to find: read the docs, search the web, or dispatch a read-only research subagent. Do not block on a lookup; only the questions downstream of it wait, and the rest of the frontier goes out now.
- Decisions are the user's. A broad answer gets a narrowing follow-up next round ("Of those, who feels it every week?") instead of being accepted.
- After each round, write the answers into `hack/PITCH.md` and recompute the frontier. An answer that reopens an upstream node reopens everything below it; say which nodes reopened.
- The grill is finished when the frontier is empty and the user confirms the summary at G1.

## Nodes

| Node | Needs | Settled when | Narrow further when you hear |
|---|---|---|---|
| N1 Customer | the idea | A role in a context, one example person with a name and a one-line situation (fictional and labeled is fine), and why them before their neighbours | "SMBs", "developers", "anyone who …"; nobody on the team can describe their week |
| N2 Painful moment | N1 | The trigger (when it happens), today's workaround (tool or hack), the cost per occurrence (time, money, risk), and the frequency, each with its source | "It's inefficient"; no workaround exists, which usually means it does not hurt |
| N3 Single job | N2 | One verb and one object that end in an outcome the persona acts on ("turn a 40-page lease into the five clauses that cost money") | "Platform", "assistant for everything", two jobs joined by "and" |
| N4 Why AI | N3 | What is impossible or ten times slower without the model, and why a chat assistant alone cannot do it (kill test K3) | A chatbot bolted on; a rule or a query would do |
| N5 Riskiest assumption | N3, N4 | One falsifiable sentence and a spike plan: input, command or prompt, pass criterion, 30 minutes at most | "It should work" |
| N6 Wow moment | N3, N4 | One screen: what appears, how fast, why a judge reacts. It shows the core AI working, and its business logic (input → AI step → outcome) reads without narration | A metrics dashboard, a settings page, a chat box full of text |
| N7 Demo story | N2, N6 | Before → after in 3–5 beats within the demo length: opens on the painful moment, wow about two thirds in, closes on the outcome | Opens with login or onboarding; explains the architecture |
| N8 Judging map | N6, N7, rubric | Each weighted criterion maps to a beat or fact that scores it; weak criteria are named with a plan or accepted | A heavy criterion with nothing mapped |
| N9 Out of scope | N3, N7 | An explicit list, including the tempting features, and auth, settings, and onboarding unless a beat needs them | The list is empty |
| N10 Name and tagline | N1–N3, N6 | A short name with a collision check (web search) and the one-liner `For <persona> who <pain moment>, <name> <does X> so <outcome>.` | The name describes the technology, not the outcome |

N1, N2, N6, and N10 are on the human list in principles.md: never settle them as `Assumed:`.

## Typical rounds

| Round | Frontier |
|---|---|
| R1 | N1, plus the idea if step 2 left it open |
| R2 | N2 |
| R3 | N3, N4 |
| R4 | N5 (the spike starts now), N6, a first N9 |
| R5 | N7, N8, N10 |
| R6 | G1 approval |

Events of 8 hours or less get three rounds: R1 = N1 + N2, R2 = N3 + N4 + N6, R3 = N7 + N10 and the G1 approval. N5 runs as a spike in parallel; you draft N8 and N9 and show them in R3.

## Recommending

- Recommend the narrower option every time, unless it removes the wow.
- Prefer a customer someone on the team has been or works with; their details make the demo believable.
- Ground each recommendation in a fact you looked up, cited in one clause.
- Never fill a cost or frequency with an invented number. Cite a source, mark it as the team's estimate, or leave it open.
- Prefer a wow the designer can make beautiful on one screen over one that needs a tour of several.
