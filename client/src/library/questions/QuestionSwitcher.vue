<script setup lang="ts">
// Lane W2 (D-33): research question switcher — select, New question (name + text), rename, delete with an in-app confirm.
import { computed, nextTick, ref } from 'vue'
import { useVault, nameFromQuestion } from '../../stores/vault'
import { useLibrary } from '../../stores/library'

const vault = useVault()
const lib = useLibrary()
const mode = ref<'idle' | 'new' | 'rename' | 'delete'>('idle')
const newName = ref('')
const newText = ref('')
const renameTo = ref('')
const err = ref('')
const nameBox = ref<HTMLInputElement | null>(null)
const running = computed(() => lib.status === 'running')
const cur = computed(() => vault.currentQuestion)
const empty = computed(() => vault.ready && !vault.questions.length)
const curCount = computed(() => cur.value ? vault.notesIn(cur.value.id).length : 0)

function startNew() { mode.value = 'new'; newName.value = ''; newText.value = ''; err.value = ''; void nextTick(() => nameBox.value?.focus()) }
async function create() {
  const text = newText.value.trim()
  if (!text && !newName.value.trim()) { err.value = 'Write the question (a name is optional).'; return }
  const name = await vault.createQuestion(newName.value.trim() || nameFromQuestion(text), text)
  if (!name) { err.value = 'Could not create that folder name.'; return }
  mode.value = 'idle'
}
function startRename() { if (!cur.value) return; mode.value = 'rename'; renameTo.value = cur.value.name; err.value = '' }
function doRename() {
  if (!cur.value) return
  const next = vault.renameQuestion(cur.value.id, renameTo.value)
  if (!next) { err.value = renameTo.value.trim() === cur.value.name ? '' : 'That name is taken or empty.'; if (!err.value) mode.value = 'idle'; return }
  if (lib.questionId === cur.value.id || lib.questionId === null) lib.questionId = next
  mode.value = 'idle'
}
function doDelete() {
  if (!cur.value) return
  vault.deleteQuestion(cur.value.id)
  mode.value = 'idle'
}
const onSelect = (e: Event) => { vault.setCurrent((e.target as HTMLSelectElement).value || null); mode.value = 'idle' }
</script>

<template>
  <section class="qs">
    <div class="eyebrow">Research questions<span class="sub">{{ vault.questions.length }} · each is a folder in Questions/</span></div>

    <div v-if="empty && mode !== 'new'" class="empty-q">
      <b>Create your first research question</b>
      <p>Each question gets its own folder with its seed papers and notes. A build reads only that folder.</p>
      <button class="pill primary" type="button" @click="startNew">New question</button>
    </div>

    <div v-else-if="!empty" class="row">
      <select class="sel" aria-label="Current research question" :value="vault.current ?? ''" :disabled="running" @change="onSelect">
        <option v-for="q in vault.questions" :key="q.id" :value="q.id">{{ q.name }}</option>
      </select>
      <button class="pill sm" type="button" :disabled="running" @click="startNew">New</button>
      <button class="pill sm" type="button" :disabled="running || !cur" @click="startRename">Rename</button>
      <button class="pill sm danger" type="button" :disabled="running || !cur" @click="mode = 'delete'">Delete</button>
    </div>

    <form v-if="mode === 'new'" class="form" @submit.prevent="create">
      <label class="lab" for="qs-text">Question</label>
      <textarea id="qs-text" v-model="newText" class="box ask" rows="3" placeholder="Which single-cell methods help study melanoma immune cells?" />
      <label class="lab" for="qs-name">Short name (folder)</label>
      <input id="qs-name" ref="nameBox" v-model="newName" class="box" :placeholder="newText ? nameFromQuestion(newText) : 'Melanoma immune cells'" maxlength="60" />
      <div class="row">
        <button class="pill primary" type="submit">Create question</button>
        <button class="pill" type="button" @click="mode = 'idle'">Cancel</button>
      </div>
    </form>

    <form v-if="mode === 'rename' && cur" class="form" @submit.prevent="doRename">
      <label class="lab" for="qs-rn">Rename folder Questions/{{ cur.name }}/</label>
      <input id="qs-rn" v-model="renameTo" class="box" maxlength="60" />
      <div class="row"><button class="pill primary" type="submit">Rename</button><button class="pill" type="button" @click="mode = 'idle'">Cancel</button></div>
    </form>

    <div v-if="mode === 'delete' && cur" class="confirm" role="alertdialog" aria-label="Confirm delete">
      <p>Delete <b>{{ cur.name }}</b> and its {{ curCount }} note{{ curCount === 1 ? '' : 's' }} (question, seeds, notes in that folder) from this browser vault? Saved libraries on the server stay in History.</p>
      <div class="row"><button class="pill danger solid" type="button" @click="doDelete">Delete question</button><button class="pill" type="button" @click="mode = 'idle'">Cancel</button></div>
    </div>
    <p v-if="err" class="bad">{{ err }}</p>
  </section>
</template>

<style scoped>
.qs{display:flex;flex-direction:column;gap:10px;padding:0 0 14px}
.eyebrow{font:700 .6rem/1.3 var(--font-sans);letter-spacing:.2em;text-transform:uppercase;color:var(--ink-46);display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.eyebrow .sub{letter-spacing:.02em;text-transform:none;font-weight:500;font-size:.68rem;color:var(--ink-38)}
.row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.sel{flex:1;min-width:120px;font:600 .8rem var(--font-sans);border:1px solid var(--ink-26);border-radius:10px;padding:8px 10px;background:var(--paper);color:var(--ink)}
.form{display:flex;flex-direction:column;gap:6px}
.lab{font:600 .66rem var(--font-sans);color:var(--ink-64)}
.box{font:500 .8rem/1.4 var(--font-sans);border:1px solid var(--ink-26);border-radius:10px;padding:8px 10px;background:var(--paper);color:var(--ink);width:100%;resize:vertical}
.box:focus,.sel:focus{outline:none;border-color:var(--ink-64)}
.pill{font:600 .72rem/1 var(--font-sans);border:1px solid var(--ink-26);background:transparent;color:var(--ink);border-radius:99px;padding:9px 14px;cursor:pointer}
.pill.sm{padding:7px 10px;font-size:.68rem}
.pill:hover:not(:disabled){border-color:var(--ink-64)}
.pill:disabled{opacity:.5;cursor:default}
.pill.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.pill.danger{color:var(--accent)}
.pill.danger.solid{background:var(--accent);border-color:var(--accent);color:var(--paper)}
.empty-q{border:1px dashed var(--ink-26);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.empty-q b{font-size:.95rem;color:var(--ink)}
.empty-q p{margin:0;font-size:.76rem;line-height:1.5;color:var(--ink-64)}
.confirm{border:1px solid var(--accent);border-radius:12px;padding:10px 12px;font-size:.76rem;line-height:1.5}
.confirm p{margin:0 0 8px}
.bad{margin:0;font-size:.72rem;color:var(--accent)}
</style>
