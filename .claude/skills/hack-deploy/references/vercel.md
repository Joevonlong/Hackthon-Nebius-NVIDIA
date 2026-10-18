# Vercel

The default host for the golden stack. Flags below match the Vercel CLI docs as of October 2026. If a flag is refused, run `vercel <command> --help` and adapt.

## Link and first deploy

```bash
vercel whoami                          # fails → the human runs `vercel login`
vercel link --yes --project <name>     # creates or links the project; writes .vercel/
vercel git connect --yes               # pushes to main now deploy to production
vercel deploy --prod                   # first deploy; stdout is the deployment URL
```

- Keep `.vercel/` out of git; add it to `.gitignore` if the CLI did not.
- A project's first deployment goes to production. Record the production domain (usually `https://<project>.vercel.app`, shown on the project dashboard) as `prod_url`, not the unique per-deployment URL printed by `vercel deploy`.
- Hobby plan with a private repo: only commits authored by the Hobby team owner deploy, so teammates' merges are blocked. The fixes are a public repo (ask, because it publishes), Pro (ask, because it costs money), or `vercel deploy --prod` run by the owner from a clean `origin/main` after each sync.

## Preview vs production

- With the Git integration, a push to `main` is a production deploy, and other branches and PRs get preview deployments with their own URLs.
- `vercel.json`'s `ignoreCommand` skips the build when a commit only touches `hack/`, so board and report commits do not use builds.
- Find deployments: `vercel ls --prod`, or the one for a commit with `vercel ls -m githubCommitSha=<full-sha>`. The health route's `commit` field confirms which build is serving.
- When Deployment Protection is on (Standard Protection), previews require a Vercel login and production domains stay public. Check the project's setting rather than assuming it. To smoke a preview, the request needs the `x-vercel-protection-bypass` header carrying the Protection Bypass for Automation secret. `scripts/smoke.sh` does not send it, so smoke prod or local instead.

## Env vars

```bash
vercel env add LLM_API_KEY production      # prompts; the human types the value
vercel env add LLM_API_KEY preview
vercel env add LLM_MODEL production --value <model> --no-sensitive --yes   # non-secret values only
vercel env ls production                   # names and types; Secret values stay hidden
```

- Production and preview variables default to type Secret, whose values cannot be read back. The human's `.env.local` stays the dev copy.
- An env change reaches users only on the next deployment: push, or run `vercel redeploy <prod-deployment-url>`, then health and smoke.
- `NEXT_PUBLIC_*` values are inlined at build time and visible to every visitor, so never put a secret there.
- Git deployments set `VERCEL_GIT_COMMIT_SHA`, which the health route reads. If a CLI deploy reports `commit: null`, deploy with `vercel deploy --prod -e GIT_COMMIT=$(git rev-parse --short HEAD)`.

## Functions: duration, streaming, region

- With fluid compute, a function may run 300 s by default on every plan; the maximum is 300 s on Hobby and 800 s on Pro.
- Set it per route in the App Router with `export const maxDuration = 120;` in `route.ts` or `page.tsx`, or for many routes under `functions` in `vercel.json`.
- Stream long AI responses (a `ReadableStream` from the route handler, or the AI SDK's streaming helpers) so the first tokens reach the screen in about a second. The duration limit still covers the whole stream.
- New projects run functions in `iad1` (Washington, D.C.). Move them next to the LLM provider or the database with `"regions": ["sfo1"]` in `vercel.json`. Hobby allows a single region.
- WebSockets on Vercel Functions are a public beta (fluid compute only), and connections close at the max duration. A demo that depends on long-lived sockets belongs on Fly. Otherwise poll or use server-sent events.

## Rollback and restore

```bash
vercel ls --prod                          # find a known-good deployment URL
vercel promote <deployment-url>           # make that deployment production again
vercel rollback <deployment-url>          # Hobby: only the previous production deployment
vercel rollback status
```

- A rollback turns off automatic assignment of production domains, so later pushes to `main` stop going live. `vercel promote <url>` turns it back on. Note in the board log which one you used.
- `vercel redeploy <url> --target production` rebuilds an existing deployment, for example after an env change.
- Before judging, record the `demo-final` deployment URL (`vercel ls -m githubCommitSha=<sha>`) in HACKATHON.md §Deploy with its `vercel promote` line.

## Logs

```bash
vercel logs --environment production --query 'level:error' --since 1h
vercel logs --deployment <deployment-url>
```

## Money

- Spend Management (alerts and the pause switch) exists only on Pro and Enterprise. Pausing serves `503 DEPLOYMENT_PAUSED` to every visitor, and it does not cap LLM spend.
- The LLM bill is capped at the provider by the human. The kill switch for runaway live calls is `DEMO_MODE=1` plus a redeploy (demo-day-ops.md §Rate limits and API budget).
- Before upgrading the plan, adding a custom domain, or turning on paid add-ons, ask the human, because each spends money or publishes.
