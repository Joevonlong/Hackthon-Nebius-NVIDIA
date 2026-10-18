<script setup lang="ts">
// Editor-area view for 'preview' tabs whose ref starts with 'lib:' (lane L3): 'lib:results' or 'lib:paper:<id>'.
import LibraryResults from './LibraryResults.vue'
import LibPaperView from './LibPaperView.vue'
defineProps<{ refId: string }>()
</script>

<template>
  <LibPaperView v-if="refId.startsWith('lib:paper:')" :key="refId" :paper-id="refId.slice('lib:paper:'.length)" />
  <LibraryResults v-else />
</template>
