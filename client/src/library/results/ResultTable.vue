<script setup lang="ts">
// F-60 (D-34) compact table: one row per paper (rank + move, title, year, kind, six sparkbars, total, grade, passed),
// sortable by any column. Hover / focus on a row = HoverCard; click = paper view; the ＋ button expands WhyScore.
import { computed, reactive, ref } from 'vue'
import type { LibPaper } from '@shared/library'
import { useLibrary } from '../../stores/library'
import { COMPONENT_KEYS, COMPONENT_META } from '../score'
import { sortPapers, type SortKey } from './facts'
import ResultRow from './ResultRow.vue'
import WhyScore from '../WhyScore.vue'

const props = defineProps<{ papers: LibPaper[]; inVault: (id: string) => boolean }>()
const emit = defineEmits<{ open: [id: string] }>()
const lib = useLibrary()
const sortKey = ref<SortKey>('rank'), sortDir = ref<1 | -1>(1)
const expanded = reactive<Record<string, boolean>>({})
const rows = computed(() => sortPapers(props.papers, sortKey.value, sortDir.value))
const sortBy = (k: SortKey) => {
  if (sortKey.value === k) sortDir.value = sortDir.value === 1 ? -1 : 1
  else { sortKey.value = k; sortDir.value = k === 'rank' || k === 'title' || k === 'kind' ? 1 : -1 }
}
const aria = (k: SortKey) => sortKey.value === k ? (sortDir.value === 1 ? 'ascending' : 'descending') : 'none'
const ABBR: Record<string, string> = { relevance: 'Rel', graph: 'Lnk', citations: 'Cit', venue: 'Ven', authors: 'Aut', llm: 'LLM' }
const cols: { k: SortKey; label: string; cls: string; title?: string }[] = [
  { k: 'rank', label: '#', cls: 'c-rk' }, { k: 'title', label: 'Title', cls: 'c-tt' }, { k: 'year', label: 'Year', cls: 'c-yr' }, { k: 'kind', label: 'Kind', cls: 'c-kd' },
  ...COMPONENT_KEYS.map(k => ({ k: k as SortKey, label: ABBR[k], cls: 'c-sb', title: COMPONENT_META[k].label })),
  { k: 'total', label: 'Total', cls: 'c-tot' }, { k: 'total', label: 'Grade', cls: 'c-g' }, { k: 'passed', label: 'Pass', cls: 'c-ps' },
]
</script>

<template>
  <div class="tw"><table class="tbl">
    <thead>
      <tr>
        <th v-for="(c, i) in cols" :key="i" :class="c.cls" :aria-sort="c.label === 'Grade' ? undefined : aria(c.k)" scope="col">
          <button type="button" :title="(c.title || c.label) + ' · click to sort'" @click="sortBy(c.k)">{{ c.label }}<span v-if="sortKey === c.k && c.label !== 'Grade'" class="ar" aria-hidden="true">{{ sortDir === 1 ? '↑' : '↓' }}</span></button>
        </th>
        <th class="c-x"><span class="sr">Report card</span></th>
      </tr>
    </thead>
    <tbody>
      <template v-for="p in rows" :key="p.paper.id">
        <ResultRow :paper="p" :threshold="lib.threshold" :move="lib.rankMove(p.paper.id, p.rank)" :in-vault="inVault(p.paper.id)" :expanded="!!expanded[p.paper.id]"
          @open="emit('open', p.paper.id)" @toggle="expanded[p.paper.id] = !expanded[p.paper.id]" />
        <tr v-if="expanded[p.paper.id]" class="exp"><td :colspan="cols.length + 1"><WhyScore :paper="p" /></td></tr>
      </template>
    </tbody>
  </table></div>
</template>

<style scoped>
.tw{container-type:inline-size;width:100%}
.tbl{width:100%;border-collapse:collapse;table-layout:fixed;font-size:.76rem;color:var(--ink)}
th{position:sticky;top:0;z-index:2;background:var(--paper);border-bottom:1px solid var(--ink-26);padding:0;text-align:left}
th button{all:unset;box-sizing:border-box;display:block;width:100%;padding:7px 6px;font:700 .56rem var(--font-sans);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-46);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
th button:hover,th[aria-sort="ascending"] button,th[aria-sort="descending"] button{color:var(--ink)}
th button:focus-visible{outline:2px solid var(--ink);outline-offset:-2px}
.ar{margin-left:3px}
.c-rk{width:54px}.c-yr{width:50px}.c-kd{width:112px}.c-sb{width:58px}.c-tot{width:52px}.c-g{width:46px}.c-ps{width:64px}.c-x{width:32px}
.c-tt{width:auto}
.c-sb button{letter-spacing:.06em}
@container (max-width: 720px){.c-yr,.c-kd,.c-g{display:none}.c-sb{width:30px}.c-rk{width:42px}.c-tot{width:62px}.c-ps{width:26px}.c-ps button{font-size:0}.c-x{width:28px}.c-sb button{padding:7px 1px;font-size:.5rem;letter-spacing:0;text-align:center}}
.exp td{padding:4px 0 12px;border-bottom:1px solid var(--hair)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
</style>
