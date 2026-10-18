# Idea scoring

Read this when the team has no idea, or several, and needs one. It turns a theme into 5–10 candidates, kills the ones that cannot win in one or two days, scores the rest, and puts the top three to the user in one round.

## Generate candidates

Draw from several sources so the list is not ten variations of one idea:

- **The team's own pain.** A painful moment someone on the team has lived, at work or before. These give the clearest customer and the most believable demo.
- **Theme × required tech.** What the sponsor's API or the theme makes newly cheap: reading long messy documents, generating media, acting through a tool, reasoning over a dataset.
- **The heaviest rubric line.** Which idea would score highest on the top-weighted judging criterion by design.
- **Expensive human glue.** Places where one kind of person copy-pastes between tools, re-reads long documents, or waits days for an expert.

Write every candidate, including each idea the team brought, as a draft one-liner: `For <persona> who <pain moment>, <idea> <does X> so <outcome>.` A candidate that cannot fill all four slots is a theme, not an idea: narrow it or drop it, and say which.

## Kill tests

A candidate that fails any test is out, unless a reshaped version passes; then score the reshaped version and say what changed. Record the test that killed each one, so nothing disappears silently.

| # | Fails when | Usual reshape |
|---|---|---|
| K1 | The customer cannot be named as one role in one situation ("businesses", "students", "everyone") | Pick the role that feels the pain every week |
| K2 | It needs data the team cannot get, license, or synthesize by tomorrow | A public dataset or realistic seeded data |
| K3 | The AI is a thin wrapper: a judge gets the same result by pasting into a chat assistant | Add what chat cannot do: the persona's context, live data, a tool action, a multi-step workflow |
| K4 | The wow needs more than a day of infrastructure (training, real-time media at scale, an app-store review) | Move the wow to what an API call and one screen can show |
| K5 | The value appears only after days of use or with many users (two-sided marketplace, network effects) | One persona, one session, seeded history |
| K6 | It depends on access the team does not have today (waitlisted API, partner approval, absent hardware) | Swap the provider, or fake that edge if it is not the core |
| K7 | It breaks the event rules (required tech unused, too much pre-existing code) | None; drop it |
| K8 | The core claim cannot be shown without real personal, medical, or financial data | Clearly synthetic data, or a different customer |

## Score the survivors

Score each criterion 1–5, multiply by its weight, and sum to a score out of 5. The weights are a heuristic.

| Criterion | Weight | 5 looks like | 1 looks like |
|---|---|---|---|
| Customer clarity | 20% | One role in one context; the team can describe one such person's Monday | A segment or an industry |
| Pain intensity × frequency | 20% | Weekly or daily, costs hours or money, and they already run a workaround | Occasional, mild, no workaround |
| Narrow and buildable | 20% | The demo path is 3–4 screens and one AI step on known APIs, inside the build hours | Several integrations or unknown APIs |
| Wow in 3 minutes | 20% | One screen where the after is visibly better and the business logic reads without narration | The value is a number in a log or a slow batch job |
| Judging and sponsor fit | 10% | Scores on the top-weighted criteria; sponsor tech is central | Off-theme, or sponsor tech bolted on |
| Team fit | 10% | The team has built this stack or knows this domain | Everything is new |

Adjust to the event: when one rubric line carries 30% or more, move 10 points of weight to the matching criterion (impact or usefulness → pain; technical execution or use of AI → narrow and buildable; creativity or presentation → wow; a sponsor prize → judging fit).

Ties go to the narrower customer, then to the cheaper wow.

## Judge pre-score (optional)

For a close call between the top two, dispatch the judge role read-only with the rubric from `hack/HACKATHON.md` and the two one-liners, nothing else. Ask for a score per rubric line and the one sentence it would remember about each. Save the reply as `hack/reviews/judge-idea-<MMDD-HHMM>.md`. It informs your recommendation; the user decides.

## Present the round

One round, top three, recommendation first. A filled example (fictional):

| # | One-liner | Score | Wow in one sentence | Biggest risk |
|---|---|---|---|---|
| 1 | For solo bookkeepers who reconcile 40 supplier invoices every Monday, Tally reads the inbox and matches each line to the ledger so Monday is done by ten | 4.3 | A messy inbox becomes a matched ledger with one duplicate caught | Invoice layouts vary widely |
| 2 | For new landlords who sign leases they cannot read, Clausewise flags the five clauses that cost money | 3.8 | A 40-page lease collapses to five red cards with euro amounts | Legal-advice framing |
| 3 | For hackathon judges who score 60 projects a day, Rubricly drafts a score sheet from the repo | 3.1 | A repo URL turns into a filled rubric | Customer is tiny; K3 borderline |

Then ask one question, "Which idea do we grill?", with your recommendation and its reason in one line. List the killed candidates under the table with their kill test.
