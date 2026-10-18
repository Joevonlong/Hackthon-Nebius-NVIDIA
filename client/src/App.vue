<script setup lang="ts">
// Workspace shell (Zettlr window chrome: toolbar · file tree | tabbed editor | sidebar · status bar). Owner: lane B.
import { computed, onMounted, ref } from 'vue'
import FileTree from './workspace/FileTree.vue'
import EditorArea from './workspace/EditorArea.vue'
import Sidebar from './workspace/Sidebar.vue'
import Icon from './workspace/Icon.vue'
import { useVault, QUESTION_PATH } from './stores/vault'
import { useUi } from './stores/ui'
import { useDiscovery } from './stores/discovery'
import { noteName, parseFrontMatter } from './stores/vault-utils'
import './styles/chrome.css'

const vault = useVault()
const ui = useUi()
const discovery = useDiscovery()
const showFiles = ref(true)
const showSidebar = ref(true)
const THEME_KEY = 'papertrail:theme'

function initialTheme(): 'light' | 'dark' {
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') return t } catch { /* storage blocked */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
function toggleTheme() {
  const t = ui.theme === 'dark' ? 'light' : 'dark'
  ui.setTheme(t)
  try { localStorage.setItem(THEME_KEY, t) } catch { /* ignore */ }
}
function discover() { ui.sideTab = 'discover'; showSidebar.value = true }

onMounted(async () => {
  ui.setTheme(initialTheme())
  if (window.innerWidth < 1100) showSidebar.value = window.innerWidth >= 1000
  await vault.load(discovery.question)
  if (!ui.tabs.length && vault.byPath(QUESTION_PATH)) ui.openNote(QUESTION_PATH, noteName(QUESTION_PATH))
})

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
  <div class="app" :class="{ 'no-files': !showFiles, 'no-side': !showSidebar }">
    <header class="toolbar">
      <span class="brand"><b>PaperTrail</b></span>
      <button class="tb" type="button" :aria-pressed="showFiles" title="Toggle file tree" @click="showFiles = !showFiles"><Icon name="files" />Files</button>
      <button class="tb" type="button" :aria-pressed="ui.activeTab?.kind === 'graph'" title="Open the graph view" @click="ui.openGraph()"><Icon name="graph" />Graph</button>
      <button class="tb" type="button" :aria-pressed="showSidebar && ui.sideTab === 'discover'" title="Discover papers from your seeds" @click="discover"><Icon name="discover" />Discover</button>
      <span class="title">{{ activeNote ? activeNote.path : 'Browser vault' }}</span>
      <button class="tb" type="button" :title="'Switch to ' + (ui.theme === 'dark' ? 'Brightfield' : 'Fluorescence')" @click="toggleTheme">
        <Icon :name="ui.theme === 'dark' ? 'moon' : 'sun'" />{{ themeName }}
      </button>
      <button class="tb" type="button" :aria-pressed="showSidebar" title="Toggle sidebar" @click="showSidebar = !showSidebar"><Icon name="sidebar" /></button>
    </header>
    <main class="panes">
      <FileTree v-show="showFiles" class="pane-files" />
      <EditorArea class="pane-editor" />
      <Sidebar v-show="showSidebar" class="pane-side" />
    </main>
    <footer class="statusbar">
      <span>{{ fmt(vault.notes.length) }} notes · {{ counts.seed }} seeds · {{ counts.lit }} discovered</span>
      <span>
        <template v-if="activeNote">{{ fmt(words) }} words · </template>
        <template v-if="discovery.status !== 'idle'">Run {{ discovery.status }} · {{ fmt(discovery.total) }} candidates · </template>
        {{ themeName }}
      </span>
    </footer>
  </div>
</template>

<style scoped>
.app{display:grid;grid-template-rows:auto minmax(0,1fr) auto;height:100%;min-width:0}
.toolbar{display:flex;align-items:center;gap:4px;padding:6px 10px;border-bottom:1px solid var(--line);background:var(--surface-2);min-width:0}
.brand{font:600 15px/1 var(--font-display);margin-right:10px;padding-left:4px;color:var(--fg)}
.title{margin-left:auto;margin-right:8px;font:500 11.5px var(--font-mono);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.panes{display:grid;grid-template-columns:220px minmax(0,1fr) 380px;min-height:0}
.no-files .panes{grid-template-columns:minmax(0,1fr) 380px}
.no-side .panes{grid-template-columns:220px minmax(0,1fr)}
.no-files.no-side .panes{grid-template-columns:minmax(0,1fr)}
.panes > *{min-height:0}
.statusbar{display:flex;justify-content:space-between;gap:10px;padding:5px 12px;border-top:1px solid var(--line);background:var(--surface-2);font:500 11px var(--font-mono);color:var(--muted);white-space:nowrap;overflow:hidden}
@media (max-width: 1180px){
  .panes{grid-template-columns:200px minmax(0,1fr) 320px}
  .no-files .panes{grid-template-columns:minmax(0,1fr) 320px}
  .no-side .panes{grid-template-columns:200px minmax(0,1fr)}
}
@media (max-width: 760px){
  .title{display:none}
}
</style>
