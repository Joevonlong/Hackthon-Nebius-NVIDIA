// Owner: lane L1. Enrichment: OpenAlex works (full fields), venues (/sources), first/last/corresponding authors (/authors),
// PubMed PublicationType + MeSH, abstract waterfall OpenAlex → PubMed → arXiv summary → Europe PMC. Then Cand → EnrichedRecord.
import type { Paper } from '@shared/contracts'
import type { Hit } from '@shared/library'
import { abstractsByDoi } from '../../sources/europepmc'
import { invertedIndexToText, mapWork, shortId } from '../../sources/openalex'
import type { EnrichedRecord } from '../types'
import { authorsBy, type OaBudget, sourcesBy, worksBy } from './openalex-lib'
import { attachWork, type Cand, recordKey } from './normalize'
import { efetch, type PubmedRecord } from './pubmed-lib'

type AuthorInfo = EnrichedRecord['authors'][number]
type VenueInfo = EnrichedRecord['venue']

export interface EnrichStats { works: number; venues: number; authors: number; pubmed: number; epmcAbstracts: number; errors: string[] }

const errMsg = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 160)

/** Fills missing OpenAlex works and PubMed records in place. PubMed efetch for already-known PMIDs runs in parallel with the
 *  OpenAlex works lookup; a second (small) efetch covers PMIDs learned from those works. */
export async function fillWorksAndPubmed(cands: Cand[], budget: OaBudget, st: EnrichStats): Promise<void> {
  const applyPubmed = (pm: Cand[], recs: Map<string, PubmedRecord>) => {
    for (const c of pm) {
      const r = recs.get(c.ids.pmid!)
      if (!r || c.pubmed) continue
      c.pubmed = r; st.pubmed++
      if (!c.title) c.title = r.title
      if (!c.year) c.year = r.year
      if (!c.ids.doi && r.doi) c.ids.doi = r.doi
      if (!c.ids.pmcid && r.pmcid) c.ids.pmcid = r.pmcid
      if (!c.authors.length) c.authors = r.authors
      if (!c.venue) c.venue = r.journal
    }
  }
  const onPmErr = (e: unknown) => st.errors.push('pubmed efetch: ' + errMsg(e))
  const pm1 = cands.filter(c => c.ids.pmid && !c.pubmed)
  const need = cands.filter(c => c.ids.openalex && !c.work)
  const [, recs1] = await Promise.all([
    (async () => {
      if (!need.length) return
      const ws = await worksBy(budget, 'openalex_id', need.map(c => c.ids.openalex!), e => st.errors.push('openalex works: ' + errMsg(e)))
      const byId = new Map(ws.map(w => [shortId(w.id), w]))
      for (const c of need) { const w = byId.get(c.ids.openalex!); if (w) { attachWork(c, w); st.works++ } }
    })(),
    pm1.length ? efetch(pm1.map(c => c.ids.pmid!), onPmErr) : Promise.resolve(new Map<string, PubmedRecord>()),
  ])
  applyPubmed(pm1, recs1)
  const pm2 = cands.filter(c => c.ids.pmid && !c.pubmed && !recs1.has(c.ids.pmid))
  if (pm2.length) applyPubmed(pm2, await efetch(pm2.map(c => c.ids.pmid!), onPmErr))
}

function pickAuthorIds(w: any): string[] {
  const as: any[] = w?.authorships ?? []
  if (!as.length) return []
  const pick = new Set<any>([as[0], as[as.length - 1], ...as.filter(a => a?.is_corresponding)])
  return [...pick].map(a => shortId(a?.author?.id)).filter(Boolean)
}

/** Venue + author lookups, abstract waterfall, then the final records. */
export async function enrich(cands: Cand[], budget: OaBudget, st: EnrichStats): Promise<EnrichedRecord[]> {
  const works = cands.filter(c => c.work)
  // abstract waterfall, last step: Europe PMC by DOI for whatever is still missing — independent of venues / authors, so in parallel
  const absOf = (c: Cand) => invertedIndexToText(c.work?.abstract_inverted_index) || c.pubmed?.abstract || c.arxiv?.summary || c.europepmc?.abstract || null
  const missing = cands.filter(c => !absOf(c) && c.ids.doi).slice(0, 200)
  const [sources, authors] = await Promise.all([
    sourcesBy(budget, [...new Set(works.map(c => shortId(c.work.primary_location?.source?.id)).filter(Boolean))], e => st.errors.push('openalex sources: ' + errMsg(e))),
    authorsBy(budget, [...new Set(works.flatMap(c => pickAuthorIds(c.work)))], e => st.errors.push('openalex authors: ' + errMsg(e))),
    (async () => {
      if (!missing.length) return
      try {
        const m = await abstractsByDoi(missing.map(c => c.ids.doi!))
        for (const c of missing) { const a = m.get(c.ids.doi!.toLowerCase()); if (a) { c.europepmc = { abstract: a }; st.epmcAbstracts++ } }
      } catch (e) { st.errors.push('europepmc abstracts: ' + errMsg(e)) }
    })(),
  ])
  const srcMap = new Map(sources.map(s => [shortId(s.id), s]))
  const authMap = new Map(authors.map(a => [shortId(a.id), a]))
  st.venues = srcMap.size; st.authors = authMap.size
  return cands.map(c => toRecord(c, srcMap, authMap))
}

function abstractOf(c: Cand): { text: string | null; source: Paper['abstractSource'] } {
  const oa = invertedIndexToText(c.work?.abstract_inverted_index)
  if (oa) return { text: oa, source: 'openalex' }
  if (c.pubmed?.abstract) return { text: c.pubmed.abstract, source: 'pubmed' }
  if (c.arxiv?.summary) return { text: c.arxiv.summary, source: null } // contract AbstractSource has no 'arxiv' (see extra.arxiv)
  if (c.europepmc?.abstract) return { text: c.europepmc.abstract, source: 'europepmc' }
  return { text: null, source: null }
}

function capAuthors<T>(xs: T[], n = 20): T[] { return xs.length <= n ? xs : [...xs.slice(0, n - 1), xs[xs.length - 1]] }

const position = (i: number, n: number): AuthorInfo['position'] => (i === 0 ? 'first' : i === n - 1 ? 'last' : 'middle')

function buildAuthors(c: Cand, authMap: Map<string, any>): AuthorInfo[] {
  const as: any[] = c.work?.authorships ?? []
  if (as.length) {
    return capAuthors(as.map((a, i) => {
      const id = shortId(a?.author?.id) || null
      const full = id ? authMap.get(id) : undefined
      const insts = (a.institutions?.length ? a.institutions : full?.last_known_institutions ?? []) as any[]
      return {
        id, name: a?.author?.display_name ?? a?.raw_author_name ?? '?',
        position: (a.author_position as AuthorInfo['position']) ?? position(i, as.length),
        hIndex: full?.summary_stats?.h_index ?? null, worksCount: full?.works_count ?? null, citedByCount: full?.cited_by_count ?? null,
        institutions: insts.map(x => ({ name: x.display_name ?? '?', ror: x.ror ?? null, type: x.type ?? null, country: x.country_code ?? null })),
      }
    }))
  }
  const names = c.authors.length ? c.authors : c.pubmed?.authors ?? c.arxiv?.authors ?? []
  return capAuthors(names.map((name, i) => ({ id: null, name, position: position(i, names.length), hIndex: null, worksCount: null, citedByCount: null, institutions: [] })))
}

function buildVenue(c: Cand, srcMap: Map<string, any>): VenueInfo {
  const s0 = c.work?.primary_location?.source
  const sid = shortId(s0?.id) || null
  const s = sid ? srcMap.get(sid) : undefined
  if (s0 || s) {
    return {
      id: sid, name: s?.display_name ?? s0?.display_name ?? null, type: s?.type ?? s0?.type ?? null,
      publisher: s?.host_organization_name ?? s0?.host_organization_name ?? null,
      hIndex: s?.summary_stats?.h_index ?? null, meanCitedness2y: s?.summary_stats?.['2yr_mean_citedness'] ?? null,
      isCore: s?.is_core ?? s0?.is_core ?? null, isInDoaj: s?.is_in_doaj ?? s0?.is_in_doaj ?? null, issn: s?.issn_l ?? s0?.issn_l ?? null,
    }
  }
  const empty: VenueInfo = { id: null, name: null, type: null, publisher: null, hIndex: null, meanCitedness2y: null, isCore: null, isInDoaj: null, issn: null }
  if (c.pubmed?.journal) return { ...empty, name: c.pubmed.journal, type: 'journal' }
  if (c.arxiv) return c.arxiv.journalRef ? { ...empty, name: c.arxiv.journalRef } : { ...empty, name: 'arXiv', type: 'repository', publisher: 'Cornell University' }
  if (c.venue) return { ...empty, name: c.venue }
  return empty
}

function firstUrl(hits: Hit[]): string { return hits.find(h => h.url)?.url ?? '' }

export function toRecord(c: Cand, srcMap: Map<string, any> = new Map(), authMap: Map<string, any> = new Map()): EnrichedRecord {
  const key = recordKey(c)
  const abs = abstractOf(c)
  const w = c.work
  let paper: Paper
  if (w) {
    paper = { ...mapWork(w), abstract: abs.text, abstractSource: abs.source }
    if (!paper.pmid && c.ids.pmid) paper.pmid = c.ids.pmid
    if (!paper.pmcid && c.ids.pmcid) paper.pmcid = c.ids.pmcid
  } else {
    const date = c.arxiv?.published ?? null
    paper = {
      id: key, doi: c.ids.doi ?? null, pmid: c.ids.pmid ?? null, pmcid: c.ids.pmcid ?? null,
      title: c.title || c.pubmed?.title || c.arxiv?.title || '(untitled)',
      authors: (c.authors.length ? c.authors : c.pubmed?.authors ?? c.arxiv?.authors ?? []).slice(0, 10),
      year: c.year ?? c.pubmed?.year ?? c.arxiv?.year ?? null, publicationDate: date,
      venue: c.pubmed?.journal ?? c.arxiv?.journalRef ?? c.venue ?? (c.arxiv ? 'arXiv' : null),
      type: c.arxiv && !c.arxiv.journalRef ? 'preprint' : c.pubmed ? 'article' : null,
      citedByCount: c.scholar?.citedBy ?? 0, citationPct: null, isRetracted: !!c.pubmed?.publicationTypes.includes('Retracted Publication'),
      isOa: c.arxiv ? true : c.ids.pmcid ? true : null, oaUrl: c.arxiv ? c.arxiv.url : c.ids.pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${c.ids.pmcid}/` : null,
      abstract: abs.text, abstractSource: abs.source, referencedWorks: [],
      url: c.ids.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${c.ids.pmid}/` : c.arxiv?.url ?? (c.ids.doi ? `https://doi.org/${c.ids.doi}` : firstUrl(c.hits)),
    }
  }
  const pt = w?.primary_topic
  return {
    key, paper,
    authors: buildAuthors(c, authMap),
    venue: buildVenue(c, srcMap),
    hits: c.hits,
    relations: c.relations,
    extra: {
      typeCrossref: w?.type_crossref ?? null,
      fwci: w?.fwci ?? null,
      oaStatus: w?.open_access?.oa_status ?? null,
      primaryTopic: pt ? { topic: pt.display_name, subfield: pt.subfield?.display_name ?? '', field: pt.field?.display_name ?? '', domain: pt.domain?.display_name ?? '' } : null,
      keywords: (w?.keywords ?? []).map((k: any) => k.display_name).filter(Boolean),
      language: w?.language ?? (c.pubmed?.language ? ({ eng: 'en', ger: 'de', fre: 'fr', spa: 'es', chi: 'zh', jpn: 'ja' } as Record<string, string>)[c.pubmed.language] ?? c.pubmed.language : null),
      grants: [...new Set([...((w?.grants ?? w?.funders ?? []) as any[]).map(g => g.funder_display_name ?? g.display_name), ...(c.pubmed?.grants ?? [])].filter(Boolean))] as string[],
      pubmedTypes: c.pubmed?.publicationTypes ?? [],
      mesh: c.pubmed?.mesh ?? [],
      arxiv: c.arxiv ? { id: c.arxiv.id, primaryCategory: c.arxiv.primaryCategory, categories: c.arxiv.categories, journalRef: c.arxiv.journalRef, comment: c.arxiv.comment } : null,
      scholarCitedBy: c.scholar?.citedBy ?? null,
    },
  }
}
