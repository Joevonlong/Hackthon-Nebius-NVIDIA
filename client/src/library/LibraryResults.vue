<script setup lang="ts">
// Library results (lanes L3, U1, W1): pass rule (top X% + minimum score), filters, and the ranked papers as score
// tiles (default) or a sortable sparkbar table (F-60, D-34; choice kept in localStorage). Every field of the old text
// row is on the tile / row, in its hover card, or in the paper view + report card (click / "Report card").
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Labels, SourceName } from '@shared/library'
import { useLibrary, SOURCE_LABEL, RECENT_FROM } from '../stores/library'
import { useUi } from '../stores/ui'
import { useVault } from '../stores/vault'
import { shortTitle } from '../discover/literatureNote'
import { activeFilterCount, f2, RELATIVE_NOTICE } from './score'
import { DEFAULT_WEIGHTS } from '@shared/library'
import PassRule from './PassRule.vue'
import ResultTiles from './results/ResultTiles.vue'
import ResultTable from './results/ResultTable.vue'
import MiniRadar from './results/MiniRadar.vue'
import { loadView, rankMoves, saveView, type ResultsView } from './results/facts'

const lib = useLibrary(), ui = useUi(), vault = useVault()
const view = ref<ResultsView>(loadView())
watch(view, saveView)

// Q-4: the header counts every paper once (found = scored + excluded); "Show all N passed" raises the visible count
// locally (no rebuild), "Show top K" goes back.
const showAll = ref(false)
const excludedCount = computed(() => lib.excludedCount) // Q2-13: same numbers as the status bar
const canShowAll = computed(() => lib.passedAll.length > lib.top.length)
const shown = computed(() => {
  const base = showAll.value ? lib.view.slice(0, Math.max(lib.topK, lib.passedAll.length)) : lib.top
  return base.filter(p => (!lib.passedOnly || p.passed) && (!lib.filterSource || p.labels.sources.includes(lib.filterSource)))
})
watch(() => lib.dir, () => { showAll.value = false })

// Q-8: rank moves after ANY re-score (weights, pass rule, filters, chat Apply): diff the previous order against the new
// one; the arrows fade out after ~8 s. Skipped while a build streams in and when another library was opened.
const MOVE_MS = 8000
const moves = ref<Record<string, number>>({}), gen = ref(0)
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => lib.papers, (next, prev) => {
  if (!prev?.length || prev.length !== next.length || lib.status !== 'done') return
  const m = rankMoves(prev, next)
  if (!Object.keys(m).length) return
  moves.value = m; gen.value++
  clearTimeout(timer)
  timer = setTimeout(() => { moves.value = {} }, MOVE_MS)
})
watch(() => lib.dir, () => { moves.value = {}; clearTimeout(timer) })
onBeforeUnmount(() => clearTimeout(timer))
// Legend radar: an even shape that only illustrates the axis order.
const legend = (['relevance', 'graph', 'citations', 'venue', 'authors', 'llm'] as const).map(key => ({ key, label: key, weight: DEFAULT_WEIGHTS[key], value: 0.8, contribution: 0, how: '', evidence: [] }))
const kinds = computed(() => Labels.shape.kind.options.filter(k => lib.papers.some(p => p.labels.kind === k)))
const sources = computed(() => SourceName.options.filter(s => lib.top.some(p => p.labels.sources.includes(s))))
const openPaper = (id: string) => { const p = lib.byId(id); if (p) ui.openLibPaper(id, shortTitle(p.paper)) }
const inVault = (id: string) => !!vault.byPaper(id)
const toggleKind = (k: string) => {
  const cur = lib.filters.kinds ?? []
  const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]
  lib.filters = { ...lib.filters, kinds: next.length ? next : undefined }
}
const year = (key: 'minYear' | 'maxYear') => computed({
  get: () => lib.filters[key] ?? '',
  set: (v: string | number) => { const n = Number(v); lib.filters = { ...lib.filters, [key]: v === '' || !Number.isFinite(n) || n < 1800 ? undefined : Math.round(n) } },
})
const minYear = year('minYear'), maxYear = year('maxYear')
const flag = (key: 'openAccessOnly' | 'peerReviewedOnly') => computed({
  get: () => !!lib.filters[key],
  set: (v: boolean) => { lib.filters = { ...lib.filters, [key]: v || undefined } },
})
const oaOnly = flag('openAccessOnly'), prOnly = flag('peerReviewedOnly')
const nFilters = computed(() => activeFilterCount(lib.filters))
const kindCount = (k: string) => lib.papers.filter(p => p.labels.kind === k).length
// J-3: "Recent (≤ 3 years)" sets the shared minYear filter, so the chat agent sees the same setting.
const recentOn = computed(() => lib.filters.minYear === RECENT_FROM)
const toggleRecent = () => { lib.filters = { ...lib.filters, minYear: recentOn.value ? undefined : RECENT_FROM } }
const recentCount = computed(() => lib.papers.filter(p => (p.paper.year ?? 0) >= RECENT_FROM).length)
</script>

<template>
  <div class="res" :class="'v-' + view">
    <header class="hd">
      <div class="hd-l">
        <div class="eyebrow">Research library<span v-if="lib.mode === 'demo'" class="mode">Replay of a recorded real run</span><span v-else-if="lib.mode === 'mock'" class="mode warn">dev mock</span></div>
        <h2>{{ lib.goals?.topic || 'Library' }}</h2>
        <p class="muted">
          <template v-if="lib.status === 'running'">Building… {{ lib.calls.length }} source calls so far.</template>
          <template v-else-if="lib.status === 'done'"><b class="ink">{{ lib.passedCount }} pass</b> of {{ lib.eligibleCount }} scored <span class="tipd" :title="`${lib.foundCount} papers found = ${lib.eligibleCount} scored + ${excludedCount} excluded by a hard gate (retracted, duplicate, off-language…). A paper passes when it is inside the top ${lib.topPercent}% of the scored papers and its total is at least ${f2(lib.threshold)}.`">({{ excludedCount }} excluded of {{ lib.foundCount }} found)</span> · top {{ lib.topPercent }}% and score ≥ {{ f2(lib.threshold) }} · showing {{ showAll ? 'all ' + shown.length : 'top ' + shown.length }}<template v-if="nFilters"> filtered</template>
            <button v-if="!showAll && canShowAll" type="button" class="lnk more" @click="showAll = true">Show all {{ lib.passedAll.length }} passed</button>
            <button v-else-if="showAll" type="button" class="lnk more" @click="showAll = false">Show top {{ lib.topK }}</button></template>
          <template v-else-if="lib.status === 'idle'">No library yet. Type a research question in the Library tab and press Build library.</template>
        </p>
      </div>
      <button v-if="lib.status === 'done'" class="pill" type="button" @click="ui.openGraph()">Show in graph</button>
    </header>

    <div v-if="lib.status === 'error'" class="errbox" role="alert">
      <b>Library build failed.</b> {{ lib.error }}
      <button class="pill" type="button" @click="lib.start()">Retry</button>
    </div>
    <p v-if="lib.notice" class="notice">{{ lib.notice }}</p>
    <p v-if="lib.lastApplied" class="notice applied">Applied from chat: {{ lib.lastApplied.rationale }} · ▲/▼ show rank moves for a few seconds.</p>
    <p v-if="lib.reweighted" class="notice">Re-scored in the browser with your weights. Build again to search with them.</p>
    <p v-if="lib.status === 'done' && lib.eligibleCount" class="notice">{{ RELATIVE_NOTICE }}</p>
    <p v-if="lib.short" class="notice">Only {{ lib.view.length }} papers are loaded; build again to return {{ lib.topK }}.</p>

    <template v-if="lib.papers.length">
      <PassRule />
      <div class="filters">
        <div class="frow">
          <button type="button" class="chip recent" :aria-pressed="recentOn" :title="`published ${RECENT_FROM} or later (same cut-off as the Recent chip on each paper)`" @click="toggleRecent">Recent (≤ 3 years) <small>{{ recentCount }}</small></button>
          <span class="flbl">Kind</span>
          <button v-for="k in kinds" :key="k" type="button" class="chip" :aria-pressed="!!lib.filters.kinds?.includes(k)" @click="toggleKind(k)">{{ k }} <small>{{ kindCount(k) }}</small></button>
        </div>
        <div class="frow">
          <label class="flbl" for="miny">Years</label>
          <input id="miny" v-model.lazy="minYear" class="yr" type="number" placeholder="from" min="1900" max="2100" aria-label="From year" />
          <span class="faint">–</span>
          <input v-model.lazy="maxYear" class="yr" type="number" placeholder="to" min="1900" max="2100" aria-label="To year" />
          <label class="chk"><input v-model="oaOnly" type="checkbox" /> open access only</label>
          <label class="chk"><input v-model="prOnly" type="checkbox" /> peer reviewed only</label>
          <label class="chk"><input v-model="lib.passedOnly" type="checkbox" /> passed only</label>
          <label class="sel">Found by <select v-model="lib.filterSource"><option value="">any source</option><option v-for="s in sources" :key="s" :value="s">{{ SOURCE_LABEL[s] }}</option></select></label>
          <button v-if="nFilters" type="button" class="lnk" @click="lib.clearFilters()">clear {{ nFilters }} filter{{ nFilters === 1 ? '' : 's' }}</button>
          <span class="ct">{{ shown.length }} shown</span>
        </div>
      </div>
    </template>

    <div v-if="lib.papers.length || lib.status === 'running'" class="bar">
      <div class="seg" role="radiogroup" aria-label="Result layout">
        <button type="button" role="radio" :aria-checked="view === 'tiles'" @click="view = 'tiles'">Tiles</button>
        <button type="button" role="radio" :aria-checked="view === 'table'" @click="view = 'table'">Table</button>
      </div>
      <div class="legend" title="Radar axes, clockwise from the top; a dashed ring marks a component that could not be assessed (its weight moved to the others). Ring = total; its tick = minimum score.">
        <MiniRadar :components="legend" :size="52" labels />
        <span>Ring = total, tick = minimum score · dashed = not assessed · hover for the verdict, click for the report card</span>
      </div>
    </div>

    <div v-if="lib.status === 'running' && !lib.top.length" class="skels" :class="view"><div v-for="i in 6" :key="i" class="skel" /></div>
    <p v-else-if="lib.papers.length && !shown.length" class="empty">No paper matches these filters. <button type="button" class="lnk" @click="lib.clearFilters(); lib.passedOnly = false; lib.filterSource = ''">Clear filters</button></p>
    <template v-else-if="shown.length">
      <ResultTiles v-if="view === 'tiles'" :papers="shown" :moves="moves" :gen="gen" :in-vault="inVault" @open="openPaper" />
      <ResultTable v-else :papers="shown" :moves="moves" :gen="gen" :in-vault="inVault" @open="openPaper" />
    </template>
  </div>
</template>

<style scoped>
.res{padding:18px 22px 40px;display:flex;flex-direction:column;gap:12px;max-width:980px;width:100%;margin:0 auto;color:var(--ink);font-family:var(--font-sans)}
.hd{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
.hd-l{min-width:0}
.eyebrow{font:700 .6rem/1.3 var(--font-sans);letter-spacing:.2em;text-transform:uppercase;color:var(--ink-46);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.mode{letter-spacing:.02em;text-transform:none;font-weight:600;border:1px solid var(--accent);color:var(--accent);border-radius:99px;padding:2px 8px}
.mode.warn{border-color:var(--ink-46);color:var(--ink-64)}
h2{margin:4px 0 2px;font:700 1.5rem/1.15 var(--font-sans);letter-spacing:-.03em;text-wrap:balance}
.muted{color:var(--ink-55);font-size:.78rem;margin:0}
.ink{color:var(--ink)}
.tipd{cursor:help;text-decoration:underline dotted;text-underline-offset:3px}
.more{margin-left:8px;color:var(--ink);font-weight:600}
.notice{margin:0;font-size:.74rem;color:var(--ink-64);border:1px dashed var(--ink-26);border-radius:10px;padding:7px 10px;line-height:1.45}
.notice.applied{border-color:var(--accent);color:var(--ink)}
.errbox{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:.78rem;border:1px solid var(--accent);border-radius:12px;padding:10px 12px}
.pill{font:600 .74rem/1 var(--font-sans);border:1px solid var(--ink-26);background:transparent;color:var(--ink);border-radius:99px;padding:9px 14px;cursor:pointer;white-space:nowrap}
.pill:hover{border-color:var(--ink-64)}
.filters{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--hair);border-bottom:1px solid var(--hair);padding:10px 0}
.frow{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:.74rem;color:var(--ink-80)}
.flbl{font:700 .56rem var(--font-sans);letter-spacing:.18em;text-transform:uppercase;color:var(--ink-46);min-width:40px}
.chip{font:500 .7rem/1 var(--font-sans);border:1px solid var(--ink-26);border-radius:99px;padding:5px 10px;background:transparent;color:var(--ink-80);cursor:pointer}
.chip small{color:var(--ink-46);font-family:var(--font-mono);font-size:.6rem}
.chip[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:var(--paper)}
.chip[aria-pressed="true"] small{color:var(--paper)}
.yr{width:66px;font:500 .72rem var(--font-mono);border:1px solid var(--ink-26);border-radius:99px;padding:4px 8px;background:transparent;color:var(--ink)}
.chk{display:inline-flex;gap:5px;align-items:center;cursor:pointer}
.chk input{accent-color:var(--ink)}
.sel select{font:.72rem var(--font-sans);border:1px solid var(--ink-26);border-radius:99px;background:var(--paper-2);color:var(--ink);padding:3px 6px;margin-left:4px}
.lnk{border:0;background:transparent;padding:0;color:var(--ink-64);font:500 .72rem var(--font-sans);cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.ct{margin-left:auto;color:var(--ink-46);font-family:var(--font-mono);font-size:.68rem}
.faint{color:var(--ink-46)}
.chip.recent{margin-right:8px}
.skel{height:96px;border-radius:12px;border:1px solid var(--hair);background:linear-gradient(90deg,var(--ink-8) 0%,transparent 50%,var(--ink-8) 100%);background-size:200% 100%;animation:shimmer 1.2s linear infinite}
@keyframes shimmer{to{background-position:-200% 0}}
.empty{font-size:.78rem;color:var(--ink-55);border:1px dashed var(--ink-26);border-radius:12px;padding:10px 12px;margin:0}
@media (prefers-reduced-motion: reduce){.skel{animation:none}}
.res.v-tiles,.res.v-table{max-width:1180px}
.bar{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.seg{display:inline-flex;border:1px solid var(--ink-26);border-radius:99px;padding:2px}
.seg button{border:0;background:transparent;color:var(--ink-64);font:600 .74rem/1 var(--font-sans);padding:7px 14px;border-radius:99px;cursor:pointer}
.seg button[aria-checked="true"]{background:var(--ink);color:var(--paper)}
.legend{display:flex;align-items:center;gap:8px;font-size:.66rem;color:var(--ink-46);cursor:help}
.skels{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.skels.table{grid-template-columns:1fr}
.skels.table .skel{height:38px}
.skels.tiles .skel{height:178px}
</style>
