<script setup lang="ts">
// CR-11 V-1 / V-3: the score as a donut. Coloured slice = what one component adds (share × value), grey arc = points
// missed (1 − total), centre = letter grade (+ total unless `small`). Pure SVG; hover a slice for its sentence.
import { computed } from 'vue'
import type { ScoreComponent } from '@shared/library'
import { f2, grade } from '../score'
import { compColor, scoreSlices, sliceText, type Slice } from './slices'
import './tokens.css'

const props = withDefaults(defineProps<{ components: ScoreComponent[]; total?: number; size?: number; small?: boolean; active?: string | null }>(), { size: 128, active: null })
const emit = defineEmits<{ hover: [key: string | null] }>()
const R = 40, SW = 13 // viewBox 100×100
const sl = computed(() => scoreSlices(props.components))
const total = computed(() => props.total ?? sl.value.total)
const g = computed(() => grade(total.value))
const GAP = 0.6 // in pathLength units (of 100)
const arcs = computed(() => sl.value.slices.filter(s => s.contribution > 0).map(s => {
  const len = s.contribution * 100, gap = len > GAP * 2 ? GAP : 0
  return { s, dash: `${len - gap} ${100 - len + gap}`, off: -s.start * 100 }
}))
const missed = computed(() => {
  const len = sl.value.missed * 100
  return len > 0.05 ? { dash: `${len} ${100 - len}`, off: -sl.value.total * 100 } : null
})
const label = computed(() => `Score ${f2(total.value)}, grade ${g.value}. ` + sl.value.slices.map(sliceText).join('; ') + `; missed ${f2(sl.value.missed)}.`)
const tip = (s: Slice) => sliceText(s)
</script>

<template>
  <svg class="donut" :class="{ small, dim: !!active }" :width="size" :height="size" viewBox="0 0 100 100" role="img" :aria-label="label">
    <g transform="rotate(-90 50 50)" :stroke-width="SW" fill="none">
      <circle v-if="missed" class="miss" cx="50" cy="50" :r="R" pathLength="100" :stroke-dasharray="missed.dash" :stroke-dashoffset="missed.off"
        @mouseenter="emit('hover', 'missed')" @mouseleave="emit('hover', null)"><title>Missed {{ f2(sl.missed) }} (1 − total)</title></circle>
      <circle v-for="a in arcs" :key="a.s.key" class="sl" :class="{ on: active === a.s.key }" cx="50" cy="50" :r="R" pathLength="100"
        :stroke="compColor(a.s.key)" :stroke-dasharray="a.dash" :stroke-dashoffset="a.off"
        @mouseenter="emit('hover', a.s.key)" @mouseleave="emit('hover', null)"><title>{{ tip(a.s) }}</title></circle>
    </g>
    <text class="gr" x="50" :y="small ? 58 : 52" text-anchor="middle">{{ g }}</text>
    <text v-if="!small" class="tot" x="50" y="68" text-anchor="middle">{{ f2(total) }}</text>
    <title v-if="small">grade {{ g }} · total {{ f2(total) }}</title>
  </svg>
</template>

<style scoped>
.donut{flex:none;display:block;overflow:visible}
.miss{stroke:var(--c-missed)}
.sl{transition:opacity .2s,stroke-width .2s;cursor:help}
.dim .sl{opacity:.35}
.dim .sl.on{opacity:1;stroke-width:16}
.gr{font:700 26px/1 var(--font-sans);fill:var(--ink)}
.small .gr{font-size:30px}
.tot{font:600 12px var(--font-mono);fill:var(--ink-64);font-variant-numeric:tabular-nums}
@media (prefers-reduced-motion: reduce){.sl{transition:none}}
</style>
