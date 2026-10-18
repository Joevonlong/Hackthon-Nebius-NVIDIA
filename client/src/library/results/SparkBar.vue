<script setup lang="ts">
// F-60: one component as a tiny bar; tooltip = value + reason + top evidence line. Dashed empty bar = not assessed.
// CR-11: the fill uses the component's chart colour (charts/tokens.css).
import type { ScoreComponent } from '@shared/library'
import { compColor } from '../charts/slices'
import '../charts/tokens.css'

defineProps<{ c?: ScoreComponent; tip: string }>()
</script>

<template>
  <span class="sb" :class="{ na: c?.value == null }" :title="tip" :aria-label="tip">
    <span class="fill" :style="{ width: ((c?.value ?? 0) * 100) + '%', background: c ? compColor(c.key) : undefined }" />
  </span>
</template>

<style scoped>
.sb{display:block;height:8px;border-radius:99px;background:var(--ink-8);overflow:hidden;cursor:help}
.fill{display:block;height:100%;background:var(--ink-64);border-radius:99px}
.na{background:transparent;border:1px dashed var(--ink-38)}
.na .fill{display:none}
</style>
