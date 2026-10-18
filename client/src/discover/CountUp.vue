<script setup lang="ts">
// A number that counts up to its new value in <= 300 ms (instant with prefers-reduced-motion). Owner: lane C.
import { onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ value: number; ms?: number }>(), { ms: 300 })
const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const shown = ref(reduce ? props.value : 0)
let raf = 0

function animate(from: number, to: number) {
  cancelAnimationFrame(raf)
  if (reduce || from === to) { shown.value = to; return }
  const t0 = performance.now()
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / props.ms)
    const e = 1 - Math.pow(1 - k, 3)
    shown.value = Math.round(from + (to - from) * e)
    if (k < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}
watch(() => props.value, (to, from) => animate(from ?? 0, to))
animate(0, props.value)
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template><span class="cu">{{ shown.toLocaleString('en') }}</span></template>

<style scoped>
.cu{font-variant-numeric:tabular-nums}
</style>
