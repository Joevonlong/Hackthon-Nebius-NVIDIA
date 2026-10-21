<script setup lang="ts">
// F-60: the hover / focus popover of a tile or table row. Holds everything the old text row showed that the tile
// does not: verdict sentence + strength / weakness chips, the LLM "why" + verified quote, full meta and citations,
// every label chip, found-by sources (with links, incl. the Tavily page) and "in vault".
import { computed } from 'vue'
import type { LibPaper } from '@shared/library'
import { COMPONENT_META, f2, grade, keyNumber, verdict } from '../score'
import { tavilyUrl } from './facts'
import { safeUrl } from '../../util/safeUrl'
import WhyRelevant from '../WhyRelevant.vue'
import LibLabels from '../LibLabels.vue'
import ScoreDonut from '../charts/ScoreDonut.vue' // CR-11 V-3

const props = defineProps<{ paper: LibPaper; inVault?: boolean; up?: boolean; right?: boolean }>()
const v = computed(() => verdict(props.paper))
const tav = computed(() => safeUrl(tavilyUrl(props.paper)))
const chipTip = (c: LibPaper['components'][number]) => `${COMPONENT_META[c.key].label}: ${f2(c.value)} (grade ${grade(c.value ?? 0)}) · ${keyNumber(c)}`
const authors = computed(() => props.paper.paper.authors.slice(0, 3).join(', ') + (props.paper.paper.authors.length > 3 ? ' et al.' : ''))
</script>

<template>
  <div class="hc" :class="{ up, right }" role="tooltip" @click.stop>
    <div class="top">
      <ScoreDonut :components="paper.components" :total="paper.total" :size="56" small />
      <div class="tx">
        <p class="sent">{{ v.sentence }}</p>
        <div class="vchips">
      <span v-for="c in v.strengths" :key="c.key" class="vc up" :title="chipTip(c)"><i aria-hidden="true">↑</i>{{ COMPONENT_META[c.key].short }} {{ grade(c.value!) }}</span>
      <span v-if="v.weakness" class="vc down" :title="chipTip(v.weakness)"><i aria-hidden="true">↓</i>{{ COMPONENT_META[v.weakness.key].short }} {{ grade(v.weakness.value!) }}</span>
        </div>
      </div>
    </div>
    <WhyRelevant :paper="paper" />
    <p class="meta">{{ authors || 'Unknown' }} · {{ paper.paper.year ?? 'n.d.' }} · {{ paper.paper.venue || 'no venue' }} · {{ paper.paper.citedByCount.toLocaleString('en') }} cites<template v-if="inVault"> · <b>in vault</b></template></p>
    <a v-if="tav" class="tav" :href="tav" target="_blank" rel="noopener">found via Tavily ↗ <span>{{ tav }}</span></a>
    <div class="lbl">Labels · found by</div>
    <LibLabels :paper="paper" />
    <p class="hint">Click for the paper view and report card</p>
  </div>
</template>

<style scoped>
.hc{position:absolute;z-index:30;top:calc(100% + 6px);left:0;width:min(380px,90vw);display:flex;flex-direction:column;gap:7px;padding:12px 14px;border:1px solid var(--ink-26);border-radius:12px;background:var(--paper-2);color:var(--ink);box-shadow:0 12px 32px -12px color-mix(in oklch,var(--ink) 40%,transparent);text-align:left;cursor:auto;animation:pop .22s var(--reveal) both}
.hc.up{top:auto;bottom:calc(100% + 6px)}
.hc.right{left:auto;right:0}
.top{display:flex;gap:12px;align-items:center}
.tx{display:flex;flex-direction:column;gap:7px;min-width:0}
.sent{margin:0;font:600 .84rem/1.35 var(--font-sans);color:var(--ink)}
.vchips{display:flex;flex-wrap:wrap;gap:5px}
.vc{display:inline-flex;gap:4px;font:600 .64rem/1 var(--font-sans);border:1px solid var(--ink-46);border-radius:99px;padding:4px 8px;color:var(--ink-80);cursor:help}
.vc i{font-style:normal}.vc.up i{color:var(--accent)}
.vc.down{border-style:dashed;border-color:var(--ink-26);color:var(--ink-55)}
.meta{margin:0;font-size:.7rem;line-height:1.4;color:var(--ink-55)}
.tav{font:600 .66rem var(--font-mono);color:var(--ink);text-decoration:none;border:1px solid var(--ink-46);border-radius:99px;padding:4px 9px;align-self:flex-start;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tav span{color:var(--ink-46);font-weight:400}
.lbl{font:700 .54rem var(--font-sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-46);margin-top:2px}
.hint{margin:0;font-size:.64rem;color:var(--ink-46)}
@keyframes pop{from{opacity:0;transform:translateY(4px)}}
@media (prefers-reduced-motion: reduce){.hc{animation:none}}
</style>
