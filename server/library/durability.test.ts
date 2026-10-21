// #16: atomic note/library writes, damaged library.json, and the running manifest after a killed build.
import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.hoisted(() => {
  process.env.TOKEN_FACTORY_API_KEY = ''
  process.env.TRACE_CONSOLE = '0'
})

import { LibraryRequest } from '@shared/library'

const request = () => LibraryRequest.parse({
  notes: [{ path: 'Question.md', title: 'Melanoma', content: '# Melanoma\nWhich single-cell methods help study melanoma immune cells?\n## T cell states\nSeed: 10.1126/science.aad0501' }],
  topK: 5,
})

describe('durable storage (#16)', () => {
  it('a failed note write keeps the previous note; a failed library.json write keeps the old library', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dur-'))
    process.env.WORKSPACE_DIR = join(root, 'ws')
    const { createQuestion, writeNote, notePathIn } = await import('./workspace')
    const { atomicHooks } = await import('../data/atomic')
    createQuestion('Q', '# Q\n\nText\n')
    expect(writeNote('Q', 'notes/a.md', 'first')).toBe(true)
    atomicHooks.beforeRename = () => { throw new Error('disk full') }
    try {
      expect(() => writeNote('Q', 'notes/a.md', 'second')).toThrow('disk full')
      expect(() => createQuestion('Q2', 'x')).toThrow('disk full')
    } finally { atomicHooks.beforeRename = null }
    expect(readFileSync(notePathIn('Q', 'notes/a.md')!, 'utf8')).toBe('first')
  })

  it('a damaged library.json gives a clear 422 and stays listed instead of vanishing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dur-'))
    process.env.WORKSPACE_DIR = join(root, 'ws')
    const { env } = await import('../env')
    env.dataDir = join(root, 'data')
    const { legacyLibraryDir, readLibrary, listLibraries, LibraryCorruptError } = await import('./store')
    const { mkdirSync } = await import('node:fs')
    const dir = legacyLibraryDir('lib_bad')!
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'library.json'), '{"libraryId": "lib_bad", "requ') // truncated
    let err: unknown
    try { readLibrary('lib_bad') } catch (e) { err = e }
    expect(err).toBeInstanceOf(LibraryCorruptError)
    const res = (err as InstanceType<typeof LibraryCorruptError>).getResponse()
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'library_corrupt', libraryId: 'lib_bad' })
    expect(listLibraries().map(l => l.libraryId)).toContain('lib_bad')
    expect(readLibrary('lib_missing')).toBeNull() // missing is still just not found
  })

  it('a build writes a running manifest at start; a killed build reads as interrupted after a restart, with partial results', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dur-'))
    process.env.WORKSPACE_DIR = join(root, 'ws')
    process.env.DATA_DIR = join(root, 'data')
    const { env } = await import('../env')
    env.dataDir = join(root, 'data')
    const { createLibraryState, runLibrary } = await import('./pipeline')
    const { fixtureGather } = await import('./fixtures')
    const store = await import('./store')

    let release!: () => void
    const hang = new Promise<never[]>(res => { release = () => res([]) })
    const s = createLibraryState('lib_killed', request())
    // the Europe PMC reference step runs after the checkpoint; hanging there stands in for the process being killed
    const run = runLibrary(s, { gather: fixtureGather, references: { fetch: () => hang, totalTimeoutMs: 600000 } })
    const dir = store.legacyLibraryDir('lib_killed')!
    const manifest = () => JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    expect(manifest().status).toBe('running') // written at start
    await vi.waitFor(() => expect(s.events.some(e => e.type === 'stage' && e.stage === 'expand')).toBe(true), { timeout: 15000 })
    expect(manifest()).toMatchObject({ status: 'running', stage: 'expand', libraryId: 'lib_killed' })
    expect(store.libraryStatus('lib_killed')).toBe('running')

    // restart: a fresh module instance has a new boot id, so the old "running" manifest is an interrupted build
    vi.resetModules()
    const restarted = await import('./store')
    const { env: env2 } = await import('../env')
    env2.dataDir = join(root, 'data')
    expect(restarted.libraryStatus('lib_killed')).toBe('interrupted')
    const listed = restarted.listLibraries().find(l => l.libraryId === 'lib_killed')!
    expect(listed.name).toMatch(/Interrupted/)
    expect(listed.total).toBeGreaterThan(0) // partial results from the checkpoint
    expect(restarted.readLibrary('lib_killed')!.papers.length).toBe(listed.total)

    release()
    await run
    expect(manifest().status).toBe('done')
    expect(existsSync(join(dir, 'library.json'))).toBe(true)
  }, 30000)

  it('a failing build marks its manifest failed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dur-'))
    process.env.WORKSPACE_DIR = join(root, 'ws')
    const { env } = await import('../env')
    env.dataDir = join(root, 'data')
    const { createLibraryState, runLibrary } = await import('./pipeline')
    const { legacyLibraryDir } = await import('./store')
    const s = createLibraryState('lib_fail', request())
    await expect(runLibrary(s, { gather: async () => [], citations: { fetchEpmc: () => { throw new Error('x') } } as never })).rejects.toThrow()
    const m = JSON.parse(readFileSync(join(legacyLibraryDir('lib_fail')!, 'manifest.json'), 'utf8'))
    expect(m.status).toBe('failed')
  }, 20000)
})
