---
name: hack-deploy
description: Gets a hackathon app onto a public URL in the first hour and keeps it demoable through judging. Ships the F-00 walking skeleton, sets env vars and secrets, deploys to Vercel or Fly.io, runs a prod smoke after every deploy, and prepares demo-day fallbacks such as a backup URL, an offline build, and a redeploy of demo-final. Not for merging branches or sync reports; use hack-integrate. Not for building features; use hack-build.
license: MIT
---

# Hack Deploy

**Live** from hour one. A walking skeleton goes on a public URL before any feature exists, so every later merge lands on a deploy path already proven. Demo day then reuses that same deploy, with rehearsed fallbacks.

Read [../hack/references/git-flow.md](../hack/references/git-flow.md) §Verification tiers and §Autonomy once per session. This skill applies them to the host.

## Inputs

- `hack/HACKATHON.md`: `prod_url`, `repo_url`, `autonomy`, the API budget and provided keys, and submission requirements (public repo, demo URL).
- `hack/ARCHITECTURE.md`: the deploy target and why, the env var list, and persistent state (SQLite, websockets, long jobs). F-00 starts at kickoff, before this file exists, so default to Vercel and revisit at G2.
- The `hack-init` scaffold: `app/api/health/route.ts` (returns `ok`, `demo`, `commit`), `vercel.json` (its `ignoreCommand` skips builds for `hack/`-only commits), `.env.example`, `scripts/gate.sh`, `scripts/smoke.sh`, `e2e/golden-path.spec.ts`.
- A host CLI the human has logged in to (`vercel whoami` or `fly auth whoami`). Agents never type credentials.

## Steps

1. **Claim F-00 and pick the target.** Run `scripts/hack claim F-00 --as integrator@<human>`. If there is no F-00 row, add it first: `scripts/hack add "Walking skeleton live on a public URL" --id F-00 --p P0 --lane infra --size S`. Use Vercel unless ARCHITECTURE.md needs a persistent process, a SQLite file, long-lived websockets, or jobs longer than the function limit; then use Fly.io. Read [references/vercel.md](references/vercel.md) or [references/fly.md](references/fly.md) when setting up the chosen host. Before creating any paid resource, custom domain, or public deployment of private data, ask the human, because it spends money or publishes. On Fly, launching an app is already a paid resource. Done when the target and its reason are in ARCHITECTURE.md, or in a `scripts/hack decide "Deploy: <host> · why: <reason>"` line if that file does not exist yet.

2. **Build the skeleton.** The scaffold already has `/api/health` (smoke beat B0). Make `/` render one contract fixture from `lib/contracts/`, parsed with its zod schema, so smoke beat B1 sees real data. If contracts have not landed, add a minimal `lib/contracts/skeleton.ts` (schema plus one fixture) as its own `chore(F-00): …` commit, because it is shared zone. Extend B1 in `e2e/golden-path.spec.ts` to assert one fixture value. Run `scripts/gate.sh` and `scripts/smoke.sh`. Done when both print their `ok` lines locally and `hack/demo/shots/B1.png` shows the fixture.

3. **Set env and secrets.** `.env.example` is the contract: every variable the app reads, with a safe placeholder and a one-line comment. The human types secret values into the host, and the agent only names them (vercel.md or fly.md). LLM keys stay server-side: no `NEXT_PUBLIC_` prefix, read only in route handlers or server actions. The human sets a spending limit at the LLM provider; Vercel's own spend controls do not cap it. Prod runs with `DEMO_MODE=0`, and `?demo=1` remains the safety net. Before the first deploy, confirm that no env file is tracked: `git ls-files | grep -E '(^|/)\.env' | grep -v example` must print nothing, because a pushed key counts as leaked. Done when `.env.example` lists every variable, the host's env listing shows the names (values hidden), and the grep is empty.

4. **Deploy and record.** Deploy `main` to production with the host steps in vercel.md or fly.md. Run `curl -s <url>/api/health`: expect `"ok":true` and `commit` equal to `git rev-parse --short HEAD`. Then run `scripts/smoke.sh <url>`. Before sharing the URL, open it and confirm it shows no private data, because a production URL is public. Run `scripts/hack event prod_url=<url>`, which commits the key to `main`. Then append a `## Deploy` section to `hack/HACKATHON.md` (host, project or app name, backup URL, restore command) and commit it straight to `main` as `docs(hackathon): deploy notes`. Close the card: `scripts/hack done F-00 --evidence "<sha>; gate ok <N>s; <url>/api/health commit <sha>; smoke ok <N>s"`. Done when `scripts/hack status` shows `F-00 live yes` and `Prod: <url>`.

5. **Smoke after every prod deploy.** Vercel's Git integration deploys every push to `main` to production. Fly deploys only when someone runs `fly deploy` from a clean `origin/main`. Before an explicit prod deploy (`fly deploy`, `vercel deploy --prod`, a redeploy, or a promote), L1 must pass on that tree, because judges only ever see prod. After every prod deploy, wait for the health `commit` to match, then run `scripts/smoke.sh <prod_url>` and log `scripts/hack log "DEPLOY <sha> smoke ok <N>s"`. A failure is red main: hand it to `hack-integrate`. Done when every prod deploy since the last report has a health-commit check and a smoke line.

6. **Prepare demo day.** Read [references/demo-day-ops.md](references/demo-day-ops.md) when feature freeze starts (70%), and again an hour before judging. Verify demo mode on prod, then set up warm-up, budget and rate limits, the backup URL, the offline build plus video, the projector check, network failover, and the restore path to `demo-final`. Done when every checklist line in HACKATHON.md §Deploy is ticked with evidence, or names its owner and a time.

7. **Hold through judging.** Warm up prod 15 minutes before the slot and keep an eye on its logs. If prod breaks mid-demo, switch to the fallback ladder first, then restore `demo-final` (demo-day-ops.md). Never debug live. Done when the demo has run on prod or a fallback and any incident is logged with its restore command and the smoke result.

## Deliverable

```text
Target: Vercel | Fly.io · why: <reason> · <ARCHITECTURE.md §… | D-NN>
Prod: <prod_url> · health ok:true commit:<sha> · smoke ok <N>s
F-00: done · "<evidence string>"
Env: .env.example <n> vars · host has <NAMES> · secrets in git: none (grep empty)
Budget: LLM provider limit <amount | not set: asked human HH:MM> · host <Hobby | Pro | Fly, approved D-NN>
Deploys: <sha> → smoke ok <N>s · <sha> → smoke FAIL B3 (handed to hack-integrate)
Fallbacks: backup <url> (DEMO_MODE=1) · demo-final <deployment URL | image ref> · offline build tested HH:MM · video <path>
Demo day: <n>/<m> checks done · open: <list>
STATUS: done | blocked | needs-decision
```

Every line cites command output, a URL, or a screenshot from this session.

## When blocked

- **Host CLI not logged in:** ask the human to run `vercel login` or `fly auth login`. Continue the skeleton locally meanwhile.
- **Vercel Hobby with a private repo blocks teammates' commits:** offer the human three options. Make the repo public (ask, because it publishes), upgrade to Pro (ask, because it costs money), or deploy with `vercel deploy --prod` from the owner's machine (vercel.md).
- **Fly needs a card or a paid machine:** ask the human. Meanwhile, ship on Vercel with demo mode covering the persistent part.
- **The host build fails but the local gate passes:** read the build log (vercel.md or fly.md §Logs). Usual causes are a build-time env var (`NEXT_PUBLIC_*`), a dev-only dependency needed at runtime, or a case-sensitive import path.
- **AI routes time out on prod:** stream the response, and set `maxDuration` on that route (vercel.md §Functions).
- **Preview URLs return 401:** that is Deployment Protection. Smoke prod or local instead, or use the bypass header (vercel.md).
- **A secret was committed or pushed:** stop and tell the human. Rotating the key and rewriting history are their decisions.
