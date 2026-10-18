// Shared UI state. Owner: captain (lanes B and C both read/write through these actions only).
// CR-6 (F-63): in-app navigation history. Every open*/activate pushes an entry; ui.back()/ui.forward() restore the
// tab plus the view state it had when the user left it (scroll, focused item, graph zoom/selection, chat scroll).
// Views write their live state with ui.saveView(key, patch) (key = tab id, or 'chat' / 'graph'); a restore copies
// the entry's snapshot back into viewState and bumps restoreSeq, so mounted (kept-alive) views can re-apply it.
import { defineStore } from 'pinia'

export type TabKind = 'note' | 'preview' | 'graph'
export interface Tab { id: string; kind: TabKind; title: string; ref: string } // ref = note path | paper id | 'graph'
export type SideTab = 'discover' | 'library' | 'related' | 'references'

/** Per-view state a Back restores. Views own the fields they use. */
export interface ViewState {
  scrollTop?: number
  /** Child-index path from the scroll container to the focused element (generic focus restore). */
  focusPath?: number[] | null
  zoom?: { x: number; y: number; k: number }
  selected?: string | null
  /** Chat: the citation the user clicked. */
  cite?: { turn: string; rank: number } | null
  [k: string]: unknown
}
/** Where a jump started; the restore of the entry it left uses it (e.g. 'chat' → refocus the citation, not the list). */
export type NavFrom = 'chat' | 'graph' | 'list' | 'tree' | 'tabs' | 'history' | (string & {})
export interface NavOpts {
  from?: NavFrom
  /** Free data for the view that owns the tab (e.g. W2: { libraryId }) — read it back from ui.restoring.entry.meta. */
  meta?: Record<string, unknown>
  /** Push a new entry even when the tab is already the current one (e.g. a different library in the same tab). */
  force?: boolean
}
export interface NavSnap { tab?: ViewState; chat?: ViewState; graph?: ViewState; via?: NavFrom }
export interface NavEntry { n: number; tab: Tab; meta?: Record<string, unknown>; snap?: NavSnap }
export interface NavRestore { seq: number; entry: NavEntry; via?: NavFrom; dir: 'back' | 'forward' }

export const NAV_MAX = 100
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
const hasWindow = () => typeof window !== 'undefined' && typeof history !== 'undefined'
let navSeq = 0
let browserSid = ''
let popHandler: ((e: PopStateEvent) => void) | null = null

export const useUi = defineStore('ui', {
  state: () => ({
    tabs: [] as Tab[],
    activeTabId: '' as string,
    sideTab: 'library' as SideTab, // D-23: Library replaces Discover in the UI
    selectedPaperId: null as string | null,
    theme: 'light' as 'light' | 'dark',
    lens: 0, // 0 = Evidence, 1 = Method
    nav: { stack: [] as NavEntry[], index: -1 },
    viewState: {} as Record<string, ViewState>,
    /** Bumped on every back/forward; `restoring` says what was restored and from where the user had left it. */
    restoreSeq: 0,
    restoring: null as NavRestore | null,
    browserBound: false,
  }),
  getters: {
    activeTab: s => s.tabs.find(t => t.id === s.activeTabId) || null,
    currentEntry: s => s.nav.stack[s.nav.index] ?? null,
    backEntry: s => s.nav.stack[s.nav.index - 1] ?? null,
    forwardEntry: s => s.nav.stack[s.nav.index + 1] ?? null,
    canBack: s => s.nav.index > 0,
    canForward: s => s.nav.index < s.nav.stack.length - 1,
  },
  actions: {
    open(tab: Tab, opts?: NavOpts) {
      if (!this.tabs.find(t => t.id === tab.id)) this.tabs.push(tab)
      this.activeTabId = tab.id
      this.track(tab, opts)
    },
    openNote(path: string, title: string, opts?: NavOpts) { this.open({ id: 'note:' + path, kind: 'note', title, ref: path }, opts) },
    openPreview(paperId: string, title: string, opts?: NavOpts) { this.selectedPaperId = paperId; this.open({ id: 'preview:' + paperId, kind: 'preview', title, ref: paperId }, opts) },
    /** Library mode (lane L3): results table and per-paper view reuse kind 'preview' with a 'lib:' ref. */
    openLibrary(opts?: NavOpts) { this.open({ id: 'preview:lib:results', kind: 'preview', title: 'Library', ref: 'lib:results' }, opts) },
    openLibPaper(paperId: string, title: string, opts?: NavOpts) { this.selectedPaperId = paperId; this.open({ id: 'preview:lib:paper:' + paperId, kind: 'preview', title, ref: 'lib:paper:' + paperId }, opts) },
    openGraph(opts?: NavOpts) { this.open({ id: 'graph', kind: 'graph', title: 'Graph', ref: 'graph' }, opts) },
    /** Generic jump for other lanes: open any tab and record it in the history. */
    navigate(tab: Tab, opts?: NavOpts) { this.open(tab, opts) },
    /** Switch to an already open tab (tab strip click) and record it. */
    activate(id: string, opts?: NavOpts) {
      const t = this.tabs.find(x => x.id === id); if (!t) return
      this.activeTabId = id
      this.track(t, { from: 'tabs', ...opts })
    },
    close(id: string) {
      const i = this.tabs.findIndex(t => t.id === id); if (i < 0) return
      this.tabs.splice(i, 1)
      if (this.activeTabId !== id) return
      this.activeTabId = this.tabs[Math.max(0, i - 1)]?.id || ''
      // Closing the current tab replaces its history entry with the tab that took its place (no push).
      const cur = this.nav.stack[this.nav.index], next = this.activeTab
      if (!cur || cur.tab.id !== id || !next) return
      const prev = this.nav.stack[this.nav.index - 1]
      if (prev && prev.tab.id === next.id) {
        // The neighbour is where the user came from: drop the closed entry (the browser steps back onto prev).
        this.nav.stack.splice(this.nav.index); this.nav.index--
        if (this.browserBound && hasWindow()) history.go(-1)
      } else { cur.tab = { ...next }; cur.snap = undefined; cur.meta = undefined; this.syncBrowser('replace') }
    },
    setTheme(t: 'light' | 'dark') { this.theme = t; document.documentElement.dataset.theme = t },

    // ---- navigation history (CR-6) ----
    saveView(key: string, patch: ViewState) { this.viewState[key] = { ...this.viewState[key], ...patch } },
    snapshot(tabId: string, via?: NavFrom): NavSnap {
      return { tab: clone(this.viewState[tabId]), chat: clone(this.viewState.chat), graph: tabId === 'graph' ? undefined : clone(this.viewState.graph), via }
    },
    /** Records `tab` as the current place. No-op when it already is (unless opts.force). */
    track(tab: Tab, opts?: NavOpts) {
      const cur = this.nav.stack[this.nav.index]
      if (cur && cur.tab.id === tab.id && !opts?.force) { cur.tab = { ...tab }; if (opts?.meta) cur.meta = opts.meta; return }
      if (cur) cur.snap = this.snapshot(cur.tab.id, opts?.from)
      this.nav.stack.splice(this.nav.index + 1)
      this.nav.stack.push({ n: ++navSeq, tab: { ...tab }, meta: opts?.meta })
      if (this.nav.stack.length > NAV_MAX) this.nav.stack.splice(0, this.nav.stack.length - NAV_MAX)
      this.nav.index = this.nav.stack.length - 1
      this.syncBrowser('push')
    },
    /** Moves to history entry `i`, restoring its tab (reopened if it was closed) and view state. */
    goTo(i: number): boolean {
      const e = this.nav.stack[i]
      if (!e || i === this.nav.index) return false
      const dir = i < this.nav.index ? 'back' : 'forward'
      const cur = this.nav.stack[this.nav.index]
      if (cur) cur.snap = { ...this.snapshot(cur.tab.id, 'history') }
      const s = e.snap
      if (s?.tab) this.viewState[e.tab.id] = clone(s.tab)
      if (s?.chat && s.via === 'chat') this.viewState.chat = clone(s.chat)
      if (s?.graph && e.tab.id !== 'graph') this.viewState.graph = { ...this.viewState.graph, ...clone(s.graph) }
      if (!this.tabs.find(t => t.id === e.tab.id)) this.tabs.push({ ...e.tab })
      if (e.tab.kind === 'preview') this.selectedPaperId = e.tab.ref.startsWith('lib:paper:') ? e.tab.ref.slice(10) : e.tab.ref.startsWith('lib:') ? this.selectedPaperId : e.tab.ref
      this.nav.index = i
      this.activeTabId = e.tab.id
      this.restoring = { seq: ++this.restoreSeq, entry: e, via: s?.via, dir }
      return true
    },
    back() { this.step(-1) },
    forward() { this.step(1) },
    step(d: -1 | 1) {
      const i = this.nav.index + d
      if (!this.nav.stack[i]) return
      // With the browser bound, walk the browser history too; popstate then calls goTo (keeps both stacks in step).
      if (this.browserBound && hasWindow() && (history.state as { ptNav?: number } | null)?.ptNav === this.nav.stack[this.nav.index]?.n) history.go(d)
      else if (this.goTo(i)) this.syncBrowser('replace')
    },
    // ---- browser history ----
    /** Mirrors the in-app stack into history.pushState so the browser Back/Forward buttons walk it. */
    bindBrowser() {
      if (!hasWindow() || this.browserBound) return
      browserSid = Math.random().toString(36).slice(2, 10)
      this.browserBound = true
      const cur = this.nav.stack[this.nav.index]
      // A guard entry under the first in-app entry: Back from the first place stays in the app.
      history.replaceState({ ...(history.state ?? {}), ptGuard: browserSid }, '')
      if (cur) history.pushState({ ptNav: cur.n, ptSid: browserSid }, '')
      popHandler = (ev: PopStateEvent) => {
        const st = ev.state as { ptNav?: number; ptSid?: string; ptGuard?: string } | null
        if (st?.ptGuard === browserSid) {
          // Browser Back from the first in-app place: stay in the app on the first entry (forward entries are dropped,
          // as the browser just dropped them too).
          const first = this.nav.stack[0]; if (!first) return
          history.pushState({ ptNav: first.n, ptSid: browserSid }, '')
          if (this.nav.index > 0) this.goTo(0)
          this.nav.stack.splice(1)
          return
        }
        if (!st || st.ptSid !== browserSid || st.ptNav == null) return
        const i = this.nav.stack.findIndex(x => x.n === st.ptNav)
        if (i >= 0) this.goTo(i)
      }
      window.addEventListener('popstate', popHandler)
    },
    unbindBrowser() {
      if (popHandler && hasWindow()) window.removeEventListener('popstate', popHandler)
      popHandler = null; this.browserBound = false
    },
    syncBrowser(kind: 'push' | 'replace') {
      if (!this.browserBound || !hasWindow()) return
      const cur = this.nav.stack[this.nav.index]; if (!cur) return
      const st = { ptNav: cur.n, ptSid: browserSid }
      if (kind === 'push') history.pushState(st, '')
      else history.replaceState(st, '')
    },
  },
})

type KeyLike = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'defaultPrevented' | 'target'>
/** Keystroke → history step. Only ⌘[ / Ctrl+[ / Alt+← (back) and ⌘] / Ctrl+] / Alt+→ (forward): never a bare key, and
 *  never while typing (input, textarea, select, contenteditable, CodeMirror), so typing can never navigate (Q-14/15). */
export function isNavKey(e: KeyLike): 'back' | 'forward' | null {
  if (e.defaultPrevented || e.isComposing || e.shiftKey) return null
  const el = e.target as (Partial<HTMLElement> & { closest?: (s: string) => Element | null }) | null
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? '') || el.closest?.('[contenteditable=""],[contenteditable="true"],.cm-editor'))) return null
  const mod = (e.metaKey || e.ctrlKey) && !e.altKey
  const alt = e.altKey && !e.metaKey && !e.ctrlKey
  if ((mod && e.key === '[') || (alt && e.key === 'ArrowLeft')) return 'back'
  if ((mod && e.key === ']') || (alt && e.key === 'ArrowRight')) return 'forward'
  return null
}
