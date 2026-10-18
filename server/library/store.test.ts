import { describe, expect, it } from 'vitest'
import type { LibPaper } from '@shared/library'
import { graphOf } from './store'

const lp = (id: string, o: { refs?: string[]; relations?: LibPaper['relations']; passed?: boolean; excluded?: string | null; rank?: number } = {}): LibPaper => ({
  paper: { id, title: id, year: 2020, referencedWorks: o.refs ?? [] },
  relations: o.relations ?? [], passed: o.passed ?? true, excluded: o.excluded ?? null, rank: o.rank ?? 1, total: 0.5,
} as unknown as LibPaper)

describe('graphOf (graph.json)', () => {
  it('adds paper→paper cite edges from referencedWorks among passed papers, keyed by paper.id', () => {
    const g = graphOf([
      lp('W1', { refs: ['W2', 'https://openalex.org/W3', 'W4', 'W999', 'W1'] }),
      lp('W2', { refs: ['W1'] }),
      lp('W3'),
      lp('W4', { passed: false }), // not drawn → no edge
    ], [])
    expect(g.nodes.map(n => n.id)).toEqual(['W1', 'W2', 'W3'])
    expect(g.edges).toEqual([
      { source: 'W1', target: 'W2', type: 'cites' },
      { source: 'W1', target: 'W3', type: 'cites' },
      { source: 'W2', target: 'W1', type: 'cites' },
    ])
  })

  it('keeps the known (seed) nodes and edges from relations, deduped against referencedWorks edges', () => {
    const g = graphOf([
      lp('W1', { refs: ['W2'], relations: [{ type: 'cites', paperId: 'W2' }, { type: 'cited_by', paperId: 'W2332292689' }, { type: 'similar', paperId: 'W7' }] }),
      lp('W2', { relations: [{ type: 'cites', paperId: 'W2332292689' }] }),
    ], ['w2332292689'])
    expect(g.edges).toEqual([
      { source: 'W1', target: 'W2', type: 'cites' },
      { source: 'W2332292689', target: 'W1', type: 'cites' },
      { source: 'W2', target: 'W2332292689', type: 'cites' },
    ])
    expect(g.nodes.find(n => n.id === 'W2332292689')).toEqual({ id: 'W2332292689', kind: 'known', links: 2, inKnownPapers: true })
  })
})
