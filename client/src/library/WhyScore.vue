<script setup lang="ts">
// "Why this score": every component with weight, value, contribution, rule and evidence lines (lane L3).
import type { LibPaper } from '@shared/library'
import { COMPONENT_META, f2 } from './score'

const props = defineProps<{ paper: LibPaper; threshold: number }>()
/** Effective weight after normalizing over the assessed components (what the contribution actually uses). */
const eff = (w: number, assessed: boolean) => {
  const sum = props.paper.components.filter(c => c.value != null).reduce((s, c) => s + c.weight, 0)
  return assessed && sum > 0 ? w / sum : 0
}
</script>

<template>
  <div class="why">
    <table>
      <thead><tr><th>Component</th><th title="raw weight → effective share after normalizing over the components that could be assessed">weight → eff.</th><th title="0..1">value</th><th title="weight × value / Σ assessed weights">contrib.</th></tr></thead>
      <tbody>
        <template v-for="c in paper.components" :key="c.key">
          <tr class="row" :class="{ na: c.value == null }">
            <td><i :style="{ background: COMPONENT_META[c.key].color }" />{{ c.label || COMPONENT_META[c.key].label }}</td>
            <td class="n" :title="`raw weight ${f2(c.weight)}; normalized over the assessed components = ${f2(eff(c.weight, c.value != null))}`">{{ f2(c.weight) }} <small class="eff">→ {{ f2(eff(c.weight, c.value != null)) }}</small></td>
            <td class="n">{{ c.value == null ? 'not assessed' : f2(c.value) }}</td>
            <td class="n"><b>{{ f2(c.contribution) }}</b></td>
          </tr>
          <tr class="ev">
            <td colspan="4">
              <p class="how">{{ c.how }}</p>
              <ul>
                <li v-for="(e, i) in c.evidence" :key="i">{{ e.text }}<template v-if="e.source"> · <a :href="e.source.url" target="_blank" rel="noopener">{{ e.source.name }}</a></template></li>
                <li v-if="!c.evidence.length" class="muted">No evidence lines recorded.</li>
              </ul>
            </td>
          </tr>
        </template>
      </tbody>
      <tfoot><tr><td>Total</td><td /><td class="n muted">threshold {{ f2(threshold) }}</td><td class="n"><b :class="paper.passed ? 'pass' : 'fail'">{{ f2(paper.total) }}</b></td></tr></tfoot>
    </table>
    <p v-if="paper.excluded" class="excl">Excluded by a hard gate: {{ paper.excluded }}. Never added to the graph.</p>
    <p v-else class="verdict">{{ paper.passed ? `Passed: ${f2(paper.total)} ≥ ${f2(threshold)}, joins the citation graph.` : `Below threshold: ${f2(paper.total)} < ${f2(threshold)}.` }}</p>
  </div>
</template>

<style scoped>
.why{font-size:12px;display:flex;flex-direction:column;gap:6px}
table{width:100%;border-collapse:collapse}
th{font:500 10px var(--font-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:right;padding:2px 4px;border-bottom:1px solid var(--line);cursor:help}
th:first-child{text-align:left}
td{padding:3px 4px;vertical-align:top}
.row td{border-top:1px solid var(--line);font-weight:600}
.row td i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px}
.row.na td{color:var(--muted)}
.n{text-align:right;font-family:var(--font-mono);font-variant-numeric:tabular-nums;white-space:nowrap}
.ev td{padding-top:0;padding-bottom:6px}
.eff{color:var(--muted);font-weight:400}
.how{margin:0 0 2px;color:var(--muted);font-style:italic}
ul{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:1px}
a{color:var(--seed)}
tfoot td{border-top:1px solid var(--line-2);font-weight:600}
.pass{color:var(--ok)}
.fail,.muted{color:var(--muted)}
.excl{margin:0;color:var(--crit)}
.verdict{margin:0;color:var(--muted)}
</style>
