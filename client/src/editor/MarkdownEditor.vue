<script setup lang="ts">
// CodeMirror 6 Markdown editor with Zettlr's live-preview renderers. Saves to the vault with a debounce.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { editorExtensions } from './extensions'
import { useVault } from '../stores/vault'
import { useUi } from '../stores/ui'
import { noteName, resolveLink } from '../stores/vault-utils'
import './zettlr/editor.css'
import InlineTitle from './InlineTitle.vue'

const props = defineProps<{ path: string }>()
const emit = defineEmits<{ (e: 'saving', v: boolean): void }>()
const vault = useVault()
const ui = useUi()
const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let lastSaved = ''

function save(doc: string) {
  const n = vault.byPath(props.path); if (!n) return
  lastSaved = doc
  vault.upsert({ ...n, content: doc })
  emit('saving', false)
}

async function openLink(target: string) {
  if (!target) return
  const hit = resolveLink(target, vault.notes)
  if (hit) return ui.openNote(hit.path, noteName(hit.path))
  const path = await vault.create(target.replace(/[\\/:*?"<>|]/g, '-'))
  ui.openNote(path, noteName(path))
}

onMounted(() => {
  const note = vault.byPath(props.path)
  lastSaved = note?.content ?? ''
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: lastSaved,
      extensions: editorExtensions({
        exists: t => !!resolveLink(t, vault.notes),
        open: t => { void openLink(t) },
        names: () => vault.notes.filter(n => n.path !== props.path).map(n => noteName(n.path)),
      }, doc => {
        emit('saving', true)
        clearTimeout(timer)
        timer = setTimeout(() => save(doc), 400)
      }),
    }),
  })
})

// External updates (e.g. lane C rewrites a literature note) replace the doc when we have no pending edits.
watch(() => vault.byPath(props.path)?.content, c => {
  if (!view || c === undefined || c === lastSaved || timer && view.state.doc.toString() !== lastSaved) return
  if (c !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: c } })
  lastSaved = c
})

onBeforeUnmount(() => {
  if (timer && view) { clearTimeout(timer); const d = view.state.doc.toString(); if (d !== lastSaved) save(d) }
  view?.destroy()
})
</script>

<template>
  <div class="pt-editor">
    <InlineTitle :key="path" :path="path" />
    <div ref="host" class="pt-host" />
  </div>
</template>

<style>
.pt-editor{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--surface)}
.pt-editor .pt-host{flex:1;min-height:0;display:flex;flex-direction:column}
.pt-editor .cm-editor{flex:1;min-height:0}
.pt-editor .cm-scroller{overflow:auto;justify-content:center}
.pt-editor .cm-content{flex-grow:0;width:100%;max-width:780px;padding:10px 36px 160px;caret-color:var(--seed)}
.pt-editor .cm-line:has(.cm-header-1),.pt-editor .cm-line:has(.cm-header-2),.pt-editor .cm-line:has(.cm-header-3),.pt-editor .cm-line:has(.cm-header-4){font-family:var(--font-display)!important;letter-spacing:-.005em}
.pt-editor .cm-line:has(.cm-header-1){padding-top:6px;padding-bottom:4px}
.pt-editor .cm-line:has(.cm-header-2),.pt-editor .cm-line:has(.cm-header-3){padding-top:10px}
.pt-editor .cm-header-1,.pt-editor .cm-header-2,.pt-editor .cm-header-3{color:var(--fg)}
.pt-editor .cm-fm-line{font:12.5px/1.75 var(--font-mono)!important;color:var(--muted);background:var(--surface-2);padding:0 12px}
.pt-editor .cm-fm-line *{font:inherit!important;color:inherit}
.pt-editor .cm-fm-first{border-radius:6px 6px 0 0;padding-top:6px}
.pt-editor .cm-fm-last{border-radius:0 0 6px 6px;padding-bottom:6px;margin-bottom:14px}
.pt-editor .cm-fm-first,.pt-editor .cm-fm-last{color:var(--line-2)}
.pt-editor .cm-fm-line .cm-fm-key{color:var(--seed)!important}
.pt-editor .cm-wikilink{color:var(--seed);border-bottom:1px dotted var(--seed);cursor:pointer}
.pt-editor .cm-wikilink-missing{color:var(--muted);border-bottom-style:dashed;border-bottom-color:var(--line-2)}
.pt-editor .cm-zkn-link-mark{color:var(--line-2)}
.pt-editor .cm-zkn-tag{color:var(--cand)}
.pt-editor .cm-strong{font-weight:650}
.pt-editor .cm-quote{color:var(--muted)}
.pt-editor .cm-url,.pt-editor .cm-link{color:var(--seed)}
.pt-editor .cm-monospace,.pt-editor .inline-code-background{font-family:var(--font-mono);font-size:.9em}
</style>
