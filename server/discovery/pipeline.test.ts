// End-to-end pipeline test with fake sources and a fake AI (no network, temp DATA_DIR).
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RunSnapshot, type Paper } from '@shared/contracts'
import { resolveConfig } from '@shared/config'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pt-test-'))

const P = (id: string, over: Partial<Paper> = {}): Paper => ({
  id, doi: `10.1000/${id.toLowerCase()}`, pmid: null, pmcid: null, title: `Paper ${id}`, authors: ['Jane Doe'], year: 2020, publicationDate: '2020-05-01',
  venue: null, type: 'article', citedByCount: 10, citationPct: 0.5, isRetracted: false, isOa: null, oaUrl: null,
  abstract: `Abstract of ${id} about melanoma T cells.`, abstractSource: 'openalex', referencedWorks: [], url: `https://openalex.org/${id}`, ...over,
})

const SEEDS = [
  P('WS1', { year: 2016, publicationDate: '2016-04-01', pmid: '111', referencedWorks: ['WA', 'WB', 'WOLD'] }),
  P('WS2', { year: 2018, publicationDate: '2018-11-01', pmid: '222', referencedWorks: ['WA', 'WC'] }),
  P('WS3', { year: 2021, publicationDate: '2021-07-01', referencedWorks: ['WC'], abstract: null }),
]
const WORKS: Record<string, Paper> = {
  WA: P('WA', { year: 2010, citedByCount: 500 }),
  WB: P('WB', { year: 2019, publicationDate: '2019-01-01' }), // S1 (2016) citing a 2019 paper → date check drops it
  WC: P('WC', { year: 2012, abstract: null, pmid: '999' }), // abstract via PubMed
  WOLD: P('WOLD', { year: 2001, isRetracted: true }),
  WR2: P('WR2', { year: 2026, publicationDate: '2026-03-01', citedByCount: 0, referencedWorks: ['WS1', 'WS2', 'WS3'] }),
  WSIM: P('WSIM', { pmid: '333', year: 2019 }),
  WQ: P('WQ', { year: 2026, publicationDate: '2026-06-01', citedByCount: 1 }),
  WWEB: P('WWEB', { doi: '10.1101/web', year: 2026, publicationDate: '2026-09-01', abstract: null }),
}

vi.mock('../sources/openalex', async orig => {
  const real: any = await orig()
  return {
    ...real,
    getWork: async (ref: { kind: string; value: string }) => {
      const s = SEEDS.find(x => (ref.kind === 'doi' ? x.doi === ref.value : ref.kind === 'pmid' ? x.pmid === ref.value : x.id === ref.value))
      return s ? { value: structuredClone(s), url: `https://api.openalex.org/works/${s.id}`, hash: 'h' } : null
    },
    getWorksBy: async (key: string, values: string[]) => {
      const all = Object.values(WORKS)
      const papers = values.map(v => all.find(p => (key === 'openalex_id' ? p.id === v : key === 'pmid' ? p.pmid === v : p.doi === v))).filter(Boolean).map(p => structuredClone(p!))
      return { papers, requests: [{ url: 'https://api.openalex.org/works?filter=x', hash: 'h' }] }
    },
    citingBoth: async () => ({ value: [structuredClone(WORKS.WR2)], url: 'https://api.openalex.org/works?filter=cites', hash: 'h' }),
    search: async () => ({ value: [structuredClone(WORKS.WQ)], url: 'https://api.openalex.org/works?search=q', hash: 'h' }),
  }
})
vi.mock('../sources/pubmed', async orig => ({
  ...(await orig() as any),
  similar: async () => ({ pmids: [{ pmid: '333', rank: 1, score: 1 }], url: 'u', hash: 'h' }),
  fetchAbstracts: async (pmids: string[]) => new Map(pmids.filter(p => p === '999').map(p => [p, 'PubMed abstract for WC.'])),
}))
vi.mock('../sources/europepmc', () => ({ abstractsByDoi: async () => new Map([['10.1101/web', 'Europe PMC abstract.']]) }))
vi.mock('../ai/index', () => {
  const vec = (t: string) => { const v = Array.from({ length: 8 }, (_, i) => Math.sin(t.length * (i + 1))); const n = Math.hypot(...v); return v.map(x => x / n) }
  return {
    facets: async (q: string) => [{ key: 'topic', label: 'Topic', query: q }, { key: 'method', label: 'Method', query: 'single-cell' }, { key: 'population', label: 'Population', query: 'melanoma' }],
    expandQueries: async () => ['melanoma single-cell'],
    embed: async (texts: string[]) => texts.map(vec),
    rerank: async (_q: string, docs: string[]) => docs.map((_, i) => 1 - i / docs.length),
    judge: async ({ paper }: { paper: Paper }) => ({
      model: 'fake', relevance: paper.id === 'WA' ? 3 : 1, facets: paper.id === 'WA' ? { topic: 3, method: 3, population: 3 } : { topic: 1, method: 1, population: 1 },
      paperType: 'primary', why: 'because', quote: 'Abstract', quoteRef: { source: 'openalex', start: 0, end: 8 }, verified: paper.id === 'WA', uncertainty: '', seedLinks: [],
    }),
    scout: async (_q: string, _s: unknown, _f: unknown, _c: unknown, onStep: (s: any) => void) => {
      onStep({ step: 1, tool: 'tavily_search', input: 'melanoma', output: '1 hit' })
      return { dois: ['10.1101/web'], openalexIds: [], webSources: [{ url: 'https://www.biorxiv.org/content/10.1101/web', title: 'bioRxiv preprint', snippet: '...', query: 'melanoma' }] }
    },
  }
})

let snap: RunSnapshot
beforeAll(async () => {
  const { createRunState, snapshotOf } = await import('./registry')
  const { runPipeline } = await import('./pipeline')
  const run = createRunState('run_test', 'Which single-cell methods help study melanoma immune cells?', 'demo', resolveConfig('demo'))
  await runPipeline(run, ['10.1000/ws1', '222', 'https://doi.org/10.1000/ws3'])
  snap = snapshotOf(run)
})

describe('pipeline with fake sources + AI', () => {
  it('produces a contract-valid snapshot', () => {
    const r = RunSnapshot.safeParse(JSON.parse(JSON.stringify(snap)))
    expect(r.success, JSON.stringify(r.error?.issues.slice(0, 3))).toBe(true)
    expect(snap.seeds.map(s => s.shortName)).toEqual(['Doe 2016', 'Doe 2018', 'Doe 2021'])
  })
  it('emits every stage and ends with done', () => {
    const stages = snap.events.filter(e => e.type === 'stage' && e.status !== 'start').map(e => e.type === 'stage' && `${e.stage}:${e.status}`)
    for (const s of ['resolve', 'r1', 'r2', 'r3', 'r4', 'scout', 'lanes', 'embed', 'rerank', 'judge', 'verify']) expect(stages).toContain(`${s}:done`)
    expect(snap.events.at(-1)?.type).toBe('done')
    expect(snap.events.some(e => e.type === 'agent')).toBe(true)
    expect(snap.events.filter(e => e.type === 'candidates').length).toBeGreaterThanOrEqual(2)
  })
  it('assigns lanes with the date check, retraction and abstract waterfall', () => {
    const by = Object.fromEntries(snap.candidates.map(c => [c.paper.id, c]))
    expect(by.WOLD.lane).toBe('Retracted')
    expect(by.WR2.lane).toBe('Core') // cites all 3 seeds
    expect(by.WA.lane).toBe('Core') // cited by S1 and S2
    expect(by.WB.lane).toBe('Bridges') // only in-link was dropped by the date check
    expect(by.WB.signals.some(s => s.kind === 'link_dropped_date')).toBe(true)
    expect(by.WC.paper.abstractSource).toBe('pubmed')
    expect(by.WC.lane).toBe('Core')
    expect(by.WQ.lane).toBe('Fresh')
    expect(by.WWEB.routes).toEqual(['R5'])
    expect(by.WWEB.paper.abstractSource).toBe('europepmc')
    expect(by.WWEB.signals.find(s => s.kind === 'web')?.source.url).toContain('biorxiv')
  })
  it('streams judgements and orders judged papers by score', () => {
    expect(snap.events.filter(e => e.type === 'judgement').length).toBeGreaterThan(0)
    const core = snap.candidates.filter(c => c.lane === 'Core').sort((a, b) => a.rank - b.rank)
    expect(core[0].paper.id).toBe('WA')
    expect(core[0].whyRanked).toMatch(/^#1 · Core · cited by S1, S2 .* judge 3\/3 verified$/)
    expect(core[0].features.eQuestion).not.toBeNull()
    expect(core[0].features.rerank).not.toBeNull()
  })
})
