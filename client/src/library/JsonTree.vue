<script setup lang="ts">
// Collapsible pretty JSON (lane L3): objects and arrays fold with <details>; the top two levels open by default.
defineOptions({ name: 'JsonTree' })
const props = withDefaults(defineProps<{ value: unknown; name?: string; depth?: number }>(), { name: '', depth: 0 })
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object'
const entries = () => Array.isArray(props.value) ? props.value.map((v, i) => [String(i), v] as const) : Object.entries(props.value as Record<string, unknown>)
const summary = () => Array.isArray(props.value) ? `[${props.value.length}]` : `{${Object.keys(props.value as object).length}}`
const lit = (v: unknown) => typeof v === 'string' ? JSON.stringify(v) : String(v)
const cls = (v: unknown) => v === null ? 'nul' : typeof v
</script>

<template>
  <details v-if="isObj(value)" class="jt" :open="depth < 2">
    <summary><span v-if="name" class="k">{{ name }}:</span> <span class="sum">{{ summary() }}</span></summary>
    <div class="kids">
      <JsonTree v-for="[k, v] in entries()" :key="k" :name="k" :value="v" :depth="depth + 1" />
    </div>
  </details>
  <div v-else class="leaf"><span v-if="name" class="k">{{ name }}:</span> <span :class="cls(value)">{{ lit(value) }}</span></div>
</template>

<style scoped>
.jt,.leaf{font:11.5px/1.5 var(--font-mono)}
summary{cursor:pointer;list-style:revert}
.kids{padding-left:14px;border-left:1px solid var(--line)}
.k{color:var(--seed)}
.sum{color:var(--muted)}
.leaf{overflow-wrap:anywhere}
.string{color:var(--ok)}
.number{color:var(--gap)}
.boolean{color:var(--warn)}
.nul{color:var(--muted)}
</style>
