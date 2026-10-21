// Paper, web-search and library-file URLs are untrusted: Vue does not sanitise `:href`, so a `javascript:` URL would run on click.
// Returns the normalised URL for http(s) only, else null; the UI renders null as plain text, not a link.
export function safeUrl(u: string | null | undefined): string | null {
  if (typeof u !== 'string') return null
  const s = u.trim()
  if (!s) return null
  try {
    const p = new URL(s)
    return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null
  } catch { return null }
}
