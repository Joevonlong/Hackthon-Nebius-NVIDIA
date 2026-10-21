import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { wireSecurity } from './wire'
import { health } from '../routes/health'
import { library } from '../routes/library'

// The production middleware stack (server/security/wire.ts, also used by server/index.ts) in front of the real routes.
const TOKEN = 'k'.repeat(32)
const PORT = 3000
function makeApp(o: { accessToken?: string; allowedOrigins?: string } = {}) {
  const app = new Hono()
  wireSecurity(app, { port: PORT, accessToken: o.accessToken ?? '', allowedOrigins: o.allowedOrigins })
  app.route('/api', health)
  app.route('/api', library)
  app.get('/', c => c.text('page'))
  const request = app.request.bind(app)
  // app.request sends no Host header; a real server always does
  app.request = ((input: string, init: RequestInit = {}) => request(input, { ...init, headers: { host: new URL(input).host, ...(init.headers as Record<string, string>) } })) as typeof app.request
  return app
}
const bearer = { authorization: `Bearer ${TOKEN}` }
const json = { 'content-type': 'application/json' }
let n = 0
const newQuestion = () => JSON.stringify({ id: `wire-q-${process.pid}-${n++}`, content: 'q' })

describe('token mode through the real wiring', () => {
  const host = 'https://papertrail.example'
  it('works under any Host (no allowlist), with 401 first when there is no token', async () => {
    const app = makeApp({ accessToken: TOKEN })
    expect((await app.request(`${host}/api/questions`)).status).toBe(401)
    expect((await app.request(`${host}/api/questions`, { headers: bearer })).status).toBe(200)
    expect((await app.request('http://10.1.2.3:9000/api/questions', { headers: bearer })).status).toBe(200)
  })
  it('a POST with only a bearer token (no session cookie, no Origin) succeeds', async () => {
    const r = await makeApp({ accessToken: TOKEN }).request(`${host}/api/questions`, { method: 'POST', headers: { ...bearer, ...json }, body: newQuestion() })
    expect(r.status).toBe(200)
  })
  it('a browser with the access and session cookies may POST from the request\'s own origin, not from another site', async () => {
    const app = makeApp({ accessToken: TOKEN })
    const exch = await app.request(`${host}/?token=${TOKEN}`)
    const access = exch.headers.get('set-cookie')!.split(';')[0]
    const get = await app.request(`${host}/api/questions`, { headers: { cookie: access } })
    const session = get.headers.get('set-cookie')!.split(';')[0]
    const cookie = `${access}; ${session}`
    const own = await app.request(`${host}/api/questions`, { method: 'POST', headers: { ...json, cookie, origin: host, 'x-forwarded-proto': 'https' }, body: newQuestion() })
    expect(own.status).toBe(200)
    const evil = await app.request(`${host}/api/questions`, { method: 'POST', headers: { ...json, cookie, origin: 'https://evil.example' }, body: newQuestion() })
    expect(evil.status).toBe(403)
    const cross = await app.request(`${host}/api/questions`, { method: 'POST', headers: { ...json, cookie, 'sec-fetch-site': 'cross-site' }, body: newQuestion() })
    expect(cross.status).toBe(403)
  })
  it('ALLOWED_ORIGINS is still accepted', async () => {
    const app = makeApp({ accessToken: TOKEN, allowedOrigins: 'https://front.example' })
    const r = await app.request(`${host}/api/questions`, { method: 'POST', headers: { ...bearer, ...json, origin: 'https://front.example' }, body: newQuestion() })
    expect(r.status).toBe(200)
  })
  it('sets the cookie Secure when ALLOWED_ORIGINS names this host with https', async () => {
    const r = await makeApp({ accessToken: TOKEN, allowedOrigins: host }).request(`http://papertrail.example/?token=${TOKEN}`)
    expect(r.headers.get('set-cookie')).toMatch(/Secure/i)
  })
  it('the page redirect never leaves the site, even for //host paths', async () => {
    const r = await makeApp({ accessToken: TOKEN }).request(`http://localhost:${PORT}//evil.example/?token=${TOKEN}`)
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('/evil.example/')
  })
  it('responses carry the security headers', async () => {
    const r = await makeApp({ accessToken: TOKEN }).request(`${host}/api/questions`)
    expect(r.headers.get('x-frame-options')).toBe('DENY')
  })
})

describe('loopback mode without a token behaves as before', () => {
  const base = `http://localhost:${PORT}`
  it('a foreign Host is refused with 403, even with a bearer header', async () => {
    const app = makeApp()
    expect((await app.request('http://evil.example/api/questions')).status).toBe(403)
    expect((await app.request('http://evil.example/api/questions', { headers: bearer })).status).toBe(403)
  })
  it('a POST needs the session cookie, and a bearer header does not replace it', async () => {
    const app = makeApp()
    const r = await app.request(`${base}/api/questions`, { method: 'POST', headers: { ...bearer, ...json, origin: base }, body: newQuestion() })
    expect(r.status).toBe(403)
  })
  it('the request\'s own non-loopback origin is not accepted', async () => {
    const app = makeApp()
    const get = await app.request(`${base}/api/questions`)
    const cookie = get.headers.get('set-cookie')!.split(';')[0]
    const r = await app.request(`${base}/api/questions`, { method: 'POST', headers: { ...json, cookie, origin: 'https://localhost:3000' }, body: newQuestion() })
    expect(r.status).toBe(403)
  })
  it('same-origin with the cookie works', async () => {
    const app = makeApp()
    const get = await app.request(`${base}/api/questions`)
    const cookie = get.headers.get('set-cookie')!.split(';')[0]
    const r = await app.request(`${base}/api/questions`, { method: 'POST', headers: { ...json, cookie, origin: base }, body: newQuestion() })
    expect(r.status).toBe(200)
  })
})
