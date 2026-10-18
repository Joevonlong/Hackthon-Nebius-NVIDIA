<script setup lang="ts">
// Library paper detail (lane L3): header, labels, score with every component, relations, the per-paper JSON
// (GET /api/library/:id/papers/:paperId) as a collapsible tree, and "Add to vault".
import { computed, onMounted, ref } from 'vue'
import { useLibrary } from '../stores/library'
import { useVault } from '../stores/vault'
import { useUi } from '../stores/ui'
import { noteName } from '../stores/vault-utils'
import { doiUrl } from '../discover/literatureNote'
import { buildLibraryNote } from './libraryNote'
import { f2 } from './score'
import Verdict from './Verdict.vue'
import WhyScore from './WhyScore.vue'
import LibLabels from './LibLabels.vue'
import JsonTree from './JsonTree.vue'

const props = defineProps<{ paperId: string }>()
const lib = useLibrary(), vault = useVault(), ui = useUi()
const lp = computed(() => lib.byId(props.paperId))
const json = ref<unknown>(null)
const jsonErr = ref<string | null>(null)
const jsonBusy = ref(false)
const note = computed(() => vault.byPaper(props.paperId))

async function loadJson() {
  jsonBusy.value = true; jsonErr.value = null
  try { json.value = await lib.fetchPaperJson(props.paperId) } catch (e) { jsonErr.value = (e as Error).message } finally { jsonBusy.value = false }
}
onMounted(loadJson)

async function addToVault() {
  if (!lp.value) return
  const n = buildLibraryNote(lp.value, { libraryId: lib.libraryId, threshold: lib.threshold })
  await vault.upsert({ ...n, kind: 'lit', paperId: lp.value.paper.id })
  ui.openNote(n.path, noteName(n.path))
}
const copy = async () => { try { await navigator.clipboard.writeText(JSON.stringify(json.value, null, 2)) } catch { /* clipboard blocked */ } }
</script>

<template>
  <div v-if="lp" class="pv">
    <header>
      <div class="kicker">#{{ lp.rank }} · {{ lp.passed ? 'passed' : lp.excluded ? 'excluded: ' + lp.excluded : 'below the pass rule' }} · total {{ f2(lp.total) }}</div>
      <h2>{{ lp.paper.title }}</h2>
      <p class="meta">{{ lp.paper.authors.slice(0, 3).join(', ') }}{{ lp.paper.authors.length > 3 ? ' et al.' : '' }} · {{ lp.paper.year ?? 'n.d.' }} · {{ lp.paper.venue || 'no venue' }} · {{ lp.paper.citedByCount.toLocaleString('en') }} citations</p>
      <p class="links">
        <a :href="lp.paper.url" target="_blank" rel="noopener">OpenAlex</a>
        <a v-if="lp.paper.doi" :href="doiUrl(lp.paper.doi)" target="_blank" rel="noopener">DOI</a>
        <a v-if="lp.paper.pmid" :href="`https://pubmed.ncbi.nlm.nih.gov/${lp.paper.pmid}/`" target="_blank" rel="noopener">PubMed</a>
      </p>
      <div class="acts">
        <button v-if="!note" class="btn primary" type="button" @click="addToVault">Add to vault</button>
        <button v-else class="btn" type="button" @click="ui.openNote(note.path, noteName(note.path))">Open note · {{ noteName(note.path) }}</button>
      </div>
    </header>
    <Verdict :paper="lp" :move="lib.rankMove(lp.paper.id, lp.rank)" />
    <LibLabels :paper="lp" />
    <section>
      <h4>Why this score</h4>
      <WhyScore :paper="lp" />
    </section>
    <section v-if="lp.paper.abstract">
      <h4>Abstract <small>{{ lp.paper.abstractSource }}</small></h4>
      <p class="abs">{{ lp.paper.abstract }}</p>
    </section>
    <section>
      <h4>Relations <small>{{ lp.relations.length }}</small></h4>
      <ul v-if="lp.relations.length" class="rels"><li v-for="(r, i) in lp.relations" :key="i"><b>{{ r.type }}</b> <code>{{ r.paperId }}</code> {{ r.note }}</li></ul>
      <p v-else class="muted">No relations recorded.</p>
    </section>
    <section>
      <h4>Paper JSON <small><code>{{ lp.file }}</code></small>
        <button type="button" class="mini" :disabled="!json" @click="copy">copy</button>
        <button type="button" class="mini" @click="loadJson">reload</button></h4>
      <p v-if="jsonBusy" class="muted">Loading the paper file…</p>
      <p v-else-if="jsonErr" class="crit">{{ jsonErr }} <button type="button" class="mini" @click="loadJson">retry</button></p>
      <div v-else-if="json" class="json"><JsonTree :value="json" /></div>
    </section>
  </div>
  <div v-else class="empty-state">
    <p v-if="lib.status === 'running'">Loading the library…</p>
    <p v-else>This paper is not in the current library. Build the library again from the Library tab.</p>
  </div>
</template>

<style scoped>
.pv{padding:18px 22px;display:flex;flex-direction:column;gap:12px;max-width:900px;width:100%;margin:0 auto}
.kicker{font:500 11px var(--font-mono);color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
h2{margin:4px 0;font:600 22px/1.3 var(--font-display)}
.meta{margin:0;font-size:12.5px;color:var(--muted)}
.links{display:flex;gap:10px;margin:4px 0;font:500 12px var(--font-mono)}
.links a{color:var(--seed)}
.acts{display:flex;gap:8px;margin-top:6px}
.btn{font:600 12.5px/1 var(--font-body);border:1px solid var(--line-2);background:var(--surface);color:var(--fg);border-radius:99px;padding:8px 12px;cursor:pointer}
.btn.primary{background:var(--fg);color:var(--bg);border-color:var(--fg)}
section{display:flex;flex-direction:column;gap:4px}
h4{margin:6px 0 2px;font:500 10.5px/1.3 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);display:flex;gap:6px;align-items:center}
h4 small{letter-spacing:0;text-transform:none}
.abs{margin:0;font-size:13px;line-height:1.55}
.rels{margin:0;padding-left:18px;font-size:12px}
code{font:11px var(--font-mono);color:var(--muted)}
.json{border:1px solid var(--line);border-radius:7px;padding:8px 10px;background:var(--surface-2);max-height:560px;overflow:auto}
.mini{border:1px solid var(--line-2);background:var(--surface);color:var(--fg);border-radius:5px;font:500 10.5px var(--font-mono);padding:2px 6px;cursor:pointer;text-transform:none;letter-spacing:0}
.muted{color:var(--muted);font-size:12px;margin:0}
.crit{color:var(--crit);font-size:12px;margin:0}
.empty-state{margin:auto;max-width:360px;text-align:center;color:var(--muted);padding:24px}
</style>
