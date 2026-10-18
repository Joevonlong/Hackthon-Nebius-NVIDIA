import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.hoisted(() => {
  process.env.TRACE_CONSOLE = '0'
})

import type { LibPaper } from '@shared/library'
import { addEuropePmcReferences, NOTE } from './references'
import { parseReferences, referencesByPmid, type EpmcRef } from '../sources/europepmc'

const tmp = mkdtempSync(join(tmpdir(), 'refs-'))
process.env.LOG_DIR = join(tmp, 'logs')
process.env.DATA_DIR = join(tmp, 'data')

function lp(id: string, o: { pmid?: string | null; doi?: string | null; title?: string; year?: number; passed?: boolean; rank?: number; refs?: string[] } = {}): LibPaper {
  return {
    paper: { id, doi: o.doi ?? null, pmid: o.pmid ?? null, pmcid: null, title: o.title ?? `Paper ${id} about caffeine metabolism in adults`, authors: [], year: o.year ?? 2020, publicationDate: null, venue: null, type: null, citedByCount: 0, citationPct: null, isRetracted: false, isOa: null, oaUrl: null, abstract: null, abstractSource: null, referencedWorks: o.refs ?? [], url: '' },
    authors: [], venue: {} as LibPaper['venue'], labels: {} as LibPaper['labels'], hits: [], relations: [], components: [],
    total: 0.8, passed: o.passed ?? true, excluded: null, rank: o.rank ?? 1, llmRead: null, file: '',
  }
}
const ref = (o: Partial<EpmcRef>): EpmcRef => ({ pmid: null, doi: null, title: null, year: null, ...o })

afterEach(() => { vi.unstubAllGlobals() })

describe('Europe PMC reference fallback (CR-10 E-2)', () => {
  it('matches references by pmid, doi and title+year; adds cites / cited_by / referencedWorks; dedupes', async () => {
    const A = lp('pmid:100', { rank: 1 }) // citing
    const B = lp('pmid:200', { rank: 2, passed: false }) // matched by pmid (not passed: still a target)
    const C = lp('W123', { doi: '10.1000/abc', rank: 3, refs: ['W9'] }) // matched by doi (has OpenAlex refs → not citing)
    const D = lp('arxiv:2101.1', { title: 'Caffeine and adenosine receptors: a review', year: 2019, rank: 4 }) // matched by title+year
    const E = lp('pmid:500', { rank: 5, title: 'Unrelated paper on sleep in teenagers', year: 2001 })
    const fetch = vi.fn(async (pmid: string): Promise<EpmcRef[]> => pmid === '100'
      ? [
          ref({ pmid: '200' }), ref({ pmid: '200' }), // duplicate
          ref({ doi: 'https://doi.org/10.1000/ABC' }),
          ref({ title: 'Caffeine and Adenosine Receptors — a Review.', year: 2019 }),
          ref({ title: 'Caffeine and adenosine receptors: a review', year: 2018 }), // wrong year: no match
          ref({ pmid: '100' }), // self
          ref({ pmid: '999' }), // not in library
        ]
      : [])
    const r = await addEuropePmcReferences([A, B, C, D, E], [], { fetch })
    expect(fetch.mock.calls.map(c => c[0]).sort()).toEqual(['100', '500']) // passed + pmid + no refs; B not passed, C has refs
    expect(r).toMatchObject({ candidates: 2, calls: 2, ok: 2, errors: 0, timedOut: 0, papersWithRefs: 1, papersLinked: 1, links: 3, refsReturned: 7 })
    expect(A.relations).toEqual([
      { type: 'cites', paperId: 'pmid:200', note: NOTE }, { type: 'cites', paperId: 'W123', note: NOTE }, { type: 'cites', paperId: 'arxiv:2101.1', note: NOTE },
    ])
    expect(A.paper.referencedWorks).toEqual(['pmid:200', 'W123', 'arxiv:2101.1'])
    for (const t of [B, C, D]) expect(t.relations).toEqual([{ type: 'cited_by', paperId: 'pmid:100', note: NOTE }])
    expect(E.relations).toEqual([])

    // a second pass (e.g. re-run) adds nothing twice
    A.paper.referencedWorks = []
    const r2 = await addEuropePmcReferences([A, B, C, D, E], [], { fetch })
    expect(r2.links).toBe(0)
    expect(A.relations).toHaveLength(3)
    expect(B.relations).toHaveLength(1)
    expect(A.paper.referencedWorks).toEqual(['pmid:200', 'W123', 'arxiv:2101.1'])
  })

  it('includes known (seed) papers that are in the library even when they did not pass', async () => {
    const S = lp('W77', { pmid: '777', passed: false, rank: 40 })
    const T = lp('pmid:888', { passed: false, rank: 50 })
    const fetch = vi.fn(async () => [ref({ pmid: '888' })])
    const r = await addEuropePmcReferences([S, T], ['PMID: 777'], { fetch })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(r.links).toBe(1)
    expect(S.relations[0]).toMatchObject({ type: 'cites', paperId: 'pmid:888' })
  })

  it('times out per request and time-boxes the whole step, keeps what finished, never throws', async () => {
    const papers = [lp('pmid:1', { rank: 1 }), lp('pmid:2', { rank: 2 }), lp('pmid:3', { rank: 3 }), lp('pmid:4', { rank: 4, passed: false })]
    const fetch = vi.fn(async (pmid: string): Promise<EpmcRef[]> => {
      if (pmid === '1') return [ref({ pmid: '4' })]
      if (pmid === '2') return new Promise(() => {}) // hangs → per-request timeout
      throw new Error('HTTP 500')
    })
    const r = await addEuropePmcReferences(papers, [], { fetch, requestTimeoutMs: 50, totalTimeoutMs: 1000 })
    expect(r).toMatchObject({ calls: 3, ok: 1, errors: 1, timedOut: 1, links: 1 })

    // whole-step time box: a request still running at the deadline is dropped and does not mutate later
    const slow = [lp('pmid:10', { rank: 1 }), lp('pmid:11', { rank: 2, passed: false })]
    const t0 = Date.now()
    const r2 = await addEuropePmcReferences(slow, [], { fetch: () => new Promise(res => setTimeout(() => res([ref({ pmid: '11' })]), 300)), requestTimeoutMs: 1000, totalTimeoutMs: 60 })
    expect(Date.now() - t0).toBeLessThan(250)
    expect(r2).toMatchObject({ calls: 1, ok: 0, timedOut: 1, links: 0 })
    await new Promise(res => setTimeout(res, 350))
    expect(slow[0].relations).toEqual([])
  })

  it('fetches /MED/<pmid>/references through the cached HTTP helper (mocked fetch), parses MED ids and DOIs', async () => {
    const body = { hitCount: 3, referenceList: { reference: [
      { source: 'MED', id: '11526365', title: 'Challenges of <i>subgroup</i> analyses.', pubYear: 2001 },
      { authorString: 'AUTHOR UNKNOWN', pubYear: 0, doi: '10.1001/JAMA.1995.0352' },
      { source: 'PMC', id: 'PMC123', title: 'x' },
    ] } }
    const f = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const refs = await referencesByPmid('25406305', 2000)
    expect(String((f.mock.calls[0] as unknown[])[0])).toBe('https://www.ebi.ac.uk/europepmc/webservices/rest/MED/25406305/references?format=json&pageSize=1000')
    expect(refs).toEqual([
      { pmid: '11526365', doi: null, title: 'Challenges of subgroup analyses.', year: 2001 },
      { pmid: null, doi: '10.1001/jama.1995.0352', title: null, year: null },
      { pmid: null, doi: null, title: 'x', year: null },
    ])
    await referencesByPmid('25406305', 2000) // second call: raw cache, no network
    expect(f).toHaveBeenCalledTimes(1)
    expect(parseReferences({})).toEqual([])
  })
})
