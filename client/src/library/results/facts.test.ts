import { describe, expect, it } from 'vitest'
import type { LibPaper } from '@shared/library'
import { loadView, saveView, sortPapers, tileChips } from './facts'

const mk = (rank: number, total: number, rel: number | null, year: number | null, title: string): LibPaper => ({
  rank, total, passed: rank === 1, excluded: null,
  paper: { title, year, authors: ['A B'] } as LibPaper['paper'],
  labels: { kind: 'journal-article', recency: 'fresh', openAccess: 'gold' } as LibPaper['labels'],
  components: [{ key: 'relevance', label: '', weight: 0.3, value: rel, contribution: 0, how: '', evidence: [] }],
} as unknown as LibPaper)

describe('results facts (F-60)', () => {
  const ps = [mk(1, 0.9, 0.5, 2020, 'b'), mk(2, 0.8, null, 2024, 'a'), mk(3, 0.7, 0.9, null, 'c')]
  it('sorts by a component with not-assessed last in both directions', () => {
    expect(sortPapers(ps, 'relevance', -1).map(p => p.rank)).toEqual([3, 1, 2])
    expect(sortPapers(ps, 'relevance', 1).map(p => p.rank)).toEqual([1, 3, 2])
  })
  it('sorts by year, title and rank', () => {
    expect(sortPapers(ps, 'year', -1).map(p => p.rank)).toEqual([2, 1, 3])
    expect(sortPapers(ps, 'title', 1).map(p => p.rank)).toEqual([2, 1, 3])
    expect(sortPapers(ps, 'rank', -1).map(p => p.rank)).toEqual([3, 2, 1])
  })
  it('shows at most 3 chips', () => { expect(tileChips(ps[0]).map(c => c.text)).toEqual(['journal-article', 'Fresh', 'OA']) })
  it('view preference falls back to tiles without storage', () => {
    expect(loadView()).toBe('tiles')
    expect(() => saveView('table')).not.toThrow()
  })
})
