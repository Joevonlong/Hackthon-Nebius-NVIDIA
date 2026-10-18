<script setup lang="ts">
// F-47 / D-25 "Why this score" as a report card (lane U1): overall letter grade, one row per component (name, letter
// grade, one-line reason + the key number, weight, contribution), evidence folded under each row with source links.
// Not-assessed rows say why and that their weight moved to the assessed components.
// CR-11: the header is a chart (score donut + value bars, same numbers as the rows); the text rows stay below, folded.
import { computed, nextTick, reactive, ref } from 'vue'
import type { LibPaper } from '@shared/library'
import { useLibrary } from '../stores/library'
import { COMPONENT_META, f2, grade, keyNumber, notAssessedWhy, reason, ruleText, verdict, weightShare } from './score'
import { compColor, scoreSlices, sliceText } from './charts/slices'
import ScoreDonut from './charts/ScoreDonut.vue'
import ValueBars from './charts/ValueBars.vue'

const props = defineProps<{ paper: LibPaper }>()
const lib = useLibrary()
const open = reactive<Record<string, boolean>>({})
const v = computed(() => verdict(props.paper))
/** Effective share of the total this component carries after the not-assessed weight moved. */
const share = (c: LibPaper['components'][number]) => weightShare(c, props.paper.components)
const hover = ref<string | null>(null)
const sl = computed(() => scoreSlices(props.paper.components))
const caption = computed(() => {
  const h = hover.value
  if (h === 'missed') return `Missed ${f2(sl.value.missed)}: the points this paper did not earn (1 − total).`
  const s = h ? sl.value.slices.find(x => x.key === h) : null
  return s ? sliceText(s) : `Each slice = what a component adds · grey = ${f2(sl.value.missed)} missed`
})
const rowsEl = ref<HTMLElement | null>(null)
async function toggle(key: string) {
  open[key] = !open[key]
  if (!open[key]) return
  await nextTick()
  rowsEl.value?.querySelector<HTMLElement>(`[data-k="${key}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}
const pc = (x: number) => Math.round(x * 100) + '%'
const passLine = computed(() => {
  const p = props.paper
  if (p.excluded) return `Excluded by a hard gate: ${p.excluded}. Never added to the graph.`
  const inTop = p.rank <= lib.cutCount
  const floor = p.total >= lib.threshold
  if (p.passed) return `Passed: rank #${p.rank} is inside the top ${lib.topPercent}% (${lib.cutCount} of ${lib.eligibleCount}) and ${f2(p.total)} ≥ minimum ${f2(lib.threshold)}. Joins the citation graph.`
  return `Below: ${inTop ? `rank #${p.rank} is inside the top ${lib.topPercent}%` : `rank #${p.rank} is outside the top ${lib.topPercent}% (${lib.cutCount} of ${lib.eligibleCount})`}${floor ? '' : `, and ${f2(p.total)} < minimum ${f2(lib.threshold)}`}.`
})
</script>

<template>
  <div class="card">
    <header class="hd">
      <figure class="dn">
        <ScoreDonut :components="paper.components" :total="paper.total" :size="124" :active="hover" @hover="hover = $event" />
      </figure>
      <div class="side">
        <div class="eyebrow">Overall · grade {{ v.grade }} · total {{ f2(paper.total) }}</div>
        <p class="sent">{{ v.sentence }}</p>
        <ValueBars :components="paper.components" :active="hover" :open="open" @hover="hover = $event" @toggle="toggle" />
        <p class="cap" aria-live="polite">{{ caption }}</p>
      </div>
    </header>
    <div class="cols" aria-hidden="true"><span>Component</span><span>Weight</span><span>Adds</span></div>
    <ul ref="rowsEl" class="rows">
      <li v-for="c in paper.components" :key="c.key" class="row" :class="{ na: c.value == null, on: hover === c.key }" :data-k="c.key">
        <button type="button" class="line" :aria-expanded="!!open[c.key]" @click="open[c.key] = !open[c.key]">
          <b class="g" :class="c.value == null ? 'g-na' : 'g-' + grade(c.value)" :title="c.value == null ? 'not assessed' : `value ${f2(c.value)}`">{{ c.value == null ? '–' : grade(c.value) }}</b>
          <span class="main">
            <span class="nm"><i class="dot" :style="{ background: c.value == null ? 'transparent' : compColor(c.key), borderColor: compColor(c.key) }" aria-hidden="true" />{{ COMPONENT_META[c.key].label }}<span class="rs"> · {{ reason(c) }}</span></span>
            <span v-if="c.value != null" class="key">{{ keyNumber(c) }}</span>
            <span v-else class="key">Not assessed: {{ notAssessedWhy(c) }}. Its weight ({{ f2(c.weight) }}) moved to the assessed components.</span>
          </span>
          <span class="w" :title="`raw weight ${f2(c.weight)} → ${pc(share(c))} of the total after normalizing over the assessed components`">{{ c.value == null ? '0%' : pc(share(c)) }}</span>
          <span class="ct" :title="'weight share × value'">+{{ f2(c.contribution) }}</span>
          <span class="plus" :class="{ open: open[c.key] }" aria-hidden="true" />
        </button>
        <div class="more" :class="{ open: open[c.key] }"><div class="more-in">
          <p class="rule"><span>Rule</span> {{ ruleText(c.how) }}</p>
          <ul class="ev">
            <li v-for="(e, i) in c.evidence" :key="i">{{ lib.deK(e.text) }}<template v-if="e.source"> · <a :href="e.source.url" target="_blank" rel="noopener">{{ lib.deK(e.source.name) }}</a></template></li>
            <li v-if="!c.evidence.length" class="faint">No evidence lines recorded.</li>
          </ul>
        </div></div>
      </li>
    </ul>
    <p class="verdict" :class="{ pass: paper.passed }">{{ passLine }}</p>
  </div>
</template>

<style scoped>
.card{display:flex;flex-direction:column;gap:8px;border:1px solid var(--hair);border-radius:12px;padding:12px 14px;background:var(--paper-2);color:var(--ink);font-family:var(--font-sans)}
.card{container-type:inline-size}
.hd{display:flex;gap:16px;align-items:flex-start;padding-bottom:6px}
.dn{margin:0;flex:none;padding-top:4px}
.side{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1;max-width:560px}
.cap{margin:0;min-height:1.4em;font:.66rem/1.4 var(--font-mono);color:var(--ink-55)}
@container (max-width: 440px){
  .hd{flex-direction:column;align-items:stretch}.dn{align-self:center}
  /* the weight share is in the value bars above, so the narrow rows keep only "Adds" */
  .line{grid-template-columns:24px minmax(0,1fr) 44px 10px;gap:8px}
  .cols{grid-template-columns:1fr 44px 10px;padding-left:32px}
  .line .w,.cols span:nth-child(2){display:none}
  .more-in{padding-left:0}
}
.dot{display:inline-block;width:8px;height:8px;border-radius:2px;border:1.5px solid;margin-right:6px}
.na .dot{border-style:dotted}
.row.on{background:var(--ink-8)}
.eyebrow{font:700 .58rem/1.3 var(--font-sans);letter-spacing:.2em;text-transform:uppercase;color:var(--ink-46)}
.sent{margin:2px 0 0;font-size:.84rem;line-height:1.35;color:var(--ink-86)}
.g{width:24px;height:24px;flex:none;border-radius:50%;display:grid;place-items:center;font:700 .72rem/1 var(--font-sans);border:1.5px solid var(--ink-38);color:var(--ink)}
.g.big{width:40px;height:40px;font-size:1.1rem}
.g-A{background:var(--accent);border-color:var(--accent);color:var(--paper)}
.g-B{border-color:var(--accent);color:var(--accent)}
.g-C{border-color:var(--ink-64)}
.g-D,.g-E{border-style:dashed;color:var(--ink-55)}
.g-na{border-style:dotted;color:var(--ink-38)}
.cols{display:grid;grid-template-columns:1fr 46px 48px 14px;gap:8px;padding:0 0 0 34px;font:700 .54rem var(--font-sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-46);border-bottom:1px solid var(--hair);padding-bottom:4px}
.cols span:nth-child(2),.cols span:nth-child(3){text-align:right}
.rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.row{border-bottom:1px solid var(--ink-8)}
.line{width:100%;display:grid;grid-template-columns:24px 1fr 46px 48px 14px;gap:10px;align-items:center;padding:7px 0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.line:hover .nm{text-decoration:underline;text-underline-offset:3px}
.main{display:flex;flex-direction:column;gap:2px;min-width:0}
.nm{font-size:.76rem;font-weight:600;color:var(--ink)}
.rs{font-weight:400;color:var(--ink-64)}
.key{font:.64rem/1.4 var(--font-mono);color:var(--ink-55);overflow-wrap:anywhere}
.na .nm{color:var(--ink-55)}
.w,.ct{font:600 .7rem var(--font-mono);font-variant-numeric:tabular-nums;text-align:right;color:var(--ink-64)}
.ct{color:var(--ink)}
.plus{width:9px;height:9px;position:relative;justify-self:end}
.plus::before,.plus::after{content:"";position:absolute;left:0;top:4px;width:9px;height:1px;background:var(--ink-46);transition:transform .35s var(--drawer)}
.plus::after{transform:rotate(90deg)}.plus.open::after{transform:rotate(0)}
.more{display:grid;grid-template-rows:0fr;transition:grid-template-rows .4s var(--drawer)}
.more.open{grid-template-rows:1fr}
.more-in{overflow:hidden;min-height:0;padding-left:34px}
.rule{margin:0 0 4px;font-size:.7rem;line-height:1.45;color:var(--ink-64)}
.rule span{font:700 .54rem var(--font-sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-46);margin-right:4px}
.ev{margin:0 0 8px;padding-left:14px;font-size:.7rem;line-height:1.45;color:var(--ink-80);display:flex;flex-direction:column;gap:2px}
.ev a{color:var(--ink);text-underline-offset:2px}
.faint{color:var(--ink-46)}
.verdict{margin:2px 0 0;font-size:.72rem;color:var(--ink-64)}
.verdict.pass{color:var(--accent)}
@media (prefers-reduced-motion: reduce){.more,.plus::before,.plus::after{transition:none}}
</style>
