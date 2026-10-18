---
name: hack-backend
description: Builds a hackathon app's server side. Covers the smallest data model, API routes per demo beat, the AI pipeline (prompts, zod-validated structured output, streaming, latency budgets, timeouts, fallbacks, cost guard), demo mode that replays recorded AI responses, story seed data, and a quick prompt eval. Use for LLM calls, prompts, demo mode, or seed data. Not for stack, contracts, or ownership; use hack-architecture.
license: MIT
---

# Hack backend

**Make** the AI capability the pitch claims real, fast enough for the stage, and safe to demo without the network. That means one pipeline per capability, validated structured output, streaming past ~1.5 s, a fallback for every failure, and recorded replays behind `?demo=1`. The architect runs steps 1–5 late in plan; backend-dev runs steps 6–9 during build, inside cards claimed through `hack-build`. It applies the [principles](../hack/references/principles.md), above all "Fake the edges, never the core" and "Evidence over claims".

## Inputs

- **From `hack-architecture`:** the merged contracts in `lib/contracts/**` and `hack/ARCHITECTURE.md` (stack, data rung, fake-vs-real, ownership).
- **The beats in `hack/SPEC.md`:** what each beat sends, what it shows, and how long the presenter can talk over a wait.
- **The persona and story** from `hack/PITCH.md`.
- **Model settings:** `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` in `.env.local`. A missing key is a secret only a human can supply: ask for it, and never print or commit its value.
- **The stack and layout:** [../hack-architecture/references/golden-stack.md](../hack-architecture/references/golden-stack.md).

## Steps

1. **Trace beats to server work.** For each beat that touches the server, write down four things: the input, the capability (AI call, read, write, external API), the output schema from the contracts, and the wait the presenter can fill. Done when every server-touching beat has a row and each row names a contract schema.
2. **Model the data.**
   - Read [references/data-and-api.md](references/data-and-api.md) when choosing entities, the store, or route patterns.
   - Stay on the rung ARCHITECTURE.md chose, and model only entities that a beat reads or writes.
   - Done when the Data section lists the entities, the rung, and the store module path, and every entity serves a beat.
3. **List the API.**
   - Use one route handler per capability, at `app/api/<capability>/route.ts`, for anything streamed or fetched. Server actions are only for simple form mutations.
   - Every entry point checks its input against the contract schema and returns `{ error }` on failure.
   - Done when the API section has one row per route with its method, schemas, whether it streams, its beat, and its `maxDuration`.
4. **Design the AI pipeline.**
   - Read [references/ai-pipeline.md](references/ai-pipeline.md) when writing the LLM client, prompts, budgets, fallbacks, or the cost guard.
   - Settle these for each capability:
     - a prompt module in `lib/ai/prompts/`
     - structured output checked against the contract schema
     - streaming beyond ~1.5 s
     - tools only when the model must fetch data mid-answer
     - a latency budget for the beat: first visible output and total time
     - a timeout, one retry, and a fallback message
     - `maxOutputTokens` and a per-session call budget
     - secrets kept server-side, and the model chosen by env
   - Before choosing a model or tier priced beyond the event budget, ask a human. Spend is a human decision.
   - Done when the AI pipeline section has a row for every capability with all of these fields, and one call against the exact `LLM_MODEL` returned schema-valid output.
5. **Cut the cards.**
   - Read the board first and reuse any enabling card that already exists.
   - Add these cards in lane `ai`:
     - the enabling card "LLM client, demo mode, eval harness"
     - one card per capability, with its beat
     - "Story seed data for <persona>"
   - Use `scripts/hack add "<title>" [--beat B2] --p P0 --size M --lane ai --deps F-NN --as architect@<human>`. The seed card is usually `--size S`; enabling cards take no `--beat`.
   - Add a demo-mode check to each card's checks in SPEC.md, for example "with `?demo=1` and the network off, B2 replays end to end". Tell the product role when it owns the file.
   - Done when `scripts/hack check` passes and every capability has a card.
6. **Build the core.**
   - As backend-dev, claim the enabling card, then the capability cards, through `hack-build`.
   - Write `lib/ai/llm.ts`, one module per capability, and its route handler, replacing the contract stub.
   - Done when the route streams schema-valid output for the fixture request in live mode, first-chunk and total times are measured, and `scripts/gate.sh` passes.
7. **Wire demo mode.**
   - Read [references/demo-mode.md](references/demo-mode.md) when wiring `DEMO_MODE`, `?demo=1`, recording, or replay.
   - Record every demo input against the real model with `DEMO_RECORD=1`. Never hand-write or edit a recording, because the README tells judges that replays are real outputs.
   - Before committing recordings, read them for secrets and personal data. They ship in the repo and in the deploy.
   - In `e2e/golden-path.spec.ts`, make the first AI beat wait for its route's response and assert `x-demo-source` is `replay` when the spec's `DEMO` flag is on (`smoke.sh --live` turns it off), so `scripts/smoke.sh` catches a missing recording on the deployed URL.
   - Done when, with the network off, `?demo=1` replays every AI beat with streaming timing, each response carries `x-demo-source: replay`, and `scripts/smoke.sh` passes.
8. **Seed the story.**
   - Write `lib/demo/seed.ts` around the persona, reusing the contract fixtures. Use realistic records a judge recognizes, sized for the beats: five to eight items, not one and not five hundred.
   - Never invent metrics, user counts, or results. Every number on screen is either an input or computed by the app.
   - Done when every beat renders from seed alone and each number on screen traces back to seed input or app logic.
9. **Evaluate the prompts.**
   - Keep 5–10 cases in `lib/ai/eval/cases.ts`: the demo inputs plus long, messy, and off-topic ones.
   - Run them without a framework: `pnpm exec tsx --env-file=.env.local lib/ai/eval/run.ts | tee hack/reviews/eval-<MMDD-HHMM>.md`.
   - Rerun after every prompt or model change and before feature freeze. When outputs change, re-record with `DEMO_RECORD=1` so demo mode matches live.
   - Done when every case prints `valid`, the demo cases meet their latency budget, and the eval file is committed.

## Deliverable

```text
AI pipeline: <n> capabilities · model <LLM_MODEL> at <provider host> · sections filled in hack/ARCHITECTURE.md
Latency: <capability> first chunk <s> / total <s> vs budget <s> / <s>
Demo mode: <n> recordings · offline ?demo=1 replay ok · x-demo-source: replay on <url>
Seed: lib/demo/seed.ts · persona <name> · <n> records · numbers traced to input or logic
Eval: <k>/<n> valid · hack/reviews/eval-<MMDD-HHMM>.md
Cost guard: maxOutputTokens <n> · session budget <n> calls · provider spend cap set by <human | unknown>
Cards: <ids> · Assumed: <lines | none>
```

Every line cites a file, a command's output, or a response header seen in this session.

## When blocked

- **No API key yet.** Build against the contract stub and fixtures, ask a human for the key, and keep the capability card `blocked` with that reason.
- **The model returns invalid JSON.** Flatten the schema and add `.describe()`. Put the JSON Schema and one example in the prompt. Set `LLM_STRUCTURED_OUTPUTS=1` if the provider supports JSON Schema output. Otherwise switch the model through env and record it with `scripts/hack decide`.
- **Too slow for the beat.** Stream, shrink the output (fewer items, shorter fields), or try a faster model. Alternatively, precompute at seed time and label it in fake-vs-real. Demo mode covers the stage, but live mode still needs its fallback.
- **The provider returns 400 on a parameter.** Drop `temperature`, `top_p`, and forced `tool_choice`, then check the provider's OpenAI-compatibility notes.
- **Rate limit or budget hit near judging.** Demo mode is the default for the stage and the video. The live URL shows the fallback message, never a stack trace.
- **Running as a subagent.** You cannot ask for keys or spend approval. Return `STATUS: needs-decision` with the exact question ([../hack/references/dispatch.md](../hack/references/dispatch.md) §Report contract).
