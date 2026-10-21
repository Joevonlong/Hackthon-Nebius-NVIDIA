// Security response headers (#35): CSP, frame protection, nosniff, no referrer.
// The client needs: its own bundle, one inline theme script in index.html (allowed by hash, computed from the built page), inline
// styles (CodeMirror and Vue style bindings), Google Fonts (index.html loads Newsreader / Public Sans / JetBrains Mono), data: and blob: images.
import type { MiddlewareHandler } from 'hono'
import { createHash } from 'node:crypto'

/** CSP hash sources ('sha256-…') for the inline <script> blocks of a built HTML page. */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi))
    if (m[1].trim()) out.push(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
  return out
}

export function contentSecurityPolicy(scriptHashes: string[] = []): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export function securityHeaders(opts: { scriptHashes?: string[] } = {}): MiddlewareHandler {
  const csp = contentSecurityPolicy(opts.scriptHashes)
  return async (c, next) => {
    try { await next() } finally {
      // also on errors: the onError / notFound response is built after next() returns
      c.header('Content-Security-Policy', csp)
      c.header('X-Frame-Options', 'DENY')
      c.header('X-Content-Type-Options', 'nosniff')
      c.header('Referrer-Policy', 'no-referrer')
    }
  }
}
