# Running PaperTrail in Docker and on a remote host

PaperTrail has no user accounts. On your own computer it listens on loopback only. Anywhere else it needs an **access token**, and the server refuses to start without one.

## What the server enforces

| Setting | Behaviour |
|---|---|
| `PAPERTRAIL_HOST` unset or loopback (`127.0.0.1`, `localhost`, `::1`) | Starts without a token. |
| `PAPERTRAIL_HOST` anything else (the Docker image sets `0.0.0.0`) | Exits with code 1 and one line, unless `PAPERTRAIL_ACCESS_TOKEN` is set. |
| `PAPERTRAIL_ACCESS_TOKEN` set (any host) | Every `/api` route answers `401` without it. Must be at least 16 characters. |
| Token set: Host and Origin | The Host allowlist is skipped, because a DNS-rebinding page cannot carry the access cookie or a bearer token. A write must come from the request's own origin (Host plus `X-Forwarded-Proto`) or from `ALLOWED_ORIGINS` (optional, comma separated); any other Origin gets `403`. |
| No token (loopback) | Host allowlist, Origin check and session cookie as before. |

The token is accepted as `Authorization: Bearer <token>`, or once on the page: open `https://<host>/?token=<token>`. The server sets an HttpOnly cookie holding a SHA-256 digest of the token (not the token) and redirects to the same URL without it. `GET /api/health` stays open and returns only `{"ok":true}` without the token. Responses carry a Content-Security-Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.

A request with a valid `Authorization: Bearer <token>` also passes the session-cookie check on writes (curl, scripts); browsers cannot add that header cross-site without a CORS preflight, and the server sends no CORS headers.

Generate a token with `openssl rand -hex 32`.

**Where the token shows up.** `/?token=` is only for the first sign-in. The link stays in your browser history and may appear in the access logs of a reverse proxy or ingress in front of the server. After the redirect the token is no longer in the address bar. For scripts use the `Authorization` header, which is not part of the URL. If a link leaked, rotate the token.

## Local Docker

```bash
scripts/docker-local.sh            # builds papertrail:local and starts it
scripts/docker-local.sh --dry-run  # prints the docker commands, runs nothing
```

- Keys are read from `.env.local` and passed with `--env-file`, never as `-e KEY=value` or flags.
- The port is published as `127.0.0.1:${HOST_PORT:-3040}:3000`, so other devices on your network cannot reach it.
- A token is created once in `./data/access-token` (mode 0600) and reused on every start. The script prints `http://127.0.0.1:<port>/?token=...` only when it creates the token; open it once. Later starts print the plain URL (the browser cookie signs you in; if it is gone, open `/?token=` with the content of that file).
- Data and logs live in `./data` and `./logs`.

## Remote deploy (Nebius Serverless Endpoint)

```bash
scripts/deploy.sh v2 --dry-run   # check first
scripts/deploy.sh v2
```

- Keys and the token are written to a mode-0600 temp file that the CLI reads with `--env-file`; the file is deleted when the script exits. The script stops if the installed `nebius` CLI has no `--env-file` option for `ai endpoint create`, and never falls back to `--env KEY=value`.
- The token comes from `PAPERTRAIL_DEPLOY_TOKEN` (environment) or `.env.deploy.local` at the repo root (git-ignored through `.env.*.local`); otherwise one is created and printed once at the end. Store it in a password manager. It is deliberately not read from `.env.local`: a token there would also lock down your local `pnpm dev` and `pnpm start` with `401`.
- The public URL is not known before the endpoint exists, so nothing about it is required up front: with a token set the server accepts requests from its own origin. `PUBLIC_ORIGIN=https://...` is optional and only adds another allowed origin.
- After the endpoint is RUNNING the script makes an authenticated `/api/questions` call (the token goes to curl on stdin, not on its command line). `/api/health` is open, so it would say nothing about access. If the call fails after six tries, the script stops with the teardown steps.
- Each deploy is a new tag and endpoint name (`papertrail-<version>`); there is no update command.
- Not verified: the `--env-file` flag name against the real CLI (this was written without calling it). Run `--dry-run` first and read the printed command.

Endpoint environment variables are stored by the platform. Treat the endpoint as holding your keys.

## Rotate the token

1. Create a new token: `openssl rand -hex 32`.
2. Local Docker: delete `./data/access-token` and run `scripts/docker-local.sh` again.
   Remote: put the new token in `.env.deploy.local` as `PAPERTRAIL_DEPLOY_TOKEN=<new>` (or the environment) and run `scripts/deploy.sh <new version>`; the endpoint's environment cannot be edited in place, so then tear down the old endpoint.
3. Open the new `/?token=` URL once. Browsers holding the old cookie get `401` because the cookie is a digest of the old token. Clear the old link from your browser history and from any ingress log you control.

If a key may have leaked, rotate that key at its provider as well.

## Tear down

- Local: `docker rm -f papertrail`. Your data stays in `./data`, `./logs` and the workspace folder.
- Remote: delete the endpoint with the Nebius CLI or console (`nebius ai endpoint delete <id>`, check `--help` for your version), then remove unused images from the registry. Endpoints cost money while they exist.
