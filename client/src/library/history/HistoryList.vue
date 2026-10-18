<script setup lang="ts">
// Lane W2 (D-35): saved libraries of the current question — open (no rebuild), rename, delete with an in-app confirm, export JSON.
import { ref } from 'vue'
import { useLibrary } from '../../stores/library'
import { useUi } from '../../stores/ui'

const props = defineProps<{ questionId: string | null; title?: string }>()
const lib = useLibrary()
const ui = useUi()
const editing = ref<string | null>(null)
const editName = ref('')
const confirming = ref<string | null>(null)

const when = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }
async function open(id: string) { if (await lib.openStored(id, props.questionId)) ui.openLibrary() }
function startRename(id: string, cur: string) { editing.value = id; editName.value = cur; confirming.value = null }
async function saveRename(id: string) { await lib.renameStored(id, editName.value); editing.value = null }
async function del(id: string) { await lib.deleteStored(id, props.questionId); confirming.value = null }
</script>

<template>
  <div class="hist">
    <p v-if="lib.historyError" class="bad">{{ lib.historyError }}</p>
    <p v-if="!lib.history.length" class="faint">{{ lib.historyBusy ? 'Loading saved libraries…' : 'No saved libraries for this question yet. Every build is kept here.' }}</p>
    <ul v-else class="list">
      <li v-for="h in lib.history" :key="h.libraryId" :class="{ on: lib.libraryId === h.libraryId }">
        <form v-if="editing === h.libraryId" class="rn" @submit.prevent="saveRename(h.libraryId)">
          <input v-model="editName" class="box" maxlength="120" aria-label="Library name" />
          <button class="lnk" type="submit">save</button><button class="lnk" type="button" @click="editing = null">cancel</button>
        </form>
        <button v-else type="button" class="main" :title="'Open ' + h.libraryId + ' without rebuilding'" @click="open(h.libraryId)">
          <b>{{ h.name || when(h.createdAt) }}</b>
          <span class="meta">{{ h.name ? when(h.createdAt) + ' · ' : '' }}{{ h.total }} scored · {{ h.passed }} passed · top {{ h.topK }}</span>
          <span v-if="h.topTitle" class="top">#1 {{ h.topTitle }}</span>
        </button>
        <div v-if="confirming === h.libraryId" class="confirm" role="alertdialog" aria-label="Confirm delete">
          Delete this library? Its folder moves to .trash/ next to it (not erased).
          <button type="button" class="lnk bad" @click="del(h.libraryId)">delete</button><button type="button" class="lnk" @click="confirming = null">cancel</button>
        </div>
        <div v-else-if="editing !== h.libraryId" class="acts">
          <span v-if="lib.libraryId === h.libraryId" class="cur">open</span>
          <button type="button" class="lnk" @click="startRename(h.libraryId, h.name || '')">rename</button>
          <a class="lnk" :href="lib.exportUrl(h.libraryId)" :download="h.libraryId + '.json'">export</a>
          <button type="button" class="lnk" @click="confirming = h.libraryId; editing = null">delete</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.hist{display:flex;flex-direction:column;gap:6px}
.list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.list li{border:1px solid var(--hair);border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:4px}
.list li.on{border-color:var(--ink-46);background:var(--ink-8)}
.main{display:flex;flex-direction:column;gap:2px;text-align:left;border:0;background:transparent;padding:0;cursor:pointer;color:var(--ink);font:inherit}
.main b{font-size:.78rem}
.meta{font:.62rem var(--font-mono);color:var(--ink-55)}
.top{font-size:.68rem;color:var(--ink-64);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acts,.rn,.confirm{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:.68rem}
.confirm{color:var(--ink)}
.cur{font:700 .56rem var(--font-sans);letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.box{flex:1;min-width:0;font:500 .74rem var(--font-sans);border:1px solid var(--ink-26);border-radius:8px;padding:5px 8px;background:var(--paper);color:var(--ink)}
.lnk{border:0;background:transparent;padding:0;color:var(--ink-64);font:500 .64rem var(--font-sans);cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.lnk:hover{color:var(--ink)}
.lnk.bad,.bad{color:var(--accent)}
.faint{margin:0;font-size:.72rem;color:var(--ink-46)}
p.bad{margin:0;font-size:.72rem}
</style>
