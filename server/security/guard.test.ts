import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { apiGuard, bodyLimitFor, sessionCookie, loadSessionToken } from './guard'
import { extractPdfPages } from './pdf-worker'
import { parseSeedPdf } from '../library/seed-import'

const PORT = 3000
function makeApp(extra?: string, o: { port?: number; dataDir?: string; devClient?: boolean } = {}) {
  const app = new Hono()
  // app.request sends no Host header (a real server always does); derive it from the URL like a client would
  const request = app.request.bind(app)
  app.request = ((input: string, init: RequestInit = {}) => request(input, { ...init, headers: { host: new URL(input).host, ...(init.headers as Record<string, string>) } })) as typeof app.request
  app.use('/api/*', apiGuard({ port: PORT, devClient: true, allowedOrigins: extra, ...o }))
  app.get('/api/health', c => c.json({ ok: true }))
  app.post('/api/seeds/resolve', async c => c.json({ got: (await c.req.text()).length }))
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
    expect(r.headers.get('set-cookie')).toContain(sessionCookie(PORT))
  })
  it('ALLOWED_ORIGINS adds an origin and its host', async () => {
    const app = makeApp('https://pt.example')
    expect((await app.request('https://pt.example/api/health')).status).toBe(200)
    const cookie = (await app.request('https://pt.example/api/health')).headers.get('set-cookie')!.split(';')[0]
    expect((await post(app, 'https://pt.example/api/library', { origin: 'https://pt.example', cookie })).status).toBe(200)
  })
  it('413 when Content-Length is over the route limit', async () => {
    const app = makeApp(); const cookie = await cookieOf(app)
    expect(bodyLimitFor('/api/seeds/resolve')).toBe(1024 * 1024)
    expect((await post(app, `${base}/api/seeds/resolve`, { origin: base, cookie, 'content-length': String(2 * 1024 * 1024) }, 'x')).status).toBe(413)
  })
  it('413 for a chunked body over the limit', async () => {
    const app = makeApp(); const cookie = await cookieOf(app)
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1024 * 1024 + 10)); c.close() } })
    expect((await post(app, `${base}/api/seeds/resolve`, { origin: base, cookie }, stream)).status).toBe(413)
  })
})

describe('session token', () => {
  it('survives a restart (same token from DATA_DIR) and is stored 0600', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pt-guard-'))
    expect(loadSessionToken(dir, PORT)).toBe(loadSessionToken(dir, PORT))
    const cookie = await cookieOf(makeApp(undefined, { dataDir: dir }))
    const restarted = makeApp(undefined, { dataDir: dir })
    expect((await post(restarted, `${base}/api/library`, { origin: base, cookie })).status).toBe(200)
    expect(statSync(join(dir, `session-token-${PORT}`)).mode & 0o777).toBe(0o600)
  })
  it('two ports use independent cookie names and tokens', async () => {
    expect(sessionCookie(3001)).not.toBe(sessionCookie(3002))
    const a = makeApp(undefined, { port: 3001 }), b = makeApp(undefined, { port: 3002 })
    const ca = (await a.request('http://localhost:3001/api/health')).headers.get('set-cookie')!
    const cb = (await b.request('http://localhost:3002/api/health')).headers.get('set-cookie')!
    expect(ca.startsWith(sessionCookie(3001))).toBe(true)
    expect(cb.startsWith(sessionCookie(3002))).toBe(true)
    // a browser holding both cookies still works against each
    const both = `${ca.split(';')[0]}; ${cb.split(';')[0]}`
    expect((await post(a, 'http://localhost:3001/api/library', { origin: 'http://localhost:3001', cookie: both })).status).toBe(200)
    expect((await post(b, 'http://localhost:3002/api/library', { origin: 'http://localhost:3002', cookie: both })).status).toBe(200)
  })
  it('port 5173 is only allowed with devClient', async () => {
    expect((await makeApp(undefined, { devClient: false }).request('http://localhost:5173/api/health')).status).toBe(403)
  })
  it('a >1 MB library request is not rejected (notes are sent in full), >30 MB is', async () => {
    const app = makeApp(); const cookie = await cookieOf(app)
    expect((await post(app, `${base}/api/library`, { origin: base, cookie }, 'x'.repeat(5 * 1024 * 1024))).status).toBe(200)
    expect((await post(app, `${base}/api/library`, { origin: base, cookie, 'content-length': String(31 * 1024 * 1024) }, 'x')).status).toBe(413)
    expect(bodyLimitFor('/api/questions/q/notes/a.md')).toBeGreaterThanOrEqual(8 * 1024 * 1024)
  })
})

describe('PDF worker', () => {
  it('extracts a DOI from a real PDF through the worker, from another cwd', async () => {
    const cwd = process.cwd()
    try { process.chdir(tmpdir()) } catch { /* vitest threads can't chdir; the URL is resolved in the parent anyway */ }
    try {
      const r = await parseSeedPdf(tinyPdf('Smith 2020. doi:10.1234/abc.5678'))
      expect(r.ids).toEqual(['10.1234/abc.5678'])
    } finally { try { process.chdir(cwd) } catch { /* same */ } }
  })
  it('queues workers: three hung parses never run more than two at once', async () => {
    const t0 = Date.now()
    const run = () => extractPdfPages(new Uint8Array(1), { deadlineMs: 400, source: 'while (true) {}' }).then(() => 0, () => Date.now() - t0)
    const done = await Promise.all([run(), run(), run()])
    expect(Math.max(...done)).toBeGreaterThanOrEqual(750) // the third started after one of the first two timed out
  })
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

/** A one-page PDF with a single text line (xref is left to pdf.js to rebuild). */
function tinyPdf(line: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${line}) Tj ET`
  const body = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${stream.length}>>stream
${stream}
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R/Size 6>>
%%EOF`
  return new TextEncoder().encode(body)
}
