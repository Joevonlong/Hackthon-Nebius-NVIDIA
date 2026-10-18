<script setup lang="ts">
// Workspace shell. Owner: lane B (layout). Lane C components mount into the marked slots.
import { onMounted } from 'vue'
import FileTree from './workspace/FileTree.vue'
import EditorArea from './workspace/EditorArea.vue'
import Sidebar from './workspace/Sidebar.vue'
import { useVault } from './stores/vault'
const vault = useVault()
onMounted(() => vault.load())
</script>

<template>
  <div class="app">
    <header class="toolbar">PaperTrail</header>
    <main class="panes">
      <FileTree />
      <EditorArea />
      <Sidebar />
    </main>
    <footer class="statusbar">ready</footer>
  </div>
</template>

<style scoped>
.app{display:grid;grid-template-rows:auto 1fr auto;height:100%}
.toolbar,.statusbar{padding:6px 12px;background:var(--surface-2);border-bottom:1px solid var(--line);font-size:12px}
.statusbar{border-top:1px solid var(--line);border-bottom:0}
.panes{display:grid;grid-template-columns:220px minmax(0,1fr) 380px;min-height:0}
</style>
