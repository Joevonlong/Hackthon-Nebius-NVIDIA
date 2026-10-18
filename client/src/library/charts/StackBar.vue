<script setup lang="ts">
// CR-11 V-4: mini stacked bar for tiles and table rows. Segments = component contributions in the component colours,
// total length = total (full width = 1.0); the tick marks the minimum score (pass floor).
import { computed } from 'vue'
import type { ScoreComponent } from '@shared/library'
import { f2 } from '../score'
import { compColor, scoreSlices, sliceText } from './slices'
import './tokens.css'

const props = defineProps<{ components: ScoreComponent[]; threshold: number }>()
const sl = computed(() => scoreSlices(props.components))
const segs = computed(() => sl.value.slices.filter(s => s.contribution > 0))
const tip = computed(() => [`total ${f2(sl.value.total)} · tick = minimum ${f2(props.threshold)}`, ...sl.value.slices.map(sliceText)].join('\n'))
const pc = (x: number) => Math.max(0, Math.min(100, x * 100)) + '%'
</script>

<template>
  <span class="stk" :title="tip" role="img" :aria-label="tip">
    <span class="segs"><span v-for="s in segs" :key="s.key" class="seg" :style="{ width: pc(s.contribution), background: compColor(s.key) }" /></span>
    <span class="tick" :style="{ left: pc(threshold) }" aria-hidden="true" />
  </span>
</template>

<style scoped>
.stk{position:relative;display:block;height:5px;border-radius:99px;background:var(--c-missed);cursor:help}
.segs{position:absolute;inset:0;display:flex;border-radius:99px;overflow:hidden}
.seg{display:block;height:100%;flex:none}
.seg + .seg{box-shadow:inset 1px 0 0 var(--paper-2)}
.tick{position:absolute;top:-2px;bottom:-2px;width:1.5px;margin-left:-.75px;background:var(--ink);border-radius:1px}
</style>
