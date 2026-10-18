import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { LibraryRequest } from '@shared/library'
import { useLibrary } from './library'
import { buildMockLibrary } from '../library/mock'

describe('library store (chat API for lane U2)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('applyProposal merges settings, re-scores in the browser and returns top-10 before/after', () => {
    const lib = useLibrary()
    const req = LibraryRequest.parse({ notes: [{ path: 'Notes/Question.md', title: 'Question', content: 'melanoma single-cell 10.1126/science.aad0501' }] })
    lib.allPapers = buildMockLibrary(req, 'test').papers
    lib.runRequest = { topK: 30, threshold: 0.5, sources: ['openalex'], weights: { ...lib.weights } }
    expect(lib.currentSettings()).toEqual({ weights: lib.weights, topPercent: 25, threshold: 0.5, filters: {} })
    const passedBefore = lib.passedCount
    const { before, after } = lib.applyProposal({ weights: { citations: 0.5, relevance: 0.1 }, topPercent: 10, filters: { minYear: 2019 }, rationale: 'test' })
    expect(before).toHaveLength(10)
    expect(after).toHaveLength(10)
    expect(after).not.toEqual(before)
    expect(lib.weights.citations).toBe(0.5)
    expect(lib.weights.venue).toBe(0.15) // untouched keys kept
    expect(lib.currentSettings().topPercent).toBe(10)
    expect(lib.passedCount).toBeLessThan(passedBefore)
    expect(lib.top.every(p => (p.paper.year ?? 0) >= 2019)).toBe(true)
    expect(lib.papers.length).toBe(lib.allPapers.length)
    const moved = lib.papers.find(p => lib.rankMove(p.paper.id, p.rank) != null)
    expect(moved).toBeTruthy()
  })
})
