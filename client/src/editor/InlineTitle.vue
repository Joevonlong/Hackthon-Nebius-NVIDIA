<script setup lang="ts">
// CR-8 (F-64, lane W2): Obsidian / Apple Notes style inline title above the note body. Title = the note's name; for a
// question note (Questions/<subject>/Question.md) it is the subject = the folder name. Editing it renames the note / folder.
import { computed, ref, watch } from 'vue'
import { useVault } from '../stores/vault'
import { useUi } from '../stores/ui'
import { useLibrary } from '../stores/library'
import { noteName } from '../stores/vault-utils'

const props = defineProps<{ path: string }>()
const vault = useVault()
const ui = useUi()
const lib = useLibrary()
const question = computed(() => props.path.match(/^Questions\/([^/]+)\/Question\.md$/)?.[1] ?? null)
const current = computed(() => question.value ?? noteName(props.path))
const draft = ref(current.value)
const err = ref('')
watch(current, v => { draft.value = v; err.value = '' })

async function commit() {
  const next = draft.value.trim()
  if (!next || next === current.value) { draft.value = current.value; err.value = ''; return }
  const oldQ = question.value
  const oldPrefix = oldQ ? `Questions/${oldQ}/` : null
  const newPath = await vault.retitle(props.path, next)
  if (!newPath) { err.value = 'That name is taken or not allowed.'; draft.value = current.value; return }
  // tabs: re-open every note tab whose path moved (the edited note, and notes inside a renamed question folder)
  let active = ui.activeTabId
  for (const t of [...ui.tabs]) {
    if (t.kind !== 'note') continue
    const moved = t.ref === props.path ? newPath : oldPrefix && t.ref.startsWith(oldPrefix) ? `Questions/${newPath.split('/')[1]}/${t.ref.slice(oldPrefix.length)}` : null
    if (!moved) continue
    if (active === t.id) active = 'note:' + moved
    ui.close(t.id)
    ui.openNote(moved, noteName(moved))
  }
  if (ui.tabs.some(t => t.id === active)) ui.activeTabId = active
  if (oldQ) {
    const nq = newPath.split('/')[1]
    if (lib.questionId === oldQ) lib.questionId = nq
    void lib.loadHistory(nq)
  }
  err.value = ''
}
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur() }
  if (e.key === 'Escape') { draft.value = current.value; (e.target as HTMLElement).blur() }
}
</script>

<template>
  <div class="inline-title-wrap">
    <input v-model="draft" class="inline-title" :aria-label="question ? 'Question subject (folder name)' : 'Note title'" spellcheck="false" maxlength="60" @blur="commit" @keydown="onKey" />
    <small v-if="question" class="it-sub">Research question · folder Questions/{{ question }}/</small>
    <small v-if="err" class="it-err">{{ err }}</small>
  </div>
</template>

<style scoped>
.inline-title-wrap{width:100%;max-width:780px;margin:0 auto;padding:26px 36px 0;display:flex;flex-direction:column;gap:2px}
.inline-title{font:700 1.9rem/1.2 var(--font-display, var(--font-sans));letter-spacing:-.015em;color:var(--fg);background:transparent;border:0;outline:none;padding:0;width:100%}
.inline-title:focus{box-shadow:inset 0 -1px 0 var(--line-2)}
.it-sub{font:500 11px var(--font-mono);color:var(--muted)}
.it-err{font-size:11.5px;color:var(--cand)}
</style>
