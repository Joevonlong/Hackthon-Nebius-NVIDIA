// Local-API guard (#12): Host allowlist (DNS rebinding), Origin / Sec-Fetch-Site checks on mutating requests,
// a SameSite=Strict session cookie required on mutating requests, and per-route body limits (413 before the body is read).
import type { Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { getCookie, setCookie } from 'hono/cookie'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BEARER_OK } from './auth'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
/** Cookies are not scoped by port, so each server port gets its own cookie name. */
export const sessionCookie = (port: number) => `pt_session_${port}`
const DEV_CLIENT_PORT = 5173

export interface GuardOptions {
  port: number
  /** Where the session token lives so it survives restarts (DATA_DIR). Omitted → in-memory token only (tests). */
  dataDir?: string
  /** Accept the Vite dev client on :5173; leave off in production so another project's dev server can't pass. */
  devClient?: boolean
  /** Extra origins, e.g. "http://localhost:8080,https://papertrail.example" (env ALLOWED_ORIGINS). */
  allowedOrigins?: string
  /**
   * Token mode (an access token is required, #35): the Host allowlist is skipped (a DNS-rebinding page cannot carry the access cookie
   * or a bearer token) and a write may also come from the request's own origin (Host + x-forwarded-proto), so a deployment works
   * under whatever name it is reached by. A cross-site Origin is still refused.
   */
  tokenMode?: boolean
}

/** Session token persisted in dataDir (atomic write, mode 0600), so a restart or tsx-watch reload keeps the browser's cookie valid. */
export function loadSessionToken(dataDir: string | undefined, port: number): string {
  const file = dataDir ? join(dataDir, `session-token-${port}`) : ''
  if (file) {
    try { const t = readFileSync(file, 'utf8').trim(); if (/^[0-9a-f]{64}$/.test(t)) return t } catch { /* create below */ }
  }
  const token = randomBytes(32).toString('hex')
  if (file) {
    try {
      if (!existsSync(dataDir!)) mkdirSync(dataDir!, { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, token, { mode: 0o600 }); renameSync(tmp, file)
    } catch { /* unwritable dataDir: the token lasts for this process only */ }
  }
  return token
}

/** Origins and hosts the local API accepts: this server and the Vite dev client on loopback, plus ALLOWED_ORIGINS. */
export function allowlist(opts: GuardOptions) {
  const origins = new Set<string>()
  for (const port of opts.devClient ? [opts.port, DEV_CLIENT_PORT] : [opts.port])
    for (const h of ['localhost', '127.0.0.1', '[::1]']) origins.add(`http://${h}:${port}`)
  for (const o of (opts.allowedOrigins ?? '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)) origins.add(o)
  const hosts = new Set<string>()
  for (const o of origins) { try { hosts.add(new URL(o).host.toLowerCase()) } catch { /* ignore a malformed entry */ } }
  return { origins, hosts }
}

/**
 * Body size limits in bytes; the first matching rule wins. Notes/exports/uploads get more room than JSON requests.
 * A library build sends every note of the question in full (each up to 2M chars), so /api/library and its chat/applied
 * calls get 30 MB, the same ceiling as exports; one note is at most 2M chars x 4 bytes (CJK UTF-8) = 8 MB.
 */
const MB = 1024 * 1024
const LIMITS: Array<[RegExp, number]> = [
  [/^\/api\/seeds\/import$/, 26 * MB],
  [/^\/api\/questions\/[^/]+\/exports\//, 30 * MB],
  [/^\/api\/questions\/[^/]+\/notes\//, 8 * MB],
  [/^\/api\/library(\/|$)/, 30 * MB],
  [/^\/api\//, 1 * MB],
]
export const bodyLimitFor = (path: string) => LIMITS.find(([re]) => re.test(path))?.[1] ?? 1 * MB

export function apiGuard(opts: GuardOptions): MiddlewareHandler {
  const { origins, hosts } = allowlist(opts)
  const token = loadSessionToken(opts.dataDir, opts.port)
  const SESSION_COOKIE = sessionCookie(opts.port)
  const tokenBuf = Buffer.from(token)
  const giveCookie = (c: Context) => setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Strict', path: '/' })
  const deny = (c: Context, why: string) => {
    giveCookie(c) // hand out the cookie even on a refusal so a stale session (server restart) recovers on retry
    return c.json({ error: `Forbidden: ${why}` }, 403)
  }
  const limiters = new Map<number, MiddlewareHandler>()
  const limiterFor = (max: number) => {
    let m = limiters.get(max)
    if (!m) { m = bodyLimit({ maxSize: max, onError: c => c.json({ error: `Request body is larger than ${Math.round(max / MB)} MB.` }, 413) }); limiters.set(max, m) }
    return m
  }

  return async (c, next) => {
    const host = (c.req.header('host') ?? '').toLowerCase()
    if (!opts.tokenMode && !hosts.has(host)) return c.json({ error: 'Forbidden: unexpected Host header' }, 403)

    if (MUTATING.has(c.req.method)) {
      const origin = c.req.header('origin')
      const site = c.req.header('sec-fetch-site')
      const own = () => `${c.req.header('x-forwarded-proto')?.split(',')[0].trim() || new URL(c.req.url).protocol.replace(':', '')}://${host}`
      if (origin !== undefined) { const o = origin.replace(/\/+$/, ''); if (!origins.has(o) && !(opts.tokenMode && o.toLowerCase() === own())) return deny(c, 'foreign Origin') }
      else if (site && site !== 'same-origin' && site !== 'none') return deny(c, 'cross-site request')
      const cb = Buffer.from(getCookie(c, SESSION_COOKIE) ?? '')
      if (!c.get(BEARER_OK) && (cb.length !== tokenBuf.length || !timingSafeEqual(cb, tokenBuf))) return deny(c, 'missing session cookie')
      const res = await limiterFor(bodyLimitFor(new URL(c.req.url).pathname))(c, next)
      if (res) return res
    } else {
      if (getCookie(c, SESSION_COOKIE) !== token) giveCookie(c)
      await next()
    }
  }
}
