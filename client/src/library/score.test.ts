import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHTS, LibPaper, LibraryRequest } from '@shared/library'
import { combine, rescore } from './score'
import { buildMockLibrary } from './mock'

const comp = (key: LibPaper['components'][number]['key'], value: number | null) => ({ key, label: key, weight: 0, value, contribution: 0, how: '', evidence: [] })

describe('library score', () => {
  it('combines with default weights and redistributes not-assessed weight', () => {
    const all = combine([comp('relevance', 1), comp('graph', 1), comp('citations', 1), comp('venue', 1), comp('authors', 1), comp('llm', 1)], DEFAULT_WEIGHTS)
    expect(all.total).toBeCloseTo(1)
    const noLlm = combine([comp('relevance', 1), comp('graph', 0), comp('citations', 0), comp('venue', 0), comp('authors', 0), comp('llm', null)], DEFAULT_WEIGHTS)
    expect(noLlm.total).toBeCloseTo(0.3 / 0.9)
    expect(noLlm.components.find(c => c.key === 'llm')!.contribution).toBe(0)
  })

  it('mock library is contract-valid, ranked, and re-gates on a new threshold', () => {
    const req = LibraryRequest.parse({ notes: [{ path: 'Notes/Question.md', title: 'Question', content: 'Which single-cell methods help study melanoma immune cells? 10.1126/science.aad0501' }] })
    const { papers, goals } = buildMockLibrary(req, 'test')
    expect(goals.knownPapers).toContain('10.1126/science.aad0501')
    expect(papers.length).toBeGreaterThan(400)
    for (const p of papers.slice(0, 50)) expect(LibPaper.safeParse(p).success).toBe(true)
    expect(papers[0].rank).toBe(1)
    expect(papers.every(p => !p.excluded || !p.passed)).toBe(true)
    const strict = rescore(papers, DEFAULT_WEIGHTS, 0.95)
    expect(strict.filter(p => p.passed).length).toBeLessThan(papers.filter(p => p.passed).length)
  })
})
