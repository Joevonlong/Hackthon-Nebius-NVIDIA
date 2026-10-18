<script setup lang="ts">
// Owner: lane B. Renders tabs; kind 'preview' → discover/PaperPreview.vue, kind 'graph' → graph/GraphView.vue (lane C).
import { useUi } from '../stores/ui'
import PaperPreview from '../discover/PaperPreview.vue'
import GraphView from '../graph/GraphView.vue'
const ui = useUi()
</script>
<template>
  <section class="editor">
    <PaperPreview v-if="ui.activeTab?.kind === 'preview'" :paper-id="ui.activeTab.ref" />
    <GraphView v-else-if="ui.activeTab?.kind === 'graph'" />
    <div v-else>Editor</div>
  </section>
</template>
