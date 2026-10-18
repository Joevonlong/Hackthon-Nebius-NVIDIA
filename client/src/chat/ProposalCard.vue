<script setup lang="ts">
// Lane U2. A chat proposal as a diff card (weights old → new, pass rule, filters, rationale) with Apply / Dismiss.
import { computed } from 'vue'
import type { Proposal, Weights } from '@shared/library'
import type { LibSettings } from './libApi'

const props = defineProps<{ proposal: Proposal; current: LibSettings; state?: 'open' | 'applied' | 'dismissed'; note?: string }>()
defineEmits<{ apply: []; dismiss: [] }>()

const KEYS: (keyof Weights)[] = ['relevance', 'graph', 'citations', 'venue', 'authors', 'llm']
const LABEL: Record<keyof Weights, string> = { relevance: 'Relevance', graph: 'Links to your papers', citations: 'Citations', venue: 'Venue', authors: 'Authors', llm: 'LLM read' }
const pct = (w: Weights, k: keyof Weights) => { const s = KEYS.reduce((a, x) => a + w[x], 0) || 1; return Math.round((w[k] / s) * 100) }

const weightRows = computed(() => {
  const pw = props.proposal.weights
  if (!pw) return []
  const now = props.current.weights
  const next = { ...now, ...pw } as Weights
  return KEYS.filter(k => pw[k] != null).map(k => ({ k, label: LABEL[k], from: pct(now, k), to: pct(next, k) }))
})
const filterRows = computed(() => {
  const f = props.proposal.filters
  if (!f) return []
  const rows: string[] = []
  if (f.kinds?.length) rows.push(`Keep kinds: ${f.kinds.join(', ')}`)
  if (f.minYear != null || f.maxYear != null) rows.push(`Years: ${f.minYear ?? 'any'}–${f.maxYear ?? 'now'}`)
  if (f.openAccessOnly) rows.push('Open access only')
  if (f.peerReviewedOnly) rows.push('Peer reviewed only')
  return rows
})
</script>

<template>
  <div class="card" :class="state">
    <div class="hd">Proposed change</div>
    <table v-if="weightRows.length" class="w">
      <tr v-for="r in weightRows" :key="r.k">
        <td>{{ r.label }}</td>
        <td class="num">{{ r.from }}%</td><td class="arr">→</td>
        <td class="num" :class="r.to > r.from ? 'up' : r.to < r.from ? 'down' : ''">{{ r.to }}%</td>
      </tr>
    </table>
    <div v-if="proposal.topPercent != null || proposal.threshold != null" class="row">
      Pass rule: top {{ current.topPercent }}% · min {{ current.threshold.toFixed(2) }}
      <span class="arr">→</span>
      <b>top {{ proposal.topPercent ?? current.topPercent }}% · min {{ (proposal.threshold ?? current.threshold).toFixed(2) }}</b>
    </div>
    <div v-for="f in filterRows" :key="f" class="row">Filter: <b>{{ f }}</b></div>
    <p class="why">{{ proposal.rationale }}</p>
    <div v-if="state === 'open'" class="btns">
      <button type="button" class="apply" @click="$emit('apply')">Apply</button>
      <button type="button" class="dismiss" @click="$emit('dismiss')">Dismiss</button>
    </div>
    <div v-else-if="state === 'applied'" class="done">{{ note || 'Applied' }}</div>
    <div v-else-if="state === 'dismissed'" class="done muted">Dismissed</div>
  </div>
</template>

<style scoped>
.card{margin-top:8px;border:1px solid var(--line-2);border-radius:var(--r);padding:10px 12px;background:var(--surface);font-size:12.5px}
.card.dismissed{opacity:.6}
.hd{font:600 11px var(--font-mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:6px}
.w{width:100%;border-collapse:collapse;margin-bottom:4px}
.w td{padding:2px 0}
.num{text-align:right;font-family:var(--font-mono);width:44px}
.arr{color:var(--muted);text-align:center;width:22px;padding:0 4px}
.up{color:var(--ok);font-weight:600}.down{color:var(--cand);font-weight:600}
.row{margin:3px 0}
.why{margin:6px 0 8px;color:var(--muted);line-height:1.4}
.btns{display:flex;gap:6px}
button{border-radius:6px;padding:5px 12px;font-size:12.5px;cursor:pointer;border:1px solid var(--line-2);background:var(--surface-2);color:var(--fg)}
.apply{background:var(--seed);border-color:var(--seed);color:#fff;font-weight:600}
.done{font-weight:600;color:var(--ok)}
.done.muted{color:var(--muted);font-weight:500}
</style>
