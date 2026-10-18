<script setup lang="ts">
// Label chips for a library paper (lane L3): kind, study design, peer review, OA, field, recency, tags, found-by.
import { computed } from 'vue'
import type { LibPaper } from '@shared/library'
import { SOURCE_LABEL } from '../stores/library'

const props = defineProps<{ paper: LibPaper }>()
const chips = computed(() => {
  const l = props.paper.labels
  const out: { text: string; cls: string; title: string }[] = []
  out.push({ text: l.kind, cls: 'kind', title: 'kind: from OpenAlex type, venue type, PubMed publication type and arXiv' })
  for (const d of l.studyDesign) out.push({ text: d, cls: 'design', title: 'study design (PubMed publication type)' })
  if (l.peerReviewed != null) out.push({ text: l.peerReviewed ? 'peer-reviewed' : 'not peer-reviewed', cls: l.peerReviewed ? 'ok' : 'warn', title: 'journal or conference venue and not a preprint' })
  if (l.openAccess) out.push({ text: 'OA ' + l.openAccess, cls: l.openAccess === 'closed' ? '' : 'ok', title: 'OpenAlex oa_status' })
  if (l.subfield || l.field) out.push({ text: l.subfield || l.field!, cls: '', title: `field: ${l.field ?? 'n/a'} · subfield: ${l.subfield ?? 'n/a'} · topic: ${l.topic ?? 'n/a'} (OpenAlex primary_topic)` })
  out.push({ text: l.recency, cls: l.recency === 'fresh' ? 'fresh' : '', title: 'fresh ≤ 18 months · recent ≤ 5 y · established ≤ 15 y · classic older' })
  for (const t of l.tags) out.push({ text: t, cls: t === 'retracted' ? 'crit' : 'tag', title: 'tag' })
  if (!l.hasAbstract) out.push({ text: 'no abstract', cls: 'warn', title: 'flag (shown, not excluded)' })
  if (l.language && l.language !== 'en') out.push({ text: 'lang ' + l.language, cls: 'warn', title: 'non-English (flag)' })
  for (const c of props.paper.components) if (c.value == null) out.push({ text: 'not assessed: ' + c.key, cls: 'na', title: c.how })
  return out
})
const found = computed(() => props.paper.labels.sources.map(s => {
  const hits = props.paper.hits.filter(h => h.source === s)
  return { s, label: SOURCE_LABEL[s], title: hits.map(h => `${h.via}${h.query ? ': ' + h.query : ''}${h.rank != null ? ' · rank ' + h.rank : ''}`).join('\n') || 'found by ' + SOURCE_LABEL[s], url: hits[0]?.url }
}))
</script>

<template>
  <div class="chips">
    <span v-for="(c, i) in chips" :key="i" class="chip" :class="c.cls" :title="c.title">{{ c.text }}</span>
    <a v-for="f in found" :key="f.s" class="chip src" :href="f.url" target="_blank" rel="noopener" :title="'found by ' + f.label + '\n' + f.title" @click.stop>{{ f.label }}</a>
  </div>
</template>

<style scoped>
.chips{display:flex;flex-wrap:wrap;gap:3px}
.chip{font:500 10px/1 var(--font-mono);padding:3px 5px;border-radius:4px;border:1px solid var(--line-2);color:var(--muted);background:var(--surface);cursor:help;text-decoration:none;white-space:nowrap}
.chip.kind{color:var(--fg);border-color:var(--fg);font-weight:600}
.chip.ok{color:var(--ok);border-color:currentColor}
.chip.warn{color:var(--warn);border-color:currentColor}
.chip.crit{color:var(--crit);border-color:currentColor}
.chip.fresh{color:var(--cand);border-color:currentColor;background:var(--cand-soft)}
.chip.tag,.chip.design{color:var(--seed);border-color:currentColor}
.chip.na{border-style:dashed}
.chip.src{color:var(--seed);background:var(--seed-soft);border-color:transparent;cursor:pointer}
</style>
