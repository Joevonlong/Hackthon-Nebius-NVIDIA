<script setup lang="ts">
// Owner: lane B. Tabs (Zettlr win-main/DocumentTabs.vue); kind 'note' → Markdown editor,
// 'preview' → discover/PaperPreview.vue, 'graph' → graph/GraphView.vue (lane C).
// CR-6 (F-63): back/forward buttons, ⌘[ / ⌘] and Alt+←/→, browser history binding, and per-tab restore of the
// centre pane's scroll position and focused item. GraphView and LibraryResults are kept alive so their DOM, zoom
// and local UI state survive a jump to a paper or note.
import { KeepAlive, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isNavKey, useUi, type Tab } from '../stores/ui'
import { useVault } from '../stores/vault'
import { noteName } from '../stores/vault-utils'
import PaperPreview from '../discover/PaperPreview.vue'
import GraphView from '../graph/GraphView.vue'
import LibraryResults from '../library/LibraryResults.vue'
import LibPaperView from '../library/LibPaperView.vue'
import MarkdownEditor from '../editor/MarkdownEditor.vue'
import Icon from './Icon.vue'

const ui = useUi()
const vault = useVault()
const saving = ref(false)
const center = ref<HTMLElement | null>(null)

function dot(t: Tab) {
  if (t.kind === 'graph') return 'var(--o2)'
  if (t.kind === 'preview') return t.ref.startsWith('lib:') ? 'var(--warn)' : 'var(--cand)'
  const k = vault.byPath(t.ref)?.kind
  return k === 'seed' ? 'var(--seed)' : k === 'lit' ? 'var(--cand)' : 'var(--line-2)'
}
function label(t: Tab) { return t.kind === 'note' ? noteName(t.ref) : t.title }
function onMiddle(e: MouseEvent, t: Tab) { if (e.button === 1) { e.preventDefault(); ui.close(t.id) } }
async function newNote() { const p = await vault.create('Untitled'); ui.openNote(p, noteName(p)) }
function openQuestion() { const q = vault.byPath('Notes/Question.md') || vault.notes[0]; if (q) ui.openNote(q.path, noteName(q.path)) }
const isLibResults = (t: Tab | null) => t?.kind === 'preview' && t.ref === 'lib:results'

// ---- scroll + focus memory for the centre pane ----
const FOCUSABLE = 'button, a[href], input, select, textarea, summary, [tabindex]'
const ITEM = 'tr, li, [role="row"], [data-nav-item]'
const lastFocus = new Map<string, Element>() // live element per tab (kept-alive views keep the same node)
let restoringScroll = false
let cancelRestore: (() => void) | null = null

function pathOf(el: Element): number[] | null {
  const root = center.value; if (!root || !root.contains(el)) return null
  const path: number[] = []
  for (let n: Element | null = el; n && n !== root; n = n.parentElement) path.unshift(Array.prototype.indexOf.call(n.parentElement!.children, n))
  return path
}
function byPath(path: number[]): Element | null {
  let n: Element | null = center.value
  for (const i of path) { n = n?.children[i] ?? null; if (!n) return null }
  return n
}
function remember(target: EventTarget | null) {
  const id = ui.activeTabId, t = target as Element | null
  if (!id || !t?.closest || !center.value?.contains(t)) return
  const el = t.closest(FOCUSABLE) ?? t.closest(ITEM); if (!el || el === center.value) return
  lastFocus.set(id, el)
  ui.saveView(id, { focusPath: pathOf(el) })
}
function onScroll() { if (!restoringScroll && ui.activeTabId && center.value) ui.saveView(ui.activeTabId, { scrollTop: center.value.scrollTop }) }

const STOP_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
/** Re-applies the scroll position for up to ~1 s while lazy content is still growing; any user input cancels. */
function restoreScroll(top: number): Promise<void> {
  cancelRestore?.()
  return new Promise(resolve => {
    const el = center.value; if (!el) { restoringScroll = false; return resolve() }
    let frames = 0, ok = 0, raf = 0
    const stop = () => { cancelAnimationFrame(raf); restoringScroll = false; cancelRestore = null; STOP_EVENTS.forEach(ev => el.removeEventListener(ev, stop)); resolve() }
    STOP_EVENTS.forEach(ev => el.addEventListener(ev, stop, { passive: true }))
    cancelRestore = stop
    const tick = () => {
      el.scrollTop = top
      ok = Math.abs(el.scrollTop - top) < 2 ? ok + 1 : 0
      if (ok >= 3 || ++frames > 60) return stop()
      raf = requestAnimationFrame(tick)
    }
    tick()
  })
}
function restoreFocus(id: string) {
  const vs = ui.viewState[id]
  let el: Element | null | undefined = vs?.focusPath ? byPath(vs.focusPath) : null
  if (!el || !el.isConnected) el = lastFocus.get(id)
  if (!el || !el.isConnected || !center.value?.contains(el)) return
  const h = el as HTMLElement
  if (!h.matches(FOCUSABLE)) h.setAttribute('tabindex', '-1')
  h.focus({ preventScroll: true })
  h.classList.add('nav-return'); setTimeout(() => h.classList.remove('nav-return'), 1600)
}
let lastSeq = 0
watch(() => [ui.activeTabId, ui.restoreSeq] as const, ([id, seq]) => {
  if (!id) return
  // Catch direct `ui.activeTabId = …` writes from other lanes: record them like a tab click.
  if (ui.currentEntry?.tab.id !== id && ui.activeTab) ui.track(ui.activeTab, { from: 'tabs' })
  const isRestore = seq !== lastSeq; lastSeq = seq
  const top = ui.viewState[id]?.scrollTop ?? 0
  restoringScroll = true
  void nextTick(async () => {
    await restoreScroll(top)
    // The graph restores its own selection (GraphView.applyView); generic focus restore is for lists and pages.
    if (isRestore && ui.restoring?.via !== 'chat' && ui.activeTab?.kind !== 'graph') restoreFocus(id)
  })
})

// ---- keyboard + browser ----
function onKey(e: KeyboardEvent) {
  const k = isNavKey(e); if (!k) return
  e.preventDefault()
  if (k === 'back') ui.back(); else ui.forward()
}
// Mouse back/forward buttons (button 3/4) walk the in-app stack too.
function onMouseNav(e: MouseEvent) { if (e.button === 3) { e.preventDefault(); ui.back() } else if (e.button === 4) { e.preventDefault(); ui.forward() } }
onMounted(() => {
  ui.bindBrowser()
  window.addEventListener('keydown', onKey)
  window.addEventListener('mouseup', onMouseNav)
})
onBeforeUnmount(() => { ui.unbindBrowser(); window.removeEventListener('keydown', onKey); window.removeEventListener('mouseup', onMouseNav); cancelRestore?.() })
</script>

<template>
  <section class="editor">
    <div class="tabs" role="tablist" v-if="ui.tabs.length">
      <div class="navb">
        <button type="button" class="nb" :disabled="!ui.canBack" :title="ui.backEntry ? 'Back to ' + ui.backEntry.tab.title + ' (⌘[ or Alt+←)' : 'Back'" aria-label="Back" @click="ui.back()">←</button>
        <button type="button" class="nb" :disabled="!ui.canForward" :title="ui.forwardEntry ? 'Forward to ' + ui.forwardEntry.tab.title + ' (⌘] or Alt+→)' : 'Forward'" aria-label="Forward" @click="ui.forward()">→</button>
      </div>
      <div v-for="t in ui.tabs" :key="t.id" class="tab" role="tab" :aria-selected="t.id === ui.activeTabId" tabindex="0"
           :title="t.kind === 'note' ? t.ref : t.title"
           @click="ui.activate(t.id)" @keydown.enter="ui.activate(t.id)" @mousedown="onMiddle($event, t)">
        <i :style="{ background: dot(t) }" />
        <span class="tl">{{ label(t) }}</span>
        <button class="tx" type="button" :aria-label="'Close ' + label(t)" @click.stop="ui.close(t.id)"><Icon name="close" /></button>
      </div>
      <span v-if="saving" class="saving">saving…</span>
    </div>

    <div ref="center" class="center" @scroll.passive="onScroll" @focusin="remember($event.target)" @pointerdown="remember($event.target)">
      <KeepAlive :include="['GraphView', 'LibraryResults']" :max="4">
        <GraphView v-if="ui.activeTab?.kind === 'graph'" />
        <LibraryResults v-else-if="isLibResults(ui.activeTab)" />
      </KeepAlive>
      <template v-if="ui.activeTab?.kind === 'graph' || isLibResults(ui.activeTab)" />
      <template v-else-if="ui.activeTab?.kind === 'note'">
        <MarkdownEditor v-if="vault.byPath(ui.activeTab.ref)" :key="ui.activeTab.ref" :path="ui.activeTab.ref" @saving="saving = $event" />
        <div v-else class="empty-state">
          <p>This note is no longer in the vault.</p>
          <button class="btn" type="button" @click="ui.close(ui.activeTab.id)">Close tab</button>
        </div>
      </template>
      <LibPaperView v-else-if="ui.activeTab?.kind === 'preview' && ui.activeTab.ref.startsWith('lib:paper:')" :key="ui.activeTab.ref" :paper-id="ui.activeTab.ref.slice('lib:paper:'.length)" />
      <PaperPreview v-else-if="ui.activeTab?.kind === 'preview'" :key="ui.activeTab.ref" :paper-id="ui.activeTab.ref" />
      <div v-else class="empty-state">
        <h2>No note open</h2>
        <p>Pick a note in the file tree, or start with your research question.</p>
        <div class="row">
          <button class="btn primary" type="button" :disabled="!vault.ready" @click="openQuestion">Open Question.md</button>
          <button class="btn" type="button" :disabled="!vault.ready" @click="newNote">New note</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.editor{display:flex;flex-direction:column;min-width:0;min-height:0;border-right:1px solid var(--line);background:var(--surface)}
.tabs{display:flex;border-bottom:1px solid var(--line);background:var(--surface-2);overflow-x:auto;flex:none;align-items:stretch;scrollbar-width:thin}
.navb{display:flex;align-items:center;gap:2px;padding:0 6px;border-right:1px solid var(--line);flex:none;position:sticky;left:0;background:var(--surface-2);z-index:1}
.nb{width:24px;height:24px;border:0;border-radius:5px;background:transparent;color:var(--fg);font:600 14px/1 var(--font-body);cursor:pointer}
.nb:hover:not(:disabled){background:var(--line)}
.nb:disabled{opacity:.3;cursor:default}
.nb:focus-visible{outline:2px solid var(--seed);outline-offset:1px}
.center :deep(.nav-return){outline:2px solid var(--seed);outline-offset:2px;border-radius:4px}
.tab{display:flex;align-items:center;gap:7px;border-right:1px solid var(--line);padding:0 6px 0 12px;height:34px;font-size:12px;color:var(--muted);cursor:pointer;white-space:nowrap;max-width:240px;flex:none;user-select:none}
.tab:hover{color:var(--fg)}
.tab[aria-selected="true"]{background:var(--surface);color:var(--fg);box-shadow:inset 0 -2px 0 var(--cand)}
.tab i{width:7px;height:7px;border-radius:50%;flex:none}
.tl{overflow:hidden;text-overflow:ellipsis}
.tx{border:0;background:transparent;color:inherit;opacity:.45;padding:3px;border-radius:4px;display:inline-flex;cursor:pointer}
.tx .ic{width:12px;height:12px}
.tab:hover .tx,.tab[aria-selected="true"] .tx{opacity:.8}
.tx:hover{background:var(--line);opacity:1}
.saving{margin-left:auto;align-self:center;padding:0 10px;font:500 10.5px var(--font-mono);color:var(--muted)}
.center{flex:1;min-height:0;display:flex;flex-direction:column;overflow:auto}
.empty-state{margin:auto;max-width:360px;text-align:center;color:var(--muted);padding:24px}
.empty-state h2{font:600 22px/1.25 var(--font-display);color:var(--fg);margin:0 0 6px}
.empty-state .row{display:flex;gap:8px;justify-content:center;margin-top:14px}
</style>
