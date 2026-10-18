# Golden stack

This is the default for every hack-team project. One repo holds one Next.js app with the UI and API together. Any change needs a D-NN.

## Defaults

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16, App Router, TypeScript | One deploy and one language for screens and routes |
| UI | Tailwind v4, shadcn/ui, motion, lucide-react | shadcn copies components into the repo, so `hack-design` can retheme them |
| Validation | zod 4 | One schema serves as the type, the request check, and the LLM output check |
| LLM | AI SDK 7 (`ai`) with `@ai-sdk/openai-compatible`, configured by `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Works with any OpenAI-compatible provider; changing the model is an env change |
| Data | Rung 0 none, rung 1 SQLite, rung 2 Supabase | See the data ladder below |
| Deploy | Vercel; Fly.io for long-lived servers | See deploy below |
| Tooling | pnpm, Node ≥ 22, tsx for scripts, Playwright golden path | AI SDK 7 is ESM-only and needs Node 22+; Vercel defaults to Node 24 |
| Python | Optional FastAPI sidecar managed by uv | Only when the core needs a library that exists only in Python |

**Why AI SDK instead of the plain `openai` client.** AI SDK already covers what a demo needs, each of which is otherwise a hand-written loop: zod-validated structured output (`Output.object`), partial objects streamed to the client (`useObject`), per-call timeouts and retries, a tool loop, and stripping `<think>` tags. The cost is renamed APIs between major versions. Pin `ai@^7` and let `tsc` catch stale names. For Next.js, the version-matched docs are in `node_modules/next/dist/docs/`.

## Bootstrap

Run this before `hack-init` adds its files. `create-next-app` refuses a folder that holds anything besides `.git`, `.gitignore`, `LICENSE`, `docs`, editor folders, and a few similar files. If the folder is not empty, scaffold into a temporary folder and copy the result in.

```bash
pnpm create next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" \
  --use-pnpm --turbopack --no-cache-components --agents-md --yes
pnpm dlx shadcn@latest init --defaults --yes
pnpm dlx shadcn@latest add button card input textarea skeleton sonner
pnpm add ai @ai-sdk/openai-compatible @ai-sdk/react zod motion
pnpm add -D tsx
```

- **`--no-cache-components`.** Next 16 turns Cache Components on for new apps. Then every dynamic read needs a `<Suspense>` boundary or `"use cache"`, and `runtime` segment exports are rejected. A weekend app avoids that class of build error. Switching it on later needs a D-NN.
- **Node version.** Add `"engines": { "node": ">=22" }` to `package.json`.
- **AGENTS.md.** `--agents-md` writes a Next.js block between its own markers, and `next dev` re-adds it unless `agentRules: false` is set in `next.config.ts`. `hack-init` merges the hack-team block next to it. Keep both.
- **Next 16 renames.** `proxy.ts` replaces `middleware.ts` and exports `proxy`. `next lint` is removed and `next build` no longer lints; the generated `lint` script runs ESLint, and `scripts/gate.sh` calls that script.
- **Build-script approval.** pnpm skips dependency build scripts until they are approved. When an install reports ignored builds (better-sqlite3, sharp, …), run `pnpm approve-builds <pkg>` and commit the change in a shared-zone branch.

## Hygiene

`hack-init` already does four things. Check each one is in place before the lanes split:

- `.worktrees/`, `.claude/worktrees/`, and `hack/demo/video/` are in `.gitignore`, tsconfig `exclude`, and ESLint `globalIgnores`.
- `!.env.example` comes after create-next-app's `.env*` line, so the example file is committed.
- `next.config.ts` pins the root. Otherwise a dev server inside a worktree finds the parent checkout's lockfile and compiles the parent as its root. Each worktree runs its own `pnpm install`, which the root needs.

```ts
const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
};
```

**Ports.** `main` runs on 3000. The worktree for F-NN runs on 3000 + NN: `scripts/hack wt F-07` prints `PORT=3007`.

## Folder layout

```text
app/                          pages; app/layout.tsx is shared
app/api/<capability>/route.ts one route handler per capability
components/ui/                shadcn components, changed only via `shadcn add`
components/<feature>/         one folder per feature, owned by one lane
lib/contracts/                zod schemas, types, fixtures (shared zone)
lib/ai/                       LLM client, prompts/, capability modules, eval/
lib/demo/                     demo mode, replay, recordings/, seed.ts
lib/data/                     the store for the chosen data rung
proxy.ts                      ?demo=1 cookie, Supabase session refresh (shared)
e2e/golden-path.spec.ts       smoke walk of the demo beats
sidecar/                      optional FastAPI app
```

## Data ladder

| Rung | Pick it when | Store | Host |
|---|---|---|---|
| 0 none | Nothing must survive a reload, or state can live in the browser | `lib/demo/seed.ts` plus an in-memory `Map` | Vercel |
| 1 SQLite | Writes must survive restarts on one instance | better-sqlite3 file on a Fly volume | Fly.io |
| 2 Supabase | Auth, several users, realtime, file storage, or persistence on Vercel | Supabase Postgres | Vercel |

Rules for choosing a rung:

- **Pick the lowest rung that survives the demo.**
- **Vercel has no shared memory.** Instances are short-lived and not shared, so rung 0 writes can vanish between requests. Keep flow state in the client or move up a rung.
- **F-00 is already live on Vercel and persistence is needed.** Choose rung 2 rather than moving hosts.
- **Moving up a rung touches only `lib/data/`.** Routes call the store module, never the database client.

## Deploy

- **Vercel is the default.** Fluid compute gives functions up to 300 s by default. Set `export const maxDuration` on long AI routes. Vercel WebSockets are only a public beta, so stream responses instead.
- **Fly.io** is for a persistent process, websockets, jobs longer than the function limit, or a SQLite file. `fly launch` detects Next.js. A volume lives on one machine in one region, is not replicated, and is not mounted at build time, so run a single machine. Mount it with `[mounts] source = "data"`, `destination = "/data"`.
- **`hack-init`** writes `vercel.json` unless `fly.toml` exists. `hack-deploy` owns everything after that.

## Python sidecar

Add the sidecar only when a Python-only library is essential to the core, and record it with a D-NN. Set it up with `uv init --no-package sidecar`, then `uv add fastapi --extra standard` inside it, and run it with `uv run fastapi dev main.py --port 8000`.

- **Only Next.js calls it.** Route handlers call it server-side through `SIDECAR_URL`; the browser never does.
- **Contracts stay in zod.** `lib/contracts` remains the source of truth; `sidecar/models.py` mirrors it with pydantic.
- **Deploy it separately,** as its own Vercel project (Vercel runs FastAPI natively) or as a second Fly app.
