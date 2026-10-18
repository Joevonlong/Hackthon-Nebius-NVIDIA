<script setup lang="ts">
// F-60: one component as a tiny bar; tooltip = value + reason + top evidence line. Dashed empty bar = not assessed.
import type { ScoreComponent } from '@shared/library'

defineProps<{ c?: ScoreComponent; tip: string }>()
</script>

<template>
  <span class="sb" :class="{ na: c?.value == null }" :title="tip" :aria-label="tip">
    <span class="fill" :style="{ width: ((c?.value ?? 0) * 100) + '%' }" />
  </span>
</template>

<style scoped>
.sb{display:block;height:8px;border-radius:99px;background:var(--ink-8);overflow:hidden;cursor:help}
.fill{display:block;height:100%;background:var(--ink-64);border-radius:99px}
.na{background:transparent;border:1px dashed var(--ink-38)}
.na .fill{display:none}
</style>
