<script setup lang="ts">
// Lane W2 (D-36): seeds of the CURRENT question only — table (title, year, id, status, open, remove) + paste ids + file upload.
import { computed, ref } from 'vue'
import { useVault } from '../../stores/vault'
import { useLibrary, seedInfo } from '../../stores/library'
import { useUi } from '../../stores/ui'
import { noteName } from '../../stores/vault-utils'

const props = defineProps<{ question: string }>()
const vault = useVault()
const lib = useLibrary()
const ui = useUi()
const text = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const removing = ref<string | null>(null)

const seeds = computed(() => vault.seedsIn(props.question))
const rowsHere = computed(() => lib.seedQuestion === props.question ? lib.seedRows : [])
const table = computed(() => {
  const out = seeds.value.map(n => {
    const info = seedInfo(n.content)
    const dup = rowsHere.value.find(r => r.path === n.path && r.status === 'duplicate')
    return { key: n.path, path: n.path as string | undefined, label: info.label || noteName(n.path).split(' ')[0], title: info.title || noteName(n.path), year: info.year, id: info.id, status: dup ? 'duplicate' : 'resolved', msg: dup?.message }
  })
  for (const r of rowsHere.value) if (r.status === 'not found') out.push({ key: 'nf:' + r.input, path: undefined, label: '', title: r.message || 'not resolved', year: '', id: r.input, status: 'not found', msg: r.message })
  return out
})

async function add() { await lib.addSeeds(text.value, props.question); if (!lib.seedErrors.length) text.value = '' }
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files || [])]
  for (const f of files) await lib.importSeedFile(f, props.question)
  input.value = ''
}
function open(path: string) { ui.openNote(path, noteName(path)) }
function remove(path: string) { ui.close('note:' + path); void vault.remove(path); removing.value = null }
function dropRow(id: string) { lib.seedRows = lib.seedRows.filter(r => r.input !== id) }
</script>

<template>
  <div class="seeds">
    <table v-if="table.length" class="tbl">
      <thead><tr><th>#</th><th>title</th><th>year</th><th>id</th><th>status</th><th /></tr></thead>
      <tbody>
        <tr v-for="r in table" :key="r.key" :class="r.status.replace(' ', '-')">
          <td class="lb">{{ r.label }}</td>
          <td class="tt" :title="r.title">{{ r.title }}</td>
          <td class="n">{{ r.year }}</td>
          <td class="id" :title="r.id">{{ r.id }}</td>
          <td><span class="st" :title="r.msg">{{ r.status }}</span></td>
          <td class="acts">
            <template v-if="r.path && removing === r.path">
              <button type="button" class="lnk bad" @click="remove(r.path)">remove?</button>
              <button type="button" class="lnk" @click="removing = null">no</button>
            </template>
            <template v-else-if="r.path">
              <button type="button" class="lnk" title="Open the seed note" @click="open(r.path)">open</button>
              <button type="button" class="lnk" title="Remove this seed from the question" @click="removing = r.path">remove</button>
            </template>
            <button v-else type="button" class="lnk" title="Dismiss" @click="dropRow(r.id)">dismiss</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="faint small">No seeds for this question yet.</p>

    <textarea v-model="text" class="qbox mono" rows="3" spellcheck="false" placeholder="Paste DOIs, PMIDs, arXiv or OpenAlex ids (one per line)" :disabled="lib.seedBusy" aria-label="Seed ids" />
    <div class="runrow">
      <button class="pill" type="button" :disabled="lib.seedBusy || !text.trim()" @click="add">{{ lib.seedBusy ? 'Resolving…' : 'Add seeds' }}</button>
      <button class="pill" type="button" :disabled="lib.seedBusy" @click="fileInput?.click()">Upload file…</button>
      <input ref="fileInput" type="file" multiple hidden accept=".bib,.bibtex,.ris,.nbib,.json,.csv,.tsv,.txt,.pdf,application/pdf,application/json,text/csv,text/plain" @change="onFile">
    </div>
    <small class="faint">.bib · .ris · CSL JSON · .csv / .txt id lists · PDF (DOI from the first 2 pages). Seeds stay in this question's seeds/ folder.</small>
    <p v-if="lib.importNote && lib.seedQuestion === question" class="small note">{{ lib.importNote }}</p>
    <ul v-if="lib.seedErrors.length && (lib.seedQuestion === question || !lib.seedQuestion)" class="errs"><li v-for="(e, i) in lib.seedErrors" :key="i">{{ e.input ? e.input + ': ' : '' }}{{ e.message }}</li></ul>
  </div>
</template>

<style scoped>
.seeds{display:flex;flex-direction:column;gap:8px}
.tbl{width:100%;border-collapse:collapse;font-size:.68rem;table-layout:fixed}
.tbl th{font:700 .54rem var(--font-sans);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-46);text-align:left;border-bottom:1px solid var(--hair);padding:4px 3px}
.tbl th:nth-child(1){width:26px}.tbl th:nth-child(3){width:34px}.tbl th:nth-child(4){width:76px}.tbl th:nth-child(5){width:58px}.tbl th:nth-child(6){width:62px}
.tbl td{padding:5px 3px;border-bottom:1px solid var(--ink-8);vertical-align:top;color:var(--ink-80)}
.tt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.id{font:.6rem var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb{font:700 .6rem var(--font-mono);color:var(--ink-64)}
.n{font-family:var(--font-mono)}
.st{font:600 .58rem var(--font-sans);border:1px solid var(--ink-26);border-radius:99px;padding:2px 6px;white-space:nowrap}
tr.resolved .st{border-color:var(--ink-46);color:var(--ink)}
tr.not-found .st{border-color:var(--accent);color:var(--accent)}
tr.duplicate .st{border-style:dashed;color:var(--ink-64)}
tr.not-found .tt{color:var(--ink-55);font-style:italic}
.acts{display:flex;gap:6px;flex-wrap:wrap}
.lnk{border:0;background:transparent;padding:0;color:var(--ink-64);font:500 .62rem var(--font-sans);cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.lnk:hover{color:var(--ink)}
.lnk.bad{color:var(--accent)}
.qbox{font:.7rem/1.45 var(--font-mono);border:1px solid var(--ink-26);border-radius:10px;padding:9px 11px;background:var(--paper);color:var(--ink);resize:vertical;width:100%}
.qbox:focus{outline:none;border-color:var(--ink-64)}
.runrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pill{font:600 .72rem/1 var(--font-sans);border:1px solid var(--ink-26);background:transparent;color:var(--ink);border-radius:99px;padding:9px 14px;cursor:pointer}
.pill:hover:not(:disabled){border-color:var(--ink-64)}
.pill:disabled{opacity:.5;cursor:default}
.faint{color:var(--ink-46)}
.small{font-size:.72rem;margin:0}
small{font-size:.64rem;line-height:1.4}
.note{color:var(--ink-64)}
.errs{margin:0;padding-left:16px;font-size:.7rem;color:var(--accent)}
.mono{font-family:var(--font-mono)}
</style>
