# Demo mode

Demo mode makes the stage, the video, and the smoke test independent of the network, the provider, and luck. It replays real model outputs recorded earlier, with realistic streaming timing, on top of the story seed.

## Switches

| Switch | Effect |
|---|---|
| `DEMO_MODE=1` (env) | Every request on that server replays |
| `?demo=1` on any page | `proxy.ts` sets a `demo=1` cookie and redirects to the clean URL; later requests replay |
| `?demo=0` | Clears the cookie |
| `DEMO_RECORD=1` (env, local only) | Calls the real model and saves each response as a recording |

Setting `DEMO_MODE=1` on a deploy makes every visitor see replays. Use it only on a dedicated demo deployment, recorded with a D-NN. Smoke tests, the video, and the stage use `?demo=1`.

```ts
// lib/demo/mode.ts
import { cookies } from "next/headers";
export async function isDemo() {
  return process.env.DEMO_MODE === "1" || (await cookies()).get("demo")?.value === "1";
}
```

```ts
// proxy.ts (shared zone; Next 16 replaces middleware.ts with proxy.ts)
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const flag = req.nextUrl.searchParams.get("demo");
  if (flag !== "1" && flag !== "0") return NextResponse.next();
  const url = req.nextUrl.clone();
  url.searchParams.delete("demo");
  const res = NextResponse.redirect(url);
  if (flag === "1") res.cookies.set("demo", "1", { path: "/", sameSite: "lax" }); else res.cookies.delete("demo");
  return res;
}
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
```

## Record and replay

The key is `<pipeline>-<hash>`: a SHA-256 of the normalized input (whitespace collapsed, object keys sorted), cut to 12 characters. The same demo input always finds its recording; any other input misses and goes live.

```ts
// lib/demo/replay.ts
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Chunk = [delayMs: number, text: string];
export type Source = "live" | "replay" | "fallback" | "record";
const DIR = path.join(process.cwd(), "lib/demo/recordings");
const norm = (v: unknown): unknown =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ") : Array.isArray(v) ? v.map(norm)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, norm(x)]))
  : v;
export const demoKey = (pipeline: string, input: unknown) =>
  `${pipeline}-${createHash("sha256").update(JSON.stringify(norm(input))).digest("hex").slice(0, 12)}`;

async function* replay(chunks: Chunk[]) {
  for (const [i, [ms, text]] of chunks.entries()) {
    await new Promise((r) => setTimeout(r, Math.min(ms, i === 0 ? 700 : 250)));
    yield text;
  }
}

async function* record(file: string, meta: object, live: AsyncIterable<string>) {
  const chunks: Chunk[] = [];
  let t = Date.now();
  for await (const text of live) { chunks.push([Date.now() - t, text]); t = Date.now(); yield text; }
  await mkdir(DIR, { recursive: true });
  await writeFile(file, JSON.stringify({ ...meta, recordedAt: new Date().toISOString(), chunks }, null, 2));
}

export async function withDemo(pipeline: string, input: unknown, demo: boolean, live: () => AsyncIterable<string>) {
  const key = demoKey(pipeline, input);
  const file = path.join(DIR, `${key}.json`);
  if (process.env.DEMO_RECORD === "1")
    return { source: "record" as Source, stream: record(file, { key, pipeline, model: process.env.LLM_MODEL, input }, live()) };
  if (!demo) return { source: "live" as Source, stream: live() };
  try {
    const { chunks } = JSON.parse(await readFile(file, "utf8")) as { chunks: Chunk[] };
    return { source: "replay" as Source, stream: replay(chunks) };
  } catch {
    console.warn(`[demo] no recording for ${key}; calling the live model`);
    return { source: "fallback" as Source, stream: live() };
  }
}
```

- **Replay timing.** Delays are capped at 700 ms for the first chunk and 250 ms after it, so a provider hiccup at recording time never replays on stage.
- **Response header.** Each route sends `x-demo-source: <source>` (see data-and-api.md), so a smoke test can assert replay on the deployed URL.
- **Shipping recordings.** Recordings are read from disk at runtime, which file tracing cannot see. Add `outputFileTracingIncludes: { "/api/**": ["./lib/demo/recordings/**/*.json"] }` to `next.config.ts` through a shared-zone branch.

## Procedure

1. **Seed first.** Reset the data to `lib/demo/seed.ts`. At rung 0 the store always boots from it.
2. **Record locally.** Run `DEMO_RECORD=1 pnpm dev` and walk the golden path with the exact demo inputs, or run the eval with `DEMO_RECORD=1`. Never record on a deploy.
3. **Read every new file in `lib/demo/recordings/`.** Check for keys, emails, and real personal data, because recordings are committed and deployed. Never hand-write or edit a recording; if an output is wrong, fix the prompt and record again.
4. **Prove replay is offline.** Point `LLM_BASE_URL` at a dead port (`http://127.0.0.1:9`) and open the app with `?demo=1`. Every AI beat must still stream; a miss shows up as a failed live call in the log.
5. **Re-record after any prompt or model change.** The key covers only the input, so the new recording overwrites the old one.
6. **Disclose it.** The README and the fake-vs-real matrix say: "Demo mode (`?demo=1`) replays recorded outputs from the real model so the demo survives bad Wi-Fi; without it, every request calls the model live."
