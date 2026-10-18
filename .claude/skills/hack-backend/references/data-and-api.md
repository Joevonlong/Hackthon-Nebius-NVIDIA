# Data and API

Routes never talk to a database client directly. They call `lib/data/store.ts`, so moving up the data ladder (golden-stack.md) changes one module. Every boundary validates against the contract schema.

## Rung 0: no database

```ts
// lib/data/store.ts
import { seed } from "@/lib/demo/seed";
import type { Review } from "@/lib/contracts"; // Review = { id, createdAt, result: ReviewResult }

const reviews = new Map<string, Review>(seed.reviews.map((r) => [r.id, r]));

export const store = {
  listReviews: async () => [...reviews.values()],
  getReview: async (id: string) => reviews.get(id) ?? null,
  saveReview: async (r: Review) => { reviews.set(r.id, r); return r; },
};
```

The async signatures match the later rungs, so callers never change. On Vercel, instances are short-lived and not shared, so a write can vanish on the next request. Keep the flow's state in the client (React state, or a URL param for a shareable result) and treat the store as read-mostly.

## Rung 1: SQLite (local or Fly with a volume)

```ts
// lib/data/db.ts
import Database from "better-sqlite3";

export const db = new Database(process.env.DATABASE_PATH ?? "data/app.db");
db.pragma("journal_mode = WAL");
db.exec(`create table if not exists reviews (id text primary key, json text not null, created_at text not null)`);
```

- **Install.** `pnpm add better-sqlite3 && pnpm add -D @types/better-sqlite3`, then `pnpm approve-builds better-sqlite3` so the native build runs. Next already treats better-sqlite3 as a server external package.
- **Storage.** Store each contract-shaped entity as validated JSON in one column; that is enough for a weekend. Parse it with the schema on the way out.
- **Drizzle is optional.** Use it when there are more than three tables or real relations: `drizzle({ client: new Database(path) })` from `drizzle-orm/better-sqlite3`. Its docs currently install the 1.0 release candidate; pin whichever version you install.
- **Fly.** Set `DATABASE_PATH=/data/app.db` with a volume mounted at `/data` on a single machine. Seed with a script (`pnpm exec tsx lib/data/seed-db.ts`) that inserts `lib/demo/seed.ts`.

## Rung 2: Supabase

- **Server-only access** (no auth): `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)` from `@supabase/supabase-js`, called only in route handlers and server code. The secret key never takes a `NEXT_PUBLIC_` prefix.
- **With auth:** use `@supabase/ssr`. Call `createServerClient` with the cookie methods `getAll` and `setAll`, add the browser client, and refresh the session in `proxy.ts` with `supabase.auth.getClaims()`. Merge that into the demo-mode proxy, since there is one `proxy.ts`. The env vars are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **Schema.** Create tables in the Supabase SQL editor or with a migration file, matching the contracts. Seed from `lib/demo/seed.ts` with a tsx script.

## Route handler patterns

Use a route handler for anything streamed, fetched by the client, or called by the smoke test. Use a server action only for a simple form mutation that returns nothing to stream. Leave the runtime at the Node default.

```ts
// app/api/review/route.ts
import { ReviewRequest } from "@/lib/contracts";
import { reviewStream } from "@/lib/ai/review";
import { isDemo } from "@/lib/demo/mode";
import { withDemo } from "@/lib/demo/replay";

export const maxDuration = 60;
const FALLBACK = "The model is busy. Try again, or open the recorded example.";

export async function POST(req: Request) {
  const input = ReviewRequest.safeParse(await req.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { stream, source } = await withDemo("review", input.data, await isDemo(), () => reviewStream(input.data, req.signal));
  const it = stream[Symbol.asyncIterator]();
  let first: IteratorResult<string>;
  try { first = await it.next(); } catch (err) {
    console.error("[ai] review failed before first chunk", err);
    return Response.json({ error: FALLBACK }, { status: 503 });
  }
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) { if (!first.done) c.enqueue(enc.encode(first.value)); },
    async pull(c) { const n = await it.next(); if (n.done) c.close(); else c.enqueue(enc.encode(n.value)); },
  });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "x-demo-source": source } });
}
```

- **Why peek at the first chunk.** Once a stream has started, the status code is fixed at 200. Waiting for the first chunk lets the commonest failures (bad key, timeout, provider down) return a clean 503 that `useObject` reports as `error`.
- **Cost guard.** Before calling `withDemo` in live mode, check the session budget from ai-pipeline.md and return 429 `{ error }` when it is spent.
- **Plain JSON routes.** `Response.json(data)` for success, and `{ error: string }` with 400, 404, 429, 503, or 500 for failure. The error message is human copy, never a stack trace or provider message.

## Validation at every boundary

- **Request bodies, query params, and server action input:** `Schema.safeParse`, and return 400 on failure.
- **Model output:** `Output.object({ schema })` validates on the server; the eval reports `INVALID` cases. On the client, `useObject` values are partial until the stream ends.
- **Data read back from SQLite JSON columns, Supabase rows, or external APIs:** parse with the schema before returning it, so a bad row fails loudly in development rather than on stage.
- **Env:** read `process.env` only in server modules, at call time rather than import time, so `next build` runs without secrets. Log the names of missing variables, never their values.
