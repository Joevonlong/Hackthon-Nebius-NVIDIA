<script setup lang="ts">
// F-60: six-axis mini radar (clockwise from the top: relevance, links, citations, venue, authors, LLM read).
// A not-assessed component draws a dashed ring at its axis tip and is left out of the shape (never drawn as 0).
import { computed } from 'vue'
import type { ScoreComponent } from '@shared/library'
import { COMPONENT_KEYS, COMPONENT_META, f2 } from '../score'
import { radarShapeKeys } from './facts'

const props = withDefaults(defineProps<{ components: ScoreComponent[]; accent?: boolean; size?: number; labels?: boolean }>(), { size: 64 })
const R = 26, C = 36
const axes = computed(() => COMPONENT_KEYS.map((k, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 3
  const c = props.components.find(x => x.key === k)
  const v = c?.value ?? null
  const at = (f: number) => ({ x: C + R * f * Math.cos(a), y: C + R * f * Math.sin(a) })
  return { k, v, tip: at(1), pt: v == null ? null : at(v), lbl: at(1.32), short: COMPONENT_META[k].short }
}))
const hex = (f: number) => axes.value.map(x => `${C + (x.tip.x - C) * f},${C + (x.tip.y - C) * f}`).join(' ')
const shape = computed(() => { const drawn = radarShapeKeys(props.components); return axes.value.filter(x => x.pt && drawn.includes(x.k)).map(x => `${x.pt!.x},${x.pt!.y}`).join(' ') })
const tip = computed(() => axes.value.map(x => `${COMPONENT_META[x.k].label}: ${x.v == null ? 'not assessed' : f2(x.v)}`).join('\n'))
</script>

<template>
  <svg class="rad" :class="{ acc: accent, lab: labels }" :width="labels ? size * 1.6 : size" :height="size" :viewBox="labels ? '-22 0 116 72' : '0 0 72 72'" role="img" :aria-label="tip">
    <title>{{ tip }}</title>
    <polygon class="g" :points="hex(1)" /><polygon class="g" :points="hex(0.5)" />
    <line v-for="x in axes" :key="x.k" class="ax" :class="{ na: x.v == null }" :x1="C" :y1="C" :x2="x.tip.x" :y2="x.tip.y" />
    <polygon class="shape" :points="shape" />
    <circle v-for="x in axes.filter(a => a.v == null)" :key="'n' + x.k" class="na-dot" :cx="x.tip.x" :cy="x.tip.y" r="3.6" />
    <template v-if="labels"><text v-for="x in axes" :key="'t' + x.k" :x="x.lbl.x" :y="x.lbl.y + 3" text-anchor="middle">{{ x.short }}</text></template>
  </svg>
</template>

<style scoped>
.rad{flex:none;display:block;overflow:visible}
.g{fill:none;stroke:var(--ink-16);stroke-width:.8}
.ax{stroke:var(--ink-16);stroke-width:.8}
.ax.na{stroke-dasharray:2 2;stroke:var(--ink-38)}
.shape{fill:var(--ink-16);stroke:var(--ink-80);stroke-width:1.4;stroke-linejoin:round}
.acc .shape{fill:color-mix(in oklch,var(--accent) 22%,transparent);stroke:var(--accent)}
.na-dot{fill:var(--paper-2);stroke:var(--ink-46);stroke-width:1;stroke-dasharray:2 1.6}
text{font:600 8.5px var(--font-sans);fill:var(--ink-64)}
</style>
