<script setup lang="ts">
// "Known papers in the vault": the ids the build used, plus the notes-as-known notice. The notice is NOT part of the
// None / chips if-else chain (a v-if between them would capture the v-else and hide the chips).
defineProps<{ knownPapers: string[]; notesKnown: number; notesAsKnown: boolean }>()
</script>

<template>
  <div class="eyebrow">Known papers in the vault<span class="sub">{{ knownPapers.length }}</span></div>
  <p v-if="!knownPapers.length" class="faint small">None: add seed papers above so the graph component can link to them.</p>
  <div v-else class="chips mono"><span v-for="k in knownPapers" :key="k" class="chip static">{{ k }}</span></div>
  <p v-if="notesKnown" class="faint small notes-known">{{ notesKnown }} paper{{ notesKnown === 1 ? '' : 's' }} from your notes {{ notesAsKnown ? 'will be treated as known' : 'will be left out of the known papers' }} in the next build.</p>
</template>
