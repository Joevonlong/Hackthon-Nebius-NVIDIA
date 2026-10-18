<script setup lang="ts">
// Library results (lane L3): filters, legend, ranked list with split score bars, label chips and "Why this score".
import { computed, reactive } from 'vue'
import { Labels, SourceName } from '@shared/library'
import { useLibrary, SOURCE_LABEL } from '../stores/library'
import { useUi } from '../stores/ui'
import { useVault } from '../stores/vault'
import { shortTitle } from '../discover/literatureNote'
import { COMPONENT_KEYS, COMPONENT_META, f2 } from './score'
import ScoreBar from './ScoreBar.vue'
import WhyScore from './WhyScore.vue'
import LibLabels from './LibLabels.vue'

const lib = useLibrary(), ui = useUi(), vault = useVault()
const open = reactive<Record<string, boolean>>({})
const kinds = computed(() => Labels.shape.kind.options.filter(k => lib.top.some(p => p.labels.kind === k)))
const sources = computed(() => SourceName.options.filter(s => lib.top.some(p => p.labels.sources.includes(s))))
const openPaper = (id: string) => { const p = lib.byId(id); if (p) ui.openLibPaper(id, shortTitle(p.paper)) }
const inVault = (id: string) => !!vault.byPaper(id)
</script>

<template>
  <div class="res">
    <header class="hd">
      <div>
        <h2>Library <small v-if="lib.goals">· {{ lib.goals.topic }}</small></h2>
        <p class="muted">
          <template v-if="lib.status === 'running'">Building… {{ lib.calls.length }} source calls so far.</template>
          <template v-else-if="lib.status === 'done'">Top {{ lib.top.length }} of {{ lib.total.toLocaleString('en') }} scored papers · <b>{{ lib.passedTop.length }}</b> at or above threshold {{ f2(lib.threshold) }} join the graph<template v-if="lib.mode === 'mock'"> · <span class="warn">dev mock</span></template></template>
          <template v-else-if="lib.status === 'error'"><span class="crit">Build failed: {{ lib.error }}</span></template>
          <template v-else>No library yet. Use the Library tab in the sidebar to build one from the vault.</template>
        </p>
        <p v-if="lib.reweighted" class="notice">Re-scored in the browser with your weights / threshold. Totals differ from the server run until you build again.</p>
        <p v-if="lib.short" class="notice">Only {{ lib.scored.length }} papers are loaded; build again to return {{ lib.topK }}.</p>
      </div>
      <button v-if="lib.status === 'done'" class="btn" type="button" @click="ui.openGraph()">Show in graph</button>
    </header>

    <div class="legend" aria-label="Score legend">
      <span v-for="k in COMPONENT_KEYS" :key="k" :title="`default weight ${f2(lib.weights[k])}`"><i :style="{ background: COMPONENT_META[k].color }" />{{ COMPONENT_META[k].short }} {{ f2(lib.weights[k]) }}</span>
      <span><i class="thr" />threshold {{ f2(lib.threshold) }}</span>
    </div>

    <div v-if="lib.top.length" class="filters">
      <label>Kind <select v-model="lib.filterKind"><option value="">all</option><option v-for="k in kinds" :key="k" :value="k">{{ k }}</option></select></label>
      <label>Found by <select v-model="lib.filterSource"><option value="">any source</option><option v-for="s in sources" :key="s" :value="s">{{ SOURCE_LABEL[s] }}</option></select></label>
      <label class="chk"><input v-model="lib.passedOnly" type="checkbox" /> passed only</label>
      <span class="muted ct">{{ lib.filtered.length }} shown</span>
    </div>

    <div v-if="lib.status === 'running' && !lib.top.length" class="list"><div v-for="i in 6" :key="i" class="skel" /></div>
    <p v-else-if="lib.top.length && !lib.filtered.length" class="empty">No paper matches these filters.</p>

    <ol class="list">
      <li v-for="p in lib.filtered" :key="p.paper.id" class="row" :class="{ pass: p.passed, excl: p.excluded }">
        <div class="top">
          <span class="rk">#{{ p.rank }}</span>
          <button type="button" class="tt" @click="openPaper(p.paper.id)">{{ p.paper.title }}</button>
          <span class="badge" :class="p.excluded ? 'crit' : p.passed ? 'ok' : ''" :title="p.excluded ? 'hard gate: ' + p.excluded : `total ${f2(p.total)} vs threshold ${f2(lib.threshold)}`">{{ p.excluded ? 'excluded' : p.passed ? 'passed' : 'below' }}</span>
          <span v-if="inVault(p.paper.id)" class="badge seed">in vault</span>
        </div>
        <div class="meta">{{ p.paper.authors[0] || 'Unknown' }}{{ p.paper.authors.length > 1 ? ' et al.' : '' }} · {{ p.paper.year ?? 'n.d.' }} · {{ p.paper.venue || 'no venue' }} · <span title="OpenAlex cited_by_count">{{ p.paper.citedByCount.toLocaleString('en') }} cites</span></div>
        <ScoreBar :paper="p" :threshold="lib.threshold" />
        <LibLabels :paper="p" />
        <button type="button" class="why-t" :aria-expanded="!!open[p.paper.id]" @click="open[p.paper.id] = !open[p.paper.id]">{{ open[p.paper.id] ? '▾' : '▸' }} Why this score</button>
        <WhyScore v-if="open[p.paper.id]" :paper="p" :threshold="lib.threshold" />
      </li>
    </ol>
  </div>
</template>

<style scoped>
.res{padding:16px 20px;display:flex;flex-direction:column;gap:10px;max-width:980px;width:100%;margin:0 auto}
.hd{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
h2{margin:0;font:600 22px/1.25 var(--font-display)}
h2 small{font-size:15px;color:var(--muted);font-weight:500}
.muted{color:var(--muted);font-size:12.5px;margin:2px 0 0}
.warn{color:var(--warn)}
.crit{color:var(--crit)}
.notice{margin:6px 0 0;font-size:11.5px;color:var(--warn);border:1px dashed var(--warn);border-radius:6px;padding:5px 8px}
.btn{font:600 12.5px/1 var(--font-body);border:1px solid var(--line-2);background:var(--surface);color:var(--fg);border-radius:99px;padding:8px 12px;cursor:pointer;white-space:nowrap}
.legend{display:flex;flex-wrap:wrap;gap:10px;font:500 11px var(--font-mono);color:var(--muted)}
.legend span{display:inline-flex;align-items:center;gap:5px;cursor:help}
.legend i{width:10px;height:10px;border-radius:2px;display:inline-block}
.legend i.thr{width:2px;height:12px;background:var(--fg);border-radius:0}
.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:6px 0}
.filters select{font:12px var(--font-body);border:1px solid var(--line-2);border-radius:5px;background:var(--surface);color:var(--fg);padding:2px 4px;margin-left:4px}
.chk{display:inline-flex;gap:5px;align-items:center}
.chk input{accent-color:var(--cand)}
.ct{margin:0 0 0 auto}
.list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.row{border:1px solid var(--line);border-radius:8px;padding:9px 11px;display:flex;flex-direction:column;gap:5px;background:var(--surface)}
.row.pass{border-left:3px solid var(--ok)}
.row.excl{opacity:.75;border-left:3px solid var(--crit)}
.top{display:flex;gap:8px;align-items:baseline}
.rk{font:600 11.5px var(--font-mono);color:var(--muted);min-width:30px}
.tt{flex:1;border:0;background:transparent;color:var(--fg);font:600 14px/1.35 var(--font-display);text-align:left;cursor:pointer;padding:0}
.tt:hover{text-decoration:underline}
.badge{font:600 10px/1 var(--font-mono);padding:3px 6px;border-radius:99px;border:1px solid var(--line-2);color:var(--muted);white-space:nowrap;cursor:help}
.badge.ok{color:var(--ok);border-color:currentColor}
.badge.crit{color:var(--crit);border-color:currentColor}
.badge.seed{color:var(--seed);border-color:currentColor}
.meta{font-size:11.5px;color:var(--muted)}
.why-t{align-self:flex-start;border:0;background:transparent;color:var(--seed);font:500 11.5px var(--font-body);cursor:pointer;padding:0}
.skel{height:84px;border-radius:8px;border:1px solid var(--line);background:linear-gradient(90deg,var(--surface-2) 0%,var(--surface) 50%,var(--surface-2) 100%);background-size:200% 100%;animation:shimmer 1.2s linear infinite}
@keyframes shimmer{to{background-position:-200% 0}}
.empty{font-size:12.5px;color:var(--muted);border:1px dashed var(--line-2);border-radius:7px;padding:10px}
@media (prefers-reduced-motion: reduce){.skel{animation:none}}
</style>
