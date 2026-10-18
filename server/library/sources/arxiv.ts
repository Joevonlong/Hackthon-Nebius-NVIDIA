// Owner: lane L1. arXiv Atom API (export.arxiv.org/api/query). ≤1 request / 3 s via the 'arxiv' gate; cached.
import { cachedGet } from '../../data/http'
import { decodeXml } from '../../sources/pubmed'

const BASE = 'https://export.arxiv.org/api/query'

export interface ArxivEntry {
  id: string // without version, e.g. 2101.01234 or q-bio/0601001
  title: string
  summary: string | null
  authors: string[]
  published: string | null // YYYY-MM-DD
  year: number | null
  primaryCategory: string | null
  categories: string[]
  journalRef: string | null
  doi: string | null
  comment: string | null
  url: string
}

const txt = (s: string | undefined) => (s == null ? null : decodeXml(s).replace(/\s+/g, ' ').trim() || null)

export function parseArxivAtom(xml: string): ArxivEntry[] {
  const out: ArxivEntry[] = []
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]
    const rawId = e.match(/<id>\s*([^<]+?)\s*<\/id>/)?.[1] ?? ''
    const id = rawId.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '')
    const title = txt(e.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1])
    if (!id || !title || /^Error$/i.test(title)) continue
    const published = e.match(/<published>(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
    out.push({
      id,
      title,
      summary: txt(e.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1]),
      authors: [...e.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map(a => txt(a[1])!).filter(Boolean),
      published,
      year: published ? Number(published.slice(0, 4)) : null,
      primaryCategory: e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1] ?? null,
      categories: [...e.matchAll(/<category[^>]*term="([^"]+)"/g)].map(c => c[1]),
      journalRef: txt(e.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/)?.[1]),
      doi: txt(e.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/)?.[1])?.toLowerCase() ?? null,
      comment: txt(e.match(/<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/)?.[1]),
      url: `https://arxiv.org/abs/${id}`,
    })
  }
  return out
}

const STOP = new Set('a an and are as at be by for from how in into is it of on or that the this to via what which with using use help study studies methods method'.split(' '))

const contentWords = (q: string) => q.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w))

/** Free text → arXiv search_query: 3 content words ANDed over all fields, preferring words shared with `anchor` (the topic question). */
export function arxivQuery(q: string, anchor = ''): string {
  const words = [...new Set(contentWords(q))]
  const a = new Set(contentWords(anchor))
  const uniq = [...words.filter(w => a.has(w)), ...words.filter(w => !a.has(w))].slice(0, 3)
  return uniq.map(w => (w.includes('-') ? `all:"${w.replace(/-/g, ' ')}"` : `all:${w}`)).join(' AND ')
}

export async function arxivSearch(q: string, max = 30, anchor = ''): Promise<{ entries: ArxivEntry[]; url: string }> {
  const u = new URL(BASE)
  u.searchParams.set('search_query', arxivQuery(q, anchor) || `all:${q}`)
  u.searchParams.set('start', '0')
  u.searchParams.set('max_results', String(max))
  u.searchParams.set('sortBy', 'relevance')
  const r = await cachedGet('arxiv', u.toString(), { timeoutMs: 25000, retries: 1 })
  return { entries: parseArxivAtom(r.body), url: r.url }
}

/** Fetches entries by id (≤50 per request). */
export async function arxivByIds(ids: string[]): Promise<ArxivEntry[]> {
  const uniq = [...new Set(ids.filter(Boolean))]
  const out: ArxivEntry[] = []
  for (let i = 0; i < uniq.length; i += 50) {
    const u = new URL(BASE)
    u.searchParams.set('id_list', uniq.slice(i, i + 50).join(','))
    u.searchParams.set('max_results', '50')
    const r = await cachedGet('arxiv', u.toString(), { timeoutMs: 25000, retries: 1 })
    out.push(...parseArxivAtom(r.body))
  }
  return out
}
