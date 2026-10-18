import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.hoisted(() => {
  process.env.TOKEN_FACTORY_API_KEY = ''
  process.env.TRACE_CONSOLE = '0'
})

import { LibraryEvent, LibraryRequest, LibPaper } from '@shared/library'

describe('library pipeline without keys (fixture source)', () => {
  it('runs end to end, emits contract events, writes files, rejects path traversal', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'lib-'))
    process.env.LOG_DIR = join(tmp, 'logs')
    const { env } = await import('../env')
    env.dataDir = join(tmp, 'data')
    const { createLibraryState, runLibrary } = await import('./pipeline')
    const { fixtureGather } = await import('./fixtures')
    const { readPaperFile, readLibrary } = await import('./store')
    const req = LibraryRequest.parse({
      notes: [{ path: 'Question.md', title: 'Melanoma', content: '# Melanoma\nWhich single-cell methods help study melanoma immune cells?\n## T cell states\n## Brain metastasis\nSeed: 10.1126/science.aad0501, 10.1016/j.cell.2018.10.038' }],
      topK: 10,
    })
    const s = createLibraryState('lib_test_1', req)
    await runLibrary(s, { gather: fixtureGather })
    for (const e of s.events) expect(LibraryEvent.safeParse(e).success).toBe(true)
    const types = s.events.map(e => e.type)
    expect(types[0]).toBe('library')
    expect(types).toContain('goals')
    expect(types).toContain('source')
    expect(types.at(-1)).toBe('done')
    const papersEv = s.events.find(e => e.type === 'papers')!
    if (papersEv.type !== 'papers') throw new Error()
    expect(papersEv.papers).toHaveLength(10)
    expect(papersEv.papers.map(p => p.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(s.events.some(e => e.type === 'stage' && e.stage === 'llm' && e.status === 'skipped')).toBe(true)
    expect(s.papers.length).toBeGreaterThanOrEqual(50)
    expect(s.papers.some(p => p.excluded === 'retracted')).toBe(true)
    // known seed papers link the graph component
    expect(s.papers.some(p => p.components.find(c => c.key === 'graph')?.value === 1)).toBe(true)
    const first = s.papers[0]
    const id = first.file.replace(/^papers\//, '').replace(/\.json$/, '')
    const file = readPaperFile('lib_test_1', id)
    expect(file && file !== 'bad' && LibPaper.safeParse(file).success).toBe(true)
    expect(readPaperFile('lib_test_1', '../goals')).toBe('bad')
    expect(readPaperFile('../x', 'W1')).toBe('bad')
    expect(readLibrary('lib_test_1')?.papers.length).toBe(s.papers.length)
  }, 20000)
})
