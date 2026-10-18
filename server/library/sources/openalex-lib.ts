// Owner: lane L1. OpenAlex for Library mode: search, batched works / sources / authors with the spec §3 field lists.
// Every GET goes through the raw cache; the 'openalex' circuit breaker in server/data/http.ts stops network calls
// once the (shared, keyless) budget is exhausted. `budget` counts network-or-cache requests issued per library.
// Batches (works / sources / authors by id) go through the per-entity cache (openalex-entities.ts): cached ids are served
// without a request, only the rest is fetched, and a failed request still leaves every cached entity in the result.
import { blockedUntil, cachedGet, HttpError, isBlocked, mapLimit } from '../../data/http'
import { currentRunId, trace } from '../../trace'
import { entities, type EntityKind, type EntityStore, type LookupKey } from './openalex-entities'

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

/** Breaker bookkeeping: each stage that runs into the open circuit is traced once per breaker period. */
const breakerNoted = new Set<string>()
export const breakerLog: { stage: string; until: string; detail: string }[] = []
export function noteBlocked(stage: string, detail: string) {
  const until = new Date(blockedUntil.openalex ?? Date.now()).toISOString()
  const k = `${currentRunId() ?? '-'}:${stage}@${until}`
  if (breakerNoted.has(k)) return
  breakerNoted.add(k)
  breakerLog.push({ stage, until, detail })
  trace('api', { api: 'openalex', breaker: 'open', stage, until, detail })
}
export function resetBreakerLog() { breakerNoted.clear(); breakerLog.length = 0 }

const blockedError = (stage: string) => new HttpError(429, `openalex:${stage}`, `openalex circuit open until ${new Date(blockedUntil.openalex ?? 0).toISOString()} — request skipped, cached entities used`)

/** URL-cached GET. With the breaker open, cachedGet still serves URL-cache hits and throws (no network) on a miss. */
async function get(budget: OaBudget, stage: string, path: string, params: Record<string, string | number>) {
  if (!budget.take()) throw new Error('openalex request budget for this library reached')
  try {
    const r = await cachedGet('openalex', oaUrl(path, params), { timeoutMs: 20000 })
    return { data: JSON.parse(r.body), url: r.url, cached: r.cached }
  } catch (e) {
    if (isBlocked('openalex')) noteBlocked(stage, String((e as Error)?.message ?? e).slice(0, 160))
    throw e
  }
}

function store(): EntityStore | null {
  try { return entities() } catch { return null } // unreadable cache file: plain URL-cached batches
}

/** Work lists (search / cites: / title.search:) also feed the entity cache; the response itself stays URL-cached as before. */
function harvest(r: { data: any; cached: boolean }) {
  if (r.cached) return
  try { store()?.put('work', r.data.results ?? [], LIB_SELECT) } catch { /* a cache write must never break a run */ }
}

export async function searchWorks(budget: OaBudget, q: string, page = 1, perPage = 50): Promise<{ works: any[]; url: string }> {
  const r = await get(budget, 'search', '/works', { search: q.replace(/[?*]/g, ' ').replace(/\s+/g, ' ').trim(), 'per-page': perPage, page, select: LIB_SELECT })
  harvest(r)
  return { works: r.data.results ?? [], url: r.url }
}

export async function citedByWorks(budget: OaBudget, wid: string, n = 50): Promise<{ works: any[]; url: string }> {
  const r = await get(budget, 'cited-by', '/works', { filter: `cites:${wid}`, sort: 'cited_by_count:desc', 'per-page': n, select: LIB_SELECT })
  harvest(r)
  return { works: r.data.results ?? [], url: r.url }
}

export interface BatchReport { stage: string; kind: EntityKind; key: LookupKey; asked: number; cached: number; notFound: number; fetched: number; requests: number; failed: number; skipped: number }
/** Every batch of this process (the verification and gather stats read it). */
export const batchLog: BatchReport[] = []

/** Batched lookup by a filter key: entity-cache hits first, then ≤50 missing values per request. Failed chunks are reported
 *  (once per batch when the breaker is the cause), not thrown; with the breaker open no request is made at all. */
async function batch(budget: OaBudget, stage: string, kind: EntityKind, path: string, key: LookupKey, values: string[], select: string, onError?: (e: unknown) => void): Promise<any[]> {
  const uniq = [...new Set(values.filter(Boolean))].sort()
  if (!uniq.length) return []
  const st = store()
  const { hits, missing, negatives } = st ? st.lookup(kind, key, uniq, select) : { hits: [] as any[], missing: uniq, negatives: [] as string[] }
  const rep: BatchReport = { stage, kind, key, asked: uniq.length, cached: hits.length, notFound: negatives.length, fetched: 0, requests: 0, failed: 0, skipped: 0 }
  batchLog.push(rep)
  const done = (out: any[]) => { trace('api', { api: 'openalex', entityCache: rep }); return out }
  if (!missing.length) return done(hits)
  let breakerReported = false
  const breakerHit = () => {
    if (breakerReported) return
    breakerReported = true
    noteBlocked(stage, `${missing.length} ${kind} ids not in the entity cache (${hits.length} served from it)`)
    onError?.(blockedError(stage))
  }
  if (isBlocked('openalex')) { rep.skipped = missing.length; breakerHit(); return done(hits) }
  // sorted: chunk URLs (= raw-cache keys) must not depend on the order sources answered in
  const chunks: string[][] = []
  for (let i = 0; i < missing.length; i += 50) chunks.push(missing.slice(i, i + 50))
  const res = await mapLimit(chunks, 6, async c => {
    if (isBlocked('openalex')) { rep.skipped += c.length; breakerHit(); return [] }
    rep.requests++
    try {
      const r = await get(budget, stage, path, { filter: `${key}:${c.join('|')}`, 'per-page': 50, select })
      const results: any[] = r.data.results ?? []
      // not-found markers only when the page was not full (a full page may have dropped values)
      if (st && !r.cached) { try { st.put(kind, results, select, results.length < 50 ? { key, values: c } : undefined) } catch { /* ignore */ } }
      rep.fetched += results.length
      return results
    } catch (e) {
      rep.failed++
      if (isBlocked('openalex')) breakerHit(); else onError?.(e)
      return []
    }
  })
  return done([...hits, ...res.flat()])
}

export const worksBy = (b: OaBudget, key: LookupKey, vals: string[], onError?: (e: unknown) => void, stage: string = `works-by-${key}`) =>
  batch(b, stage, 'work', '/works', key, vals, LIB_SELECT, onError)
export const sourcesBy = (b: OaBudget, ids: string[], onError?: (e: unknown) => void, stage = 'venues') => batch(b, stage, 'source', '/sources', 'openalex_id', ids, SOURCE_SELECT, onError)
export const authorsBy = (b: OaBudget, ids: string[], onError?: (e: unknown) => void, stage = 'authors') => batch(b, stage, 'author', '/authors', 'openalex_id', ids, AUTHOR_SELECT, onError)

/** One work by OpenAlex id / DOI / PMID: entity cache first, else a one-value batch request. Throws only on a request failure. */
export async function workFor(budget: OaBudget, key: LookupKey, value: string, stage = 'known-paper'): Promise<any | null> {
  let err: unknown = null
  const ws = await batch(budget, stage, 'work', '/works', key, [value], LIB_SELECT, e => { err = e })
  if (ws[0]) return ws[0]
  if (err) throw err
  return null
}

/** Title search (strictly checked by the caller). */
export async function searchTitle(budget: OaBudget, title: string): Promise<any[]> {
  const r = await get(budget, 'title-search', '/works', { filter: `title.search:${title.replace(/[,:|]/g, ' ').slice(0, 200)}`, 'per-page': 5, select: LIB_SELECT })
  harvest(r)
  return r.data.results ?? []
}
