// A hanging AI and a failing route must not stall or kill the run.
import { expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Paper } from '@shared/contracts'
import { resolveConfig } from '@shared/config'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pt-test-'))

const P = (id: string, over: Partial<Paper> = {}): Paper => ({
  id, doi: `10.1000/${id.toLowerCase()}`, pmid: null, pmcid: null, title: id, authors: ['A B'], year: 2020, publicationDate: '2020-01-01', venue: null,
  type: 'article', citedByCount: 1, citationPct: null, isRetracted: false, isOa: null, oaUrl: null, abstract: 'abs', abstractSource: 'openalex',
  referencedWorks: [], url: '', ...over,
})
const S1 = P('WS1', { referencedWorks: ['WA'] }), S2 = P('WS2', { referencedWorks: ['WA'] })

vi.mock('../sources/openalex', async orig => ({
  ...(await orig() as any),
  getWork: async (ref: { value: string }) => { const s = [S1, S2].find(x => x.doi === ref.value); return s ? { value: structuredClone(s), url: 'u', hash: 'h' } : null },
  getWorksBy: async (key: string, ids: string[]) => ({ papers: key === 'openalex_id' && ids.includes('WA') ? [P('WA')] : [], requests: [] }),
  citingBoth: async () => { throw new Error('OpenAlex down') },
  search: async () => ({ value: [], url: 'u', hash: 'h' }),
}))
vi.mock('../sources/pubmed', async orig => ({ ...(await orig() as any), similar: async () => ({ pmids: [], url: 'u', hash: 'h' }), fetchAbstracts: async () => new Map() }))
vi.mock('../sources/europepmc', () => ({ abstractsByDoi: async () => new Map() }))
vi.mock('../ai/index', () => {
  const never = () => new Promise<never>(() => {})
  return { facets: never, expandQueries: never, embed: never, rerank: never, judge: never, scout: never }
})

it('finishes with lanes when every AI call hangs and R2 fails', async () => {
  const { createRunState, snapshotOf } = await import('./registry')
  const { runPipeline } = await import('./pipeline')
  const cfg = resolveConfig('demo', { MODEL_TIMEOUT_MS: '30', SCOUT_MAX_MS: '30' })
  const run = createRunState('run_t2', 'question?', 'demo', cfg)
  const t0 = Date.now()
  await runPipeline(run, ['10.1000/ws1', '10.1000/ws2'])
  expect(Date.now() - t0).toBeLessThan(5000)
  const snap = snapshotOf(run)
  expect(snap.events.at(-1)?.type).toBe('done')
  expect(snap.counts.Core).toBe(1)
  expect(snap.facets).toHaveLength(3) // fallback facets
  const r2 = snap.events.find(e => e.type === 'stage' && e.stage === 'r2' && e.status !== 'start')
  expect(r2 && r2.type === 'stage' && r2.message).toMatch(/10 seed pairs|1 failed/)
})
