// Owner: lane L1. OpenAlex for Library mode: search, batched works / sources / authors with the spec §3 field lists.
// Every GET goes through the raw cache; the 'openalex' circuit breaker in server/data/http.ts stops network calls
// once the (shared, keyless) budget is exhausted. `budget` counts network-or-cache requests issued per library.
import { cachedJson, isBlocked, mapLimit } from '../../data/http'

const BASE = 'https://api.openalex.org'

export const LIB_SELECT = ['id', 'doi', 'ids', 'display_name', 'publication_year', 'publication_date', 'type', 'type_crossref', 'cited_by_count',
  'citation_normalized_percentile', 'fwci', 'counts_by_year', 'primary_location', 'best_oa_location', 'open_access', 'authorships', 'primary_topic',
  'topics', 'keywords', 'language', 'is_retracted', 'referenced_works', 'abstract_inverted_index'].join(',')
// Note: spec §3 lists 'grants', but OpenAlex now rejects it ("grants is not a valid select field", 400). Funders come from PubMed GrantList.
export const SOURCE_SELECT = 'id,display_name,type,host_organization_name,summary_stats,is_core,is_in_doaj,issn_l,works_count,cited_by_count'
export const AUTHOR_SELECT = 'id,display_name,summary_stats,works_count,cited_by_count,last_known_institutions'

export function oaUrl(path: string, params: Record<string, string | number>): string {
  const u = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  if (process.env.OPENALEX_API_KEY) u.searchParams.set('api_key', process.env.OPENALEX_API_KEY)
  if (process.env.OPENALEX_MAILTO) u.searchParams.set('mailto', process.env.OPENALEX_MAILTO)
  return u.toString()
}

/** Per-library request counter (soft cap ≈ 120). */
export class OaBudget {
  used = 0
  constructor(public max = 120) {}
  take(n = 1): boolean { if (this.used + n > this.max) return false; this.used += n; return true }
}

export const openalexBlocked = () => isBlocked('openalex')

async function get(budget: OaBudget, path: string, params: Record<string, string | number>) {
  if (!budget.take()) throw new Error('openalex request budget for this library reached')
  return cachedJson('openalex', oaUrl(path, params), { timeoutMs: 20000 })
}

export async function searchWorks(budget: OaBudget, q: string, page = 1, perPage = 50): Promise<{ works: any[]; url: string }> {
  const r = await get(budget, '/works', { search: q.replace(/[?*]/g, ' ').replace(/\s+/g, ' ').trim(), 'per-page': perPage, page, select: LIB_SELECT })
  return { works: r.data.results ?? [], url: r.url }
}

export async function citedByWorks(budget: OaBudget, wid: string, n = 50): Promise<{ works: any[]; url: string }> {
  const r = await get(budget, '/works', { filter: `cites:${wid}`, sort: 'cited_by_count:desc', 'per-page': n, select: LIB_SELECT })
  return { works: r.data.results ?? [], url: r.url }
}

/** Batched lookup by a filter key, ≤50 values per request. Failed chunks are reported, not thrown. */
async function batch(budget: OaBudget, path: string, key: string, values: string[], select: string, onError?: (e: unknown) => void): Promise<any[]> {
  const uniq = [...new Set(values.filter(Boolean))]
  const chunks: string[][] = []
  for (let i = 0; i < uniq.length; i += 50) chunks.push(uniq.slice(i, i + 50))
  const res = await mapLimit(chunks, 4, async c => {
    try { return (await get(budget, path, { filter: `${key}:${c.join('|')}`, 'per-page': 50, select })).data.results ?? [] }
    catch (e) { onError?.(e); return [] }
  })
  return res.flat()
}

export const worksBy = (b: OaBudget, key: 'openalex_id' | 'doi' | 'pmid', vals: string[], onError?: (e: unknown) => void) =>
  batch(b, '/works', key, vals, LIB_SELECT, onError)
export const sourcesBy = (b: OaBudget, ids: string[], onError?: (e: unknown) => void) => batch(b, '/sources', 'openalex_id', ids, SOURCE_SELECT, onError)
export const authorsBy = (b: OaBudget, ids: string[], onError?: (e: unknown) => void) => batch(b, '/authors', 'openalex_id', ids, AUTHOR_SELECT, onError)

/** Title search (strictly checked by the caller). */
export async function searchTitle(budget: OaBudget, title: string): Promise<any[]> {
  const r = await get(budget, '/works', { filter: `title.search:${title.replace(/[,:|]/g, ' ').slice(0, 200)}`, 'per-page': 5, select: LIB_SELECT })
  return r.data.results ?? []
}
