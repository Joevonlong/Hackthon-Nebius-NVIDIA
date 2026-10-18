<script setup lang="ts">
// CR-11: key for the score colours (stacked bars, donuts, value bars), shown once above the tiles and the table.
import { COMPONENT_KEYS, COMPONENT_META } from '../score'
import { compColor } from './slices'
import './tokens.css'
</script>

<template>
  <p class="lg" title="Each coloured segment is what one component adds to the total (weight share × value); grey = points missed; the black tick is the minimum score.">
    <span v-for="k in COMPONENT_KEYS" :key="k" class="it"><i :style="{ background: compColor(k) }" aria-hidden="true" />{{ COMPONENT_META[k].short }}</span>
    <span class="it"><i class="miss" aria-hidden="true" />missed</span>
    <span class="it"><i class="tk" aria-hidden="true" />minimum</span>
  </p>
</template>

<style scoped>
.lg{margin:0 0 10px;display:flex;flex-wrap:wrap;gap:4px 12px;font:500 .64rem var(--font-sans);color:var(--ink-55);cursor:help}
.it{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
i{width:12px;height:5px;border-radius:99px;display:inline-block}
i.miss{background:var(--c-missed)}
i.tk{width:1.5px;height:9px;border-radius:1px;background:var(--ink)}
</style>
