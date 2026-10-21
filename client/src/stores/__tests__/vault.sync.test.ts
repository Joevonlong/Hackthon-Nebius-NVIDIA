import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { clear, keys } from 'idb-keyval'
import { useVault } from '../vault'
import { backupFile } from '../../workspace/export'
import { fakeServer } from './vaultServer'

const tab = () => { setActivePinia(createPinia()); return useVault() }
const Q = 'Questions/Melanoma'
let srv: ReturnType<typeof fakeServer>

beforeEach(async () => {
  await clear()
  srv = fakeServer()
  vi.stubGlobal('fetch', srv.fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('vault sync (#13)', () => {
  it('an offline edit survives a reload and reaches the server on reconnect', async () => {
    srv.folders.set('Melanoma', new Map([['Question.md', { content: 'q', updatedAt: 1 }]]))
    srv.state.online = false
    const a = tab(); await a.load()
    await a.upsert({ path: `${Q}/notes/idea.md`, kind: 'note', title: 'idea', content: '# idea\n\nwritten offline' })
    await a.flush(); await a.saveNow()
    expect(a.unsynced).toBe(1)
    const b = tab(); await b.load() // reload, still offline
    expect(b.byPath(`${Q}/notes/idea.md`)?.content).toContain('written offline')
    srv.state.online = true
    await b.load() // reconnect: pull must not wipe the edit, flush uploads it
    expect(srv.folders.get('Melanoma')!.get('notes/idea.md')?.content).toContain('written offline')
    expect(b.unsynced).toBe(0)
  })

  it('retries a failed PUT until the server accepts it', async () => {
    srv.folders.set('Melanoma', new Map([['Question.md', { content: 'q', updatedAt: 1 }]]))
    const a = tab(); await a.load()
    srv.state.failPut = 2
    await a.upsert({ path: `${Q}/notes/n.md`, kind: 'note', title: 'n', content: 'hello' })
    await a.flush(); expect(a.unsynced).toBe(1); expect(a.syncError).not.toBe('')
    await a.flush(); expect(srv.folders.get('Melanoma')!.has('notes/n.md')).toBe(false)
    await a.flush(); expect(srv.folders.get('Melanoma')!.get('notes/n.md')?.content).toBe('hello')
    expect(a.unsynced).toBe(0); expect(a.syncError).toBe('')
  })

  it('a rename never loses the note when the PUT fails; the old file goes only after the new one is saved', async () => {
    srv.folders.set('Melanoma', new Map([['Question.md', { content: 'q', updatedAt: 1 }], ['notes/old.md', { content: 'precious', updatedAt: 1 }]]))
    const a = tab(); await a.load()
    srv.state.failPut = 1
    expect(await a.rename(`${Q}/notes/old.md`, `${Q}/notes/new.md`)).toBe(true)
    await a.flush()
    expect(srv.calls.some(c => c.method === 'DELETE')).toBe(false)
    expect(srv.folders.get('Melanoma')!.get('notes/old.md')?.content).toBe('precious')
    expect(a.byPath(`${Q}/notes/new.md`)?.content).toBe('precious')
    await a.saveNow()
    const b = tab(); await b.load() // reload between the attempts: the queued delete survives and still waits for the PUT
    const f = srv.folders.get('Melanoma')!
    expect(f.get('notes/new.md')?.content).toBe('precious')
    expect(f.has('notes/old.md')).toBe(false)
    expect(b.byPath(`${Q}/notes/new.md`)).toBeTruthy()
  })

  it('two tabs do not overwrite each other', async () => {
    const a = tab(); await a.load()
    const b = tab(); await b.load()
    await a.upsert({ path: 'Notes/from-a.md', kind: 'note', title: 'a', content: 'A' })
    await b.upsert({ path: 'Notes/from-b.md', kind: 'note', title: 'b', content: 'B' })
    await a.saveNow(); await b.saveNow()
    const c = tab(); await c.load()
    expect(c.notes.map(n => n.path).sort()).toEqual(['Notes/from-a.md', 'Notes/from-b.md'])
    await a.mergeFromDisk()
    expect(a.byPath('Notes/from-b.md')?.content).toBe('B')
    // the newer edit wins per note, and a delete in one tab is not undone by the other tab's save
    await b.remove('Notes/from-a.md'); await b.saveNow()
    await a.upsert({ path: 'Notes/from-a.md', kind: 'note', title: 'a', content: 'A2' }); await a.saveNow()
    const d = tab(); await d.load()
    expect(d.byPath('Notes/from-a.md')?.content).toBe('A2')
  })

  it('flags a conflict instead of dropping either side', async () => {
    srv.folders.set('Melanoma', new Map([['Question.md', { content: 'q', updatedAt: 1 }], ['notes/x.md', { content: 'base', updatedAt: 1 }]]))
    const a = tab(); await a.load(); await a.saveNow()
    srv.state.online = false
    await a.upsert({ path: `${Q}/notes/x.md`, kind: 'note', title: 'x', content: 'local edit' })
    await a.flush(); await a.saveNow()
    srv.state.online = true
    srv.put('Melanoma', 'notes/x.md', 'edited elsewhere')
    const b = tab(); await b.load()
    expect(b.byPath(`${Q}/notes/x.md`)?.content).toBe('local edit')
    expect(b.conflicts[`${Q}/notes/x.md`]).toEqual({ server: 'edited elsewhere' })
    expect(srv.folders.get('Melanoma')!.get('notes/x.md')?.content).toBe('edited elsewhere') // not overwritten
    b.resolveConflict(`${Q}/notes/x.md`, 'local'); await b.flush()
    expect(srv.folders.get('Melanoma')!.get('notes/x.md')?.content).toBe('local edit')
    expect(Object.keys(b.conflicts)).toEqual([])
  })

  it('flushes on pagehide, asks for persistent storage and backs up every note', async () => {
    const win = new EventTarget()
    vi.stubGlobal('window', win)
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { storage: { persist } })
    srv.folders.set('Melanoma', new Map([['Question.md', { content: 'q', updatedAt: 1 }]]))
    const a = tab(); await a.load()
    expect(persist).toHaveBeenCalled()
    await a.upsert({ path: `${Q}/notes/late.md`, kind: 'note', title: 'late', content: 'typed just before closing' })
    await a.upsert({ path: 'Notes/browser-only.md', kind: 'note', title: 'b', content: 'outside Questions' })
    win.dispatchEvent(new Event('pagehide'))
    expect(srv.calls.some(c => c.method === 'PUT' && c.keepalive && c.url.endsWith('/notes/notes/late.md'))).toBe(true)
    await vi.waitFor(async () => expect((await keys()).length).toBeGreaterThan(0))
    const text = await (backupFile(a.notes).data as Blob).text()
    expect(text).toContain('Notes/browser-only.md'); expect(text).toContain('outside Questions'); expect(text).toContain('Questions/Melanoma/notes/late.md')
  })

  it('demo mode keeps the vault in memory only', async () => {
    vi.stubGlobal('location', { search: '?demo=1' })
    const win = new EventTarget(); vi.stubGlobal('window', win)
    srv.folders.set('Melanoma', new Map([['Question.md', { content: 'q', updatedAt: 1 }]]))
    const a = tab(); await a.load()
    await a.upsert({ path: `${Q}/notes/demo.md`, kind: 'note', title: 'd', content: 'demo note' })
    await a.rename(`${Q}/notes/demo.md`, `${Q}/notes/demo2.md`); await a.remove(`${Q}/notes/demo2.md`)
    await a.upsert({ path: `${Q}/notes/demo3.md`, kind: 'note', title: 'd', content: 'demo note 3' })
    await a.flush(); await a.saveNow(); win.dispatchEvent(new Event('pagehide'))
    await new Promise(r => setTimeout(r, 400))
    expect(srv.calls.filter(c => c.method !== 'GET')).toEqual([])
    expect(await keys()).toEqual([])
    expect(a.byPath(`${Q}/notes/demo3.md`)).toBeTruthy()
  })
})
