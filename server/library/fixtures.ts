// Owner: lane L2. TEST-ONLY fixture source (LIBRARY_FIXTURE=1): stands in for L1's gather() while it is built.
// Turns docs/data/melanoma-lanes-snapshot.json (31 lane papers) + the melanoma demo recording (abstracts, authors,
// seed links) into ~60 EnrichedRecords. Venue / author metrics are NOT in these files, so they stay null (→ the
// score shows "not assessed" and redistributes their weight). Nothing here is invented.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Paper } from '@shared/contracts'
import type { Goals, Hit, LibraryRequest } from '@shared/library'
import type { EnrichedRecord, SourceCall } from './types'

const SNAPSHOT = fileURLToPath(new URL('../../docs/data/melanoma-lanes-snapshot.json', import.meta.url))
const RECORDING = fileURLToPath(new URL('../demo/recordings/melanoma.json', import.meta.url))

const PAPER_KEYS: (keyof Paper)[] = ['id', 'doi', 'pmid', 'pmcid', 'title', 'authors', 'year', 'publicationDate', 'venue', 'type', 'citedByCount', 'citationPct', 'isRetracted', 'isOa', 'oaUrl', 'abstract', 'abstractSource', 'referencedWorks', 'url']
const toPaper = (x: any): Paper => Object.fromEntries(PAPER_KEYS.map(k => [k, x[k] ?? (k === 'authors' || k === 'referencedWorks' ? [] : k === 'citedByCount' ? 0 : k === 'isRetracted' ? false : null)])) as Paper
const REPO_RE = /arxiv|biorxiv|medrxiv|research square|ssrn|preprints|zenodo/i

function record(paper: Paper, hits: Hit[], relations: EnrichedRecord['relations']): EnrichedRecord {
  const n = paper.authors.length
  return {
    key: paper.id, paper, hits, relations,
    authors: paper.authors.map((name, i) => ({ id: null, name, position: i === 0 ? 'first' : i === n - 1 ? 'last' : 'middle', hIndex: null, worksCount: null, citedByCount: null, institutions: [] })),
    venue: { id: null, name: paper.venue, type: paper.venue ? (REPO_RE.test(paper.venue) || paper.type === 'preprint' ? 'repository' : 'journal') : null, publisher: null, hIndex: null, meanCitedness2y: null, isCore: null, isInDoaj: null, issn: null },
    extra: {
      typeCrossref: null, fwci: null, oaStatus: paper.isOa === false ? 'closed' : null, primaryTopic: null, keywords: [], language: 'en', grants: [],
      pubmedTypes: paper.type === 'review' ? ['Review'] : [], mesh: [], arxiv: null, scholarCitedBy: null,
    },
  }
}

export function loadFixtureRecords(limit = 60): EnrichedRecord[] {
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  const rec = JSON.parse(readFileSync(RECORDING, 'utf8'))
  const seedId = new Map<number, string>(rec.seeds.map((s: any) => [s.n, s.id]))
  const cand = new Map<string, any>(rec.candidates.map((c: any) => [c.paper.id, c]))
  const out: EnrichedRecord[] = []
  for (const s of rec.seeds) {
    const p = toPaper(s)
    out.push(record(p, [{ source: 'openalex', via: 'known_paper', query: s.doi, rank: 1, url: p.url }], []))
  }
  const fromCandidate = (c: any): EnrichedRecord => {
    const hits: Hit[] = []
    const relations: EnrichedRecord['relations'] = []
    for (const sg of c.signals ?? []) {
      for (const n of sg.seedNs ?? []) {
        const sid = seedId.get(n)
        if (!sid) continue
        if (sg.kind === 'cites_seed') relations.push({ type: 'cites', paperId: sid, note: sg.source?.name })
        else if (sg.kind === 'cited_by_seed') relations.push({ type: 'cited_by', paperId: sid, note: sg.source?.name })
        else if (sg.kind === 'pubmed_similar') relations.push({ type: 'similar', paperId: sid, note: sg.source?.name })
      }
      const via: Hit['via'] = sg.kind === 'cites_seed' ? 'cited_by' : sg.kind === 'cited_by_seed' ? 'references' : sg.kind === 'pubmed_similar' ? 'similar' : sg.kind === 'web' ? 'web' : 'keyword'
      hits.push({ source: sg.kind === 'pubmed_similar' ? 'pubmed' : sg.kind === 'web' ? 'tavily' : 'openalex', via, query: null, rank: typeof sg.value === 'number' && sg.kind === 'pubmed_similar' ? sg.value : null, url: sg.source?.url ?? c.paper.url })
    }
    if (!hits.length) hits.push({ source: 'openalex', via: 'keyword', query: null, rank: null, url: c.paper.url })
    return record(toPaper(c.paper), hits, relations)
  }
  const seen = new Set(out.map(r => r.key))
  for (const lane of Object.values(snap.top) as any[][]) for (const x of lane) {
    const c = cand.get(x.id)
    if (!c || seen.has(x.id)) continue
    out.push(fromCandidate(c)); seen.add(x.id)
  }
  for (const c of rec.candidates) {
    if (out.length >= limit) break
    if (seen.has(c.paper.id) || !c.paper.abstract) continue
    out.push(fromCandidate(c)); seen.add(c.paper.id)
  }
  return out
}

export async function fixtureGather(_goals: Goals, _req: LibraryRequest, onCall: (c: SourceCall) => void): Promise<EnrichedRecord[]> {
  const t0 = Date.now()
  const recs = loadFixtureRecords(Number(process.env.LIBRARY_FIXTURE_N || 60))
  const by = new Map<string, number>()
  for (const r of recs) for (const s of new Set(r.hits.map(h => `${h.source}|${h.via}`))) by.set(s, (by.get(s) ?? 0) + 1)
  for (const [k, count] of by) { const [source, via] = k.split('|'); onCall({ source: source as SourceCall['source'], query: `fixture (melanoma recording) via ${via}`, count, ms: Date.now() - t0 }) }
  return recs
}
