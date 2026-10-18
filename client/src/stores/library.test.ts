import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { LibraryRequest } from '@shared/library'
import { DEFAULT_WEIGHTS } from '@shared/library'
import { useLibrary } from './library'
import { useVault, questionNote } from './vault'
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

describe('Q2-2: weights, pass rule and filters are per library', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())
  const req = LibraryRequest.parse({ notes: [{ path: 'Notes/Question.md', title: 'Question', content: 'melanoma single-cell 10.1126/science.aad0501' }] })
  /** Library of question 1 with a chat proposal applied (recent + kind filters, other weights, stricter pass rule). */
  function appliedQ1() {
    const lib = useLibrary(), vault = useVault()
    for (const q of ['Q one', 'Q two']) vault.notes.push({ ...questionNote('x', q), updatedAt: 0 })
    vault.current = 'Q one'
    lib.allPapers = buildMockLibrary(req, 'q1').papers
    lib.libraryId = 'lib_q1'; lib.questionId = 'Q one'; lib.status = 'done'; lib.mode = 'live'
    lib.runRequest = { topK: 30, threshold: 0.5, sources: ['openalex'], weights: { ...DEFAULT_WEIGHTS } }
    lib.applyProposal({ weights: { citations: 0.5 }, topPercent: 10, threshold: 0.7, filters: { minYear: 2023, kinds: ['review'] }, rationale: 'chat' })
    expect(lib.filters.minYear).toBe(2023)
    return { lib, vault }
  }

  it('a new build for another question starts from the request defaults, with no filters', async () => {
    const { lib, vault } = appliedQ1()
    let sent: { weights?: unknown; topPercent?: number; threshold?: number } | null = null
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => { sent = JSON.parse(String(init?.body)); throw new TypeError('offline') }))
    vault.current = 'Q two'
    await lib.start()
    expect(lib.filters).toEqual({})
    expect(lib.weights).toEqual(DEFAULT_WEIGHTS)
    expect([lib.topPercent, lib.threshold, lib.topK]).toEqual([25, 0.5, 30])
    expect(sent).toMatchObject({ weights: DEFAULT_WEIGHTS, topPercent: 25, threshold: 0.5, questionId: 'Q two' })
  })

  it('rebuilding the same question keeps its weights and pass rule (sent with the build) but drops the view filters', async () => {
    const { lib } = appliedQ1()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await lib.start()
    expect(lib.filters).toEqual({})
    expect(lib.weights.citations).toBe(0.5)
    expect([lib.topPercent, lib.threshold]).toEqual([10, 0.7])
  })

  it('opening another stored library applies that library\'s request, not the previous library\'s filters', async () => {
    const { lib } = appliedQ1()
    const papers = buildMockLibrary(req, 'q2').papers
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ goals: null, papers, request: { topK: 40, threshold: 0.6, weights: DEFAULT_WEIGHTS } }))))
    expect(await lib.openStored('lib_q2', 'Q two')).toBe(true)
    expect(lib.filters).toEqual({})
    expect(lib.weights).toEqual(DEFAULT_WEIGHTS)
    expect([lib.topPercent, lib.threshold, lib.topK]).toEqual([25, 0.6, 40])
    expect(lib.top[0].rank).toBe(1) // the list starts at #1 again
  })

  it('switching to a question without a library (reset) clears the applied settings', () => {
    const { lib } = appliedQ1()
    lib.reset()
    expect(lib.filters).toEqual({})
    expect(lib.weights).toEqual(DEFAULT_WEIGHTS)
    expect(lib.topPercent).toBe(25)
  })
})
