// Q2-6 (CR-13): seed resolution when OpenAlex cannot answer (429 rate limit, 401 key, network, or not indexed).
// DOI → Crossref /works/<doi> (mailto from OPENALEX_MAILTO / CROSSREF_MAILTO), then Europe PMC search DOI:"…";
// PMID → PubMed esummary, then Europe PMC EXT_ID; PMCID → Europe PMC PMCID:… . Returns a contract Paper with the
// fields that source knows (citationPct null, referencedWorks []), so the seed still resolves; the caller notes the source.
import type { Paper } from '@shared/contracts'
import { cachedJson, HttpError } from '../data/http'
import { normDoi } from '../sources/openalex'
import type { SeedRef } from './seeds'

export type FallbackSource = 'Crossref' | 'Europe PMC' | 'PubMed'
export interface FallbackHit { paper: Paper; source: FallbackSource }

const TIMEOUT = 12000
const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '')
const isoDate = (parts: unknown): { year: number | null; date: string | null } => {
  const p = Array.isArray(parts) ? (parts as number[]).map(Number).filter(Number.isFinite) : []
  if (!p.length) return { year: null, date: null }
  const [y, m, d] = p
  return { year: y, date: m && d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null }
}

function base(o: Partial<Paper> & { id: string; title: string; url: string }): Paper {
  return {
    doi: null, pmid: null, pmcid: null, authors: [], year: null, publicationDate: null, venue: null, type: null,
    citedByCount: 0, citationPct: null, isRetracted: false, isOa: null, oaUrl: null, abstract: null, abstractSource: null,
    referencedWorks: [], ...o,
  }
}

/** Seed id for a paper without an OpenAlex work: pmid:<n> when known (same form the library records use), else doi:<doi>. */
const fallbackId = (pmid: string | null, doi: string | null, pmcid: string | null) =>
  pmid ? `pmid:${pmid}` : doi ? `doi:${doi}` : pmcid ? `pmcid:${pmcid}` : 'unknown'

const CROSSREF_TYPE: Record<string, string> = { 'journal-article': 'article', 'posted-content': 'preprint', 'proceedings-article': 'article', 'book-chapter': 'book-chapter', book: 'book', monograph: 'book', dataset: 'dataset', dissertation: 'dissertation', 'peer-review': 'peer-review' }

export function mapCrossref(m: any): Paper | null {
  if (!m || !Array.isArray(m.title) || !clean(m.title[0])) return null
  const doi = normDoi(m.DOI)
  const when = isoDate(m.published?.['date-parts']?.[0] ?? m.issued?.['date-parts']?.[0] ?? m['published-print']?.['date-parts']?.[0] ?? m['published-online']?.['date-parts']?.[0])
  const authors = (Array.isArray(m.author) ? m.author : []).slice(0, 10).map((a: any) => [a.given, a.family].filter(Boolean).join(' ') || a.name).filter(Boolean)
  const type = m.type === 'journal-article' && /review/i.test(String(m.subtype ?? '')) ? 'review' : CROSSREF_TYPE[m.type] ?? m.type ?? null
  return base({
    id: fallbackId(null, doi, null), doi, title: clean(m.title[0]), authors, year: when.year, publicationDate: when.date,
    venue: clean(m['container-title']?.[0]) || null, type,
    citedByCount: Number.isFinite(m['is-referenced-by-count']) ? m['is-referenced-by-count'] : 0,
    isRetracted: Array.isArray(m['update-to']) && m['update-to'].some((u: any) => /retraction/i.test(u?.type ?? '')),
    url: doi ? `https://doi.org/${doi}` : String(m.URL ?? ''),
  })
}

export function mapEuropePmc(x: any): Paper | null {
  if (!x || !clean(x.title)) return null
  const doi = normDoi(x.doi)
  const pmid = x.pmid ? String(x.pmid) : null
  const pmcid = x.pmcid ? String(x.pmcid).toUpperCase() : null
  const abs = clean(x.abstractText) || null
  const pubTypes: string[] = x.pubTypeList?.pubType ?? []
  const year = Number(x.pubYear) || null
  return base({
    id: fallbackId(pmid, doi, pmcid), doi, pmid, pmcid, title: clean(x.title).replace(/\.$/, ''),
    authors: (x.authorList?.author ?? []).slice(0, 10).map((a: any) => a.fullName || [a.firstName, a.lastName].filter(Boolean).join(' ')).filter(Boolean),
    year, publicationDate: /^\d{4}-\d{2}-\d{2}$/.test(x.firstPublicationDate ?? '') ? x.firstPublicationDate : null,
    venue: x.journalInfo?.journal?.title ?? x.journalTitle ?? null,
    type: pubTypes.some(t => /^review/i.test(t)) ? 'review' : x.source === 'PPR' ? 'preprint' : 'article',
    citedByCount: Number(x.citedByCount) || 0, isOa: x.isOpenAccess === 'Y' ? true : x.isOpenAccess === 'N' ? false : null,
    oaUrl: pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` : null,
    abstract: abs, abstractSource: abs ? 'europepmc' : null,
    url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : doi ? `https://doi.org/${doi}` : `https://europepmc.org/article/${x.source}/${x.id}`,
  })
}

export function mapEsummary(pmid: string, r: any): Paper | null {
  if (!r || r.error || !clean(r.title)) return null
  const ids: { idtype: string; value: string }[] = r.articleids ?? []
  const doi = normDoi(ids.find(i => i.idtype === 'doi')?.value)
  const pmc = ids.find(i => i.idtype === 'pmc')?.value?.toUpperCase() ?? null
  const year = Number(String(r.pubdate ?? r.sortpubdate ?? '').slice(0, 4)) || null
  const pt: string[] = r.pubtype ?? []
  return base({
    id: `pmid:${pmid}`, doi, pmid, pmcid: pmc, title: clean(r.title).replace(/\.$/, ''),
    authors: (r.authors ?? []).filter((a: any) => a.authtype === 'Author' || !a.authtype).slice(0, 10).map((a: any) => a.name).filter(Boolean),
    year, venue: r.fulljournalname || r.source || null, type: pt.some(t => /review/i.test(t)) ? 'review' : 'article',
    isRetracted: pt.includes('Retracted Publication'), isOa: pmc ? true : null, oaUrl: pmc ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmc}/` : null,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
  })
}

const mailto = () => process.env.CROSSREF_MAILTO || process.env.OPENALEX_MAILTO || ''

async function crossref(doi: string): Promise<Paper | null> {
  const u = new URL(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)
  if (mailto()) u.searchParams.set('mailto', mailto())
  try {
    const r = await cachedJson('crossref', u.toString(), { timeoutMs: TIMEOUT })
    return mapCrossref(r.data?.message)
  } catch (e) { if (e instanceof HttpError && e.status === 404) return null; throw e }
}

async function europePmc(query: string): Promise<Paper | null> {
  const u = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search')
  u.searchParams.set('query', query); u.searchParams.set('resultType', 'core'); u.searchParams.set('format', 'json'); u.searchParams.set('pageSize', '1')
  const r = await cachedJson('europepmc', u.toString(), { timeoutMs: TIMEOUT })
  return mapEuropePmc(r.data?.resultList?.result?.[0])
}

async function esummary(pmid: string): Promise<Paper | null> {
  const u = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi')
  u.searchParams.set('db', 'pubmed'); u.searchParams.set('id', pmid); u.searchParams.set('retmode', 'json'); u.searchParams.set('tool', 'papertrail')
  if (process.env.OPENALEX_MAILTO) u.searchParams.set('email', process.env.OPENALEX_MAILTO)
  if (process.env.NCBI_API_KEY) u.searchParams.set('api_key', process.env.NCBI_API_KEY)
  const r = await cachedJson('pubmed', u.toString(), { timeoutMs: TIMEOUT })
  return mapEsummary(pmid, r.data?.result?.[pmid])
}

/** Fills empty fields of `a` from `b` (same paper from a second source). */
function merge(a: Paper, b: Paper | null): Paper {
  if (!b) return a
  const out = { ...a }
  for (const k of Object.keys(b) as (keyof Paper)[]) {
    const v = out[k] as unknown
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) (out as Record<string, unknown>)[k] = b[k]
  }
  if (!a.pmid && b.pmid) { out.id = `pmid:${b.pmid}`; out.url = b.url }
  return out
}

/** Tries the non-OpenAlex sources in order; null when none knows the id. Never throws. */
export async function resolveWithoutOpenAlex(ref: SeedRef, deps: { crossref?: typeof crossref; europePmc?: typeof europePmc; esummary?: typeof esummary } = {}): Promise<FallbackHit | null> {
  const cr = deps.crossref ?? crossref, ep = deps.europePmc ?? europePmc, es = deps.esummary ?? esummary
  const safe = async <T>(f: () => Promise<T>): Promise<T | null> => { try { return await f() } catch (e) { console.warn('[seed fallback]', (e as Error).message.slice(0, 160)); return null } }
  if (ref.kind === 'doi') {
    const c = await safe(() => cr(ref.value))
    const e = await safe(() => ep(`DOI:"${ref.value}"`))
    if (c) return { paper: merge(c, e && e.doi === c.doi ? e : null), source: 'Crossref' }
    if (e) return { paper: e, source: 'Europe PMC' }
    return null
  }
  if (ref.kind === 'pmid') {
    const s = await safe(() => es(ref.value))
    if (s) return { paper: s, source: 'PubMed' }
    const e = await safe(() => ep(`EXT_ID:${ref.value} AND SRC:MED`))
    return e ? { paper: e, source: 'Europe PMC' } : null
  }
  if (ref.kind === 'pmcid') {
    const e = await safe(() => ep(`PMCID:${ref.value}`))
    return e ? { paper: e, source: 'Europe PMC' } : null
  }
  return null // a bare OpenAlex W-id has no other source
}

/** "OpenAlex rate-limited" / "OpenAlex key rejected" / … from the OpenAlex error. */
export function openAlexProblem(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.status === 429) return 'OpenAlex rate-limited'
    if (e.status === 401 || e.status === 403) return 'OpenAlex refused the request (API key)'
    if (e.status >= 500) return `OpenAlex unavailable (HTTP ${e.status})`
  }
  return e == null ? 'Not in OpenAlex' : 'OpenAlex unreachable'
}
