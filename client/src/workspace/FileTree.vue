<script setup lang="ts">
// Owner: lane B. Zettlr-style file tree (win-main/file-manager): folders by path prefix, colored note dots.
import { computed, reactive, ref } from 'vue'
import { useVault, type Note } from '../stores/vault'
import { useUi } from '../stores/ui'
import { useDiscovery } from '../stores/discovery'
import { noteName } from '../stores/vault-utils'
import { extractDois } from './importRefs'
import Icon from './Icon.vue'

const vault = useVault()
const ui = useUi()
const collapsed = reactive<Record<string, boolean>>({})
const menu = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const imported = ref<{ file: string; dois: string[] } | null>(null)
const importError = ref('')

const activePath = computed(() => ui.activeTab?.kind === 'note' ? ui.activeTab.ref : ui.activeTab?.kind === 'preview' ? vault.byPaper(ui.activeTab.ref)?.path : '')
const dot = (n: Note) => n.kind === 'seed' ? 'var(--seed)' : n.kind === 'lit' ? 'var(--cand)' : 'var(--line-2)'
const emptyText: Record<string, string> = {
  Seeds: 'Resolve seeds in Discover.',
  Discovered: 'Kept papers land here.',
  Notes: 'No notes yet.',
}

function open(n: Note) { ui.openNote(n.path, noteName(n.path)) }
async function newNote() {
  menu.value = false
  const path = await vault.create('Untitled')
  ui.openNote(path, noteName(path))
}
async function rename(n: Note) {
  const name = window.prompt('Rename note', noteName(n.path))?.trim()
  if (!name || name === noteName(n.path)) return
  const folder = n.path.includes('/') ? n.path.slice(0, n.path.lastIndexOf('/') + 1) : ''
  const wasOpen = ui.tabs.some(t => t.id === 'note:' + n.path)
  const old = n.path
  if (!(await vault.rename(old, folder + name.replace(/[\\/:*?"<>|]/g, '-')))) return window.alert('A note with that name exists.')
  if (wasOpen) { ui.close('note:' + old); ui.openNote(n.path, noteName(n.path)) }
}
async function remove(n: Note) {
  if (!window.confirm(`Delete “${noteName(n.path)}” from this browser vault?`)) return
  ui.close('note:' + n.path)
  await vault.remove(n.path)
}
function pickImport() { menu.value = false; importError.value = ''; fileInput.value?.click() }
async function onImport(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return
  try {
    const dois = extractDois(await f.text(), f.name)
    if (!dois.length) { importError.value = `No DOIs found in ${f.name}.`; imported.value = null; return }
    imported.value = { file: f.name, dois }
  } catch { importError.value = `Could not read ${f.name}.` }
  finally { (e.target as HTMLInputElement).value = '' }
}
function useAsSeeds() {
  if (!imported.value) return
  useDiscovery().seedInputs = [...imported.value.dois]
  ui.sideTab = 'discover'
  imported.value = null
}
</script>

<template>
  <nav class="files" aria-label="Vault files">
    <div class="files-head">
      <span class="files-title">Files</span>
      <button class="ibtn" type="button" title="New note" @click="newNote"><Icon name="plus" /></button>
      <div class="menu-wrap">
        <button class="ibtn" type="button" title="More" :aria-expanded="menu" @click="menu = !menu">⋯</button>
        <div v-if="menu" class="menu" role="menu" @mouseleave="menu = false">
          <button role="menuitem" type="button" @click="newNote"><Icon name="note" />New note</button>
          <button role="menuitem" type="button" @click="pickImport"><Icon name="upload" />Import .bib / CSL JSON</button>
        </div>
      </div>
      <input ref="fileInput" type="file" accept=".bib,.json,.txt,application/json" hidden @change="onImport">
    </div>

    <div v-if="!vault.ready" class="files-empty">Opening vault…</div>
    <template v-else>
      <div v-if="vault.error" class="files-err">{{ vault.error }}</div>
      <div v-for="f in vault.folders" :key="f.name" class="folder">
        <button class="dir" type="button" :aria-expanded="!collapsed[f.name]" @click="collapsed[f.name] = !collapsed[f.name]">
          <Icon name="chevron" class="chev" :class="{ open: !collapsed[f.name] }" />
          {{ f.name || 'Vault' }} <small>{{ f.notes.length }}</small>
        </button>
        <template v-if="!collapsed[f.name]">
          <div v-if="!f.notes.length" class="files-empty">{{ emptyText[f.name] || 'Empty' }}</div>
          <div v-for="n in f.notes" :key="n.path" class="file" :class="{ on: activePath === n.path }" role="button" tabindex="0"
               :title="n.path" @click="open(n)" @keydown.enter="open(n)" @dblclick.stop="rename(n)">
            <i :style="{ background: dot(n) }" />
            <span class="fname">{{ noteName(n.path) }}</span>
            <span class="facts">
              <button type="button" class="ibtn sm" title="Rename" @click.stop="rename(n)"><Icon name="edit" /></button>
              <button type="button" class="ibtn sm" title="Delete" @click.stop="remove(n)"><Icon name="trash" /></button>
            </span>
          </div>
        </template>
      </div>
    </template>

    <div v-if="importError" class="files-err">{{ importError }}</div>
    <div v-if="imported" class="import-box">
      <b>{{ imported.dois.length }} DOIs</b> from {{ imported.file }}
      <ul><li v-for="d in imported.dois.slice(0, 8)" :key="d">{{ d }}</li><li v-if="imported.dois.length > 8">+ {{ imported.dois.length - 8 }} more</li></ul>
      <div class="row">
        <button class="btn primary" type="button" @click="useAsSeeds">Use as seeds</button>
        <button class="btn" type="button" @click="imported = null">Cancel</button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.files{border-right:1px solid var(--line);padding:6px 8px 12px;font-size:12.5px;display:flex;flex-direction:column;gap:1px;background:var(--surface);overflow:auto;min-width:0}
.files-head{display:flex;align-items:center;gap:2px;padding:4px 4px 6px}
.files-title{font:500 10.5px/1 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-right:auto}
.menu-wrap{position:relative}
.menu{position:absolute;right:0;top:26px;z-index:20;background:var(--surface);border:1px solid var(--line-2);border-radius:8px;padding:4px;min-width:200px;box-shadow:0 8px 24px rgba(0,0,0,.14)}
.menu button{display:flex;gap:8px;align-items:center;width:100%;border:0;background:transparent;color:var(--fg);padding:7px 8px;border-radius:5px;font-size:12.5px;cursor:pointer;text-align:left}
.menu button:hover{background:var(--surface-2)}
.dir{display:flex;align-items:center;gap:4px;padding:5px 4px;font-weight:600;color:var(--fg);border:0;background:transparent;width:100%;cursor:pointer;font-size:12.5px;border-radius:5px}
.dir:hover{background:var(--surface-2)}
.dir small{margin-left:auto;font:500 10.5px var(--font-mono);color:var(--muted)}
.chev{width:12px;height:12px;transition:transform .15s;color:var(--muted)}
.chev.open{transform:rotate(90deg)}
.file{display:flex;align-items:center;gap:7px;padding:4px 4px 4px 22px;border-radius:5px;cursor:pointer;color:var(--fg);line-height:1.3;position:relative}
.file:hover{background:var(--surface-2)}
.file.on{background:var(--cand-soft)}
.file i{width:7px;height:7px;border-radius:50%;flex:none}
.fname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.facts{display:none;gap:0}
.file:hover .facts,.file:focus-within .facts{display:inline-flex}
.files-empty{padding:2px 6px 6px 22px;color:var(--muted);font-size:11.5px}
.files-err{margin:6px 4px;padding:6px 8px;border-radius:6px;background:var(--cand-soft);color:var(--fg);font-size:11.5px}
.import-box{margin:10px 4px 0;padding:8px 10px;border:1px solid var(--line-2);border-radius:8px;background:var(--surface-2);font-size:12px}
.import-box ul{margin:6px 0;padding-left:16px;font:11px/1.5 var(--font-mono);color:var(--muted);overflow-wrap:anywhere}
.import-box .row{display:flex;gap:6px}
</style>
