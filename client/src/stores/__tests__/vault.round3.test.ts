import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { clear } from 'idb-keyval'
import { useVault } from '../vault'
import { fakeServer } from './vaultServer'

// Round-3 review of PR #34: pull vs flush interleaving, deletes queued before the first PUT lands.
const tab = () => { setActivePinia(createPinia()); return useVault() }
const Q = 'Questions/Melanoma'
const base = () => new Map([['Question.md', { content: 'q', updatedAt: 1 }], ['notes/x.md', { content: 'base', updatedAt: 1 }]])
const note = (path: string, content: string) => ({ path, kind: 'note' as const, title: path.split('/').pop()!.replace(/\.md$/, ''), content })
let srv: ReturnType<typeof fakeServer>
const gate = () => { let release!: () => void; const p = new Promise<void>(r => { release = r }); return { p, release } }

beforeEach(async () => { await clear(); srv = fakeServer(); vi.stubGlobal('fetch', srv.fetchMock) })
afterEach(() => { vi.unstubAllGlobals() })

describe('round 3 (#13)', () => {
  it('1. a focus refresh that overlaps a flush never reverts the editor to the older server text', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    await a.upsert(note(`${Q}/notes/x.md`, 'my new text'))
    const g = gate(); srv.state.listGate = g.p
    const refreshing = a.refresh() // GETs "base" and waits
    await vi.waitFor(() => expect(srv.state.listGate).toBeNull())
    const flushing = a.flush() // must not interleave: the PUT would land before the stale list is applied
    g.release(); await refreshing; await flushing
    await a.flush()
    expect(a.byPath(`${Q}/notes/x.md`)?.content).toBe('my new text')
    expect(srv.folders.get('Melanoma')!.get('notes/x.md')?.content).toBe('my new text')
  })

  it('1. pull ignores server data for a note that was saved or changed while the GET was in flight', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    const g = gate(); srv.state.listGate = g.p
    const pulling = a.pull()
    await vi.waitFor(() => expect(srv.state.listGate).toBeNull())
    await a.upsert(note(`${Q}/notes/x.md`, 'typed meanwhile')) // base on the server, local was "base" a moment ago
    g.release(); await pulling
    expect(a.byPath(`${Q}/notes/x.md`)?.content).toBe('typed meanwhile')
  })

  it('2. deleting a never-synced note while its first PUT is in flight still deletes it on the server', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    await a.upsert(note(`${Q}/notes/new.md`, 'first text'))
    const g = gate(); srv.state.gate = g.p
    const f = a.flush()
    await vi.waitFor(() => expect(srv.state.gate).toBeNull())
    await a.remove(`${Q}/notes/new.md`)
    g.release(); await f; await a.flush()
    expect(srv.folders.get('Melanoma')!.has('notes/new.md')).toBe(false)
    const b = tab(); await b.load()
    expect(b.byPath(`${Q}/notes/new.md`)).toBeUndefined()
  })

  it('2. renaming a never-synced note while its first PUT is in flight leaves no duplicate', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    await a.upsert(note(`${Q}/notes/a.md`, 'first text'))
    const g = gate(); srv.state.gate = g.p
    const f = a.flush()
    await vi.waitFor(() => expect(srv.state.gate).toBeNull())
    await a.rename(`${Q}/notes/a.md`, `${Q}/notes/b.md`)
    g.release(); await f; await a.flush()
    const files = srv.folders.get('Melanoma')!
    expect(files.has('notes/a.md')).toBe(false); expect(files.get('notes/b.md')?.content).toBe('first text')
  })
})
