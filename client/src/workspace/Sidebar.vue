<script setup lang="ts">
// Owner: lane B. Tab 'discover' mounts discover/DiscoverPanel.vue (lane C).
import { useUi } from '../stores/ui'
import DiscoverPanel from '../discover/DiscoverPanel.vue'
const ui = useUi()
</script>
<template>
  <aside class="sidebar">
    <DiscoverPanel v-if="ui.sideTab === 'discover'" />
  </aside>
</template>
