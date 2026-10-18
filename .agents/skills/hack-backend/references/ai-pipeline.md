# AI pipeline

Each capability gets one prompt module, one capability module, and one route. The route is in data-and-api.md; replay and recording are in demo-mode.md. The code targets AI SDK 7 (`ai@^7`) with zod 4.

## Client and portability

```ts
// lib/ai/llm.ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";

export function model() {
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_STRUCTURED_OUTPUTS } = process.env;
  if (!LLM_BASE_URL || !LLM_MODEL) throw new Error("Set LLM_BASE_URL and LLM_MODEL in .env.local");
  const provider = createOpenAICompatible({ name: "llm", baseURL: LLM_BASE_URL, apiKey: LLM_API_KEY,
    includeUsage: true, supportsStructuredOutputs: LLM_STRUCTURED_OUTPUTS === "1" });
  return wrapLanguageModel({ model: provider(LLM_MODEL), middleware: extractReasoningMiddleware({ tagName: "think" }) });
}
```

Any OpenAI-compatible provider sits behind these env vars. These rules keep one code path working on all of them:
- **Check env inside the call, not at import.** Then `next build` passes without keys, and a missing variable surfaces as the route's fallback plus a log line that names it.
- **Leave `temperature` and `top_p` unset, and never force `toolChoice`.** Some endpoints reject non-default values; Anthropic's compatibility endpoint does on recent Claude models.
- **Never rely on `response_format`.** Several endpoints ignore it. Put the JSON Schema in the instructions instead; the SDK still validates the reply against zod. Make one real call per capability with the exact `LLM_MODEL` string before building on it.
- **Keep `import "server-only"` out of `lib/ai`.** The eval runs these modules in plain Node, where that import throws. Never import `lib/ai` from a client component either.

## Prompt and capability modules

```ts
// lib/ai/prompts/review.ts
import { z } from "zod";
import { ReviewResult, type ReviewRequest } from "@/lib/contracts";

export const reviewPrompt = {
  instructions: [
    "You review contracts for the freelancer, never for the client. Return at most 6 clauses that cost",
    "the freelancer money, time, or rights, costliest first, each quoted exactly. If none, say so in the summary.",
    "Reply with JSON only, no code fences, matching this JSON Schema:", JSON.stringify(z.toJSONSchema(ReviewResult)),
  ].join("\n"),
  user: (input: ReviewRequest) => `Contract:\n"""\n${input.contractText}\n"""`,
};

// lib/ai/review.ts
import { Output, streamText } from "ai";
import { ReviewResult, type ReviewRequest } from "@/lib/contracts";
import { model } from "./llm";
import { reviewPrompt } from "./prompts/review";

export async function* reviewStream(input: ReviewRequest, signal?: AbortSignal) {
  let failure: unknown, got = false;
  const result = streamText({
    model: model(), instructions: reviewPrompt.instructions, prompt: reviewPrompt.user(input),
    output: Output.object({ schema: ReviewResult }), maxOutputTokens: 1200, maxRetries: 1,
    timeout: { firstChunkMs: 8_000, totalMs: 40_000 }, abortSignal: signal, onError: ({ error }) => { failure = error; },
  });
  for await (const text of result.textStream) { got = true; yield text; }
  if (failure || !got) throw failure ?? new Error("Empty model response (timeout or abort)");
}
```

- **Why a generator.** `textStream` drops error parts silently. `onError` captures the failure, the generator rethrows it, and the route turns it into the fallback. Demo mode records and replays the same text chunks.
- **Client.** `useObject({ api: "/api/review", schema: ReviewResult })` from `@ai-sdk/react` returns `object` (partial and not yet validated), `submit`, `isLoading`, `error`, and `stop`. Render fields as they arrive.
- **No streaming needed.** Call `generateText({ …, output: Output.object({ schema }) })` and read `result.output`. **Tools:** add them only when the model must fetch data mid-answer: `tool({ description, inputSchema, execute })` with `stopWhen: isStepCount(3)`. Every step adds a model round trip.

## Latency budget

Response-time research (NN/g, "Response Times: The 3 Important Limits") sets three thresholds: about 0.1 s feels instant, 1 s keeps flow, and 10 s is the limit of attention. On stage the presenter can talk over a wait, but the screen must keep moving.

| Wait | Pattern |
|---|---|
| Under 0.1 s | Local state, optimistic UI |
| Under ~1.5 s | Await the call behind a skeleton that appears immediately |
| Over ~1.5 s | Stream it; the first chunk arrives within 1–2 s and partial fields render |
| Over 10 s total | Shrink the output, use a faster model, or precompute at seed time and label it |

For each capability, record the beat, the first-chunk and total budgets, `timeout` (about 3× the budgets), `maxOutputTokens`, and the fallback copy. Use `maxRetries: 1`, because each retry repeats the whole wait. Set the route's `maxDuration` above `totalMs`.

## Fallback, cost guard, secrets

- **Fallback before the first chunk.** The route returns 503 `{ error }` with human copy such as "The model is busy. Try again, or open the recorded example." The UI keeps the input, offers Retry, and links "recorded example" to `?demo=1`. After the first chunk, a failure keeps the partial result on screen next to Retry.
- **Cost guard.** Size `maxOutputTokens` to about twice the fixture's length. Count live calls per client IP in memory and return 429 above `LLM_SESSION_BUDGET` (default 40); replays never count. On Vercel the counter is per instance, so it is a speed bump, not a wall. Ask a human to set a hard spend cap in the provider dashboard.
- **Secrets.** `LLM_*` never gets a `NEXT_PUBLIC_` prefix. With the key set, run this after `pnpm build`: `grep -rqF "$(sed -n 's/^LLM_API_KEY=//p' .env.local)" .next/static && echo LEAK || echo clean`.

## Eval

```ts
// lib/ai/eval/run.ts: pnpm exec tsx --env-file=.env.local lib/ai/eval/run.ts
import { ReviewResult } from "@/lib/contracts";
import { reviewStream } from "@/lib/ai/review";
import { withDemo } from "@/lib/demo/replay";
import { cases } from "./cases"; // [{ name: "demo: Maya's agency contract", input: reviewRequest }, …]
async function main() {
  for (const c of cases) {
    const t0 = Date.now(); let first = 0; let text = "";
    try {
      const { stream } = await withDemo("review", c.input, false, () => reviewStream(c.input));
      for await (const chunk of stream) { first ||= Date.now() - t0; text += chunk; }
      const ok = ReviewResult.safeParse(JSON.parse(text)).success;
      console.log(`${ok ? "valid" : "INVALID"} · ${c.name} · first ${first} ms · total ${Date.now() - t0} ms\n${text}\n`);
    } catch (err) { console.log(`ERROR · ${c.name} · ${String(err)}\n${text}\n`); }
  }
}
main();
```

The cases are the demo inputs, using their exact fixtures so the recording keys match. Add edge cases: a long input, a messy one, an off-topic one, and one with nothing wrong. Running with `DEMO_RECORD=1` also refreshes the recordings.
