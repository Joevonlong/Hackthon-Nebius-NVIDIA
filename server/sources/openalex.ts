// Owner: lane A1. OpenAlex client: single work, id/pmid/doi batches, cites-pair filter (R2), search (R4).
// All GETs go through the raw cache (server/data/http.ts).
import type { Paper } from '@shared/contracts'
import { cachedJson, HttpError, mapLimit } from '../data/http'

const BASE = 'https://api.openalex.org'
export const SELECT = [
  'id', 'doi', 'ids', 'display_name', 'publication_year', 'publication_date', 'cited_by_count', 'type', 'primary_location',
  'authorships', 'is_retracted', 'referenced_works', 'open_access', 'abstract_inverted_index', 'citation_normalized_percentile',
].join(',')

export const shortId = (x: string | null | undefined) => (x ? x.split('/').pop()! : '')

export function normDoi(d: string | null | undefined): string | null {
  if (!d) return null
  const s = d.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '')
  return s || null
}

/** Rebuilds plain text from OpenAlex abstract_inverted_index. */
export function invertedIndexToText(idx: Record<string, number[]> | null | undefined): string | null {
  if (!idx || typeof idx !== 'object') return null
  const words: string[] = []
  for (const [w, positions] of Object.entries(idx)) for (const p of positions) words[p] = w
  const text = words.filter(w => w !== undefined).join(' ').trim()
  return text || null
}

export function mapWork(w: any): Paper {
  const id = shortId(w.id)
  const abstract = invertedIndexToText(w.abstract_inverted_index)
  const pmid = w.ids?.pmid ? shortId(w.ids.pmid) : null
  const pmcid = w.ids?.pmcid ? shortId(String(w.ids.pmcid).replace(/\/$/, '')) : null
  return {
    id,
    doi: normDoi(w.doi),
    pmid: pmid || null,
    pmcid: pmcid || null,
    title: w.display_name || w.title || '(untitled)',
    authors: (w.authorships || []).slice(0, 10).map((a: any) => a?.author?.display_name).filter(Boolean),
    year: w.publication_year ?? null,
    publicationDate: w.publication_date ?? null,
    venue: w.primary_location?.source?.display_name ?? null,
    type: w.type ?? null,
    citedByCount: w.cited_by_count ?? 0,
    citationPct: w.citation_normalized_percentile?.value ?? null,
    isRetracted: !!w.is_retracted,
    isOa: w.open_access?.is_oa ?? null,
    oaUrl: w.open_access?.oa_url ?? null,
    abstract,
    abstractSource: abstract ? 'openalex' : null,
    referencedWorks: (w.referenced_works || []).map(shortId),
    url: `https://openalex.org/${id}`,
  }
}

function url(path: string, params: Record<string, string | number>): string {
  const u = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  if (process.env.OPENALEX_API_KEY) u.searchParams.set('api_key', process.env.OPENALEX_API_KEY)
  if (process.env.OPENALEX_MAILTO) u.searchParams.set('mailto', process.env.OPENALEX_MAILTO)
  return u.toString()
}

export interface Fetched<T> { value: T; url: string; hash: string }

/** id: W-id, DOI, or PMID (prefix-typed: 'doi:…', 'pmid:…', or bare W-id). Returns null on 404. */
/** Request path of one work. The id is encoded so "/", "?", "#" and ".." in it cannot change the path or add a query (#35). */
export function workPath(ref: { kind: 'openalex' | 'doi' | 'pmid' | 'pmcid'; value: string }): string {
  return ref.kind === 'openalex' ? `/works/${encodeURIComponent(ref.value)}` : `/works/${ref.kind}:${encodeURIComponent(ref.value)}`
}

export async function getWork(ref: { kind: 'openalex' | 'doi' | 'pmid' | 'pmcid'; value: string }): Promise<Fetched<Paper> | null> {
  const path = workPath(ref)
  try {
    const r = await cachedJson('openalex', url(path, { select: SELECT }))
    return { value: mapWork(r.data), url: r.url, hash: r.hash }
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 400)) return null
    throw e
  }
}

/** Batch lookup by filter key (openalex_id | pmid | doi), ≤50 per request. */
export async function getWorksBy(key: 'openalex_id' | 'pmid' | 'doi', values: string[]): Promise<{ papers: Paper[]; requests: { url: string; hash: string }[] }> {
  const uniq = [...new Set(values.filter(Boolean))]
  const chunks: string[][] = []
  for (let i = 0; i < uniq.length; i += 50) chunks.push(uniq.slice(i, i + 50))
  const res = await mapLimit(chunks, 8, async c => {
    const r = await cachedJson('openalex', url('/works', { filter: `${key}:${c.join('|')}`, 'per-page': 50, select: SELECT }))
    return { papers: (r.data.results || []).map(mapWork) as Paper[], url: r.url, hash: r.hash }
  })
  return { papers: res.flatMap(r => r.papers), requests: res.map(r => ({ url: r.url, hash: r.hash })) }
}

/** R2: works citing both a and b, most cited first, capped at `max`. */
export async function citingBoth(a: string, b: string, max: number): Promise<Fetched<Paper[]>> {
  const perPage = Math.min(200, Math.max(1, max))
  const out: Paper[] = []
  let last = { url: '', hash: '' }
  for (let page = 1; out.length < max; page++) {
    const r = await cachedJson('openalex', url('/works', { filter: `cites:${a},cites:${b}`, sort: 'cited_by_count:desc', 'per-page': perPage, page, select: SELECT }))
    last = { url: r.url, hash: r.hash }
    const results = (r.data.results || []).map(mapWork)
    out.push(...results)
    if (results.length < perPage || page * perPage >= (r.data.meta?.count ?? 0)) break
  }
  return { value: out.slice(0, max), ...last }
}

/** R4: relevance search, top n. */
export async function search(query: string, n = 10): Promise<Fetched<Paper[]>> {
  const r = await cachedJson('openalex', url('/works', { search: query, 'per-page': n, select: SELECT }))
  return { value: (r.data.results || []).map(mapWork), url: r.url, hash: r.hash }
}
