<script setup lang="ts">
// F-60: one table row (see ResultTable.vue). The HoverCard anchors to the title cell.
import { computed } from 'vue'
import type { LibPaper } from '@shared/library'
import { useLibrary } from '../../stores/library'
import { COMPONENT_KEYS, f2, grade } from '../score'
import { fmtScore, authorYear, comp, compTip, status, statusTip } from './facts'
import { useHoverCard } from './useHoverCard'
import MoveBadge from './MoveBadge.vue'
import SparkBar from './SparkBar.vue'
import HoverCard from './HoverCard.vue'
import StackBar from '../charts/StackBar.vue' // CR-11 V-4

const props = defineProps<{ paper: LibPaper; threshold: number; move?: number | null; gen?: number; inVault?: boolean; expanded?: boolean }>()
const emit = defineEmits<{ open: []; toggle: [] }>()
const lib = useLibrary()
const g = computed(() => grade(props.paper.total))
const st = computed(() => status(props.paper))
const hc = useHoverCard()
</script>

<template>
  <tr class="row" :class="[st, { exp: expanded }]" @click="emit('open')">
    <td class="rk">#{{ paper.rank }}<MoveBadge class="mvb" :move="move" :gen="gen" /></td>
    <td :ref="el => (hc.host.value = el as HTMLElement)" class="tt" v-on="hc.on">
      <button type="button" :title="paper.paper.title" @click.stop="emit('open')">{{ paper.paper.title }}</button>
      <span class="sub">{{ authorYear(paper) }} · {{ paper.paper.venue || 'no venue' }}<span class="kn"> · {{ paper.labels.kind }}</span><template v-if="inVault"> · in vault</template></span>
      <StackBar class="stk" :components="paper.components" :threshold="threshold" />
      <HoverCard v-if="hc.open.value" :paper="paper" :in-vault="inVault" :up="hc.up.value" :right="hc.right.value" />
    </td>
    <td class="num yr">{{ paper.paper.year ?? 'n.d.' }}</td>
    <td class="kd" :title="paper.labels.kind">{{ paper.labels.kind }}</td>
    <td v-for="k in COMPONENT_KEYS" :key="k" class="sbc"><SparkBar :c="comp(paper, k)" :tip="compTip(comp(paper, k), lib.deK)" /></td>
    <td class="num tot" :title="`total ${fmtScore(paper.total, threshold)} · minimum ${f2(threshold)}`"><b class="gi" :class="{ hi: g === 'A' || g === 'B' }">{{ g }}</b>{{ fmtScore(paper.total, threshold) }}</td>
    <td class="gc"><b class="g" :class="'g-' + g" :title="`grade ${g}`">{{ g }}</b></td>
    <td><span class="st" :title="statusTip(paper)">{{ st }}</span></td>
    <td><button type="button" class="x" :aria-expanded="!!expanded" :aria-label="(expanded ? 'Close' : 'Open') + ' report card'" :title="expanded ? 'Close report card' : 'Report card'" @click.stop="hc.close(); emit('toggle')"><span class="plus" :class="{ open: expanded }" aria-hidden="true" /></button></td>
  </tr>
</template>

<style scoped>
.row{cursor:pointer;border-bottom:1px solid var(--hair)}
.row:hover,.row:focus-within{background:var(--ink-8)}
.row.passed td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
.row.excluded{opacity:.7}
td{padding:7px 6px;vertical-align:middle}
.rk{font:700 .68rem var(--font-mono);white-space:nowrap}
.mvb{margin-left:5px}
.tt{position:relative;min-width:0}
.tt button{all:unset;display:block;max-width:100%;font:600 .8rem/1.3 var(--font-sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.tt button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.tt button:hover{text-decoration:underline;text-underline-offset:3px}
.sub{display:block;font-size:.66rem;color:var(--ink-55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stk{margin-top:5px;max-width:260px}
.num{font:500 .72rem var(--font-mono);font-variant-numeric:tabular-nums}
.tot{font-weight:700}
.kd{font-size:.66rem;color:var(--ink-64);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font:700 .66rem/1 var(--font-sans);border:1.5px solid var(--ink-38)}
.g-A{background:var(--accent);border-color:var(--accent);color:var(--paper)}
.g-B{border-color:var(--accent);color:var(--accent)}
.g-C{border-color:var(--ink-64)}
.g-D,.g-E{border-style:dashed;color:var(--ink-55)}
.st{font:600 .56rem var(--font-mono);letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--ink-26);border-radius:99px;padding:3px 6px;color:var(--ink-55);cursor:help}
.passed .st{border-color:var(--accent);color:var(--accent)}
.excluded .st{border-style:dashed}
.x{border:0;background:transparent;cursor:pointer;padding:6px;color:var(--ink-55)}
.plus{display:block;width:10px;height:10px;position:relative}
.plus::before,.plus::after{content:"";position:absolute;left:0;top:4.5px;width:10px;height:1px;background:currentColor;transition:transform .35s var(--drawer)}
.plus::after{transform:rotate(90deg)}.plus.open::after{transform:rotate(0)}
td.sbc{padding:7px 4px}
.kn,.gi{display:none}
@container (max-width: 960px){
  .yr,.kd,.gc{display:none}
  .kn{display:inline}
  .gi{display:inline-block;margin-right:5px;font:700 .7rem var(--font-sans)}
  .gi.hi{color:var(--accent)}
  td.sbc{padding:7px 2px}
  .tt button{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .st{font-size:0;padding:0;width:9px;height:9px;display:inline-block;border-radius:50%;border:1.5px solid var(--ink-38)}
  .passed .st{background:var(--accent);border-color:var(--accent)}
}
@container (max-width: 440px){td.sbc{display:none}}
@media (prefers-reduced-motion: reduce){.plus::before,.plus::after{transition:none}}
</style>
