<script setup lang="ts">
// CR-11 V-2: one bar per component beside the donut. Colour chip, bar length = value 0–1, label "value · share";
// not assessed = dotted empty bar. Clicking a row toggles that component's evidence text in the report card.
import { computed } from 'vue'
import type { ScoreComponent } from '@shared/library'
import { COMPONENT_META } from '../score'
import { barLabel, compColor, scoreSlices, sliceText } from './slices'
import './tokens.css'

const props = defineProps<{ components: ScoreComponent[]; active?: string | null; open?: Record<string, boolean> }>()
const emit = defineEmits<{ hover: [key: string | null]; toggle: [key: string] }>()
const sl = computed(() => scoreSlices(props.components))
</script>

<template>
  <ul class="vb" :class="{ dim: !!active && active !== 'missed' }">
    <li v-for="s in sl.slices" :key="s.key">
      <button type="button" class="r" :class="{ na: s.value == null, on: active === s.key }" :aria-expanded="!!open?.[s.key]" :title="sliceText(s) + ' · click for the evidence'"
        @mouseenter="emit('hover', s.key)" @mouseleave="emit('hover', null)" @focus="emit('hover', s.key)" @blur="emit('hover', null)" @click="emit('toggle', s.key)">
        <i class="chip" :style="{ background: s.value == null ? 'transparent' : compColor(s.key), borderColor: compColor(s.key) }" aria-hidden="true" />
        <span class="nm">{{ COMPONENT_META[s.key].short }}</span>
        <span class="bar"><span v-if="s.value != null" class="fill" :style="{ width: s.value * 100 + '%', background: compColor(s.key) }" /></span>
        <span class="lb">{{ barLabel(s) }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.vb{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px;min-width:0}
.r{width:100%;display:grid;grid-template-columns:9px 64px minmax(40px,1fr) 78px;gap:8px;align-items:center;padding:4px 4px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:opacity .2s,background .2s}
.r:hover,.r.on{background:var(--ink-8)}
.dim .r:not(.on){opacity:.45}
.r:focus-visible{outline:2px solid var(--ink);outline-offset:-1px}
.chip{width:9px;height:9px;border-radius:2px;border:1.5px solid}
.na .chip{border-style:dotted}
.nm{font:600 .72rem var(--font-sans);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.na .nm{color:var(--ink-55)}
.bar{position:relative;display:block;height:8px;border-radius:99px;background:var(--ink-8);overflow:hidden}
.na .bar{background:transparent;border:1.5px dotted var(--ink-38)}
.fill{display:block;height:100%;border-radius:99px}
.lb{font:600 .66rem var(--font-mono);font-variant-numeric:tabular-nums;color:var(--ink-64);text-align:right;white-space:nowrap}
.na .lb{font-family:var(--font-sans);font-weight:500;font-style:italic;color:var(--ink-46)}
@media (prefers-reduced-motion: reduce){.r{transition:none}}
</style>
