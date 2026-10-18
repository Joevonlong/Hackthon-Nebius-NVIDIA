// CR-14. Citation / venue data without OpenAlex (budget exhausted, breaker open, or paper not indexed).
// Citations: cited-by counts from Europe PMC (PMID batches, then DOI batches; free, no key) and Crossref
// `is-referenced-by-count` (per DOI) for what Europe PMC missed. Venue: the paper's journal matched by ISSN (from the
// Europe PMC / Crossref answers) or normalized name against the OpenAlex sources already in the entity cache.
// Mutates the records in place (rec.extra.citedByFallback, rec.venue + rec.extra.venueMatch). Never throws; time-boxed:
// whatever finished by the deadline is applied. Every HTTP call is traced by cachedGet ('api'); the summary goes to 'references'.
import { cachedJson, mapLimit } from '../../data/http'
import { env } from '../../env'
import { trace } from '../../trace'
import { hasOpenAlexWork } from '../score'
import type { EnrichedRecord } from '../types'
import { entities, shortOaId } from './openalex-entities'

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'
const CROSSREF = 'https://api.crossref.org/works/'

export interface FallbackOptions {
  totalTimeoutMs?: number // default 10000: settle whatever finished by then
  requestTimeoutMs?: number // default 6000
  crossrefConcurrency?: number // default 6
  pmidBatch?: number // default 100
  doiBatch?: number // default 40
  /** OpenAlex source objects to match venues against (default: every source in the entity cache). */
  sources?: any[]
}

export interface FallbackResult {
  candidates: number // records with no OpenAlex / Scholar citation count and a PMID or DOI
  epmcCalls: number; crossrefCalls: number; errors: number; timedOut: boolean
  citations: number; viaEpmc: number; viaCrossref: number
  venueCandidates: number; venues: number; venuesByIssn: number; venuesByName: number; sourcesIndexed: number
  ms: number
}

const digits = (s: string | null | undefined) => (s && /^\d+$/.test(s.trim()) ? s.trim() : null)
const pmidOf = (r: EnrichedRecord) => digits(r.paper.pmid) ?? (r.key.startsWith('pmid:') ? digits(r.key.slice(5)) : null)
const normDoi = (d: string | null | undefined) => (d ? d.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:/, '') || null : null)
const normIssn = (s: string) => s.trim().toUpperCase().replace(/[^0-9X]/g, '').replace(/^(\d{4})(\d{3}[0-9X])$/, '$1-$2')
const issnsOf = (s: unknown): string[] => (Array.isArray(s) ? s : String(s ?? '').split(/[;,]/)).map(x => normIssn(String(x))).filter(x => /^\d{4}-\d{3}[0-9X]$/.test(x))
export const normVenueName = (s: string | null | undefined) =>
  (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').trim()

/** A record needs the citations fallback when no source we trust gave it a count. */
export const needsCitations = (r: EnrichedRecord) => !hasOpenAlexWork(r) && r.extra.scholarCitedBy == null && r.extra.citedByFallback == null
const needsVenue = (r: EnrichedRecord) => !r.venue.id && r.venue.type !== 'repository' && !r.extra.arxiv && (!!r.venue.name || !!r.paper.doi || !!pmidOf(r))

/** OpenAlex source object (entity cache shape) → VenueInfo, like enrich.ts buildVenue does for a work's source. */
export function venueFromSource(s: any): EnrichedRecord['venue'] {
  return {
    id: shortOaId(s.id) || null, name: s.display_name ?? null, type: s.type ?? null, publisher: s.host_organization_name ?? null,
    hIndex: s.summary_stats?.h_index ?? null, meanCitedness2y: s.summary_stats?.['2yr_mean_citedness'] ?? null,
    isCore: s.is_core ?? null, isInDoaj: s.is_in_doaj ?? null, issn: s.issn_l ?? null,
  }
}

function sourceIndex(sources: any[]) {
  const byIssn = new Map<string, any>()
  const byName = new Map<string, any[]>()
  for (const s of sources) {
    for (const i of issnsOf([s.issn_l, ...(Array.isArray(s.issn) ? s.issn : [])])) if (!byIssn.has(i)) byIssn.set(i, s)
    const n = normVenueName(s.display_name)
    if (n.length >= 4) byName.set(n, [...(byName.get(n) ?? []), s])
  }
  return { byIssn, byName }
}

function loadCachedSources(): any[] {
  try { return entities().list('source') } catch { return [] }
}

const sleep = (ms: number) => new Promise<void>(r => { const t = setTimeout(r, ms); (t as { unref?: () => void }).unref?.() })
const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

export async function addCitationFallback(recs: EnrichedRecord[], opts: FallbackOptions = {}): Promise<FallbackResult> {
  const t0 = Date.now()
  const totalMs = opts.totalTimeoutMs ?? 10000
  const reqMs = opts.requestTimeoutMs ?? 6000
  const res: FallbackResult = { candidates: 0, epmcCalls: 0, crossrefCalls: 0, errors: 0, timedOut: false, citations: 0, viaEpmc: 0, viaCrossref: 0, venueCandidates: 0, venues: 0, venuesByIssn: 0, venuesByName: 0, sourcesIndexed: 0, ms: 0 }
  try {
    const cands = recs.filter(r => needsCitations(r) && (pmidOf(r) || normDoi(r.paper.doi)))
    const venueCands = recs.filter(needsVenue)
    res.candidates = cands.length; res.venueCandidates = venueCands.length
    const need = new Set([...cands, ...venueCands])
    if (!need.size) return res

    // results land here as they arrive; the deadline applies whatever is in them
    const counts = new Map<EnrichedRecord, { count: number; source: 'Europe PMC' | 'Crossref'; url: string }>()
    const issns = new Map<EnrichedRecord, string[]>()
    const containerTitle = new Map<EnrichedRecord, string>()
    const byPmid = new Map<string, EnrichedRecord[]>()
    const byDoi = new Map<string, EnrichedRecord[]>()
    for (const r of need) {
      const p = pmidOf(r); if (p) byPmid.set(p, [...(byPmid.get(p) ?? []), r])
      const d = normDoi(r.paper.doi); if (d) byDoi.set(d, [...(byDoi.get(d) ?? []), r])
    }
    const wantsCount = new Set(cands)
    const take = (rs: EnrichedRecord[] | undefined, x: any) => {
      for (const r of rs ?? []) {
        const is = issnsOf(x.journalIssn); if (is.length && !issns.has(r)) issns.set(r, is)
        if (!wantsCount.has(r) || counts.has(r) || x.citedByCount == null || !Number.isFinite(Number(x.citedByCount))) continue
        const url = x.source && x.id ? `https://europepmc.org/article/${x.source}/${x.id}` : `https://europepmc.org/search?query=${encodeURIComponent(r.paper.doi ?? '')}`
        counts.set(r, { count: Number(x.citedByCount), source: 'Europe PMC', url })
      }
    }
    const epmc = async (q: string) => {
      const u = new URL(EPMC)
      u.searchParams.set('query', q); u.searchParams.set('resultType', 'lite'); u.searchParams.set('format', 'json'); u.searchParams.set('pageSize', '100')
      res.epmcCalls++
      try { return ((await cachedJson('europepmc', u.toString(), { timeoutMs: reqMs })).data?.resultList?.result ?? []) as any[] } catch { res.errors++; return [] }
    }
    const work = (async () => {
      // 1. Europe PMC: PMIDs, and DOIs of records without a PMID — batched OR queries, in parallel
      const pmids = [...byPmid.keys()]
      const dois = [...byDoi.entries()].filter(([, rs]) => rs.some(r => !pmidOf(r))).map(([d]) => d)
      await Promise.all([
        ...chunks(pmids, opts.pmidBatch ?? 100).map(async b => { for (const x of await epmc(`EXT_ID:(${b.join(' OR ')}) AND SRC:MED`)) take(byPmid.get(String(x.pmid ?? x.id)), x) }),
        ...chunks(dois, opts.doiBatch ?? 40).map(async b => { for (const x of await epmc(b.map(d => `DOI:"${d.replace(/"/g, '')}"`).join(' OR '))) take(byDoi.get(normDoi(x.doi) ?? ''), x) }),
      ])
      // 2. Crossref for DOIs Europe PMC missed (no count, or no ISSN for a venue candidate)
      const mailto = env.raw.CROSSREF_MAILTO || env.openalexMailto
      const rest = [...byDoi.entries()].filter(([, rs]) => rs.some(r => (wantsCount.has(r) && !counts.has(r)) || (needsVenue(r) && !issns.has(r)))).map(([d]) => d)
      await mapLimit(rest, opts.crossrefConcurrency ?? 6, async d => {
        if (Date.now() - t0 > totalMs) return
        res.crossrefCalls++
        try {
          const m = (await cachedJson('crossref', `${CROSSREF}${encodeURIComponent(d)}${mailto ? `?mailto=${encodeURIComponent(mailto)}` : ''}`, { timeoutMs: reqMs })).data?.message
          if (!m) return
          for (const r of byDoi.get(d) ?? []) {
            const is = issnsOf(m.ISSN); if (is.length && !issns.has(r)) issns.set(r, is)
            if (m['container-title']?.[0]) containerTitle.set(r, String(m['container-title'][0]))
            const c = m['is-referenced-by-count']
            if (wantsCount.has(r) && !counts.has(r) && c != null && Number.isFinite(Number(c))) counts.set(r, { count: Number(c), source: 'Crossref', url: `https://api.crossref.org/works/${d}` })
          }
        } catch { res.errors++ }
      })
    })()
    const finished = await Promise.race([work.then(() => true), sleep(totalMs).then(() => false)])
    res.timedOut = !finished

    // apply citations
    for (const [r, c] of counts) {
      r.extra.citedByFallback = { ...c }
      res.citations++
      if (c.source === 'Europe PMC') res.viaEpmc++; else res.viaCrossref++
    }
    // apply venues
    const sources = opts.sources ?? loadCachedSources()
    res.sourcesIndexed = sources.length
    if (sources.length) {
      const { byIssn, byName } = sourceIndex(sources)
      for (const r of venueCands) {
        const s = (issns.get(r) ?? []).map(i => byIssn.get(i)).find(Boolean)
        if (s) { r.venue = { ...venueFromSource(s), name: s.display_name ?? r.venue.name }; r.extra.venueMatch = 'ISSN'; res.venues++; res.venuesByIssn++; continue }
        for (const nm of [r.venue.name, containerTitle.get(r)]) {
          const hit = byName.get(normVenueName(nm))
          if (hit?.length === 1) { r.venue = venueFromSource(hit[0]); r.extra.venueMatch = 'name'; res.venues++; res.venuesByName++; break }
        }
      }
    }
  } catch (e) {
    res.errors++
    trace('references', { kind: 'citations-fallback', error: String((e as Error)?.message ?? e).slice(0, 200) })
  }
  res.ms = Date.now() - t0
  trace('references', { kind: 'citations-fallback', ...res })
  return res
}

export function fallbackSummary(r: FallbackResult): string {
  return `citation/venue fallback (OpenAlex unavailable): cited-by for ${r.citations}/${r.candidates} (Europe PMC ${r.viaEpmc}, Crossref ${r.viaCrossref})`
    + ` · venue for ${r.venues}/${r.venueCandidates} (ISSN ${r.venuesByIssn}, name ${r.venuesByName}; ${r.sourcesIndexed} cached OpenAlex sources)`
    + ` · ${r.epmcCalls} Europe PMC + ${r.crossrefCalls} Crossref calls${r.errors ? ` · ${r.errors} errors` : ''}${r.timedOut ? ' · time box hit' : ''}`
}
