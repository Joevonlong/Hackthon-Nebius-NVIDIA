# Contracts

Contracts are the one place where lanes agree on shapes. The frontend builds against fixtures, the backend makes the real route return the same shape, and the gate's typecheck tells everyone when a shape drifts.

## Layout

```text
lib/contracts/index.ts             re-exports every schema and type
lib/contracts/<entity>.ts          zod schemas plus inferred types, one file per entity
lib/contracts/api.ts               route paths with their request and response schemas
lib/contracts/fixtures/<entity>.ts example data around the named persona
```

## Schemas

Give each schema and its type the same name, and derive the type with `z.infer` so it is never written twice. The running example is a contract review for a freelancer.

```ts
// lib/contracts/review.ts
import { z } from "zod";

export const Risk = z.enum(["low", "medium", "high"]);
export type Risk = z.infer<typeof Risk>;

export const Clause = z.object({
  title: z.string().describe("Short clause name, e.g. 'Payment terms'"),
  quote: z.string().describe("The exact sentence from the contract"),
  risk: Risk,
  why: z.string().describe("One sentence on what this costs the freelancer"),
  fix: z.string().describe("Replacement wording the freelancer can propose"),
});
export type Clause = z.infer<typeof Clause>;

export const ReviewRequest = z.object({ contractText: z.string().min(1).max(20_000) });
export type ReviewRequest = z.infer<typeof ReviewRequest>;

export const ReviewResult = z.object({ summary: z.string(), clauses: z.array(Clause).max(6) });
export type ReviewResult = z.infer<typeof ReviewResult>;
```

Schemas the model fills follow stricter rules, so that every OpenAI-compatible model can produce them:

- **Shape.** Keep objects flat, at most two levels deep. Use enums instead of free-text categories, and cap every array.
- **Descriptions.** Add `.describe()` to any field whose meaning is not obvious. It travels into the JSON Schema that the prompt shows the model.
- **No unions, records, or optional chains.** Use `.nullable()` when a value can be missing.
- **IDs are added server-side.** Model-generated IDs are unreliable.

## Fixtures

Build fixtures around one named persona from the pitch, such as "Maya Chen, freelance brand designer in Lisbon". Type them with `satisfies`, so `scripts/gate.sh` fails when a fixture stops matching its schema.

```ts
// lib/contracts/fixtures/review.ts
import type { ReviewRequest, ReviewResult } from "../review";

export const persona = { name: "Maya Chen", role: "freelance brand designer", city: "Lisbon" } as const;
export const reviewRequest = {
  contractText: "1. Payment. Client shall pay invoices within ninety (90) days of receipt. …",
} satisfies ReviewRequest;
export const reviewResult = {
  summary: "Two clauses put Maya's cash flow and portfolio at risk. Payment terms are the costliest.",
  clauses: [{ title: "Payment terms", quote: "Client shall pay invoices within ninety (90) days of receipt.", risk: "high",
    why: "Three months of unpaid work on every invoice.", fix: "Client shall pay invoices within 14 days of receipt." }],
} satisfies ReviewResult;
```

Fixtures feed the route stubs, the design screens, `lib/demo/seed.ts`, and the golden-path test. They must be plausible, with text that reads like the persona's real material. They are never metrics: no user counts, savings, or accuracy figures unless someone measured them.

## Route signatures and stubs

`lib/contracts/api.ts` lists every route, so the frontend never hard-codes a path or guesses a shape:

```ts
import { ReviewRequest, ReviewResult } from "./review";
export const api = {
  review: { method: "POST", path: "/api/review", request: ReviewRequest, response: ReviewResult, streams: true },
} as const;
```

The contracts branch adds one stub per route. A stub returns its fixture as plain-text JSON, so `useObject` on the client reads it exactly as it will read the real stream. The `ai` or `be` card that owns the route replaces the stub.

```ts
// app/api/review/route.ts (stub until the ai card lands)
import { ReviewRequest } from "@/lib/contracts";
import { reviewResult } from "@/lib/contracts/fixtures/review";

export async function POST(req: Request) {
  const input = ReviewRequest.safeParse(await req.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  return new Response(JSON.stringify(reviewResult), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
```

Evidence for the card: `curl -s -X POST localhost:3000/api/review -d '{"contractText":"Payment due in 90 days."}'` prints the fixture JSON.

## The contracts branch

1. **Branch.** Claim the contracts card and branch from `origin/main`. Commits read `chore(F-NN): contracts, fixtures, route stubs`.
2. **Content.** Put everything shared in this one branch: `lib/contracts/**`, the route stubs, every package the lanes will need (so the lockfile changes once), and new `.env.example` keys.
3. **Merge.** Run `scripts/gate.sh`, merge to `main`, then mark the card done: `scripts/hack done F-NN --evidence "<sha>; gate ok; curl /api/review returned the fixture"`. Post `scripts/hack log "contracts merged: lanes may split"`.
4. **Changes after the split.** Additive changes only, such as a new nullable field or a new schema. Each goes through a small shared-zone branch, announced in the board log and merged before the branches that use it. A rename or removal goes to the captain first, because every lane that imports the contract has to move with it. Never change a contract inside a feature branch.
