<script setup lang="ts">
// F-60 (D-34) responsive grid of score tiles; an expanded tile spans the row with its report card.
import { reactive } from 'vue'
import type { LibPaper } from '@shared/library'
import { useLibrary } from '../../stores/library'
import ResultTile from './ResultTile.vue'
import ChartLegend from '../charts/ChartLegend.vue'

defineProps<{ papers: LibPaper[]; inVault: (id: string) => boolean; moves: Record<string, number>; gen: number }>()
const emit = defineEmits<{ open: [id: string] }>()
const lib = useLibrary()
const expanded = reactive<Record<string, boolean>>({})
</script>

<template>
  <ChartLegend />
  <ol class="grid">
    <li v-for="(p, i) in papers" :key="p.paper.id" :class="{ wide: expanded[p.paper.id] }">
      <ResultTile :paper="p" :index="i" :threshold="lib.threshold" :move="moves[p.paper.id]" :gen="gen" :in-vault="inVault(p.paper.id)" :expanded="!!expanded[p.paper.id]"
        @open="emit('open', p.paper.id)" @toggle="expanded[p.paper.id] = !expanded[p.paper.id]" />
    </li>
  </ol>
</template>

<style scoped>
.grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));grid-auto-flow:row dense;gap:12px}
.grid li{display:flex;min-width:0}
.grid li > *{flex:1}
.grid li.wide{grid-column:1/-1}
</style>
