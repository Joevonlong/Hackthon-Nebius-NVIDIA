import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { inlineScriptHashes, securityHeaders } from './headers'

describe('security headers', () => {
  const app = new Hono()
  app.use('*', securityHeaders({ scriptHashes: ["'sha256-abc='"] }))
  app.get('/api/x', c => c.json({}))
  app.get('/', c => c.html('<p>hi</p>'))
  app.get('/boom', () => { throw new Error('x') })
  it('sets CSP, frame, nosniff and referrer headers on API, page and error responses', async () => {
    for (const p of ['/api/x', '/', '/boom', '/missing']) {
      const r = await app.request(p)
      const csp = r.headers.get('content-security-policy')!
      expect(csp, p).toContain("default-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("script-src 'self' 'sha256-abc='")
      expect(r.headers.get('x-frame-options')).toBe('DENY')
      expect(r.headers.get('x-content-type-options')).toBe('nosniff')
      expect(r.headers.get('referrer-policy')).toBe('no-referrer')
    }
  })
  it('hashes the inline scripts of the built page', () => {
    const html = '<script>var a=1</script><script type="module" src="/x.js"></script><script>b()</script>'
    const h = inlineScriptHashes(html)
    expect(h).toHaveLength(2)
    expect(h[0]).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/)
  })
})
