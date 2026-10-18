// Owner: lane L1. Google Scholar ONLY via SerpAPI (engine=google_scholar). Never scrape scholar.google.com.
// Without SERPAPI_KEY the caller reports one skipped call. The api_key param is stripped from cache keys and traces.
import { cachedJson } from '../../data/http'
import { extractArxiv, extractDoi, extractPmid } from '../../sources/tavily'

export interface ScholarItem {
  title: string
  link: string
  snippet: string | null
  year: number | null
  venue: string | null
  authors: string[]
  citedBy: number | null
  resultId: string | null
  position: number
  doi: string | null
  pmid: string | null
  arxiv: string | null
}

export const hasSerpApiKey = () => !!process.env.SERPAPI_KEY

/** Maps one SerpAPI google_scholar response to items. */
export function mapScholar(data: any): ScholarItem[] {
  const rs: any[] = Array.isArray(data?.organic_results) ? data.organic_results : []
  return rs.filter(r => typeof r?.title === 'string' && r.title.trim()).map((r, i) => {
    const summary: string = r.publication_info?.summary ?? ''
    // "A Author, B Author - Nature immunology, 2016 - nature.com"
    const segs = summary.split(' - ')
    const mid = segs.length >= 2 ? segs[1] : ''
    const year = Number(summary.match(/\b(19\d{2}|20\d{2})\b/)?.[1] ?? NaN)
    const venue = mid.replace(/,?\s*(19|20)\d{2}\s*$/, '').trim() || null
    const authors = Array.isArray(r.publication_info?.authors) && r.publication_info.authors.length
      ? r.publication_info.authors.map((a: any) => String(a.name))
      : segs.length >= 2 ? segs[0].split(',').map(s => s.trim()).filter(s => s && s !== '…') : []
    const link = String(r.link ?? '')
    const total = r.inline_links?.cited_by?.total
    return {
      title: String(r.title).replace(/^\[[A-Z]+\]\s*/, '').trim(),
      link,
      snippet: r.snippet ? String(r.snippet) : null,
      year: Number.isFinite(year) ? year : null,
      venue: venue && !/^(19|20)\d{2}$/.test(venue) ? venue : null,
      authors,
      citedBy: typeof total === 'number' ? total : null,
      resultId: r.result_id ? String(r.result_id) : null,
      position: typeof r.position === 'number' ? r.position + 1 : i + 1,
      doi: link ? extractDoi(link) : null,
      pmid: link ? extractPmid(link) : null,
      arxiv: link ? extractArxiv(link) : null,
    }
  })
}

export async function scholarSearch(q: string, num = 20): Promise<{ items: ScholarItem[]; url: string }> {
  const u = new URL('https://serpapi.com/search.json')
  u.searchParams.set('engine', 'google_scholar')
  u.searchParams.set('q', q)
  u.searchParams.set('num', String(num))
  u.searchParams.set('api_key', process.env.SERPAPI_KEY || '')
  const r = await cachedJson('serpapi', u.toString(), { timeoutMs: 25000 })
  if (r.data?.error) throw new Error(`serpapi: ${String(r.data.error).slice(0, 120)}`)
  return { items: mapScholar(r.data), url: r.url }
}
