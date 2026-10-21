// Access token for remote deployments (#35). Required whenever the server listens beyond loopback or PAPERTRAIL_ACCESS_TOKEN is set:
// every /api route answers 401 without it. It travels as `Authorization: Bearer <token>`, or is exchanged once on the page
// (`/?token=<token>`) for an HttpOnly cookie that holds a digest of it, after which the browser is redirected to a URL without the token.
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { createHash, timingSafeEqual } from 'node:crypto'

export const MIN_TOKEN_LENGTH = 16
/** Cookies are not scoped by port, so each server port gets its own cookie name. */
export const accessCookie = (port: number) => `pt_access_${port}`

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '::1' || /^127(\.\d{1,3}){3}$/.test(h)
}

/** One line saying why the server must not start with this host/token combination, or null when it may. */
export function accessTokenProblem(host: string, token: string): string | null {
  if (token && token.length < MIN_TOKEN_LENGTH) return `PAPERTRAIL_ACCESS_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters (generate one with: openssl rand -hex 32).`
  if (!isLoopbackHost(host) && !token) return `PAPERTRAIL_HOST=${host} listens beyond this computer, so PAPERTRAIL_ACCESS_TOKEN must be set (generate one with: openssl rand -hex 32).`
  return null
}

const digest = (s: string) => createHash('sha256').update(s).digest()
function same(a: Buffer, b: Buffer): boolean { return a.length === b.length && timingSafeEqual(a, b) }

export interface AccessOptions { token: string; port: number }

export function accessAuth(opts: AccessOptions): MiddlewareHandler {
  const { token, port } = opts
  if (!token) return (_c, next) => next()
  const want = digest(token)
  const name = accessCookie(port)
  return async (c, next) => {
    const bearer = /^Bearer\s+(.+)$/i.exec(c.req.header('authorization') ?? '')?.[1]
    const cookie = getCookie(c, name)
    const ok = (bearer !== undefined && same(digest(bearer), want)) || (cookie !== undefined && same(Buffer.from(cookie, 'hex'), want))
    if (ok) return next()
    // health stays open for container health checks but says nothing about models or keys
    if (c.req.path === '/api/health' && c.req.method === 'GET') return c.json({ ok: true })
    return c.json({ error: 'Unauthorized: access token required', code: 'unauthorized' }, 401)
  }
}

/** For pages: `?token=<token>` → set the access cookie and redirect to the same URL without the token. A wrong token does nothing. */
export function tokenExchange(opts: AccessOptions): MiddlewareHandler {
  const { token, port } = opts
  if (!token) return (_c, next) => next()
  const want = digest(token)
  return async (c: Context, next) => {
    const given = c.req.query('token')
    if (c.req.method !== 'GET' || given === undefined || c.req.path.startsWith('/api/')) return next()
    if (!same(digest(given), want)) return next()
    const u = new URL(c.req.url)
    u.searchParams.delete('token')
    const secure = u.protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https'
    setCookie(c, accessCookie(port), want.toString('hex'), { httpOnly: true, sameSite: 'Strict', path: '/', secure, maxAge: 60 * 60 * 24 * 30 })
    return c.redirect(u.pathname + u.search, 302)
  }
}
