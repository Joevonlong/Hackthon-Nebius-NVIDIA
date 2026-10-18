import { describe, expect, it } from 'vitest'
import type { Candidate } from '@shared/contracts'
import { keywordFacets, laneLensSource, sortLane } from './discovery'

const cand = (rank: number, title: string, extra: Partial<Candidate> = {}): Candidate => ({
  paper: { id: 'W' + rank, title },
  lane: 'Core', rank, whyRanked: '', judgement: null,
  features: { out: [], in: [], eFacets: null },
  ...extra,
} as unknown as Candidate)

describe('title keyword lens (judge pending)', () => {
  it('scores topic and method from the title', () => {
    expect(keywordFacets('Acral melanoma immune map', 'melanoma immune cells')).toEqual({ topic: 1, method: 0.2 })
    expect(keywordFacets('Tumour-infiltrating T cells', 'melanoma immune cells')).toEqual({ topic: 0.55, method: 0.2 })
    expect(keywordFacets('Acral melanoma immune map')).toEqual({ topic: 0.2, method: 0.2 })
    expect(keywordFacets('Fast gapped-read alignment with Bowtie 2').method).toBe(1)
  })

  it('re-sorts a lane with no judge or embedding facets and keeps every paper', () => {
    const lane = [cand(1, 'Ipilimumab in melanoma'), cand(2, 'The SAM format and SAMtools'), cand(3, 'Single-cell RNA-seq of melanoma')]
    expect(laneLensSource(lane)).toBe('keywords')
    expect(sortLane(lane, 0, 'melanoma immune cells').map(c => c.rank)).toEqual([1, 3, 2])
    expect(sortLane(lane, 1, 'melanoma immune cells').map(c => c.rank)).toEqual([2, 3, 1])
    expect(sortLane(lane, 1)).toHaveLength(3)
  })

  it('uses judge facets when any paper in the lane is judged', () => {
    const judged = cand(2, 'x', { judgement: { facets: { topic: 3, population: 3, method: 3 }, verified: true } } as Partial<Candidate>)
    const lane = [cand(1, 'Single-cell melanoma'), judged]
    expect(laneLensSource(lane)).toBe('judge')
    // the unjudged paper keeps its slot
    expect(sortLane(lane, 1).map(c => c.rank)).toEqual([1, 2])
  })
})
