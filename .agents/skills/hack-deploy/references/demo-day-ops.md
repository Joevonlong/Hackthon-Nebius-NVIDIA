# Demo-day ops

Start at feature freeze (70%) and finish an hour before judging. Copy the checklist into `hack/HACKATHON.md` §Deploy and tick each line with its evidence.

## Checklist

```markdown
- [ ] Demo mode on prod: `scripts/smoke.sh <prod_url>` ok <N>s · live: `scripts/smoke.sh <prod_url> --live` ok <N>s
- [ ] Presenter mode chosen: live | demo (`?demo=1`) · switch practised
- [ ] Budget: provider spend limit <amount> set by <human> · rate limit or kill switch tested
- [ ] Backup URL: <url> (DEMO_MODE=1) · smoke ok
- [ ] demo-final: tag <sha> · deployment <url | image ref> · restore command written below
- [ ] Offline: local build tested with Wi-Fi off at HH:MM · video <path> on the laptop and a USB stick
- [ ] Projector: <resolution> · 125% zoom readable · theme checked · notifications off
- [ ] Network: hotspot tested with the demo at HH:MM
- [ ] Warm-up done at HH:MM (T-15)
```

## Demo mode on prod

- `DEMO_MODE=1` on the host, or `?demo=1` on any URL, replays `lib/demo/recordings` with the story seed. `scripts/smoke.sh <prod_url>` runs in demo mode by default, and `--live` makes the real calls.
- Both must pass on prod, not only locally. Recordings load from the deployed bundle, so a recording that is missing on prod only shows up there.
- The presenter decides live or demo for each beat. Live impresses more, and demo mode is the safety net, so practise adding `?demo=1` mid-demo without comment.

## Warm-up before judging

At T-15 minutes:

1. Run `curl -s <prod_url>/api/health` three times and check that `commit` is the `demo-final` SHA.
2. Open every beat once in the presenter's browser. This warms functions and caches and shows any broken asset.
3. Make one live AI call. That proves the key, the quota, and the provider's latency.
4. Leave the opening screen loaded, in full screen, with the other tabs closed.

On Fly with auto-stop off there is no cold start. On Vercel, the hits above keep the functions warm.

## Rate limits and API budget

- The human sets a hard spending limit at the LLM provider. Estimate the spend as calls per run × (rehearsals + judging runs + other visitors) × cost per call, and put the figure in the checklist.
- A public URL gets traffic from other teams and judges after the demo. Live AI routes need a cheap guard: a per-IP counter in memory, or a daily cap that falls back to demo replies.
- The kill switch turns every visitor into a replay. Vercel: `vercel env add DEMO_MODE production --value 1 --no-sensitive --force --yes`, then `vercel redeploy <prod-deployment-url>`. Fly: `fly secrets set DEMO_MODE=1` (machines restart with it). Before flipping it while judging is under way, tell the presenter, because live beats become replays.
- Keys never reach the browser. Check the built client bundle for the key name with `grep -r LLM_API_KEY .next/static`, which must print nothing.

## Backup URL

- Vercel: a second free project from the same repo, permanently in demo mode. From a separate clean checkout of `demo-final`, run `vercel link --yes --project <name>-backup`, then `vercel env add DEMO_MODE production --value 1 --no-sensitive --yes`, then `vercel deploy --prod`. Smoke it.
- Fly app: if demo mode needs no persistent process, the backup can be that Vercel project. Otherwise a second Fly app is a paid resource, so ask the human first.
- Before the backup goes public, check it shows the same data as prod and nothing private, because it is a second public deployment.

## Offline fallback

- Local production build: `pnpm build && DEMO_MODE=1 PORT=3000 pnpm start` on the presenting laptop. Test it once with Wi-Fi off. Fonts must be self-hosted (`next/font` does this at build time), and there must be no CDN scripts.
- Recorded video from `hack-video`: a local file on the laptop and on a USB stick, never only a streaming link.

## Projector check

At the venue's tech check, or at the latest T-30:

- Resolution: mirror the display at the projector's native resolution (usually 1920×1080 or 1280×720) and walk every beat.
- Browser zoom at 125%: text must be readable from the back row, and no layout may break.
- Dark vs light: projectors wash out low-contrast themes. Check the DESIGN.md theme on the real projector, and switch modes if the toggle exists and reads better.
- Turn on Do Not Disturb, hide the bookmarks bar and extensions, keep the cursor visible, plug in the charger, and disable sleep.

## Network failover

The fallback ladder, in order. Name who calls each step before the demo:

1. Reload the page.
2. Add `?demo=1`.
3. Switch to the backup URL.
4. Switch to the phone hotspot (paired and tested with the demo beforehand).
5. Switch to the local build.
6. Play the local video.

Each step takes one sentence from the presenter ("let me show the recorded run"). No debugging on stage.

## If the deploy breaks during judging

1. Keep the demo going on the fallback ladder. Fix prod afterwards.
2. Restore `demo-final`:
   - Vercel: `vercel promote <demo-final deployment URL>`. It also turns automatic production-domain assignment back on, so a later push to `main` goes live again. `vercel rollback` reaches only the previous production deployment on Hobby, and it keeps later pushes off production until the next promote.
   - Fly: `fly deploy --image <demo-final image ref>`.
3. Check that the health `commit` equals the `demo-final` SHA, run `scripts/smoke.sh <prod_url>`, and log `scripts/hack log "RESTORED demo-final <sha> on <url>"`.
4. Nobody pushes to `main` while judging is under way. On Vercel every push to `main` deploys to production, so a stray merge undoes the restore.
