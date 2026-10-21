import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { clear, get } from 'idb-keyval'
import { useVault, type Note } from '../vault'
import { fakeServer } from './vaultServer'

// Review fixes for #13 (PR #34): each test below failed against the first version of the sync.
const tab = () => { setActivePinia(createPinia()); return useVault() }
const Q = 'Questions/Melanoma'
const base = () => new Map([['Question.md', { content: 'q', updatedAt: 1 }], ['notes/x.md', { content: 'on server', updatedAt: 1 }]])
const note = (path: string, content: string) => ({ path, kind: 'note' as const, title: path.split('/').pop()!.replace(/\.md$/, ''), content })
let srv: ReturnType<typeof fakeServer>

beforeEach(async () => { await clear(); srv = fakeServer(); vi.stubGlobal('fetch', srv.fetchMock) })
afterEach(() => { vi.unstubAllGlobals() })

describe('vault sync review fixes (#13)', () => {
  it('1. a never-synced local note is kept and flagged when the server has a newer copy', async () => {
    srv.folders.set('Melanoma', new Map([['Question.md', { content: 'q', updatedAt: 1 }]]))
    srv.state.online = false
    const a = tab(); await a.load()
    await a.upsert(note(`${Q}/notes/Untitled.md`, 'my offline paragraph')); await a.saveNow()
    await new Promise(r => setTimeout(r, 5))
    srv.state.online = true
    srv.put('Melanoma', 'notes/Untitled.md', 'other browser text')
    const b = tab(); await b.load()
    expect(b.byPath(`${Q}/notes/Untitled.md`)?.content).toBe('my offline paragraph')
    expect(b.conflicts[`${Q}/notes/Untitled.md`]).toMatchObject({ server: 'other browser text' })
    expect(srv.folders.get('Melanoma')!.get('notes/Untitled.md')?.content).toBe('other browser text')
  })

  it('2. a rename during an in-flight PUT neither marks the new path saved nor deletes the old file', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    await a.upsert(note(`${Q}/notes/x.md`, 'edited'))
    let release!: () => void
    srv.state.gate = new Promise<void>(r => { release = r })
    const f = a.flush()
    await vi.waitFor(() => expect(srv.state.gate).toBeNull())
    await a.rename(`${Q}/notes/x.md`, `${Q}/notes/y.md`)
    release(); await f
    expect(a.unsynced).toBe(1) // y.md is not on the server yet
    expect(srv.folders.get('Melanoma')!.has('notes/x.md')).toBe(true)
    await a.flush()
    const files = srv.folders.get('Melanoma')!
    expect(files.get('notes/y.md')?.content).toBe('edited'); expect(files.has('notes/x.md')).toBe(false); expect(a.unsynced).toBe(0)
  })

  it('3. a 403 (stale guard cookie) is retried: the note stays unsynced and the queued delete is not dropped', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    srv.state.status = 403
    await a.upsert(note(`${Q}/notes/new.md`, 'typed'))
    await a.flush()
    expect(a.unsynced).toBe(1); expect(a.syncError).not.toBe('')
    await a.remove(`${Q}/notes/x.md`); await a.flush()
    expect(srv.folders.get('Melanoma')!.has('notes/x.md')).toBe(true)
    srv.state.status = 0
    await a.flush()
    expect(srv.folders.get('Melanoma')!.get('notes/new.md')?.content).toBe('typed')
    expect(srv.folders.get('Melanoma')!.has('notes/x.md')).toBe(false)
    expect(a.unsynced).toBe(0); expect(a.syncError).toBe('')
  })

  it('3. a note the server refuses for good stays counted and flagged', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    srv.state.status = 413
    await a.upsert(note(`${Q}/notes/big.md`, 'huge'))
    await a.flush(); await a.flush()
    expect(a.unsynced).toBe(1); expect(a.syncError).toContain('refused')
  })

  it('3. a queued folder rename is not marked done by a 403', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    a.renameQuestion('Melanoma', 'Skin')
    srv.state.status = 403
    await a.flush()
    expect(srv.folders.has('Melanoma')).toBe(true)
    srv.state.status = 0; await a.flush()
    expect(srv.folders.has('Skin')).toBe(true); expect(srv.folders.has('Melanoma')).toBe(false)
  })

  it('4. a delete in one tab is not undone by another tab saving', async () => {
    const a = tab(); await a.load(); const b = tab(); await b.load()
    await a.upsert(note('Notes/x.md', 'X')); await a.saveNow()
    await b.mergeFromDisk()
    expect(b.byPath('Notes/x.md')).toBeTruthy()
    await new Promise(r => setTimeout(r, 3))
    await a.remove('Notes/x.md'); await a.saveNow()
    await new Promise(r => setTimeout(r, 3))
    await b.upsert(note('Notes/y.md', 'Y')); await b.saveNow() // b still holds x.md in memory
    expect(((await get('papertrail:vault:v1')) as Note[]).map(n => n.path)).toEqual(['Notes/y.md'])
    await b.mergeFromDisk()
    expect(b.byPath('Notes/x.md')).toBeUndefined()
  })

  it('5. a folder rename onto a name the server already has never writes into that folder', async () => {
    srv.folders.set('A', new Map([['Question.md', { content: 'question A', updatedAt: 1 }]]))
    const a = tab(); await a.load()
    srv.folders.set('B', new Map([['Question.md', { content: 'someone else', updatedAt: 1 }]]))
    expect(a.renameQuestion('A', 'B')).toBe('B')
    await a.flush()
    expect(srv.folders.get('B')!.get('Question.md')?.content).toBe('someone else')
    expect(srv.folders.get('B (2)')!.get('Question.md')?.content).toBe('question A')
    expect(srv.folders.has('A')).toBe(false)
    expect(a.byPath('Questions/B (2)/Question.md')).toBeTruthy(); expect(a.current).toBe('B (2)')
  })

  it('5. ensureQuestion on an existing server folder does not make the client write into it', async () => {
    srv.state.online = false
    const a = tab(); await a.load()
    await a.createQuestion('Shared', 'my own question')
    srv.folders.set('Shared', new Map([['Question.md', { content: 'someone else', updatedAt: 1 }]]))
    srv.state.online = true
    await a.flush() // pulls first: Question.md is flagged, nothing is overwritten
    expect(srv.folders.get('Shared')!.get('Question.md')?.content).toBe('someone else')
    expect(a.conflicts['Questions/Shared/Question.md']).toBeTruthy()
  })

  it('6. renaming X→X2→X3 with X3 refused keeps X on the server', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    await a.rename(`${Q}/notes/x.md`, `${Q}/notes/x2.md`)
    await a.rename(`${Q}/notes/x2.md`, `${Q}/notes/x3.md`)
    srv.state.putStatus = 413
    await a.flush()
    expect(srv.folders.get('Melanoma')!.get('notes/x.md')?.content).toBe('on server')
    await a.flush()
    expect(srv.folders.get('Melanoma')!.get('notes/x.md')?.content).toBe('on server'); expect(a.byPath(`${Q}/notes/x3.md`)).toBeTruthy()
  })

  it('7. both tabs editing the same note: the other copy is flagged, not dropped', async () => {
    const a = tab(); await a.load(); const b = tab(); await b.load()
    await a.upsert(note('Notes/n.md', 'v1')); await a.saveNow(); await b.mergeFromDisk()
    await new Promise(r => setTimeout(r, 3))
    await a.upsert(note('Notes/n.md', 'from tab a')); await a.saveNow()
    await b.upsert(note('Notes/n.md', 'from tab b'))
    await b.mergeFromDisk()
    expect(b.byPath('Notes/n.md')?.content).toBe('from tab b')
    expect(b.conflicts['Notes/n.md']).toMatchObject({ server: 'from tab a' })
  })

  it('9. demo mode writes nothing to localStorage', async () => {
    vi.stubGlobal('location', { search: '?demo=1' })
    const setItem = vi.fn(); vi.stubGlobal('localStorage', { getItem: () => null, setItem, removeItem: vi.fn() })
    const a = tab(); await a.load(); a.setCurrent('x')
    expect(setItem).not.toHaveBeenCalled()
  })
})
