<script setup lang="ts">
// Owner: lane B. Tabs (Zettlr win-main/DocumentTabs.vue); kind 'note' → Markdown editor,
// 'preview' → discover/PaperPreview.vue, 'graph' → graph/GraphView.vue (lane C).
import { ref } from 'vue'
import { useUi, type Tab } from '../stores/ui'
import { useVault } from '../stores/vault'
import { noteName } from '../stores/vault-utils'
import PaperPreview from '../discover/PaperPreview.vue'
import GraphView from '../graph/GraphView.vue'
import MarkdownEditor from '../editor/MarkdownEditor.vue'
import Icon from './Icon.vue'

const ui = useUi()
const vault = useVault()
const saving = ref(false)

function dot(t: Tab) {
  if (t.kind === 'graph') return 'var(--o2)'
  if (t.kind === 'preview') return 'var(--cand)'
  const k = vault.byPath(t.ref)?.kind
  return k === 'seed' ? 'var(--seed)' : k === 'lit' ? 'var(--cand)' : 'var(--line-2)'
}
function label(t: Tab) { return t.kind === 'note' ? noteName(t.ref) : t.title }
function onMiddle(e: MouseEvent, t: Tab) { if (e.button === 1) { e.preventDefault(); ui.close(t.id) } }
async function newNote() { const p = await vault.create('Untitled'); ui.openNote(p, noteName(p)) }
function openQuestion() { const q = vault.byPath('Notes/Question.md') || vault.notes[0]; if (q) ui.openNote(q.path, noteName(q.path)) }
</script>

<template>
  <section class="editor">
    <div class="tabs" role="tablist" v-if="ui.tabs.length">
      <div v-for="t in ui.tabs" :key="t.id" class="tab" role="tab" :aria-selected="t.id === ui.activeTabId" tabindex="0"
           :title="t.kind === 'note' ? t.ref : t.title"
           @click="ui.activeTabId = t.id" @keydown.enter="ui.activeTabId = t.id" @mousedown="onMiddle($event, t)">
        <i :style="{ background: dot(t) }" />
        <span class="tl">{{ label(t) }}</span>
        <button class="tx" type="button" :aria-label="'Close ' + label(t)" @click.stop="ui.close(t.id)"><Icon name="close" /></button>
      </div>
      <span v-if="saving" class="saving">saving…</span>
    </div>

    <div class="center">
      <template v-if="ui.activeTab?.kind === 'note'">
        <MarkdownEditor v-if="vault.byPath(ui.activeTab.ref)" :key="ui.activeTab.ref" :path="ui.activeTab.ref" @saving="saving = $event" />
        <div v-else class="empty-state">
          <p>This note is no longer in the vault.</p>
          <button class="btn" type="button" @click="ui.close(ui.activeTab.id)">Close tab</button>
        </div>
      </template>
      <PaperPreview v-else-if="ui.activeTab?.kind === 'preview'" :key="ui.activeTab.ref" :paper-id="ui.activeTab.ref" />
      <GraphView v-else-if="ui.activeTab?.kind === 'graph'" />
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
