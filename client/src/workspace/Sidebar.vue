<script setup lang="ts">
// Owner: lane B. Zettlr's MainSidebar tabs: Library (lane L3's LibraryPanel; replaced Discover per D-23), Related (RelatedFilesTab), References (ReferencesTab).
import { computed, ref } from 'vue'
import { useUi, type SideTab } from '../stores/ui'
import { useVault, type Note } from '../stores/vault'
import { useLibrary } from '../stores/library'
import { backlinks, extractLinks, noteName, resolveLink } from '../stores/vault-utils'
import LibraryPanel from '../library/LibraryPanel.vue'
import VaultSync from './VaultSync.vue'
import { backupFile, bibliography, download, exportFile, questionScope, saveExport, type ExportFormat } from './export'

const ui = useUi()
const vault = useVault()
const tabs: { id: SideTab; label: string }[] = [
  { id: 'library', label: 'Library' }, { id: 'related', label: 'Related' }, { id: 'references', label: 'References' },
]

const active = computed<Note | undefined>(() => {
  const t = ui.activeTab
  if (t?.kind === 'note') return vault.byPath(t.ref)
  if (t?.kind === 'preview') return vault.byPaper(t.ref)
  return undefined
})
const outgoing = computed(() => {
  if (!active.value) return []
  const seen = new Set<string>()
  return extractLinks(active.value.content).filter(t => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .map(target => ({ target, note: resolveLink(target, vault.notes) }))
})
const back = computed(() => active.value ? backlinks(active.value, vault.notes) : [])
const linkedSeeds = computed(() => outgoing.value.filter(o => o.note?.kind === 'seed').map(o => o.note!))
// Q2-4: the References tab (list + exports) covers the ACTIVE question only: its seeds, its notes (library papers added
// to the vault land in its notes/) and older vault notes of papers in its loaded library.
const lib = useLibrary()
const scoped = computed(() => questionScope(vault.notes, vault.current,
  lib.questionId === vault.current ? (lib.allPapers.length ? lib.allPapers : lib.streamed).map(p => p.paper.id) : []))
const refs = computed(() => bibliography(scoped.value))
const exportMsg = ref<{ ok: boolean; text: string } | null>(null)
const exporting = ref(false)
async function doExport(format: ExportFormat) {
  const q = vault.current
  const f = exportFile(format, scoped.value, q)
  download(f.name, f.data, f.type)
  if (!q) return
  exporting.value = true
  const r = await saveExport(q, f)
  exporting.value = false
  exportMsg.value = r.path ? { ok: true, text: `Saved to ${r.path}` } : { ok: false, text: r.error || 'Not saved.' }
}
function backupVault() { const f = backupFile(vault.notes); download(f.name, f.data, f.type) }
const dot = (n?: Note) => n?.kind === 'seed' ? 'var(--seed)' : n?.kind === 'lit' ? 'var(--cand)' : 'var(--line-2)'
const open = (n: Note) => ui.openNote(n.path, noteName(n.path))
async function create(target: string) { const p = await vault.create(target.replace(/[\\/:*?"<>|]/g, '-')); ui.openNote(p, noteName(p)) }
function openRef(path: string) { const n = vault.byPath(path); if (n) open(n) }
</script>

<template>
  <aside class="sidebar">
    <div class="sidetabs" role="tablist">
      <button v-for="t in tabs" :key="t.id" type="button" role="tab" :aria-selected="ui.sideTab === t.id || (t.id === 'library' && ui.sideTab === 'discover')" @click="ui.sideTab = t.id">{{ t.label }}</button>
    </div>
    <VaultSync />
    <div class="side-body">
      <LibraryPanel v-if="ui.sideTab === 'library' || ui.sideTab === 'discover'" />

      <div v-else-if="ui.sideTab === 'related'" class="side">
        <template v-if="active">
          <div class="ctx"><i :style="{ background: dot(active) }" />{{ noteName(active.path) }}</div>
          <section v-if="active.kind === 'lit'">
            <h4>Seeds it links <small>{{ linkedSeeds.length }}</small></h4>
            <p v-if="!linkedSeeds.length" class="muted">No links to seed notes in this note.</p>
            <button v-for="n in linkedSeeds" :key="n.path" class="rel" type="button" @click="open(n)"><i :style="{ background: dot(n) }" />{{ noteName(n.path) }}</button>
          </section>
          <section>
            <h4>Backlinks <small>{{ back.length }}</small></h4>
            <p v-if="!back.length" class="muted">No other note links here yet. Link it with [[{{ noteName(active.path) }}]].</p>
            <button v-for="n in back" :key="n.path" class="rel" type="button" @click="open(n)"><i :style="{ background: dot(n) }" />{{ noteName(n.path) }}</button>
          </section>
          <section>
            <h4>Outgoing links <small>{{ outgoing.length }}</small></h4>
            <p v-if="!outgoing.length" class="muted">Type [[ in the editor to link a note.</p>
            <template v-for="o in outgoing" :key="o.target">
              <button v-if="o.note" class="rel" type="button" @click="open(o.note)"><i :style="{ background: dot(o.note) }" />{{ noteName(o.note.path) }}</button>
              <button v-else class="rel missing" type="button" title="Create this note" @click="create(o.target)"><i />{{ o.target }} <small>create</small></button>
            </template>
          </section>
        </template>
        <p v-else class="muted">Open a note to see its backlinks and outgoing links.</p>
      </div>

      <div v-else class="side">
        <section>
          <h4>Bibliography <small>{{ refs.length }}</small></h4>
          <p class="muted">{{ vault.current ? `Seeds and kept papers of “${vault.current}” only.` : 'Select a research question in the Library tab.' }}</p>
          <p v-if="!refs.length" class="muted">No seed or literature notes in this question yet. Seeds and papers you add to the vault appear here with their metadata.</p>
          <ol class="bib">
            <li v-for="r in refs" :key="r.path" @click="openRef(r.path)">
              <i :style="{ background: r.kind === 'seed' ? 'var(--seed)' : 'var(--cand)' }" />
              <div>
                <span class="au">{{ r.authors.length ? (r.authors.length > 2 ? r.authors[0] + ' et al.' : r.authors.join(' & ')) : 'Unknown author' }}</span>
                <span v-if="r.year" class="yr"> ({{ r.year }})</span>.
                <span class="ti">{{ r.title }}</span><template v-if="r.venue">. <em>{{ r.venue }}</em></template>
                <a v-if="r.doi" class="doi" :href="'https://doi.org/' + r.doi" target="_blank" rel="noopener" @click.stop>doi:{{ r.doi }}</a>
              </div>
            </li>
          </ol>
        </section>
        <section class="exports">
          <h4>Export</h4>
          <div class="row">
            <button class="btn" type="button" :disabled="!refs.length || exporting" @click="doExport('bib')">BibTeX</button>
            <button class="btn" type="button" :disabled="!refs.length || exporting" @click="doExport('csl')">CSL JSON</button>
            <button class="btn" type="button" :disabled="!scoped.length || exporting" @click="doExport('zip')">Markdown .zip</button>
          </div>
          <p class="muted">Downloads the file and saves a copy in {{ vault.current ? vault.current + '/exports/' : 'the question folder' }}.</p>
          <p v-if="exportMsg" class="muted" :class="{ bad: !exportMsg.ok }" role="status">{{ exportMsg.text }}</p>
          <div class="row">
            <button class="btn" type="button" :disabled="!vault.notes.length" @click="backupVault">Back up whole vault</button>
          </div>
          <p class="muted">Downloads a .zip of all {{ vault.notes.length }} notes in this browser, including notes outside Questions/.</p>
        </section>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--surface)}
.sidetabs{display:flex;border-bottom:1px solid var(--line);background:var(--surface-2);flex:none}
.sidetabs button{flex:1;border:0;background:transparent;padding:0 6px;height:34px;font-size:12px;color:var(--muted);cursor:pointer}
.sidetabs button:hover{color:var(--fg)}
.sidetabs button[aria-selected="true"]{background:var(--surface);color:var(--fg);box-shadow:inset 0 -2px 0 var(--cand)}
.side-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}
.side{padding:12px;display:flex;flex-direction:column;gap:16px}
section{display:flex;flex-direction:column;gap:3px}
h4{margin:0 0 4px;font:500 10.5px/1 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);display:flex;gap:6px}
h4 small{margin-left:auto;font-size:10.5px;letter-spacing:0}
.muted{color:var(--muted);font-size:12px;margin:0}
.muted.bad{color:var(--warn)}
.ctx{display:flex;align-items:center;gap:8px;font:600 15px/1.3 var(--font-display)}
.ctx i,.rel i,.bib i{width:7px;height:7px;border-radius:50%;flex:none;display:inline-block}
.rel{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:6px;padding:6px 8px;font-size:12.5px;cursor:pointer}
.rel:hover{border-color:var(--line-2)}
.rel.missing{color:var(--muted);border-style:dashed}
.rel.missing i{background:transparent;border:1px dashed var(--line-2)}
.rel small{margin-left:auto;font:500 10.5px var(--font-mono)}
.bib{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.bib li{display:flex;gap:8px;align-items:baseline;font-size:12.5px;line-height:1.45;padding:6px 8px;border:1px solid var(--line);border-radius:6px;cursor:pointer}
.bib li:hover{border-color:var(--line-2)}
.bib .au{font-weight:600}
.bib em{color:var(--muted)}
.doi{display:block;font:11px var(--font-mono);color:var(--seed);text-decoration:none;overflow-wrap:anywhere;margin-top:2px}
.row{display:flex;gap:6px;flex-wrap:wrap}
</style>
