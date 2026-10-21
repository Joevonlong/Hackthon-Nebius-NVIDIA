import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { apiGuard, bodyLimitFor, SESSION_COOKIE } from './guard'
import { extractPdfPages } from './pdf-worker'
import { parseSeedPdf } from '../library/seed-import'

const PORT = 3000
function makeApp(extra?: string) {
  const app = new Hono()
  // app.request sends no Host header (a real server always does); derive it from the URL like a client would
  const request = app.request.bind(app)
  app.request = ((input: string, init: RequestInit = {}) => request(input, { ...init, headers: { host: new URL(input).host, ...(init.headers as Record<string, string>) } })) as typeof app.request
  app.use('/api/*', apiGuard({ port: PORT, allowedOrigins: extra }))
  app.get('/api/health', c => c.json({ ok: true }))
  app.post('/api/library', async c => c.json({ got: (await c.req.text()).length }))
  return app
}
const base = `http://localhost:${PORT}`
async function cookieOf(app: Hono) {
  const r = await app.request(`${base}/api/health`)
  return r.headers.get('set-cookie')!.split(';')[0]
}
const post = (app: Hono, url: string, headers: Record<string, string>, body: BodyInit = '{}') =>
  app.request(url, { method: 'POST', headers, body, duplex: 'half' } as RequestInit)

describe('apiGuard', () => {
  it('serves same-origin GET and sets a SameSite=Strict cookie', async () => {
    const r = await makeApp().request(`${base}/api/health`)
    expect(r.status).toBe(200)
    expect(r.headers.get('set-cookie')).toMatch(/SameSite=Strict/i)
  })
  it('accepts same-origin POSTs (also loopback aliases and the Vite dev origin) with the cookie', async () => {
    const app = makeApp(); const cookie = await cookieOf(app)
    for (const origin of [base, 'http://localhost:5173', 'http://127.0.0.1:3000'])
      expect((await post(app, `${base}/api/library`, { origin, cookie })).status).toBe(200)
    // the dev proxy forwards Host localhost:5173
    expect((await post(app, 'http://localhost:5173/api/library', { origin: 'http://localhost:5173', cookie })).status).toBe(200)
  })
  it('403 on foreign Origin', async () => {
    const app = makeApp(); const cookie = await cookieOf(app)
    expect((await post(app, `${base}/api/library`, { origin: 'https://evil.example', cookie })).status).toBe(403)
  })
  it('403 on cross-site text/plain POST (no Origin, Sec-Fetch-Site cross-site)', async () => {
    const app = makeApp(); const cookie = await cookieOf(app)
    expect((await post(app, `${base}/api/library`, { 'content-type': 'text/plain', 'sec-fetch-site': 'cross-site', cookie })).status).toBe(403)
  })
  it('403 on foreign Host, including GET (DNS rebinding)', async () => {
    const app = makeApp()
    expect((await app.request('http://evil.example/api/health')).status).toBe(403)
    expect((await post(app, 'http://evil.example:3000/api/library', {})).status).toBe(403)
  })
  it('403 on a mutating request without the session cookie, and the refusal hands out one', async () => {
    const r = await post(makeApp(), `${base}/api/library`, { origin: base })
    expect(r.status).toBe(403)
    expect(r.headers.get('set-cookie')).toContain(SESSION_COOKIE)
  })
  it('ALLOWED_ORIGINS adds an origin and its host', async () => {
    const app = makeApp('https://pt.example')
    expect((await app.request('https://pt.example/api/health')).status).toBe(200)
    const cookie = (await app.request('https://pt.example/api/health')).headers.get('set-cookie')!.split(';')[0]
    expect((await post(app, 'https://pt.example/api/library', { origin: 'https://pt.example', cookie })).status).toBe(200)
  })
  it('413 when Content-Length is over the route limit', async () => {
    const app = makeApp(); const cookie = await cookieOf(app)
    expect(bodyLimitFor('/api/library')).toBe(1024 * 1024)
    expect((await post(app, `${base}/api/library`, { origin: base, cookie, 'content-length': String(2 * 1024 * 1024) }, 'x')).status).toBe(413)
  })
  it('413 for a chunked body over the limit', async () => {
    const app = makeApp(); const cookie = await cookieOf(app)
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1024 * 1024 + 10)); c.close() } })
    expect((await post(app, `${base}/api/library`, { origin: base, cookie }, stream)).status).toBe(413)
  })
})

describe('PDF worker', () => {
  it('times out a hung parse and /api/health stays responsive meanwhile', async () => {
    const app = makeApp()
    const pending = extractPdfPages(new Uint8Array(8), { deadlineMs: 700, source: 'while (true) {}' }).then(() => 'ok', e => (e as Error).message)
    await new Promise(r => setTimeout(r, 100))
    const h0 = Date.now()
    expect((await app.request(`${base}/api/health`)).status).toBe(200)
    expect(Date.now() - h0).toBeLessThan(200)
    expect(await pending).toMatch(/timed out/)
  })
  it('rejects a malformed PDF without crashing', async () => {
    await expect(parseSeedPdf(new TextEncoder().encode('not a pdf at all'))).rejects.toThrow()
  })
})
