<script setup lang="ts">
// J-2 (D-32): the LLM read's plain "why relevant" sentence plus its verified quote, inline on every top-N card.
// Papers the model did not read say so (muted). Unverified quotes are not shown as quotes.
import type { LibPaper } from '@shared/library'

defineProps<{ paper: LibPaper; compact?: boolean }>()
</script>

<template>
  <div class="wr" :class="{ compact }">
    <template v-if="paper.llmRead">
      <p class="why"><span class="lbl">Why relevant</span> {{ paper.llmRead.why }}</p>
      <blockquote v-if="paper.llmRead.quote && paper.llmRead.verified && !compact" :title="`verified: found verbatim in the ${paper.llmRead.read === 'full-text' ? 'full text' : 'abstract'} (${paper.llmRead.model})`">“{{ paper.llmRead.quote }}”</blockquote>
      <p v-else-if="paper.llmRead.quote && !paper.llmRead.verified && !compact" class="muted">The model's quote was not found verbatim in the abstract, so it is not shown.</p>
    </template>
    <p v-else class="muted">Not read by the model.</p>
  </div>
</template>

<style scoped>
.wr{display:flex;flex-direction:column;gap:4px;min-width:0}
.why{margin:0;font-size:.76rem;line-height:1.45;color:var(--ink-80)}
.lbl{font:700 .54rem var(--font-sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-46);margin-right:4px}
blockquote{margin:0;padding:1px 0 1px 10px;border-left:2px solid var(--accent);color:var(--ink-64);font-size:.72rem;font-style:italic;line-height:1.45}
.muted{margin:0;font-size:.7rem;color:var(--ink-46)}
.compact .why{font-size:.68rem;color:var(--ink-64);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.compact .muted{font-size:.64rem}
</style>
