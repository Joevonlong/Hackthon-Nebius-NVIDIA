import { describe, expect, it } from 'vitest'
import { effectiveLlmReadK } from './pipeline'
import { labelRecord, markFieldUncertain } from './labels'
import { shortTitle } from './score'
import { mkRecord, testGoals } from './test-records'

describe('D-32 / J-2 LLM read covers every returned paper', () => {
  it('max(llmReadTopK, topK), capped at 60; 0 keeps it off', () => {
    expect(effectiveLlmReadK({ llmReadTopK: 40, topK: 30 })).toBe(40)
    expect(effectiveLlmReadK({ llmReadTopK: 10, topK: 50 })).toBe(50)
    expect(effectiveLlmReadK({ llmReadTopK: 40, topK: 120 })).toBe(60)
    expect(effectiveLlmReadK({ llmReadTopK: 0, topK: 30 })).toBe(0)
  })
})

describe('D-32 / J-5 field label + known-paper titles', () => {
  const lp = (id: string, field: string | null, excluded: string | null = null) => {
    const rec = mkRecord(id, { extra: { primaryTopic: field ? { topic: 't', subfield: 's', field, domain: 'd' } : null } })
    return { id, labels: labelRecord(rec, testGoals()), excluded }
  }
  it('field comes from primary_topic; disagreeing papers get field-uncertain', () => {
    const ranked = [lp('W1', 'Medicine'), lp('W2', 'Medicine'), lp('W3', 'Computer Science'), lp('W4', null), lp('W5', 'Physics', 'retracted')]
    expect(ranked[0].labels.field).toBe('Medicine')
    const out = markFieldUncertain(ranked)
    expect(out.map(p => p.labels.tags.includes('field-uncertain'))).toEqual([false, false, true, false, true])
    expect(ranked[2].labels.tags).not.toContain('field-uncertain') // pure
  })
  it('majority is taken over the top N only', () => {
    const ranked = [lp('W1', 'Biology'), lp('W2', 'Medicine'), lp('W3', 'Medicine'), lp('W4', 'Medicine')]
    expect(markFieldUncertain(ranked, 1).map(p => p.labels.tags.includes('field-uncertain'))).toEqual([false, true, true, true])
  })
  it('short titles cut at a word boundary', () => {
    expect(shortTitle('Known paper')).toBe('Known paper')
    expect(shortTitle('Single-cell transcriptomics of human melanoma reveals T cell exhaustion states and resistance', 40)).toBe('Single-cell transcriptomics of human…')
  })
})
