import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { NAV_MAX, isNavKey, useUi } from './ui'

describe('isNavKey (Q-14/15)', () => {
  const ev = (key: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}, target: unknown = null) =>
    ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, defaultPrevented: false, target, ...mods }) as unknown as KeyboardEvent
  it('maps only modified keys', () => {
    expect(isNavKey(ev('[', { metaKey: true }))).toBe('back')
    expect(isNavKey(ev('[', { ctrlKey: true }))).toBe('back')
    expect(isNavKey(ev('ArrowLeft', { altKey: true }))).toBe('back')
    expect(isNavKey(ev(']', { metaKey: true }))).toBe('forward')
    expect(isNavKey(ev('ArrowRight', { altKey: true }))).toBe('forward')
    for (const k of ['[', ']', 'ArrowLeft', 'ArrowRight', 'g', 'l', 'Backspace']) expect(isNavKey(ev(k))).toBeNull()
    expect(isNavKey(ev('ArrowLeft', { metaKey: true }))).toBeNull()
  })
  it('never fires while typing', () => {
    const input = { tagName: 'INPUT', isContentEditable: false, closest: () => null }
    const cm = { tagName: 'DIV', isContentEditable: false, closest: (s: string) => (s.includes('.cm-editor') ? {} : null) }
    const ce = { tagName: 'DIV', isContentEditable: true, closest: () => null }
    for (const t of [input, cm, ce]) {
      expect(isNavKey(ev('[', { metaKey: true }, t))).toBeNull()
      expect(isNavKey(ev('ArrowLeft', { altKey: true }, t))).toBeNull()
    }
  })
})

describe('navigation history (CR-6)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('pushes one entry per open*, collapsing repeats of the current tab', () => {
    const ui = useUi()
    ui.openLibrary(); ui.openLibrary(); ui.openLibPaper('W1', 'Paper one'); ui.openGraph()
    expect(ui.nav.stack.map(e => e.tab.id)).toEqual(['preview:lib:results', 'preview:lib:paper:W1', 'graph'])
    expect(ui.backEntry?.tab.title).toBe('Paper one')
    expect(ui.canForward).toBe(false)
  })

  it('back restores the tab and the view state it had when the user left it', () => {
    const ui = useUi()
    ui.openLibrary()
    ui.saveView('preview:lib:results', { scrollTop: 640, focusPath: [3, 1] })
    ui.openLibPaper('W7', 'Seven', { from: 'list' })
    ui.saveView('preview:lib:results', { scrollTop: 0 }) // e.g. a clamp while the list was hidden
    ui.saveView('preview:lib:paper:W7', { scrollTop: 120 })
    ui.back()
    expect(ui.activeTabId).toBe('preview:lib:results')
    expect(ui.viewState['preview:lib:results']).toEqual({ scrollTop: 640, focusPath: [3, 1] })
    expect(ui.restoring).toMatchObject({ dir: 'back', via: 'list', seq: 1 })
    ui.forward()
    expect(ui.activeTabId).toBe('preview:lib:paper:W7')
    expect(ui.viewState['preview:lib:paper:W7'].scrollTop).toBe(120)
    expect(ui.selectedPaperId).toBe('W7')
  })

  it('keeps graph zoom and selection per entry', () => {
    const ui = useUi()
    ui.openGraph()
    ui.saveView('graph', { zoom: { x: 10, y: -4, k: 2.5 }, selected: 'lib:W3' })
    ui.openLibPaper('W3', 'Three', { from: 'graph' })
    ui.saveView('graph', { zoom: { x: 0, y: 0, k: 1 } }) // a fit transition after leaving
    ui.back()
    expect(ui.viewState.graph).toEqual({ zoom: { x: 10, y: -4, k: 2.5 }, selected: 'lib:W3' })
  })

  it('restores chat scroll only when the jump came from the chat', () => {
    const ui = useUi()
    ui.openLibrary()
    ui.saveView('chat', { scrollTop: 300, cite: { turn: 't2', rank: 4 } })
    ui.openLibPaper('W4', 'Four', { from: 'chat' })
    ui.saveView('chat', { scrollTop: 900, cite: null })
    ui.back()
    expect(ui.restoring?.via).toBe('chat')
    expect(ui.viewState.chat).toEqual({ scrollTop: 300, cite: { turn: 't2', rank: 4 } })
  })

  it('a new jump after Back drops the forward entries', () => {
    const ui = useUi()
    ui.openNote('a.md', 'a'); ui.openNote('b.md', 'b'); ui.openNote('c.md', 'c')
    ui.back(); ui.back()
    expect(ui.activeTabId).toBe('note:a.md')
    ui.openGraph()
    expect(ui.nav.stack.map(e => e.tab.id)).toEqual(['note:a.md', 'graph'])
    expect(ui.canForward).toBe(false)
  })

  it('tab strip activation is recorded; back reopens a tab that was closed', () => {
    const ui = useUi()
    ui.openNote('a.md', 'a'); ui.openLibrary(); ui.openGraph()
    ui.activate('note:a.md')
    expect(ui.nav.stack.length).toBe(4)
    ui.close('graph')
    expect(ui.tabs.find(t => t.id === 'graph')).toBeUndefined()
    ui.back()
    expect(ui.activeTabId).toBe('graph')
    expect(ui.tabs.find(t => t.id === 'graph')).toBeTruthy()
  })

  it('closing the current tab replaces its entry instead of pushing', () => {
    const ui = useUi()
    ui.openNote('a.md', 'a'); ui.openNote('b.md', 'b'); ui.openNote('c.md', 'c')
    ui.activate('note:a.md') // stack: a b c a
    ui.close('note:a.md') // neighbour is b (index 0 → tabs[0] = b)
    expect(ui.activeTabId).toBe('note:b.md')
    expect(ui.nav.stack.map(e => e.tab.id)).toEqual(['note:a.md', 'note:b.md', 'note:c.md', 'note:b.md'])
    ui.close('note:b.md') // neighbour c is the previous entry: the closed entry is dropped
    expect(ui.activeTabId).toBe('note:c.md')
    expect(ui.nav.stack.map(e => e.tab.id)).toEqual(['note:a.md', 'note:b.md', 'note:c.md'])
    expect(ui.nav.index).toBe(2)
  })

  it('force pushes the same tab again (e.g. another library from History) and keeps meta', () => {
    const ui = useUi()
    ui.openLibrary({ meta: { libraryId: 'L1' } })
    ui.openLibrary({ force: true, meta: { libraryId: 'L2' }, from: 'history' })
    expect(ui.nav.stack.map(e => e.meta?.libraryId)).toEqual(['L1', 'L2'])
    ui.back()
    expect(ui.restoring?.entry.meta?.libraryId).toBe('L1')
  })

  it('caps the stack at NAV_MAX and back/forward at the ends are no-ops', () => {
    const ui = useUi()
    ui.back(); ui.forward()
    for (let i = 0; i < NAV_MAX + 20; i++) ui.openNote(`n${i}.md`, `n${i}`)
    expect(ui.nav.stack.length).toBe(NAV_MAX)
    expect(ui.nav.index).toBe(NAV_MAX - 1)
    ui.forward()
    expect(ui.nav.index).toBe(NAV_MAX - 1)
    expect(ui.restoreSeq).toBe(0)
  })
})
