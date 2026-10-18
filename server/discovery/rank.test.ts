import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { Candidate, Judgement, Paper } from '@shared/contracts'
import { Candidate as CandidateSchema } from '@shared/contracts'
import { assignLane, computeLinks, freshCutoff, inLinkAllowed, orderLanes, percentiles, whyRanked, type PoolItem, type SeedLite } from './rank'

const snapshot = JSON.parse(readFileSync(new URL('../../docs/data/melanoma-lanes-snapshot.json', import.meta.url), 'utf8'))

const SEEDS: SeedLite[] = [
  { n: 1, id: 'W2332292689', year: 2016, label: 'S1', shortName: 'Tirosh 2016' },
  { n: 2, id: 'W2899145148', year: 2018, label: 'S2', shortName: 'Sade-Feldman 2018' },
  { n: 3, id: 'W3184584468', year: 2021, label: 'S3', shortName: 'Oliveira 2021' },
  { n: 4, id: 'W4229030906', year: 2022, label: 'S4', shortName: 'Oliveira 2022' },
  { n: 5, id: 'W3165815938', year: 2021, label: 'S5', shortName: 'Smalley 2021' },
]

function paper(over: Partial<Paper> = {}): Paper {
  return {
    id: 'W1', doi: null, pmid: null, pmcid: null, title: 'T', authors: ['Ada Lovelace'], year: 2020, publicationDate: '2020-01-01',
    venue: null, type: 'article', citedByCount: 0, citationPct: null, isRetracted: false, isOa: null, oaUrl: null,
    abstract: 'An abstract.', abstractSource: 'openalex', referencedWorks: [], url: 'https://openalex.org/W1', ...over,
  }
}
function cand(over: Partial<Omit<Candidate, 'paper'>> & { paper?: Partial<Paper> } = {}): Candidate {
  const { paper: p, ...rest } = over
  return {
    paper: paper(p), lane: 'Core', routes: ['R1'], signals: [], judgement: null, score: 0, rank: 0, whyRanked: '',
    features: { links: 2, out: [1], in: [2], coupling: null, eSeed: null, eQuestion: null, eFacets: null, rerank: null, impact: null, pubmedRank: null },
    ...rest,
  }
}

describe('lane precedence', () => {
  const fresh = '2025-04-18'
  it('Retracted beats everything', () => {
    expect(assignLane({ isRetracted: true, abstract: null, publicationDate: '2026-01-01', year: 2026 }, 5, fresh)).toBe('Retracted')
  })
  it('NotAssessable = no abstract and links < 3', () => {
    expect(assignLane({ isRetracted: false, abstract: null, publicationDate: '2020-01-01', year: 2020 }, 2, fresh)).toBe('NotAssessable')
    expect(assignLane({ isRetracted: false, abstract: null, publicationDate: '2020-01-01', year: 2020 }, 3, fresh)).toBe('Core')
  })
  it('Core ≥2 beats Fresh; Fresh beats Linked and Bridges', () => {
    const base = { isRetracted: false, abstract: 'x', year: 2026 }
    expect(assignLane({ ...base, publicationDate: '2026-02-01' }, 2, fresh)).toBe('Core')
    expect(assignLane({ ...base, publicationDate: '2026-02-01' }, 1, fresh)).toBe('Fresh')
    expect(assignLane({ ...base, publicationDate: '2026-02-01' }, 0, fresh)).toBe('Fresh')
    expect(assignLane({ ...base, publicationDate: '2024-02-01', year: 2024 }, 1, fresh)).toBe('Linked')
    expect(assignLane({ ...base, publicationDate: '2024-02-01', year: 2024 }, 0, fresh)).toBe('Bridges')
  })
  it('agrees with the real melanoma snapshot (docs/data)', () => {
    for (const [lane, items] of Object.entries(snapshot.top) as [string, any[]][]) {
      for (const it of items) {
        const got = assignLane({ isRetracted: it.retr, abstract: 'present', publicationDate: it.dt, year: it.y }, it.n, fresh)
        expect(got, `${it.id} ${it.t}`).toBe(lane)
      }
    }
  })
  it('fresh cutoff is 18 months before today', () => {
    expect(freshCutoff(18, new Date('2026-10-18T12:00:00Z'))).toBe('2025-04-18')
  })
})

describe('date check on in-links', () => {
  it('allows one year of slack', () => {
    expect(inLinkAllowed(2017, 2016)).toBe(true)
    expect(inLinkAllowed(2018, 2016)).toBe(false)
    expect(inLinkAllowed(null, 2016)).toBe(true)
  })
  it('drops impossible links and logs a link_dropped_date signal', () => {
    const item: PoolItem = { paper: paper({ id: 'W9', year: 2019, referencedWorks: ['W3184584468'] }), routes: new Set(['R1']), signals: [], inRaw: new Set([1, 3]), pubmedRank: null }
    const f = computeLinks(item, SEEDS)
    expect(f.in).toEqual([3]) // S1 (2016) citing a 2019 paper is dropped
    expect(f.out).toEqual([3])
    expect(f.links).toBe(1)
    const dropped = item.signals.filter(s => s.kind === 'link_dropped_date')
    expect(dropped).toHaveLength(1)
    expect(dropped[0].seedNs).toEqual([1])
    expect(item.signals.some(s => s.kind === 'cites_seed')).toBe(true)
  })
})

describe('ordering', () => {
  it('pre-judge: links desc then citations desc; Bridges by PubMed rank', () => {
    const a = cand({ paper: { id: 'Wa', citedByCount: 10 }, features: { ...cand().features, links: 2 } })
    const b = cand({ paper: { id: 'Wb', citedByCount: 5 }, features: { ...cand().features, links: 4 } })
    const c = cand({ paper: { id: 'Wc', citedByCount: 99 }, features: { ...cand().features, links: 2 } })
    const x = cand({ lane: 'Bridges', paper: { id: 'Wx', citedByCount: 1000 }, features: { ...cand().features, links: 0, pubmedRank: 9 } })
    const y = cand({ lane: 'Bridges', paper: { id: 'Wy', citedByCount: 1 }, features: { ...cand().features, links: 0, pubmedRank: 2 } })
    const out = orderLanes([a, b, c, x, y], new Map())
    const core = out.filter(o => o.lane === 'Core').sort((p, q) => p.rank - q.rank).map(o => o.paper.id)
    expect(core).toEqual(['Wb', 'Wc', 'Wa'])
    const br = out.filter(o => o.lane === 'Bridges').sort((p, q) => p.rank - q.rank).map(o => o.paper.id)
    expect(br).toEqual(['Wy', 'Wx'])
  })
  it('judged items come first, unverified quotes are discounted', () => {
    const j = (g: number, verified: boolean): Judgement => ({ model: 'm', relevance: g, facets: { topic: g, method: g, population: g }, paperType: 'primary', why: '', quote: null, quoteRef: null, verified, uncertainty: '', seedLinks: [] })
    const top = cand({ paper: { id: 'Wtop', citedByCount: 9999 }, features: { ...cand().features, links: 5 } })
    const v = cand({ paper: { id: 'Wv' }, judgement: j(3, true) })
    const u = cand({ paper: { id: 'Wu' }, judgement: j(3, false) })
    const out = orderLanes([top, u, v], new Map()).sort((p, q) => p.rank - q.rank).map(o => o.paper.id)
    expect(out).toEqual(['Wv', 'Wu', 'Wtop'])
  })
  it('percentiles are mid-rank', () => {
    expect(percentiles([0, 0, 1, 2])).toEqual([0.25, 0.25, 0.625, 0.875])
  })
})

describe('whyRanked', () => {
  it('is a deterministic string built from features', () => {
    const c = cand({ rank: 1, routes: ['R2'], paper: { year: 2026, citedByCount: 0 }, features: { ...cand().features, links: 5, out: [1, 2, 3, 4, 5], in: [] } })
    expect(whyRanked(c, 5)).toBe('#1 · Core · cites all 5 seeds · 0 citations · 2026 · routes R2')
    const d = cand({ rank: 2, routes: ['R1', 'R2'], paper: { year: 2019, citedByCount: 1522 }, features: { ...cand().features, links: 4, out: [1, 2], in: [3, 4] },
      judgement: { model: 'm', relevance: 3, facets: { topic: 3, method: 3, population: 3 }, paperType: 'primary', why: '', quote: 'q', quoteRef: null, verified: true, uncertainty: '', seedLinks: [] } })
    expect(whyRanked(d, 5, 0.92)).toBe('#2 · Core · cites S1, S2 · cited by S3, S4 · 1522 citations · 2019 · routes R1, R2 · reranker 92nd pct · judge 3/3 verified')
    expect(CandidateSchema.safeParse({ ...d, whyRanked: whyRanked(d, 5) }).success).toBe(true)
  })
})
