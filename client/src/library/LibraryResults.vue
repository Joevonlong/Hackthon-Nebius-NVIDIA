<script setup lang="ts">
// Library results (lanes L3, U1): pass rule (top X% + minimum score), filters, ranked list with the "verdict first"
// row (D-25), label chips, the "Why this score" report card, and rank moves after an applied chat proposal.
import { computed, reactive } from 'vue'
import { Labels, SourceName } from '@shared/library'
import { useLibrary, SOURCE_LABEL, RECENT_FROM } from '../stores/library'
import { useUi } from '../stores/ui'
import { useVault } from '../stores/vault'
import { shortTitle } from '../discover/literatureNote'
import { activeFilterCount, f2 } from './score'
import Verdict from './Verdict.vue'
import WhyScore from './WhyScore.vue'
import LibLabels from './LibLabels.vue'
import PassRule from './PassRule.vue'
import WhyRelevant from './WhyRelevant.vue'

const lib = useLibrary(), ui = useUi(), vault = useVault()
const open = reactive<Record<string, boolean>>({})
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
// J-4: the web page Tavily found the paper on.
const tavilyUrl = (p: { hits: { source: string; url: string }[] }) => p.hits.find(h => h.source === 'tavily')?.url
</script>

<template>
  <div class="res">
    <header class="hd">
      <div class="hd-l">
        <div class="eyebrow">Research library<span v-if="lib.mode === 'demo'" class="mode">Replay of a recorded real run</span><span v-else-if="lib.mode === 'mock'" class="mode warn">dev mock</span></div>
        <h2>{{ lib.goals?.topic || 'Library' }}</h2>
        <p class="muted">
          <template v-if="lib.status === 'running'">Building… {{ lib.calls.length }} source calls so far.</template>
          <template v-else-if="lib.status === 'done'"><b class="ink">{{ lib.passedCount }} of {{ lib.eligibleCount }}</b> pass · top {{ lib.topPercent }}% and score ≥ {{ f2(lib.threshold) }} · showing {{ lib.top.length }} of {{ lib.view.length }}<template v-if="nFilters"> filtered</template> papers</template>
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
    <p v-if="lib.lastApplied" class="notice applied">Applied from chat: {{ lib.lastApplied.rationale }} · ▲/▼ show rank moves since then.</p>
    <p v-if="lib.reweighted" class="notice">Re-scored in the browser with your weights. Build again to search with them.</p>
    <p v-if="lib.short" class="notice">Only {{ lib.view.length }} papers are loaded; build again to return {{ lib.topK }}.</p>

    <template v-if="lib.papers.length">
      <PassRule />
      <div class="filters">
        <div class="frow">
          <button type="button" class="chip recent" :aria-pressed="recentOn" :title="`published ${RECENT_FROM} or later`" @click="toggleRecent">Recent (≤ 3 years) <small>{{ recentCount }}</small></button>
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
          <span class="ct">{{ lib.filtered.length }} shown</span>
        </div>
      </div>
    </template>

    <div v-if="lib.status === 'running' && !lib.top.length" class="list"><div v-for="i in 6" :key="i" class="skel" /></div>
    <p v-else-if="lib.papers.length && !lib.filtered.length" class="empty">No paper matches these filters. <button type="button" class="lnk" @click="lib.clearFilters(); lib.passedOnly = false; lib.filterSource = ''">Clear filters</button></p>

    <ol class="list">
      <li v-for="p in lib.filtered" :key="p.paper.id" class="row" :class="{ pass: p.passed, excl: p.excluded }">
        <div class="top">
          <span class="rk">#{{ p.rank }}</span>
          <button type="button" class="tt" @click="openPaper(p.paper.id)">{{ p.paper.title }}</button>
          <span v-if="p.labels.recency === 'fresh'" class="badge fresh" title="published within the last 18 months">Fresh</span>
          <a v-if="tavilyUrl(p)" class="badge tav" :href="tavilyUrl(p)" target="_blank" rel="noopener" :title="'Tavily web search found it here: ' + tavilyUrl(p)">found via Tavily ↗</a>
          <span v-if="inVault(p.paper.id)" class="badge">in vault</span>
        </div>
        <div class="meta">{{ p.paper.authors[0] || 'Unknown' }}{{ p.paper.authors.length > 1 ? ' et al.' : '' }} · {{ p.paper.year ?? 'n.d.' }} · {{ p.paper.venue || 'no venue' }} · <span title="OpenAlex cited_by_count">{{ p.paper.citedByCount.toLocaleString('en') }} cites</span></div>
        <Verdict :paper="p" :move="lib.rankMove(p.paper.id, p.rank)" />
        <WhyRelevant :paper="p" />
        <LibLabels :paper="p" />
        <button type="button" class="why-t" :aria-expanded="!!open[p.paper.id]" @click="open[p.paper.id] = !open[p.paper.id]"><span class="plus" :class="{ open: open[p.paper.id] }" aria-hidden="true" />Why this score</button>
        <WhyScore v-if="open[p.paper.id]" :paper="p" />
      </li>
    </ol>
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
.list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.row{border:1px solid var(--hair);border-radius:12px;padding:11px 13px;display:flex;flex-direction:column;gap:7px;background:var(--paper-2)}
.row.pass{border-left:3px solid var(--accent)}
.row.excl{opacity:.7;border-left:3px dashed var(--ink-38)}
.top{display:flex;gap:8px;align-items:baseline}
.rk{font:700 .66rem var(--font-mono);color:var(--ink-55);min-width:30px}
.tt{flex:1;border:0;background:transparent;color:var(--ink);font:600 .92rem/1.35 var(--font-sans);letter-spacing:-.01em;text-align:left;cursor:pointer;padding:0}
.tt:hover{text-decoration:underline;text-underline-offset:3px}
.badge{font:600 .6rem/1 var(--font-mono);padding:3px 7px;border-radius:99px;border:1px solid var(--ink-26);color:var(--ink-64);white-space:nowrap}
.meta{font-size:.72rem;color:var(--ink-55)}
.badge.fresh{border-color:var(--accent);color:var(--accent)}
.badge.tav{text-decoration:none;color:var(--ink);border-color:var(--ink-46)}
.badge.tav:hover{border-color:var(--ink)}
.chip.recent{margin-right:8px}
.why-t{align-self:flex-start;display:inline-flex;gap:7px;align-items:center;border:0;background:transparent;color:var(--ink-64);font:600 .72rem var(--font-sans);cursor:pointer;padding:0}
.why-t:hover{color:var(--ink)}
.plus{width:9px;height:9px;position:relative}
.plus::before,.plus::after{content:"";position:absolute;left:0;top:4px;width:9px;height:1px;background:currentColor;transition:transform .35s var(--drawer)}
.plus::after{transform:rotate(90deg)}.plus.open::after{transform:rotate(0)}
.skel{height:96px;border-radius:12px;border:1px solid var(--hair);background:linear-gradient(90deg,var(--ink-8) 0%,transparent 50%,var(--ink-8) 100%);background-size:200% 100%;animation:shimmer 1.2s linear infinite}
@keyframes shimmer{to{background-position:-200% 0}}
.empty{font-size:.78rem;color:var(--ink-55);border:1px dashed var(--ink-26);border-radius:12px;padding:10px 12px;margin:0}
@media (prefers-reduced-motion: reduce){.skel{animation:none}.plus::before,.plus::after{transition:none}}
</style>
