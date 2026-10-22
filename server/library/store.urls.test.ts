import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '../env'
import { library } from '../routes/library'
import { readLibrary, writeLibraryFiles } from './store'
import { emitLib, type LibraryState } from './pipeline'
import { logRoot } from '../trace'

// Issue #15 (D-13): a stored library with non-web URLs is cleaned when it is read, and new data is cleaned before it is saved or sent.
let dir: string; let prevData: string; let prevLog: string | undefined
const BAD = 'javascript:void(0)//URLMARKER'
const oldPaper = (id: string, url: string) => ({
  paper: { id, doi: null, pmid: null, pmcid: null, title: 't', authors: [], year: 2020, publicationDate: null, venue: null, type: null, citedByCount: 0, citationPct: null, isRetracted: false, isOa: null, oaUrl: id === 'W1' ? BAD : null, abstract: null, abstractSource: null, referencedWorks: [], url },
  hits: [{ source: 'tavily', via: 'web', query: null, rank: 1, url: id === 'W1' ? BAD : 'https://example.org/p' }],
  relations: [], passed: true, excluded: null, rank: id === 'W1' ? 1 : 2, total: 0.5,
})

beforeAll(() => {
  prevData = env.dataDir; prevLog = process.env.LOG_DIR
  dir = mkdtempSync(join(tmpdir(), 'pt-urls-'))
  ;(env as { dataDir: string }).dataDir = dir
  process.env.LOG_DIR = join(dir, 'logs')
  process.env.TRACE_CONSOLE = '0'
  for (const id of ['lib_bad', 'lib_good']) {
    const d = join(dir, 'library', id)
    mkdirSync(join(d, 'papers'), { recursive: true })
    writeFileSync(join(d, 'library.json'), JSON.stringify({ libraryId: id, request: { topK: 5 }, papers: [] }))
  }
  writeFileSync(join(dir, 'library', 'lib_bad', 'papers', 'W1.json'), JSON.stringify(oldPaper('W1', BAD)))
  writeFileSync(join(dir, 'library', 'lib_good', 'papers', 'W2.json'), JSON.stringify(oldPaper('W2', 'https://openalex.org/W2')))
})
afterAll(() => { (env as { dataDir: string }).dataDir = prevData; if (prevLog === undefined) delete process.env.LOG_DIR; else process.env.LOG_DIR = prevLog })

describe('old library files with non-web URLs', () => {
  it('GET /library/:id drops them in paper.url, paper.oaUrl and hits[].url', async () => {
    const r = await library.request('/library/lib_bad')
    expect(r.status).toBe(200)
    const body = await r.json() as { papers: ReturnType<typeof oldPaper>[] }
    expect(JSON.stringify(body)).not.toContain('javascript')
    expect(body.papers[0].paper.url).toBe('')
    expect(body.papers[0].paper.oaUrl).toBeNull()
    expect(body.papers[0].hits[0].url).toBe('')
  })
  it('GET /library/:id/papers/:id drops them too', async () => {
    const r = await library.request('/library/lib_bad/papers/W1')
    expect(r.status).toBe(200)
    const p = await r.json() as ReturnType<typeof oldPaper>
    expect(JSON.stringify(p)).not.toContain('javascript')
    expect(p.paper.url).toBe('')
  })
  it('a valid old file reads exactly as stored', () => {
    const stored = JSON.parse(readFileSync(join(dir, 'library', 'lib_good', 'papers', 'W2.json'), 'utf8'))
    expect(readLibrary('lib_good')?.papers[0]).toEqual(stored)
  })
  it('the url_dropped trace line is written once and holds no URL text', async () => {
    await library.request('/library/lib_bad'); await library.request('/library/lib_bad')
    const f = join(logRoot(), 'server', 'events.jsonl')
    expect(existsSync(f)).toBe(true)
    const lines = readFileSync(f, 'utf8').split('\n').filter(l => l.includes('url_dropped'))
    expect(lines.length).toBe(1)
    expect(lines[0]).not.toMatch(/URLMARKER|void/)
  })
})

describe('ingest', () => {
  it('emitLib sends cleaned URLs and writeLibraryFiles saves them cleaned', () => {
    const lp = { ...oldPaper('W3', BAD), file: 'papers/W3.json' }
    const s = { id: 'lib_new', request: { topK: 5, notes: [], weights: {}, sources: [] }, goals: null, papers: [lp], events: [] as unknown[], listeners: new Set(), calls: [], done: false, startedAt: Date.now() } as unknown as LibraryState
    emitLib(s, { type: 'papers', papers: [structuredClone(lp)], total: 1, passed: 1 } as never)
    expect(JSON.stringify(s.events)).not.toContain('javascript')
    writeLibraryFiles(s)
    const saved = readFileSync(join(dir, 'library', 'lib_new', 'papers', 'W3.json'), 'utf8')
    expect(saved).not.toContain('javascript')
  })
})
