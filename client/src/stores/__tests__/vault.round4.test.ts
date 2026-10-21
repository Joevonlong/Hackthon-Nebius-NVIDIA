import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { clear } from 'idb-keyval'
import { useVault } from '../vault'
import { fakeServer } from './vaultServer'

const tab = () => { setActivePinia(createPinia()); return useVault() }
const Q = 'Questions/Melanoma'
const base = () => new Map([['Question.md', { content: 'q', updatedAt: 1 }], ['notes/x.md', { content: 'base', updatedAt: 1 }]])
const note = (path: string, content: string) => ({ path, kind: 'note' as const, title: path.split('/').pop()!.replace(/\.md$/, ''), content })
let srv: ReturnType<typeof fakeServer>

beforeEach(async () => { await clear(); srv = fakeServer(); vi.stubGlobal('fetch', srv.fetchMock) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('round 4 (#13)', () => {
  it('a hung request times out: it releases `running`, reports syncError, and the next flush runs', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    // the next request hangs until its timeout signal fires
    const timeout = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockImplementationOnce(() => timeout.signal)
    vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => new Promise((_, rej) => init!.signal!.addEventListener('abort', () => rej(new DOMException('timed out', 'TimeoutError'))))))
    const refreshing = a.refresh()
    timeout.abort()
    await refreshing
    expect(a.syncError).not.toBe('')
    vi.stubGlobal('fetch', srv.fetchMock)
    await a.upsert(note(`${Q}/notes/x.md`, 'typed after the hang'))
    await a.flush()
    expect(srv.folders.get('Melanoma')!.get('notes/x.md')?.content).toBe('typed after the hang')
  })

  it('a 412 whose server copy equals ours (a keepalive PUT already landed) marks the note synced, not conflicted', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    await a.upsert(note(`${Q}/notes/x.md`, 'landed already'))
    srv.put('Melanoma', 'notes/x.md', 'landed already') // the keepalive PUT got there first
    await a.flush()
    expect(a.conflicts[`${Q}/notes/x.md`]).toBeUndefined()
    expect(a.unsynced).toBe(0)
  })
})
