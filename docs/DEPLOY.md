# Running PaperTrail in Docker and on a remote host

PaperTrail has no user accounts. On your own computer it listens on loopback only. Anywhere else it needs an **access token**, and the server refuses to start without one.

## What the server enforces

| Setting | Behaviour |
|---|---|
| `PAPERTRAIL_HOST` unset or loopback (`127.0.0.1`, `localhost`, `::1`) | Starts without a token. |
| `PAPERTRAIL_HOST` anything else (the Docker image sets `0.0.0.0`) | Exits with code 1 and one line, unless `PAPERTRAIL_ACCESS_TOKEN` is set. |
| `PAPERTRAIL_ACCESS_TOKEN` set (any host) | Every `/api` route answers `401` without it. Must be at least 16 characters. |
| `ALLOWED_ORIGINS` | Required when the app is reached by a name other than localhost, e.g. `https://papertrail.example`. Other Host and Origin values get `403`. |

The token is accepted as `Authorization: Bearer <token>`, or once on the page: open `https://<host>/?token=<token>`. The server sets an HttpOnly cookie holding a SHA-256 digest of the token (not the token) and redirects to the same URL without it. `GET /api/health` stays open and returns only `{"ok":true}` without the token. Responses carry a Content-Security-Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.

Generate a token with `openssl rand -hex 32`.

## Local Docker

```bash
scripts/docker-local.sh            # builds papertrail:local and starts it
scripts/docker-local.sh --dry-run  # prints the docker commands, runs nothing
```

- Keys are read from `.env.local` and passed with `--env-file`, never as `-e KEY=value` or flags.
- The port is published as `127.0.0.1:${HOST_PORT:-3040}:3000`, so other devices on your network cannot reach it.
- A token is created once in `./data/access-token` (mode 0600) and reused on every start. The script prints `http://127.0.0.1:<port>/?token=...`; open it once.
- Data and logs live in `./data` and `./logs`.

## Remote deploy (Nebius Serverless Endpoint)

```bash
PUBLIC_ORIGIN=https://<the endpoint's public origin> scripts/deploy.sh v2 --dry-run   # check first
PUBLIC_ORIGIN=https://<the endpoint's public origin> scripts/deploy.sh v2
```

- Keys and the token are written to a mode-0600 temp file that the CLI reads with `--env-file`; the file is deleted when the script exits. The script stops if the installed `nebius` CLI has no `--env-file` option for `ai endpoint create`, and never falls back to `--env KEY=value`.
- The token comes from `PAPERTRAIL_ACCESS_TOKEN` (environment or `.env.local`); otherwise one is created and printed once at the end. Store it in a password manager.
- `PUBLIC_ORIGIN` is required because the Host check only accepts that name.
- Each deploy is a new tag and endpoint name (`papertrail-<version>`); there is no update command.
- Not verified: the `--env-file` flag name against the real CLI (this was written without calling it). Run `--dry-run` first and read the printed command.

Endpoint environment variables are stored by the platform. Treat the endpoint as holding your keys.

## Rotate the token

1. Create a new token: `openssl rand -hex 32`.
2. Local Docker: delete `./data/access-token` and run `scripts/docker-local.sh` again.
   Remote: deploy a new version with `PAPERTRAIL_ACCESS_TOKEN=<new>` (the endpoint's environment cannot be edited in place), then tear down the old one.
3. Open the new `/?token=` URL. Browsers holding the old cookie get `401` because the cookie is a digest of the old token.

If a key may have leaked, rotate that key at its provider as well.

## Tear down

- Local: `docker rm -f papertrail`. Your data stays in `./data`, `./logs` and the workspace folder.
- Remote: delete the endpoint with the Nebius CLI or console (`nebius ai endpoint delete <id>`, check `--help` for your version), then remove unused images from the registry. Endpoints cost money while they exist.
