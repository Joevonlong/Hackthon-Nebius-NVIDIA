# PITCH.md template

Read this when creating `hack/PITCH.md` in step 1 and again before the G1 round. Fill sections as rounds settle them; an unsettled section keeps its placeholder until the next round, and an assumed one starts with `Assumed:`. Write in `doc_language`; give the one-liner, name, and tagline also in `submission_language` when it differs.

```markdown
# Pitch: <name>

Status: draft

## One-liner

For <persona> who <pain moment>, <name> <does X> so <outcome>.

## Customer

- Persona: <role> in <context>
- Example person: <name>, <one-line situation> (fictional; reused in the demo seed data)
- Why them first: <reason>

## Painful moment

- Trigger: <when it happens>
- Today's workaround: <tool or hack>
- Cost: <time, money, or risk per occurrence> × <frequency> (source: <link, interview, or team estimate>)

## Before and after

| | Before | After |
|---|---|---|
| What <example person> does | <steps today> | <steps with the product> |
| Time or cost | <today> | <with the product> |

## Why AI

<What is impossible or ten times slower without the model, and why pasting into a chat assistant does not do it.>

## Wow moment

<The one screen: what appears, how fast, and what the judge understands without narration.>

## Demo story

1. <persona and painful moment>
2. <…>
3. <wow, about two thirds in>
4. <after: the outcome in the persona's terms>

Length: <m:ss> of <demo length>. hack-spec turns this sketch into the timed demo script.

## Riskiest assumption

- Assumption: <one falsifiable sentence>
- Spike: <input> · <command or prompt> · pass when <criterion> · budget 30 min
- Result: <pass | fail | not run> · <observed output or file path> · <MM-DD HH:MM>

## Judging map

| Criterion (weight) | How this pitch scores | Beat or evidence | Risk |
|---|---|---|---|
| <criterion> (<weight>) | <how> | <beat or fact> | <risk or none> |

## Out of scope

- <tempting feature>: <why not now>

## Name and tagline

- Name: <name> · collision check: <what the search found>
- Tagline: <short line in submission_language>

## 30-second test

- Reader: <judge role or teammate>, given only the one-liner · said: "<their words>" · <pass | fail>

## Ideas considered

| Idea | Score | Outcome |
|---|---|---|
| <one-liner> | <x.x> | <picked / runner-up / killed by K<n>> |

## Open questions and assumptions

- Assumed: <assumption> · <who can confirm>
```

## The Status line

Keep exactly one Status line, directly under the title. `scripts/hack status` reports G1 as passed when any line of the file on `origin/main` starts with `Status: locked`, so never write that phrase at the start of any other line, including notes and quotes.

At G1 the line becomes `Status: locked (<human>, <MM-DD HH:MM>, D-NN)`: `<human>` is the approver's handle from `team` in HACKATHON.md, the time is in the event's UTC offset, and `D-NN` is the ID `scripts/hack decide` printed. A pitch change after G1 is a new decision line that names the one it supersedes, and the Status line takes the new ID.

## Writing rules

- No invented metrics, testimonials, or user counts. Every number cites a source, the spike, or is marked as the team's estimate.
- The example person is fictional and labeled; never use a real person's private details.
- Keep the one-liner under about 30 words, so a reader can repeat it after one reading.
