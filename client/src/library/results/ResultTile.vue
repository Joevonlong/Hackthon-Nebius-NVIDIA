<script setup lang="ts">
// F-60 (D-34) score tile: rank (+ rank move), passed/below, grade badge + score ring with the minimum tick, mini radar,
// title (2 lines), "Author Year · Venue", up to 3 chips. Hover / focus = HoverCard; click = paper view;
// "Report card" expands WhyScore (with evidence) across the row.
import { computed } from 'vue'
import type { LibPaper } from '@shared/library'
import { grade } from '../score'
import { authorYear, status, statusTip, tileChips } from './facts'
import { useHoverCard } from './useHoverCard'
import MoveBadge from './MoveBadge.vue'
import ScoreRing from './ScoreRing.vue'
import MiniRadar from './MiniRadar.vue'
import HoverCard from './HoverCard.vue'
import WhyScore from '../WhyScore.vue'
import StackBar from '../charts/StackBar.vue' // CR-11 V-4

const props = defineProps<{ paper: LibPaper; threshold: number; move?: number | null; gen?: number; inVault?: boolean; expanded?: boolean; index?: number }>()
const emit = defineEmits<{ open: []; toggle: [] }>()
const g = computed(() => grade(props.paper.total))
const st = computed(() => status(props.paper))
const hc = useHoverCard()
</script>

<template>
  <article :ref="el => (hc.host.value = el as HTMLElement)" class="tile" :class="[st, { exp: expanded }]" :style="{ '--i': Math.min(index ?? 0, 20) }"
    v-on="hc.on" @click="emit('open')">
    <div class="face">
      <div class="eb">
        <span class="rk">#{{ paper.rank }}</span>
        <MoveBadge :move="move" :gen="gen" />
        <span v-if="inVault" class="iv" title="already in your vault">in vault</span>
        <span class="st" :title="statusTip(paper)">{{ st }}</span>
      </div>
      <div class="viz">
        <b class="g" :class="'g-' + g" :title="`grade ${g} (A ≥ 0.85 · B ≥ 0.70 · C ≥ 0.55 · D ≥ 0.40 · E below)`">{{ g }}</b>
        <ScoreRing :total="paper.total" :threshold="threshold" :passed="paper.passed" />
        <MiniRadar class="rad" :components="paper.components" :accent="paper.passed" />
      </div>
      <StackBar class="stk" :components="paper.components" :threshold="threshold" />
      <button type="button" class="tt" :title="paper.paper.title" @click.stop="emit('open')">{{ paper.paper.title }}</button>
      <p class="meta">{{ authorYear(paper) }} · {{ paper.paper.venue || 'no venue' }}</p>
      <div class="ft">
        <span v-for="c in tileChips(paper)" :key="c.text" class="chip" :class="c.cls" :title="c.title">{{ c.text }}</span>
        <button type="button" class="rc" :aria-expanded="!!expanded" @click.stop="hc.close(); emit('toggle')">{{ expanded ? 'Close' : 'Report card' }}</button>
      </div>
    </div>
    <div v-if="expanded" class="card-x" @click.stop><WhyScore :paper="paper" /></div>
    <HoverCard v-if="hc.open.value && !expanded" :paper="paper" :in-vault="inVault" :up="hc.up.value" :right="hc.right.value" />
  </article>
</template>

<style scoped>
.tile{position:relative;display:flex;gap:16px;min-width:0;border:1px solid var(--hair);border-radius:14px;padding:12px 14px 12px;background:var(--paper-2);cursor:pointer;transition:border-color .2s;animation:rise .5s var(--reveal) both;animation-delay:calc(var(--i) * 25ms)}
.tile:hover,.tile:focus-within{border-color:var(--ink-46);z-index:5}
.tile.passed{box-shadow:inset 3px 0 0 var(--accent)}
.tile.excluded{opacity:.72;border-style:dashed}
.tile.exp{flex-direction:column;cursor:auto}
.face{display:flex;flex-direction:column;gap:7px;min-width:0;flex:1}
.exp .face{flex:none}
.card-x{flex:1;min-width:0}
.eb{display:flex;align-items:center;gap:8px;font:600 .64rem var(--font-mono);color:var(--ink-55)}
.rk{color:var(--ink);font-weight:700}
.iv{border:1px solid var(--ink-26);border-radius:99px;padding:2px 6px;font-size:.58rem}
.st{margin-left:auto;letter-spacing:.08em;text-transform:uppercase;font-size:.58rem;border:1px solid var(--ink-26);border-radius:99px;padding:3px 7px;cursor:help}
.passed .st{border-color:var(--accent);color:var(--accent)}
.excluded .st{border-style:dashed}
.viz{display:flex;align-items:center;gap:8px}
.rad{margin-left:auto}
.stk{margin:1px 0 2px}
.g{width:30px;height:30px;flex:none;border-radius:50%;display:grid;place-items:center;font:700 .86rem/1 var(--font-sans);border:1.5px solid var(--ink-38);color:var(--ink)}
.g-A{background:var(--accent);border-color:var(--accent);color:var(--paper)}
.g-B{border-color:var(--accent);color:var(--accent)}
.g-C{border-color:var(--ink-64)}
.g-D,.g-E{border-style:dashed;color:var(--ink-55)}
.tt{border:0;background:transparent;padding:0;text-align:left;color:var(--ink);font:600 .9rem/1.32 var(--font-sans);letter-spacing:-.01em;cursor:pointer;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.64em}
.tt:hover{text-decoration:underline;text-underline-offset:3px}
.meta{margin:0;font-size:.72rem;color:var(--ink-55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ft{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-top:auto}
.chip{font:500 .62rem/1 var(--font-sans);padding:4px 8px;border-radius:99px;border:1px solid var(--ink-26);color:var(--ink-64);white-space:nowrap}
.chip.kind{background:var(--ink);border-color:var(--ink);color:var(--paper);font-weight:600}
.chip.fresh{border-color:var(--accent);color:var(--accent)}
.rc{margin-left:auto;border:0;background:transparent;color:var(--ink-55);font:600 .66rem var(--font-sans);cursor:pointer;padding:3px 0;text-decoration:underline;text-underline-offset:3px}
.rc:hover{color:var(--ink)}
@keyframes rise{from{opacity:0;transform:translateY(6px)}}
@media (prefers-reduced-motion: reduce){.tile{animation:none;transition:none}}
</style>
