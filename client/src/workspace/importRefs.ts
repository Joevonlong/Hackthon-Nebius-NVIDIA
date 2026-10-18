// F-20: extract DOIs from a BibTeX (.bib) or CSL JSON file so they can become discovery seeds.
const DOI_RE = /\b10\.\d{4,9}\/[^\s"'{}<>,;]+/gi

const clean = (d: string) => d.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/[.)\]]+$/, '').toLowerCase()

export function extractDois(text: string, fileName = ''): string[] {
  const out: string[] = []
  const looksJson = /\.json$/i.test(fileName) || /^\s*[[{]/.test(text)
  if (looksJson) {
    try {
      const data = JSON.parse(text)
      const items: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [data]
      for (const it of items) {
        const d = (it as Record<string, unknown>)?.DOI ?? (it as Record<string, unknown>)?.doi
        if (typeof d === 'string' && d) out.push(clean(d))
      }
    } catch { /* fall through to regex */ }
  }
  if (!out.length) {
    for (const m of text.matchAll(/\bdoi\s*=\s*[{"]\s*([^}"]+)[}"]/gi)) out.push(clean(m[1]))
    if (!out.length) for (const m of text.matchAll(DOI_RE)) out.push(clean(m[0]))
  }
  return [...new Set(out.filter(d => /^10\.\d{4,9}\//.test(d)))]
}
