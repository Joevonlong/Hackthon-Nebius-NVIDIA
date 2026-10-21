<script setup lang="ts">
// Library paper detail (lane L3): header, labels, score with every component, relations, the per-paper JSON
// (GET /api/library/:id/papers/:paperId) as a collapsible tree, and "Add to vault".
import { computed, onMounted, ref } from 'vue'
import { useLibrary } from '../stores/library'
import { useVault, questionNotePath } from '../stores/vault'
import { useUi } from '../stores/ui'
import { noteName } from '../stores/vault-utils'
import { doiUrl } from '../discover/literatureNote'
import { safeUrl } from '../util/safeUrl'
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

// Q2-5 (D-37): the note goes into the library's question folder, <question>/notes/<Author Year short title>.md, and is
// written to disk by the vault's write-through (same path as seeds and notes). paperId links it into the graph.
const noteQuestion = computed(() => {
  const q = lib.questionId ?? vault.current
  return q && vault.questions.some(x => x.id === q) ? q : null
})
async function addToVault() {
  if (!lp.value) return
  const n = buildLibraryNote(lp.value, { libraryId: lib.libraryId, threshold: lib.threshold })
  const q = noteQuestion.value
  let path = q ? questionNotePath(q, n.title) : n.path
  for (let k = 2; vault.byPath(path); k++) path = q ? questionNotePath(q, `${n.title} ${k}`) : n.path.replace(/\.md$/, ` ${k}.md`)
  await vault.upsert({ ...n, path, title: noteName(path), kind: 'lit', paperId: lp.value.paper.id })
  ui.openNote(path, noteName(path))
}
/** The LLM read's quote, located in the text it was checked against (char offsets when it is found verbatim). */
const read = computed(() => {
  const r = lp.value?.llmRead; if (!r) return null
  const src = r.read === 'full-text' ? 'full text' : 'abstract'
  let span: [number, number] | null = null
  const abs = lp.value?.paper.abstract
  if (r.quote && r.verified && abs && r.read === 'abstract') {
    let i = abs.indexOf(r.quote)
    if (i < 0) i = abs.toLowerCase().indexOf(r.quote.toLowerCase())
    if (i >= 0) span = [i, i + r.quote.length]
  }
  return { ...r, src, span }
})
/** Q-13: relation targets by name (library paper title, vault note / seed name, known-paper name), else the raw id. */
const rels = computed(() => (lp.value?.relations ?? []).map(r => {
  const id = r.paperId, low = id.toLowerCase()
  const note = r.note ? lib.deK(r.note) : ''
  const p = lib.byId(id) ?? lib.papers.find(x => x.paper.doi?.toLowerCase() === low || (x.paper.pmid && ('pmid:' + x.paper.pmid === low || x.paper.pmid === low)))
  if (p) return { type: r.type, id, note, name: p.paper.title, open: () => ui.openLibPaper(p.paper.id, p.paper.title.slice(0, 60)) }
  const n = vault.notes.find(x => x.paperId?.toLowerCase() === low) || (low.length >= 6 ? vault.notes.find(x => x.kind === 'seed' && x.content.toLowerCase().includes(low)) : undefined)
  if (n) return { type: r.type, id, note, name: noteName(n.path), open: () => ui.openNote(n.path, noteName(n.path)) }
  const k = /^K\d{1,3}$/i.test(id) ? lib.knownName(id) : id
  return { type: r.type, id, note, name: k, open: null }
}))
const copy = async () => { try { await navigator.clipboard.writeText(JSON.stringify(json.value, null, 2)) } catch { /* clipboard blocked */ } }
</script>

<template>
  <div v-if="lp" class="pv">
    <header>
      <button v-if="ui.backEntry" class="back" type="button" :title="'Back to ' + ui.backEntry.tab.title + ' (⌘[ or Alt+←)'" @click="ui.back()">
        <span aria-hidden="true">←</span> <span class="bt">{{ ui.backEntry.tab.title }}</span>
      </button>
      <div class="kicker">#{{ lp.rank }} · {{ lp.passed ? 'passed' : lp.excluded ? 'excluded: ' + lp.excluded : 'below the pass rule' }} · total {{ f2(lp.total) }}</div>
      <h2>{{ lp.paper.title }}</h2>
      <p class="meta">{{ lp.paper.authors.slice(0, 3).join(', ') }}{{ lp.paper.authors.length > 3 ? ' et al.' : '' }} · {{ lp.paper.year ?? 'n.d.' }} · {{ lp.paper.venue || 'no venue' }} · {{ lp.paper.citedByCount.toLocaleString('en') }} citations</p>
      <p class="links">
        <a v-if="safeUrl(lp.paper.url)" :href="safeUrl(lp.paper.url)!" target="_blank" rel="noopener">OpenAlex</a>
        <a v-if="lp.paper.doi" :href="doiUrl(lp.paper.doi)" target="_blank" rel="noopener">DOI</a>
        <a v-if="lp.paper.pmid" :href="`https://pubmed.ncbi.nlm.nih.gov/${lp.paper.pmid}/`" target="_blank" rel="noopener">PubMed</a>
      </p>
      <div class="acts">
        <button v-if="!note" class="btn primary" type="button" :title="noteQuestion ? `Saves a note to ${noteQuestion}/notes/` : 'Saves a note in this browser'" @click="addToVault">Add to vault</button>
        <button v-else class="btn" type="button" @click="ui.openNote(note.path, noteName(note.path))">Open note · {{ noteName(note.path) }}</button>
      </div>
    </header>
    <section class="read" aria-label="Why the model thinks this paper is relevant">
      <template v-if="read">
        <p class="why"><span class="lbl">Why relevant</span> {{ read.why }}</p>
        <template v-if="read.quote && read.verified">
          <blockquote>“{{ read.quote }}”</blockquote>
          <p class="prov ok">✓ verified · {{ read.src }}<template v-if="read.span"> · chars {{ read.span[0].toLocaleString('en') }}–{{ read.span[1].toLocaleString('en') }}</template> · {{ read.model.split('/').pop() }}</p>
        </template>
        <p v-else-if="read.quote" class="prov">The model's quote was not found verbatim in the {{ read.src }}, so it is not shown.</p>
        <p v-else class="prov">The model gave no quote · {{ read.model.split('/').pop() }}</p>
      </template>
      <p v-else class="prov">Not read by the model.</p>
    </section>
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
      <ul v-if="lp.relations.length" class="rels">
        <li v-for="(r, i) in rels" :key="i"><b>{{ r.type.replace('_', ' ') }}</b>
          <button v-if="r.open" type="button" class="rel" :title="r.id" @click="r.open()">{{ r.name }}</button>
          <span v-else :title="r.id">{{ r.name }}</span>
          <code v-if="r.name !== r.id">{{ r.id }}</code>
          <span v-if="r.note" class="muted"> · {{ r.note }}</span></li>
      </ul>
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
.back{align-self:flex-start;display:inline-flex;align-items:center;gap:5px;max-width:320px;margin:0 0 8px;border:1px solid var(--line-2);background:var(--surface);color:var(--fg);border-radius:99px;padding:5px 11px 5px 9px;font:600 12px/1 var(--font-body);cursor:pointer}
.back:hover{border-color:var(--seed);color:var(--seed)}
.back:focus-visible{outline:2px solid var(--seed);outline-offset:2px}
.back .bt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
header{display:flex;flex-direction:column}
.read{border-left:2px solid var(--accent);padding:2px 0 2px 12px;gap:5px}
.read .why{margin:0;font-size:13.5px;line-height:1.5;color:var(--fg)}
.read .lbl{font:600 10px var(--font-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-right:6px}
.read blockquote{margin:0;font-size:13px;font-style:italic;line-height:1.5;color:var(--muted)}
.prov{margin:0;font:500 11px var(--font-mono);color:var(--muted)}
.prov.ok{color:var(--ok)}
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
.rels{margin:0;padding-left:18px;font-size:12px;display:flex;flex-direction:column;gap:3px}
.rel{border:0;background:none;padding:0;color:var(--seed);font:inherit;cursor:pointer;text-align:left;text-decoration:underline dotted}
.rel:hover{text-decoration:underline}
code{font:11px var(--font-mono);color:var(--muted)}
.json{border:1px solid var(--line);border-radius:7px;padding:8px 10px;background:var(--surface-2);max-height:560px;overflow:auto}
.mini{border:1px solid var(--line-2);background:var(--surface);color:var(--fg);border-radius:5px;font:500 10.5px var(--font-mono);padding:2px 6px;cursor:pointer;text-transform:none;letter-spacing:0}
.muted{color:var(--muted);font-size:12px;margin:0}
.crit{color:var(--crit);font-size:12px;margin:0}
.empty-state{margin:auto;max-width:360px;text-align:center;color:var(--muted);padding:24px}
</style>
