// Paper, web-search and library-file URLs are untrusted: Vue does not sanitise `:href`, so a `javascript:` URL would run on click.
// Returns the normalised URL for http(s) only, else null; the UI renders null as plain text, not a link.
/** `[text](url)` when the URL is safe, else just the text, so a note never holds `[x]()` or a script link. */
export const mdLink = (text: string, url: string | null | undefined) => { const u = safeUrl(url); return u ? `[${text}](${u})` : text }

export function safeUrl(u: string | null | undefined): string | null {
  if (typeof u !== 'string') return null
  const s = u.trim()
  if (!s) return null
  try {
    const p = new URL(s)
    return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null
  } catch { return null }
}
