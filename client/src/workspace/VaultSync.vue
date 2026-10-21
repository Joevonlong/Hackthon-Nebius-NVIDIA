<script setup lang="ts">
// Issue #13: shows what the vault could not save yet and lets the user settle note conflicts. Renders nothing when all is saved.
import { computed } from 'vue'
import { useVault } from '../stores/vault'

const vault = useVault()
const conflicts = computed(() => Object.keys(vault.conflicts))
const show = computed(() => vault.unsynced > 0 || !!vault.syncError || conflicts.value.length > 0)
</script>

<template>
  <section v-if="show" class="vsync" role="status">
    <p v-if="vault.unsynced > 0 || vault.syncError" class="line" :class="{ bad: !!vault.syncError }">
      <template v-if="vault.unsynced > 0">{{ vault.unsynced }} unsynced</template><template v-if="vault.unsynced > 0 && vault.syncError"> · </template>{{ vault.syncError }}
    </p>
    <div v-for="p in conflicts" :key="p" class="conf">
      <span class="path" :title="p">Changed in two places: {{ p.split('/').pop() }}</span>
      <span class="row">
        <button class="btn" type="button" @click="vault.resolveConflict(p, 'local')">Keep mine</button>
        <button class="btn" type="button" @click="vault.resolveConflict(p, 'server')">Keep server</button>
      </span>
    </div>
  </section>
</template>

<style scoped>
.vsync{flex:none;display:flex;flex-direction:column;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--surface-2);font-size:12px}
.line{margin:0;color:var(--muted)}
.line.bad{color:var(--warn)}
.conf{display:flex;flex-direction:column;gap:4px}
.path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row{display:flex;gap:6px;flex-wrap:wrap}
</style>
