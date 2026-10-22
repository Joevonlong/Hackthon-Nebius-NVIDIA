import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { accessAuth, accessTokenProblem, isLoopbackHost, tokenExchange } from './auth'

const TOKEN = 'a'.repeat(32)
const PORT = 3000

function makeApp(token = TOKEN) {
  const app = new Hono()
  app.use('/api/*', accessAuth({ token, port: PORT }))
  app.use('*', tokenExchange({ token, port: PORT }))
  app.get('/api/health', c => c.json({ ok: true, keys: { tokenFactory: true } }))
  app.get('/api/questions', c => c.json({ questions: [] }))
  app.post('/api/library', c => c.json({ libraryId: 'x' }))
  app.get('/api/library/:id/stream', c => c.json({}))
  app.put('/api/questions/:id/notes/*', c => c.json({ ok: true }))
  app.get('/', c => c.text('app'))
  return app
}
const base = `http://localhost:${PORT}`

describe('startup rule', () => {
  it('knows loopback hosts', () => {
    for (const h of ['127.0.0.1', 'localhost', '::1', '[::1]', '127.1.2.3']) expect(isLoopbackHost(h)).toBe(true)
    for (const h of ['0.0.0.0', '192.168.1.5', 'example.com', '::']) expect(isLoopbackHost(h)).toBe(false)
  })
  it('refuses a non-loopback host without a token, or with a short one', () => {
    expect(accessTokenProblem('0.0.0.0', '')).toMatch(/PAPERTRAIL_ACCESS_TOKEN/)
    expect(accessTokenProblem('0.0.0.0', 'short')).toMatch(/at least/)
    expect(accessTokenProblem('0.0.0.0', TOKEN)).toBeNull()
    expect(accessTokenProblem('127.0.0.1', '')).toBeNull()
    expect(accessTokenProblem('127.0.0.1', 'short')).toMatch(/at least/)
  })
})

describe('access token', () => {
  it('every /api route returns 401 without the token (any method)', async () => {
    const app = makeApp()
    for (const [m, p] of [['GET', '/api/questions'], ['POST', '/api/library'], ['GET', '/api/library/x/stream'], ['PUT', '/api/questions/Q/notes/a.md'], ['GET', '/api/nope']])
      expect((await app.request(base + p, { method: m })).status, `${m} ${p}`).toBe(401)
  })
  it('rejects a wrong token (header and query)', async () => {
    const app = makeApp()
    expect((await app.request(`${base}/api/questions`, { headers: { authorization: 'Bearer ' + 'b'.repeat(32) } })).status).toBe(401)
    expect((await app.request(`${base}/api/questions?token=${TOKEN}`)).status).toBe(401) // the query form only works on the page, not on the API
  })
  it('accepts Authorization: Bearer', async () => {
    const r = await makeApp().request(`${base}/api/questions`, { headers: { authorization: `Bearer ${TOKEN}` } })
    expect(r.status).toBe(200)
  })
  it('/?token= sets an HttpOnly cookie and redirects without the token in the URL', async () => {
    const app = makeApp()
    const r = await app.request(`${base}/?token=${TOKEN}&x=1`)
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('/?x=1')
    const cookie = r.headers.get('set-cookie')!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).not.toContain(TOKEN) // the cookie holds a digest, not the token
    const ok = await app.request(`${base}/api/questions`, { headers: { cookie: cookie.split(';')[0] } })
    expect(ok.status).toBe(200)
  })
  it('a wrong token on the page sets no cookie', async () => {
    const r = await makeApp().request(`${base}/?token=nope`)
    expect(r.headers.get('set-cookie')).toBeNull()
    expect(r.status).toBe(200)
  })
  it('/api/health stays open but reveals only ok without the token', async () => {
    const app = makeApp()
    const open = await app.request(`${base}/api/health`)
    expect(open.status).toBe(200)
    expect(await open.json()).toEqual({ ok: true })
    const full = await app.request(`${base}/api/health`, { headers: { authorization: `Bearer ${TOKEN}` } })
    expect(await full.json()).toMatchObject({ keys: { tokenFactory: true } })
  })
  it('no token configured: nothing changes', async () => {
    const app = new Hono()
    app.use('/api/*', accessAuth({ token: '', port: PORT }))
    app.get('/api/questions', c => c.json({}))
    expect((await app.request(`${base}/api/questions`)).status).toBe(200)
  })
})
