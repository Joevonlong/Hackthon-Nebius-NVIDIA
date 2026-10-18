import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHTS, type LibPaper, LibraryRequest } from '@shared/library'
import { COMPONENT_KEYS, combine, weightShare } from '../score'
import { buildMockLibrary } from '../mock'
import { barLabel, scoreSlices, sliceText } from './slices'

type C = LibPaper['components'][number]
const comp = (key: C['key'], value: number | null, weight = 0.1): C => ({ key, label: key, weight, value, contribution: 0, how: '', evidence: [] })

describe('score chart slices (CR-11)', () => {
  it('slices sum to the total and the missed arc closes the circle', () => {
    const { components, total } = combine([comp('relevance', 0.9), comp('graph', 0.5), comp('citations', 0.75), comp('venue', 0.6), comp('authors', 0.3), comp('llm', 0.8)], DEFAULT_WEIGHTS)
    const s = scoreSlices(components)
    expect(s.total).toBeCloseTo(total, 12)
    expect(s.total + s.missed).toBeCloseTo(1, 12)
    expect(s.slices.map(x => x.key)).toEqual(COMPONENT_KEYS)
    // contiguous: each slice starts where the previous one ended
    s.slices.forEach((x, i) => { if (i) expect(x.start).toBeCloseTo(s.slices[i - 1].start + s.slices[i - 1].contribution, 12) })
    // slice = value × share, matching the report-card rows
    for (const x of s.slices) expect(x.contribution).toBeCloseTo(x.value! * x.share, 12)
  })

  it('redistributes a not-assessed weight over the assessed components', () => {
    const { components, total } = combine([comp('relevance', 1), comp('graph', 0), comp('citations', 0.5), comp('venue', 0), comp('authors', 0), comp('llm', null)], DEFAULT_WEIGHTS)
    const s = scoreSlices(components)
    const llm = s.slices.find(x => x.key === 'llm')!
    expect(llm.share).toBe(0)
    expect(llm.contribution).toBe(0)
    const shares = s.slices.reduce((a, x) => a + x.share, 0)
    expect(shares).toBeCloseTo(1, 12) // the assessed shares still add up to 100 %
    const rel = s.slices.find(x => x.key === 'relevance')!
    expect(rel.share).toBeCloseTo(DEFAULT_WEIGHTS.relevance / (1 - DEFAULT_WEIGHTS.llm), 12)
    expect(rel.share).toBeCloseTo(weightShare(components[0], components), 12)
    expect(s.total).toBeCloseTo(total, 12)
    expect(barLabel(llm)).toBe('not assessed')
    expect(sliceText(llm)).toMatch(/^LLM not assessed/)
  })

  it('formats the hover sentence and bar label', () => {
    const s = scoreSlices([{ ...comp('citations', 0.75, 0.18), contribution: 0.135 }, { ...comp('relevance', 0.5, 0.82), contribution: 0.41 }])
    const cit = s.slices.find(x => x.key === 'citations')!
    expect(sliceText(cit)).toBe('Citations adds 0.14 (value 0.75 × share 18%)')
    expect(barLabel(cit)).toBe('0.75 · 18%')
  })

  it('matches every mock paper total, also after re-weighting', () => {
    const req = LibraryRequest.parse({ notes: [{ path: 'Notes/Q.md', title: 'Q', content: 'Which single-cell methods help study melanoma immune cells?' }] })
    const { papers } = buildMockLibrary(req, 'test')
    const w = { ...DEFAULT_WEIGHTS, citations: 0.5, relevance: 0.05 }
    for (const p of papers.slice(0, 40)) {
      expect(scoreSlices(p.components).total).toBeCloseTo(p.total, 9)
      const r = combine(p.components, w)
      expect(scoreSlices(r.components).total).toBeCloseTo(r.total, 12)
    }
  })

  it('an empty / unassessed paper gives an all-grey donut', () => {
    const s = scoreSlices(COMPONENT_KEYS.map(k => comp(k, null)))
    expect(s.total).toBe(0)
    expect(s.missed).toBe(1)
  })
})
