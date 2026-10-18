# Fly.io

Use Fly when ARCHITECTURE.md needs a persistent process, a SQLite file, long-lived websockets, or jobs longer than a serverless function allows. Flags below match the flyctl docs as of October 2026. If a flag is refused, run `fly <command> --help`.

## Before anything

- New organizations get no free tier, only a short trial (2 machine-hours or 7 days), and a card is required. Rough prices: a shared-cpu-1x machine costs about $2/month at 256 MB, $3.70 at 512 MB, and $6.70 at 1 GB. A volume costs $0.15 per GB-month.
- Before `fly launch`, `fly volumes create`, `fly scale`, or a second app, ask the human, because each creates a paid resource. Quote the expected monthly cost.
- `fly auth whoami`: if it fails, the human runs `fly auth login`.

## Launch a Next.js app

Set `output: "standalone"` in `next.config.ts` so the image runs `node server.js`. Then:

```bash
fly launch --no-deploy --name <app> --region <code> --ha=false
```

- `fly launch` detects Next.js and writes a `Dockerfile` and `fly.toml`. Review both before the first deploy.
- `--ha=false` gives one machine. A volume attaches to a single machine, and SQLite cannot be shared between machines.
- Runtime packages must be in `dependencies`, not `devDependencies`, or the standalone server fails to boot.
- `NEXT_PUBLIC_*` values are baked in at build time. Pass them as Docker build args (`fly deploy --build-arg NAME=value` with a matching `ARG` in the Dockerfile), never as runtime secrets.

## fly.toml essentials

```toml
app = "<app>"
primary_region = "<code>"

[env]
  DEMO_MODE = "0"
  DATABASE_PATH = "/data/app.db"     # whatever name the app reads; points SQLite at the volume

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "off"         # always on: no cold start in front of judges
  auto_start_machines = false        # Fly advises turning stop and start on or off together

[mounts]
  source = "data"
  destination = "/data"
  initial_size = "1gb"

[[vm]]
  memory = "1gb"
```

`fly launch` generates `auto_stop_machines = "stop"` and `min_machines_running = 0`, which means a cold start after idle. Change it to the block above before demo day. `min_machines_running` has no effect when auto-stop is off.

## Volumes for SQLite

```bash
fly volumes create data --size 1 --region <code> --yes
```

- One volume per machine, not replicated. Fly keeps daily snapshots for 5 days. Treat the demo data as rebuildable from `lib/demo/seed.ts`.
- The volume is mounted only at runtime, so run migrations and seeding at boot (for example in the start command), never in the Dockerfile.

## Secrets

```bash
fly secrets set LLM_API_KEY=<value> --stage     # the human runs this; --stage skips the immediate redeploy
fly secrets list                                # names and digests only
```

- The human types secret values. Agents only name them.
- Without `--stage`, setting a secret restarts the machines with the new value.

## Deploy, verify, restore

```bash
fly deploy -e GIT_COMMIT=$(git rev-parse --short HEAD)   # from a clean origin/main, after gate + L1
fly status
curl -s https://<app>.fly.dev/api/health                 # commit must match
fly releases --image                                     # image ref per release
fly deploy --image <image-ref>                           # restore a known-good image without rebuilding
```

- `-e GIT_COMMIT=…` feeds the health route's `commit` field, which Vercel sets on its own and Fly does not.
- Before judging, record the `demo-final` image ref from `fly releases --image` in HACKATHON.md §Deploy with its restore line.
- `prod_url` is `https://<app>.fly.dev` unless the human approved a custom domain.

## Always on

- `auto_stop_machines = "off"` keeps the machine running, so the first judge never waits for a boot. It also bills full time, which is part of the approved cost.
- `fly scale count 1 --yes` keeps exactly one machine. Never scale a SQLite app above one.
- If the Next.js server runs out of memory, run `fly scale memory 1024` after the human approves the higher price.

## Logs

```bash
fly logs --no-tail
fly logs                 # follow live during judging
```
