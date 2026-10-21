// Local-API guard (#12): Host allowlist (DNS rebinding), Origin / Sec-Fetch-Site checks on mutating requests,
// a SameSite=Strict session cookie required on mutating requests, and per-route body limits (413 before the body is read).
import type { Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { getCookie, setCookie } from 'hono/cookie'
import { randomBytes, timingSafeEqual } from 'node:crypto'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
export const SESSION_COOKIE = 'pt_session'
const DEV_CLIENT_PORT = 5173

export interface GuardOptions {
  port: number
  /** Extra origins, e.g. "http://localhost:8080,https://papertrail.example" (env ALLOWED_ORIGINS). */
  allowedOrigins?: string
}

/** Origins and hosts the local API accepts: this server and the Vite dev client on loopback, plus ALLOWED_ORIGINS. */
export function allowlist(opts: GuardOptions) {
  const origins = new Set<string>()
  for (const port of [opts.port, DEV_CLIENT_PORT])
    for (const h of ['localhost', '127.0.0.1', '[::1]']) origins.add(`http://${h}:${port}`)
  for (const o of (opts.allowedOrigins ?? '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)) origins.add(o)
  const hosts = new Set<string>()
  for (const o of origins) { try { hosts.add(new URL(o).host.toLowerCase()) } catch { /* ignore a malformed entry */ } }
  return { origins, hosts }
}

/** Body size limits in bytes; the first matching rule wins. Notes/exports/uploads get more room than JSON requests. */
const MB = 1024 * 1024
const LIMITS: Array<[RegExp, number]> = [
  [/^\/api\/seeds\/import$/, 26 * MB],
  [/^\/api\/questions\/[^/]+\/exports\//, 30 * MB],
  [/^\/api\/questions\/[^/]+\/notes\//, 3 * MB],
  [/^\/api\//, 1 * MB],
]
export const bodyLimitFor = (path: string) => LIMITS.find(([re]) => re.test(path))?.[1] ?? 1 * MB

export function apiGuard(opts: GuardOptions): MiddlewareHandler {
  const { origins, hosts } = allowlist(opts)
  const token = randomBytes(32).toString('hex')
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
    if (!hosts.has(host)) return c.json({ error: 'Forbidden: unexpected Host header' }, 403)

    if (MUTATING.has(c.req.method)) {
      const origin = c.req.header('origin')
      const site = c.req.header('sec-fetch-site')
      if (origin !== undefined) { if (!origins.has(origin.replace(/\/+$/, ''))) return deny(c, 'foreign Origin') }
      else if (site && site !== 'same-origin' && site !== 'none') return deny(c, 'cross-site request')
      const cb = Buffer.from(getCookie(c, SESSION_COOKIE) ?? '')
      if (cb.length !== tokenBuf.length || !timingSafeEqual(cb, tokenBuf)) return deny(c, 'missing session cookie')
      const res = await limiterFor(bodyLimitFor(new URL(c.req.url).pathname))(c, next)
      if (res) return res
    } else {
      if (getCookie(c, SESSION_COOKIE) !== token) giveCookie(c)
      await next()
    }
  }
}
