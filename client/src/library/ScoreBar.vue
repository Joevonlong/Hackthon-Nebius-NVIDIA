<script setup lang="ts">
// Total score as a bar split into the six component contributions, with the threshold marker (lane L3).
// Every segment and the total carry their evidence in the hover title, so no score is unexplained.
import { computed } from 'vue'
import type { LibPaper } from '@shared/library'
import { COMPONENT_META, f2 } from './score'

const props = defineProps<{ paper: LibPaper; threshold: number }>()
const segs = computed(() => props.paper.components.filter(c => c.contribution > 0))
const tipFor = (c: LibPaper['components'][number]) =>
  `${COMPONENT_META[c.key].label}: weight ${f2(c.weight)} × value ${f2(c.value)} = ${f2(c.contribution)}\n${c.how}\n` + c.evidence.map(e => '· ' + e.text + (e.source ? ` [${e.source.name}]` : '')).join('\n')
const totalTip = computed(() => {
  const p = props.paper
  const parts = p.components.map(c => c.value == null ? `${COMPONENT_META[c.key].short} not assessed` : `${COMPONENT_META[c.key].short} ${f2(c.contribution)}`).join(' + ')
  return `total ${f2(p.total)} = ${parts}\n${p.excluded ? 'excluded: ' + p.excluded : p.passed ? `passed: ≥ threshold ${f2(props.threshold)}` : `below threshold ${f2(props.threshold)}`}`
})
</script>

<template>
  <div class="sb" :title="totalTip">
    <div class="track" role="img" :aria-label="totalTip">
      <div class="fill"><span v-for="c in segs" :key="c.key" class="seg" :style="{ width: (c.contribution * 100) + '%', background: COMPONENT_META[c.key].color }" :title="tipFor(c)" /></div>
      <i class="thr" :style="{ left: (threshold * 100) + '%' }" :title="`threshold ${f2(threshold)}: papers at or above it join the citation graph`" />
    </div>
    <b class="tot" :class="{ pass: paper.passed, fail: !paper.passed }">{{ f2(paper.total) }}</b>
  </div>
</template>

<style scoped>
.sb{display:flex;align-items:center;gap:10px;min-width:0}
.track{position:relative;flex:1;height:6px;border-radius:99px;background:var(--ink-8);display:flex;overflow:visible}
.fill{display:flex;width:100%;height:100%;border-radius:99px;overflow:hidden;transform-origin:left;animation:fillIn .9s var(--reveal) both;animation-delay:.15s}
@keyframes fillIn{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.seg{height:100%;display:block}
.seg:hover{filter:brightness(1.15)}
.thr{position:absolute;top:-3px;bottom:-3px;width:1px;background:var(--ink);transform:translateX(-.5px);cursor:help}
.tot{font:600 .72rem var(--font-mono);font-variant-numeric:tabular-nums;min-width:32px;text-align:right;cursor:help}
.tot.pass{color:var(--accent)}
.tot.fail{color:var(--ink-46)}
@media (prefers-reduced-motion: reduce){.fill{animation:none}}
</style>
