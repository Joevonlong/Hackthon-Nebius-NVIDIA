import { describe, expect, it } from 'vitest'
import { passFlags, passSummary } from './score'
import { pickSubtopics, subtopicsByKeywords } from './labels'
import { mkRecord, testGoals } from './test-records'

const mk = (totals: number[], excluded: number[] = []) => totals.map((total, i) => ({ total, excluded: excluded.includes(i) ? 'retracted' : null }))

describe('D-27 pass rule: top X% of non-excluded AND total ≥ floor', () => {
  it('top 25% of 8 = 2 papers', () => {
    expect(passFlags(mk([0.9, 0.8, 0.7, 0.6, 0.55, 0.52, 0.51, 0.5]), { topPercent: 25, threshold: 0.5 })).toEqual([true, true, false, false, false, false, false, false])
  })
  it('the floor removes papers inside the top X%', () => {
    expect(passFlags(mk([0.9, 0.45, 0.4, 0.3]), { topPercent: 50, threshold: 0.5 })).toEqual([true, false, false, false])
  })
  it('excluded papers never pass and do not count toward M', () => {
    // 4 non-excluded → top 50% = 2; the excluded 0.99 is skipped
    expect(passFlags(mk([0.99, 0.9, 0.8, 0.7, 0.6], [0]), { topPercent: 50, threshold: 0.5 })).toEqual([false, true, true, false, false])
  })
  it('order independent, ceil(k), at least one when any qualify', () => {
    expect(passFlags(mk([0.6, 0.9, 0.7]), { topPercent: 10, threshold: 0.5 })).toEqual([false, true, false])
    expect(passFlags(mk([0.6, 0.9, 0.7]), { topPercent: 100, threshold: 0.65 })).toEqual([false, true, true])
    expect(passFlags([], { topPercent: 25, threshold: 0.5 })).toEqual([])
  })
  it('summary line', () => {
    const papers = [{ passed: true, excluded: null }, { passed: false, excluded: null }, { passed: false, excluded: 'retracted' }]
    expect(passSummary(papers, { topPercent: 25, threshold: 0.5 })).toBe('1 of 2 pass (top 25%, min 0.5)')
  })
})

describe('D-28 subtopic labels', () => {
  const names = ['A', 'B', 'C']
  it('keeps only subtopics within 0.05 of the best and ≥ the library p60', () => {
    expect(pickSubtopics([0.62, 0.60, 0.50], names, 0.55)).toEqual(['A', 'B'])
    expect(pickSubtopics([0.62, 0.56, 0.50], names, 0.55)).toEqual(['A'])
    expect(pickSubtopics([0.62, 0.60, 0.59], names, 0.60)).toEqual(['A', 'B'])
  })
  it('no label when the best is below the library p60', () => {
    expect(pickSubtopics([0.40, 0.39, 0.38], names, 0.55)).toEqual([])
    expect(pickSubtopics([], [], 0)).toEqual([])
  })
  it('keyword fallback needs ≥ 2 keyword hits', () => {
    const goals = testGoals({ subtopics: [{ name: 'T cell states', query: 'melanoma T cell states single-cell' }, { name: 'Brain', query: 'brain metastasis immune' }] })
    const one = mkRecord('W1', { paper: { title: 'Brain imaging', abstract: 'nothing else' } })
    expect(subtopicsByKeywords(one, goals)).toEqual([])
    const two = mkRecord('W2', { paper: { title: 'Brain metastasis in mice', abstract: 'x' } })
    expect(subtopicsByKeywords(two, goals)).toEqual(['Brain'])
  })
})
