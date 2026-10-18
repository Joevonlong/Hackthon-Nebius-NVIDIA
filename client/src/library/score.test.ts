import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHTS, LibPaper, LibraryRequest } from '@shared/library'
import { combine, grade, matchesFilters, passCut, rescore, verdict, keyNumber, notAssessedWhy } from './score'
import { buildMockLibrary } from './mock'

const comp = (key: LibPaper['components'][number]['key'], value: number | null, weight = 0.1) => ({ key, label: key, weight, value, contribution: 0, how: '', evidence: [] })

describe('library score', () => {
  it('combines with default weights and redistributes not-assessed weight', () => {
    const all = combine([comp('relevance', 1), comp('graph', 1), comp('citations', 1), comp('venue', 1), comp('authors', 1), comp('llm', 1)], DEFAULT_WEIGHTS)
    expect(all.total).toBeCloseTo(1)
    const noLlm = combine([comp('relevance', 1), comp('graph', 0), comp('citations', 0), comp('venue', 0), comp('authors', 0), comp('llm', null)], DEFAULT_WEIGHTS)
    expect(noLlm.total).toBeCloseTo(0.3 / 0.9)
    expect(noLlm.components.find(c => c.key === 'llm')!.contribution).toBe(0)
  })

  it('grades on the D-25 scale', () => {
    expect([0.9, 0.85, 0.7, 0.69, 0.55, 0.4, 0.39].map(grade).join('')).toBe('AABCCDE')
  })

  it('pass rule: top X% of non-excluded papers and total ≥ floor (D-27)', () => {
    const req = LibraryRequest.parse({ notes: [{ path: 'Notes/Question.md', title: 'Question', content: 'Which single-cell methods help study melanoma immune cells? 10.1126/science.aad0501' }] })
    const { papers, goals } = buildMockLibrary(req, 'test')
    expect(goals.knownPapers).toContain('10.1126/science.aad0501')
    for (const p of papers.slice(0, 50)) expect(LibPaper.safeParse(p).success).toBe(true)
    const n = papers.filter(p => !p.excluded).length
    const r = rescore(papers, { topPercent: 25, threshold: 0 })
    // D-38: papers the LLM read rated 0–1 of 3 inside the cut do not pass (no backfill).
    const cut = passCut(n, 25)
    const offTopicInCut = r.filter(p => !p.excluded).slice(0, cut).filter(p => p.llmRead && p.llmRead.relevance <= 1).length
    expect(r.filter(p => p.passed).length).toBe(cut - offTopicInCut)
    expect(r.every(p => !(p.passed && p.llmRead && p.llmRead.relevance <= 1))).toBe(true)
    expect(r[0].rank).toBe(1)
    expect(r.every(p => !p.excluded || !p.passed)).toBe(true)
    const strict = rescore(papers, { topPercent: 25, threshold: 0.95 })
    expect(strict.filter(p => p.passed).length).toBeLessThan(r.filter(p => p.passed).length)
    expect(strict.filter(p => p.passed).every(p => p.total >= 0.95)).toBe(true)
    expect(rescore(papers, { topPercent: 100, threshold: 0 }).filter(p => p.passed).length).toBe(n)
    const reweighted = rescore(papers, { topPercent: 25, threshold: 0.5, weights: { ...DEFAULT_WEIGHTS, citations: 0.5 } })
    expect(reweighted.map(p => p.paper.id)).not.toEqual(r.map(p => p.paper.id))
  })

  it('verdict names the top 2 strengths and the main weakness', () => {
    const p = { total: 0.8, components: [comp('relevance', 0.9, 0.3), comp('venue', 0.88, 0.15), comp('citations', 0.6, 0.18), comp('authors', 0.3, 0.12), comp('llm', null, 0.1)] } as unknown as LibPaper
    const v = verdict(p)
    expect(v.sentence).toBe('Excellent on relevance and venue; weak on author record')
    expect(v.strengths.map(c => c.key)).toEqual(['relevance', 'venue'])
    expect(v.weakness?.key).toBe('authors')
    expect(v.grade).toBe('B')
  })

  it('report card helpers read the evidence and the not-assessed reason', () => {
    const c = { ...comp('citations', 0.99), evidence: [{ text: 'cited_by 1,419 · 99th percentile for field and year (OpenAlex)' }] }
    expect(keyNumber(c)).toBe('cited_by 1,419 · 99th percentile for field and year (OpenAlex)')
    const na = { ...comp('llm', null), how: 'Not assessed: outside the top 40 by the other components. Its weight 0.1 is redistributed.' }
    expect(notAssessedWhy(na)).toBe('outside the top 40 by the other components')
  })

  it('filters by kind, year, open access and peer review', () => {
    const p = { paper: { year: 2020 }, labels: { kind: 'review', openAccess: 'closed', peerReviewed: true } } as unknown as LibPaper
    expect(matchesFilters(p, {})).toBe(true)
    expect(matchesFilters(p, { kinds: ['journal-article'] })).toBe(false)
    expect(matchesFilters(p, { minYear: 2021 })).toBe(false)
    expect(matchesFilters(p, { maxYear: 2020, peerReviewedOnly: true })).toBe(true)
    expect(matchesFilters(p, { openAccessOnly: true })).toBe(false)
  })
})
