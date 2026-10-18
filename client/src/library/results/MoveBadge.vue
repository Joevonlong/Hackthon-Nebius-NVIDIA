<script setup lang="ts">
// Q-7 / Q-8: rank move since the last re-score. Green ▲ n (moved up) / red ▼ n (moved down), 12+ px, fades after ~8 s
// (the parent drops the move at the same time; `gen` restarts the animation on every new re-score).
defineProps<{ move?: number | null; gen?: number }>()
</script>

<template>
  <span v-if="move" :key="gen" class="mv" :class="move > 0 ? 'up' : 'dn'" :title="`rank moved ${move > 0 ? 'up' : 'down'} ${Math.abs(move)} after the last re-score`"><i aria-hidden="true">{{ move > 0 ? '▲' : '▼' }}</i>{{ Math.abs(move) }}<span class="sr">{{ move > 0 ? ' places up' : ' places down' }}</span></span>
</template>

<style scoped>
.mv{display:inline-flex;align-items:center;gap:2px;font:700 .8rem/1 var(--font-mono);font-variant-numeric:tabular-nums;white-space:nowrap;animation:mvfade 8s ease-out forwards}
.mv i{font-style:normal;font-size:.8rem;line-height:1}
.up{color:var(--ok)}.dn{color:var(--crit)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@keyframes mvfade{0%,80%{opacity:1}100%{opacity:0}}
@media (prefers-reduced-motion: reduce){.mv{animation:none}}
</style>
