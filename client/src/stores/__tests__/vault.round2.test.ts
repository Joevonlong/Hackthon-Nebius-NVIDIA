import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { clear } from 'idb-keyval'
import { onVaultExit, useVault } from '../vault'
import { fakeServer } from './vaultServer'

// Round-2 review of PR #34: conflict origins, conditional writes, exit flush, name cap.
const tab = () => { setActivePinia(createPinia()); return useVault() }
const Q = 'Questions/Melanoma'
const base = () => new Map([['Question.md', { content: 'q', updatedAt: 1 }], ['notes/x.md', { content: 'base', updatedAt: 1 }]])
const note = (path: string, content: string) => ({ path, kind: 'note' as const, title: path.split('/').pop()!.replace(/\.md$/, ''), content })
const allText = (v: ReturnType<typeof useVault>) => v.notes.map(n => n.content).join('\n')
let srv: ReturnType<typeof fakeServer>

beforeEach(async () => { await clear(); srv = fakeServer(); vi.stubGlobal('fetch', srv.fetchMock) })
afterEach(() => { vi.unstubAllGlobals() })

describe('round 2 (#13)', () => {
  it('1. "keep the other tab\'s copy" does not mark it synced: it still uploads when the server is back', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load(); await a.saveNow()
    const b = tab(); await b.load(); await b.saveNow()
    srv.state.online = false
    await new Promise(r => setTimeout(r, 3))
    await a.upsert(note(`${Q}/notes/x.md`, 'text from tab A')); await a.saveNow()
    await b.upsert(note(`${Q}/notes/x.md`, 'text from tab B')); await b.mergeFromDisk()
    expect(b.conflicts[`${Q}/notes/x.md`]?.origin).toBe('tab')
    await b.resolveConflict(`${Q}/notes/x.md`, 'server')
    expect(b.byPath(`${Q}/notes/x.md`)?.content).toBe('text from tab A')
    expect(b.unsynced).toBeGreaterThan(0)
    srv.state.online = true; await b.flush()
    expect(srv.folders.get('Melanoma')!.get('notes/x.md')?.content).toBe('text from tab A')
  })

  it('3. resolving a conflict never deletes text: the losing copy becomes a "(conflict …)" sibling note', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    srv.put('Melanoma', 'notes/x.md', 'changed on disk')
    await a.upsert(note(`${Q}/notes/x.md`, 'my edit')); await a.flush()
    expect(a.conflicts[`${Q}/notes/x.md`]?.origin).toBe('server')
    await a.resolveConflict(`${Q}/notes/x.md`, 'local'); await a.flush()
    const sibling = a.notes.find(n => /notes\/x \(conflict \d{4}-\d\d-\d\d \d\d-\d\d\)\.md$/.test(n.path))
    expect(sibling?.content).toBe('changed on disk')
    expect(srv.folders.get('Melanoma')!.get('notes/x.md')?.content).toBe('my edit')
    expect([...srv.folders.get('Melanoma')!.values()].some(f => f.content === 'changed on disk')).toBe(true) // the sibling reached the server too
    // and the other way round
    srv.put('Melanoma', 'notes/x.md', 'changed again'); await a.upsert(note(`${Q}/notes/x.md`, 'my 2nd edit')); await a.flush()
    await a.resolveConflict(`${Q}/notes/x.md`, 'server')
    expect(a.byPath(`${Q}/notes/x.md`)?.content).toBe('changed again')
    expect(allText(a)).toContain('my 2nd edit')
  })

  it('8. a change made on the server behind the browser\'s back is a conflict, not an overwrite; "Keep mine" uploads over the new base', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load() // x.md is synced with base "base"
    srv.put('Melanoma', 'notes/x.md', 'base + appended in another app')
    await a.upsert(note(`${Q}/notes/x.md`, 'base typed in the browser')); await a.flush()
    expect(srv.folders.get('Melanoma')!.get('notes/x.md')?.content).toBe('base + appended in another app')
    expect(a.conflicts[`${Q}/notes/x.md`]).toMatchObject({ server: 'base + appended in another app', origin: 'server' })
    await a.resolveConflict(`${Q}/notes/x.md`, 'local'); await a.flush()
    expect(srv.folders.get('Melanoma')!.get('notes/x.md')?.content).toBe('base typed in the browser')
    expect(a.notes.some(n => n.content === 'base + appended in another app')).toBe(true)
    expect(a.unsynced).toBe(0)
  })

  it('8. an external edit also shows up on window focus (refresh pulls)', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    srv.put('Melanoma', 'notes/x.md', 'edited elsewhere')
    await a.refresh()
    expect(a.byPath(`${Q}/notes/x.md`)?.content).toBe('edited elsewhere')
  })

  it('8. a delete is refused (kept) when the server copy changed since', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    srv.put('Melanoma', 'notes/x.md', 'edited elsewhere')
    await a.remove(`${Q}/notes/x.md`); await a.flush()
    expect(srv.folders.get('Melanoma')!.get('notes/x.md')?.content).toBe('edited elsewhere')
    await a.flush()
    expect(a.byPath(`${Q}/notes/x.md`)?.content).toBe('edited elsewhere') // pull brought it back
  })

  it('2. a conflict-free name stays within the server\'s 60-character limit', async () => {
    const long = 'B'.repeat(60)
    srv.folders.set('A', new Map([['Question.md', { content: 'question A', updatedAt: 1 }]]))
    const a = tab(); await a.load()
    srv.folders.set(long, new Map([['Question.md', { content: 'someone else', updatedAt: 1 }]]))
    expect(a.renameQuestion('A', long)).toBe(long)
    await a.flush()
    const names = [...srv.folders.keys()]
    expect(names.every(n => n.length <= 60)).toBe(true)
    expect(names).toHaveLength(2); expect(names).not.toContain('A')
    expect(srv.folders.get(long)!.get('Question.md')?.content).toBe('someone else')
  })

  it('5. the refused notes are listed by path', async () => {
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    srv.state.putStatus = 413
    await a.upsert(note(`${Q}/notes/big.md`, 'huge')); await a.flush()
    expect(a.refused).toEqual([`${Q}/notes/big.md`])
  })

  it('4. pagehide pushes the editor\'s pending text first and flushes once', async () => {
    const win = new EventTarget(); vi.stubGlobal('window', win)
    srv.folders.set('Melanoma', base())
    const a = tab(); await a.load()
    await a.upsert(note(`${Q}/notes/x.md`, 'saved text'))
    const off = onVaultExit(() => { void a.upsert(note(`${Q}/notes/x.md`, 'text still in the 400 ms timer')) })
    srv.calls.length = 0
    win.dispatchEvent(new Event('pagehide'))
    const puts = srv.calls.filter(c => c.method === 'PUT' && c.keepalive)
    expect(puts).toHaveLength(1)
    expect(String(srv.fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.keepalive)?.[1]?.body)).toContain('400 ms timer')
    off()
  })

  it('6. an editor save over a note that changed behind its back flags the other copy', async () => {
    const a = tab(); await a.load()
    await a.upsert(note('Notes/n.md', 'v1'))
    await a.upsert(note('Notes/n.md', 'from the other tab')) // arrives while the editor still holds "v1" + typing
    await a.saveEdit(note('Notes/n.md', 'v1 plus typing'), 'v1')
    expect(a.byPath('Notes/n.md')?.content).toBe('v1 plus typing')
    expect(a.conflicts['Notes/n.md']).toMatchObject({ server: 'from the other tab', origin: 'tab' })
  })
})
