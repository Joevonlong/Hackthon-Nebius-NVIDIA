<script setup lang="ts">
// F-60: total as a ring (0..1, clockwise from the top) with a tick at the minimum score; accent when passed.
import { computed } from 'vue'
import { f2 } from '../score'
import { fmtScore } from './facts'

const props = withDefaults(defineProps<{ total: number; threshold: number; passed?: boolean; size?: number }>(), { size: 54 })
const r = 21
const tick = computed(() => {
  const a = props.threshold * 2 * Math.PI - Math.PI / 2
  return { x1: 27 + (r - 5) * Math.cos(a), y1: 27 + (r - 5) * Math.sin(a), x2: 27 + (r + 5) * Math.cos(a), y2: 27 + (r + 5) * Math.sin(a) }
})
</script>

<template>
  <svg class="ring" :class="{ pass: passed }" :width="size" :height="size" viewBox="0 0 54 54" role="img" :aria-label="`total ${fmtScore(total, threshold)}, minimum ${f2(threshold)}`">
    <title>total {{ fmtScore(total, threshold) }} · tick = minimum score {{ f2(threshold) }}</title>
    <circle class="track" cx="27" cy="27" :r="r" />
    <circle class="arc" cx="27" cy="27" :r="r" pathLength="100" :stroke-dasharray="`${Math.max(0, Math.min(1, total)) * 100} 100`" transform="rotate(-90 27 27)" />
    <line class="tick" v-bind="tick" />
    <text x="27" y="31" text-anchor="middle" :class="{ sm: fmtScore(total, threshold).length > 4 }">{{ fmtScore(total, threshold) }}</text>
  </svg>
</template>

<style scoped>
.ring{flex:none;display:block}
.track{fill:none;stroke:var(--ink-16);stroke-width:4}
.arc{fill:none;stroke:var(--ink-80);stroke-width:4;stroke-linecap:round;animation:draw .9s var(--reveal) both}
.pass .arc{stroke:var(--accent)}
.tick{stroke:var(--ink);stroke-width:1.5}
text.sm{font-size:9px}
text{font:600 11.5px var(--font-mono);fill:var(--ink);font-variant-numeric:tabular-nums}
@keyframes draw{from{stroke-dasharray:0 100}}
@media (prefers-reduced-motion: reduce){.arc{animation:none}}
</style>
