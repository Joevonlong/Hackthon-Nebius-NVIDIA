import { describe, expect, it } from 'vitest'
import type { LibPaper } from '@shared/library'
import { fmtScore, loadView, radarShapeKeys, statusTip, rankMoves, saveView, sortPapers, tileChips } from './facts'

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
  it('MiniRadar leaves a not-assessed axis out of the shape (not drawn as 0)', () => {
    const c = (key: string, value: number | null) => ({ key, value }) as unknown as LibPaper['components'][number]
    expect(radarShapeKeys([c('relevance', 0.4), c('graph', null), c('citations', 0), c('venue', null)])).toEqual(['relevance', 'citations'])
  })
  it('status tip names the real top X% and minimum', () => {
    expect(statusTip(ps[0], { topPercent: 25, threshold: 0.5 })).toMatch(/top 25%.*0\.50/)
    expect(statusTip(ps[0], { topPercent: 25, threshold: 0.5 })).not.toMatch(/top X%/)
  })
  it('Recent chip uses the Recent filter cut-off (3 years), not the 5-year label', () => {
    const y = new Date().getFullYear()
    const rec = (year: number) => ({ ...mk(1, 0.5, 0.5, year, 't'), labels: { kind: 'journal-article', recency: 'recent', openAccess: 'closed' } }) as unknown as LibPaper
    expect(tileChips(rec(y - 1)).map(c => c.text)).toContain('Recent')
    expect(tileChips(rec(y - 4)).map(c => c.text)).not.toContain('Recent')
  })
  it('shows at most 3 chips', () => { expect(tileChips(ps[0]).map(c => c.text)).toEqual(['journal-article', 'Fresh', 'OA']) })
  it('view preference falls back to tiles without storage', () => {
    expect(loadView()).toBe('tiles')
    expect(() => saveView('table')).not.toThrow()
  })
})

describe('fmtScore (Q-5)', () => {
  it('keeps two decimals away from the minimum', () => expect(fmtScore(0.7234, 0.5)).toBe('0.72'))
  it('never shows a rounded value that contradicts pass / below', () => {
    expect(fmtScore(0.8496, 0.85)).toBe('0.8496')
    expect(Number(fmtScore(0.8496, 0.85))).toBeLessThan(0.85)
    expect(fmtScore(0.8504, 0.85)).toBe('0.850')
    expect(fmtScore(0.85, 0.85)).toBe('0.850')
    expect(fmtScore(0.849, 0.85)).toBe('0.849')
  })
})
describe('rankMoves (Q-8)', () => {
  it('reports moved papers only, positive = up', () => {
    const a = [mk(1, .9, 1, 2020, 'a'), mk(2, .8, 1, 2020, 'b')]; a[0].paper.id = 'a'; a[1].paper.id = 'b'
    const b = [{ ...a[1], rank: 1 }, { ...a[0], rank: 2 }]
    expect(rankMoves(a, b)).toEqual({ b: 1, a: -1 })
    expect(rankMoves(a, a)).toEqual({})
  })
})
