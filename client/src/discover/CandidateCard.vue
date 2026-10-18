<script setup lang="ts">
// One candidate row in a lane. Owner: lane C.
import { computed } from 'vue'
import type { Candidate } from '@shared/contracts'
import { useUi } from '../stores/ui'
import { useVault } from '../stores/vault'
import { useDiscovery } from '../stores/discovery'
import { firstAuthor, shortTitle } from './literatureNote'

const props = defineProps<{ c: Candidate; pos: number; seedCount: number }>()
const ui = useUi(), vault = useVault(), disc = useDiscovery()
const p = computed(() => props.c.paper)
const inVault = computed(() => !!vault.byPaper(p.value.id))
const fb = computed(() => disc.feedback[p.value.id])
const pips = computed(() => Array.from({ length: Math.max(props.seedCount, 1) }, (_, i) => {
  const n = i + 1
  return { n, cls: props.c.features.out.includes(n) ? 'out' : props.c.features.in.includes(n) ? 'in' : '' }
}))
const why = computed(() => props.pos === props.c.rank ? props.c.whyRanked : `${props.c.whyRanked} · Lens moved #${props.c.rank}→#${props.pos}`)
const meta = computed(() => [firstAuthor(p.value), p.value.year, p.value.venue || p.value.type, `${p.value.citedByCount.toLocaleString('en')} cites`].filter(Boolean).join(' · '))
const open = () => ui.openPreview(p.value.id, shortTitle(p.value))
</script>

<template>
  <button type="button" class="pc" :class="{ sel: ui.selectedPaperId === p.id, rejected: fb?.verdict === 'reject' }" @click="open">
    <span class="rk">{{ pos }}</span>
    <span class="body">
      <span class="tt">{{ p.title }}</span>
      <span class="mt">{{ meta }}</span>
      <span class="row">
        <span class="pips" :aria-label="`Seed links: cites ${c.features.out.length}, cited by ${c.features.in.length}`">
          <i v-for="pip in pips" :key="pip.n" :class="pip.cls" :title="`S${pip.n}${pip.cls === 'out' ? ': paper cites this seed' : pip.cls === 'in' ? ': seed cites this paper' : ''}`" />
        </span>
        <template v-if="c.judgement">
          <span class="rel" :title="`Judge relevance ${c.judgement.relevance}/3 · ${c.judgement.model}`">rel {{ c.judgement.relevance }}/3</span>
          <span v-if="c.judgement.verified" class="badge ok">✓ verified</span>
          <span v-else class="badge warn">⚠ unverified</span>
        </template>
        <span v-if="inVault" class="saved">in vault</span>
        <span v-if="fb?.verdict === 'keep'" class="kept">👍 kept</span>
        <span v-else-if="fb?.verdict === 'reject'" class="kept muted">👎 {{ fb.reason || 'not relevant' }}</span>
      </span>
      <span class="why">{{ why }}</span>
    </span>
  </button>
</template>

<style scoped>
.pc{display:grid;grid-template-columns:22px minmax(0,1fr);gap:8px;padding:8px 9px;border:1px solid var(--line);border-radius:7px;cursor:pointer;background:var(--surface);text-align:left;width:100%;color:var(--fg);font:inherit}
.pc:hover{border-color:var(--line-2)}
.pc.sel{border-color:var(--cand);background:var(--cand-soft)}
.pc.rejected{opacity:.6}
.rk{font:600 12px/1.35 var(--font-mono);color:var(--muted);font-variant-numeric:tabular-nums}
.body{min-width:0;display:block}
.tt{font-size:12.5px;line-height:1.35;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.mt{font-size:11px;color:var(--muted);margin-top:2px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.why{font:400 10.5px/1.4 var(--font-mono);color:var(--muted);margin-top:4px;display:block;overflow-wrap:anywhere}
.row{display:flex;gap:6px;align-items:center;margin-top:5px;flex-wrap:wrap}
.pips{display:inline-flex;gap:2px}
.pips i{width:12px;height:5px;border-radius:2px;background:var(--line)}
.pips i.out{background:var(--seed)}
.pips i.in{background:var(--seed);opacity:.45}
.rel{font:600 10.5px var(--font-mono);color:var(--fg)}
.badge{font:600 10.5px var(--font-mono);padding:1px 5px;border-radius:4px;border:1px solid currentColor}
.badge.ok{color:var(--ok)}
.badge.warn{color:var(--warn)}
.saved{font:600 10.5px var(--font-mono);color:var(--cand)}
.kept{font:500 10.5px var(--font-mono);color:var(--fg)}
.muted{color:var(--muted)}
</style>
