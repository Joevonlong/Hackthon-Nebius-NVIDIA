<script setup lang="ts">
// F-47 / D-25 "verdict first": total + letter grade, one plain sentence, chips for the top 2 strengths and the main
// weakness, and the passed / below badge (lane U1). Replaces the six-colour stacked bar.
import { computed } from 'vue'
import type { LibPaper } from '@shared/library'
import { COMPONENT_META, f2, grade, keyNumber, relativeNote, verdict } from './score'
import { useLibrary } from '../stores/library'
import { statusTip as statusTipOf } from './results/facts'

const props = defineProps<{ paper: LibPaper; compact?: boolean; move?: number | null }>()
const lib = useLibrary()
const v = computed(() => verdict(props.paper))
const status = computed(() => props.paper.excluded ? 'excluded' : props.paper.passed ? 'passed' : 'below')
const statusTip = computed(() => statusTipOf(props.paper, lib))
const chipTip = (c: LibPaper['components'][number]) => c.value == null ? `${COMPONENT_META[c.key].label}: not assessed` : `${COMPONENT_META[c.key].label}: ${f2(c.value)} (grade ${grade(c.value)}) · ${keyNumber(c)}${relativeNote(c) ? ' · ' + relativeNote(c) : ''}`
</script>

<template>
  <div class="vd" :class="{ compact }">
    <div class="score" :title="v.grade ? `total ${f2(paper.total)} · grade ${v.grade} (A ≥ 0.85 · B ≥ 0.70 · C ≥ 0.55 · D ≥ 0.40 · E below)` : 'no grade: nothing could be assessed'">
      <b class="g" :class="'g-' + v.grade">{{ v.grade ?? '–' }}</b><span class="tot">{{ f2(paper.total) }}</span>
    </div>
    <div class="body">
      <p class="sent">{{ v.sentence }}</p>
      <div v-if="!compact" class="chips">
        <span v-for="c in v.strengths" :key="c.key" class="chip up" :title="chipTip(c)"><i aria-hidden="true">↑</i>{{ COMPONENT_META[c.key].short }} {{ grade(c.value!) }}</span>
        <span v-if="v.weakness" class="chip down" :title="chipTip(v.weakness)"><i aria-hidden="true">↓</i>{{ COMPONENT_META[v.weakness.key].short }} {{ grade(v.weakness.value!) }}</span>
      </div>
    </div>
    <div class="side">
      <span class="badge" :class="status" :title="statusTip">{{ status }}</span>
      <span v-if="move" class="move" :class="move > 0 ? 'upm' : 'downm'" :title="`rank moved ${Math.abs(move)} place${Math.abs(move) === 1 ? '' : 's'} after the last applied change`">{{ move > 0 ? '▲' : '▼' }}{{ Math.abs(move) }}</span>
    </div>
  </div>
</template>

<style scoped>
.vd{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;min-width:0}
.score{display:flex;align-items:center;gap:7px;cursor:help}
.g{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font:700 .82rem/1 var(--font-sans);border:1.5px solid var(--ink-38);color:var(--ink)}
.g-A{background:var(--accent);border-color:var(--accent);color:var(--paper)}
.g-B{border-color:var(--accent);color:var(--accent)}
.g-C{border-color:var(--ink-64)}
.g-D,.g-E{border-style:dashed;color:var(--ink-55)}
.tot{font:600 .95rem var(--font-mono);font-variant-numeric:tabular-nums;color:var(--ink)}
.body{min-width:0;display:flex;flex-direction:column;gap:5px}
.sent{margin:0;font-size:.8rem;line-height:1.35;color:var(--ink-86)}
.chips{display:flex;flex-wrap:wrap;gap:5px}
.chip{display:inline-flex;align-items:center;gap:4px;font:600 .64rem/1 var(--font-sans);border:1px solid var(--ink-26);border-radius:99px;padding:4px 8px;color:var(--ink-80);cursor:help}
.chip i{font-style:normal;font-weight:700}
.chip.up{border-color:var(--ink-46)}
.chip.up i{color:var(--accent)}
.chip.down{border-style:dashed;color:var(--ink-55)}
.side{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.badge{font:600 .6rem/1 var(--font-mono);letter-spacing:.06em;text-transform:uppercase;padding:4px 8px;border-radius:99px;border:1px solid var(--ink-26);color:var(--ink-55);white-space:nowrap;cursor:help}
.badge.passed{border-color:var(--accent);color:var(--accent)}
.badge.excluded{border-style:dashed}
.move{font:700 .64rem var(--font-mono);font-variant-numeric:tabular-nums}
.move.upm{color:var(--accent)}
.move.downm{color:var(--ink-55)}
.compact{gap:9px}
.compact .g{width:22px;height:22px;font-size:.68rem}
.compact .tot{font-size:.74rem}
.compact .sent{font-size:.7rem;color:var(--ink-64)}
</style>
