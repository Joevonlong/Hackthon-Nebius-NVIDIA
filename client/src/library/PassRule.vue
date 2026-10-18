<script setup lang="ts">
// F-49 / D-27 pass rule controls (lane U1): "Pass: top X% of this library" + "Minimum score"; passed = rank within the
// top X% of the scored, non-excluded papers AND total ≥ the minimum. Re-computed in the browser; shows "N of M pass".
import { computed } from 'vue'
import { useLibrary } from '../stores/library'
import { f2 } from './score'

defineProps<{ dense?: boolean }>()
const lib = useLibrary()
const uid = Math.random().toString(36).slice(2, 7)
const topPct = computed({ get: () => lib.topPercent, set: (v: number) => { lib.topPercent = Math.max(1, Math.min(100, Math.round(Number(v) || 25))) } })
const floor = computed({ get: () => lib.threshold, set: (v: number) => { lib.threshold = Math.max(0, Math.min(1, Number(v) || 0)) } })
// Fewer than the cut pass when papers in the cut fall below the floor, or the LLM read gated them off-topic (D-38).
const limitedBy = computed(() => {
  if (!lib.eligibleCount || lib.passedCount >= lib.cutCount) return 'top X%'
  const cut = lib.papers.filter(p => !p.excluded).slice(0, lib.cutCount)
  const gated = cut.filter(p => p.llmRead && p.llmRead.relevance <= 1).length
  const low = cut.filter(p => p.total < lib.threshold).length
  return gated && low ? `minimum score and the off-topic gate (${gated} gated)` : gated ? `off-topic gate (${gated} papers the LLM read rated off-topic)` : 'minimum score'
})
</script>

<template>
  <div class="pr" :class="{ dense }">
    <div class="ctl">
      <label :for="'tp-' + uid">Pass: top <b>{{ lib.topPercent }}%</b> of this library</label>
      <input :id="'tp-' + uid" v-model.number="topPct" type="range" min="1" max="100" step="1" />
    </div>
    <div class="ctl">
      <label :for="'fl-' + uid">Minimum score <b>{{ f2(lib.threshold) }}</b></label>
      <input :id="'fl-' + uid" v-model.number="floor" type="range" min="0" max="1" step="0.01" />
    </div>
    <p v-if="lib.eligibleCount" class="count" role="status"><b>{{ lib.passedCount }} of {{ lib.eligibleCount }}</b> pass<span class="faint"> · top {{ lib.topPercent }}% = {{ lib.cutCount }} papers · limited by the {{ limitedBy }}</span></p>
    <p v-else class="count faint">N of M pass appears once a library is built.</p>
  </div>
</template>

<style scoped>
.pr{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;align-items:end;font-family:var(--font-sans);color:var(--ink)}
.dense{grid-template-columns:1fr}
.ctl{display:flex;flex-direction:column;gap:5px;min-width:0}
label{font-size:.72rem;color:var(--ink-64)}
label b{font:600 .74rem var(--font-mono);color:var(--ink);font-variant-numeric:tabular-nums}
input[type=range]{width:100%;accent-color:var(--ink);height:14px;margin:0}
.count{grid-column:1 / -1;margin:0;font-size:.74rem;color:var(--ink-80)}
.count b{color:var(--accent);font-family:var(--font-mono)}
.faint{color:var(--ink-46)}
</style>
