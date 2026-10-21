import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_WEIGHTS } from '@shared/library'
import { mkRecord, testGoals } from './test-records'

// #35: the upstream error body is logged, not put in the chat reply.
vi.mock('../ai/http', async orig => ({ ...(await orig<typeof import('../ai/http')>()), hasKey: () => true, lastError: { status: 500, body: 'UPSTREAM-LEAK detail' } }))
process.env.TRACE_CONSOLE = '0'

import { runChat } from './chat'
import { labelRecord } from './labels'
import { scoreLibrary } from './score'

describe('chat upstream errors', () => {
  it('a failed model call says so without the upstream body', async () => {
    const goals = testGoals()
    const rec = mkRecord('W1', { paper: { title: 'Melanoma paper' } })
    const papers = scoreLibrary([{ rec, labels: labelRecord(rec, goals), rel: { cos: 0.5, best: 'q', bestKind: 'question' as const, method: 'embedding' as const }, llm: null }], goals, { weights: DEFAULT_WEIGHTS, threshold: 0.3, topPercent: 25, now: new Date('2026-10-18') })
    const current = { weights: { ...DEFAULT_WEIGHTS }, topPercent: 25, threshold: 0.5, filters: {} }
    const res = await runChat('lib_test', { goals, papers }, { messages: [{ role: 'user', content: 'Summarise the evidence for melanoma resistance.' }], current }, { call: async () => null })
    expect(res.reply).not.toContain('UPSTREAM-LEAK')
    expect(res.reply).toContain('model call failed (HTTP 500)')
  })
})
