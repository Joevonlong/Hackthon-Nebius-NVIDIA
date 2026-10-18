<script setup lang="ts">
// Workspace shell (Zettlr window chrome: toolbar · file tree | tabbed editor | sidebar · status bar). Owner: lane B.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FileTree from './workspace/FileTree.vue'
import EditorArea from './workspace/EditorArea.vue'
import Sidebar from './workspace/Sidebar.vue'
import Icon from './workspace/Icon.vue'
import ChatPanel from './chat/ChatPanel.vue'
import { useVault, QUESTION_PATH } from './stores/vault'
import { useUi } from './stores/ui'
import { useDiscovery } from './stores/discovery'
import { useLibrary } from './stores/library'
import { noteName, parseFrontMatter } from './stores/vault-utils'
import './styles/chrome.css'

const vault = useVault()
const ui = useUi()
const discovery = useDiscovery()
const library = useLibrary()
const THEME_KEY = 'papertrail:theme'

// Responsive shell: the editor keeps >= EDITOR_MIN px. As the window narrows, the file tree stops docking first
// (it opens as an overlay drawer from the left), then the sidebar (overlay drawer from the right).
const EDITOR_MIN = 420
const vw = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const filesW = computed(() => vw.value < 1180 ? 200 : 220)
const sideW = computed(() => vw.value < 1180 ? 340 : 380)
// D-26: the chat column sits on the far right (CHAT_W docked from CHAT_MIN px; below that a CHAT_RAIL icon opens it as an overlay).
const CHAT_W = 340, CHAT_RAIL = 44, CHAT_MIN = 1200
const chatDock = computed(() => vw.value >= CHAT_MIN)
const showChat = ref(chatDock.value)
const chatColW = computed(() => (chatDock.value && showChat.value ? CHAT_W : CHAT_RAIL))
const chatOverlay = computed(() => showChat.value && !chatDock.value)
const filesDock = computed(() => vw.value >= filesW.value + sideW.value + chatColW.value + EDITOR_MIN)
const sideDock = computed(() => vw.value >= sideW.value + chatColW.value + EDITOR_MIN)
const showFiles = ref(filesDock.value)
const showSidebar = ref(sideDock.value)
const filesOverlay = computed(() => showFiles.value && !filesDock.value)
const sideOverlay = computed(() => showSidebar.value && !sideDock.value)
const cols = computed(() => [
  showFiles.value && filesDock.value ? filesW.value + 'px' : '',
  'minmax(0,1fr)',
  showSidebar.value && sideDock.value ? sideW.value + 'px' : '',
  chatColW.value + 'px',
].filter(Boolean).join(' '))
watch(chatDock, d => { showChat.value = d })
function toggleChat() { showChat.value = !showChat.value; if (chatOverlay.value) { if (filesOverlay.value) showFiles.value = false; if (sideOverlay.value) showSidebar.value = false } }
// Crossing a breakpoint resets that pane to the default for the new width (docked = shown, overlay = closed).
watch(filesDock, d => { showFiles.value = d })
watch(sideDock, d => { showSidebar.value = d })
function closeOverlays() { if (filesOverlay.value) showFiles.value = false; if (sideOverlay.value) showSidebar.value = false; if (chatOverlay.value) showChat.value = false }
function toggleFiles() { showFiles.value = !showFiles.value; if (showFiles.value && !filesDock.value && sideOverlay.value) showSidebar.value = false }
function toggleSidebar() { showSidebar.value = !showSidebar.value; if (showSidebar.value && !sideDock.value && filesOverlay.value) showFiles.value = false }
const onResize = () => { vw.value = window.innerWidth }
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOverlays() }

function initialTheme(): 'light' | 'dark' {
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') return t } catch { /* storage blocked */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
function toggleTheme() {
  const t = ui.theme === 'dark' ? 'light' : 'dark'
  ui.setTheme(t)
  try { localStorage.setItem(THEME_KEY, t) } catch { /* ignore */ }
}
function discover() {
  ui.sideTab = 'library'; showSidebar.value = true // D-23: the toolbar's Discover button opens Library
  if (!filesDock.value) showFiles.value = false
}

onMounted(async () => {
  ui.setTheme(initialTheme())
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKey)
  await vault.load() // CR-9: no sample question; an empty vault shows "Create your first research question"
  const q = vault.currentQuestion; if (!ui.tabs.length && q) ui.openNote(q.path, noteName(q.path))
})
onBeforeUnmount(() => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey) })
// Opening a note from the file-tree drawer closes the drawer so the editor is visible.
watch(() => ui.activeTabId, () => { if (filesOverlay.value) showFiles.value = false })

const activeNote = computed(() => ui.activeTab?.kind === 'note' ? vault.byPath(ui.activeTab.ref) : undefined)
const words = computed(() => {
  const body = activeNote.value ? parseFrontMatter(activeNote.value.content).body : ''
  return (body.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length
})
const counts = computed(() => ({
  seed: vault.notes.filter(n => n.kind === 'seed').length,
  lit: vault.notes.filter(n => n.kind === 'lit').length,
}))
const themeName = computed(() => ui.theme === 'dark' ? 'Fluorescence' : 'Brightfield')
const fmt = (n: number) => n.toLocaleString('en-US')
</script>

<template>
  <div class="app">
    <header class="toolbar">
      <span class="brand"><b>PaperTrail</b></span>
      <button class="tb" type="button" :aria-pressed="showFiles" title="Toggle file tree" @click="toggleFiles"><Icon name="files" /><span class="lbl">Files</span></button>
      <button class="tb" type="button" :aria-pressed="ui.activeTab?.kind === 'graph'" title="Open the graph view" @click="ui.openGraph()"><Icon name="graph" /><span class="lbl">Graph</span></button>
      <button class="tb" type="button" :aria-pressed="showSidebar && ui.sideTab === 'library'" title="Build a scored library from the whole vault" @click="discover"><Icon name="discover" />Library</button>
      <span class="title">{{ activeNote ? activeNote.path : 'Browser vault' }}</span>
      <button class="tb theme" type="button" :title="'Switch to ' + (ui.theme === 'dark' ? 'Brightfield' : 'Fluorescence')" @click="toggleTheme">
        <Icon :name="ui.theme === 'dark' ? 'moon' : 'sun'" /><span class="lbl">{{ themeName }}</span>
      </button>
      <button class="tb" type="button" :aria-pressed="showSidebar" title="Toggle sidebar" aria-label="Toggle sidebar" @click="toggleSidebar"><Icon name="sidebar" /></button>
    </header>
    <main class="panes" :style="{ gridTemplateColumns: cols, '--files-w': filesW + 'px', '--side-w': sideW + 'px' }">
      <FileTree v-show="showFiles" class="pane-files" :class="{ overlay: !filesDock }" />
      <EditorArea class="pane-editor" />
      <Sidebar v-show="showSidebar" class="pane-side" :class="{ overlay: !sideDock }" />
      <ChatPanel class="pane-chat" :collapsed="!chatDock || !showChat" @toggle="toggleChat" />
      <ChatPanel v-if="chatOverlay" class="pane-chat overlay" @toggle="toggleChat" />
      <div v-if="filesOverlay || sideOverlay || chatOverlay" class="scrim" aria-hidden="true" @click="closeOverlays" />
    </main>
    <footer class="statusbar">
      <span>{{ fmt(vault.notes.length) }} notes · {{ counts.seed }} seeds · {{ counts.lit }} discovered</span>
      <span>
        <template v-if="activeNote">{{ fmt(words) }} words · </template>
        <!-- Q2-13: the results header's numbers and wording (scored = found minus excluded) -->
        <template v-if="library.status === 'done'">Library · {{ fmt(library.passedCount) }} pass of {{ fmt(library.eligibleCount) }} scored ({{ fmt(library.excludedCount) }} excluded of {{ fmt(library.foundCount) }} found) · </template>
        <template v-else-if="library.status !== 'idle'">Library {{ library.status }} · </template>
        {{ themeName }}
      </span>
    </footer>
  </div>
</template>

<style scoped>
.app{display:grid;grid-template-rows:auto minmax(0,1fr) auto;height:100%;min-width:0;overflow:hidden}
.toolbar{display:flex;align-items:center;gap:4px;padding:6px 10px;border-bottom:1px solid var(--line);background:var(--surface-2);min-width:0}
.brand{font:600 15px/1 var(--font-display);margin-right:10px;padding-left:4px;color:var(--fg);white-space:nowrap}
.title{margin-left:auto;margin-right:8px;font:500 11.5px var(--font-mono);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.panes{position:relative;display:grid;min-height:0;min-width:0;overflow:hidden}
.panes > *{min-height:0}
.pane-files.overlay,.pane-side.overlay{position:absolute;top:0;bottom:0;z-index:20;box-shadow:0 10px 40px color-mix(in srgb,var(--fg) 22%,transparent)}
.pane-files.overlay{left:0;width:min(var(--files-w),calc(100vw - 48px))}
.pane-side.overlay{right:0;width:min(var(--side-w),calc(100vw - 48px));border-left:1px solid var(--line)}
.pane-side.overlay{right:44px}
.pane-chat.overlay{position:absolute;top:0;bottom:0;right:0;z-index:21;width:min(340px,calc(100vw - 48px));box-shadow:0 10px 40px color-mix(in srgb,var(--fg) 22%,transparent)}
.scrim{position:absolute;inset:0;z-index:10;background:color-mix(in srgb,var(--fg) 18%,transparent)}
.statusbar{display:flex;justify-content:space-between;gap:10px;padding:5px 12px;border-top:1px solid var(--line);background:var(--surface-2);font:500 11px var(--font-mono);color:var(--muted);white-space:nowrap;overflow:hidden}
.statusbar span{overflow:hidden;text-overflow:ellipsis}
@media (max-width: 900px){ .title{display:none} .theme{margin-left:auto} }
@media (max-width: 640px){ .tb .lbl{display:none} .brand{margin-right:4px} }
</style>
