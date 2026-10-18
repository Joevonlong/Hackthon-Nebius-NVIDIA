<script setup lang="ts">
// Lane U2. Chat column on the far right (D-26): multi-round chat about the current library, paper citations that
// open the paper view, and proposal diff cards (D-29). `collapsed` renders the icon rail only.
import { computed, nextTick, ref, watch } from 'vue'
import { useChat, SUGGESTED, type ChatTurn } from '../stores/chat'
import { useLibrary } from '../stores/library'
import { useUi } from '../stores/ui'
import { renderMarkdown } from './markdown'
import { currentSettings, type LibLike } from './libApi'
import ProposalCard from './ProposalCard.vue'

defineProps<{ collapsed?: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const chat = useChat()
const library = useLibrary()
const lib = library as unknown as LibLike
const ui = useUi()
const draft = ref('')
const list = ref<HTMLElement | null>(null)

const libId = computed(() => lib.libraryId)
watch(libId, id => { if (id) chat.ensure(id) }, { immediate: true })
const turns = computed(() => chat.turns)
const ready = computed(() => !!libId.value && library.status === 'done')
const settings = computed(() => currentSettings(lib))

async function scrollEnd() { await nextTick(); list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' }) }
watch(() => turns.value.length + (chat.busy ? 1 : 0), scrollEnd)

async function send(text = draft.value) {
  if (!text.trim() || chat.busy || !ready.value) return
  draft.value = ''
  await chat.send(text)
}
function onKey(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send() } }

/** Citation click → open the paper (library paper tab); falls back to selecting it. */
function onClick(e: MouseEvent, t: ChatTurn) {
  const a = (e.target as HTMLElement).closest('a.cite') as HTMLAnchorElement | null
  if (!a) return
  e.preventDefault()
  const rank = Number(a.dataset.rank)
  const c = t.cited?.find(x => x.rank === rank)
  const pool = lib.scored ?? lib.papers ?? []
  const p = c ? pool.find(x => x.paper.id === c.paperId) : pool.find(x => x.rank === rank)
  const id = c?.paperId ?? p?.paper.id
  if (!id) return
  ui.selectedPaperId = id
  ui.openLibPaper(id, (c?.title ?? p?.paper.title ?? `#${rank}`).slice(0, 60))
}
</script>

<template>
  <aside class="chat" :class="{ collapsed }" aria-label="Library chat">
    <button v-if="collapsed" type="button" class="rail" title="Open the library chat" aria-label="Open the library chat" @click="emit('toggle')">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /></svg>
      <span v-if="turns.length" class="dot" />
    </button>
    <template v-else>
      <header class="hd">
        <span class="t">Ask the library</span>
        <button v-if="turns.length" type="button" class="ghost" title="Clear this library's chat" @click="chat.clear()">Clear</button>
        <button type="button" class="ghost" title="Collapse the chat" aria-label="Collapse the chat" @click="emit('toggle')">⟩</button>
      </header>
      <div ref="list" class="list">
        <div v-if="!ready" class="empty">
          <p>Build a library first. Then ask about its papers, scores and evidence, or tell it what to prioritize.</p>
        </div>
        <div v-else-if="!turns.length" class="empty">
          <p>Ask about this library's {{ library.total || '' }} papers, or tell it what matters more to you.</p>
          <div class="chips">
            <button v-for="s in SUGGESTED" :key="s" type="button" class="chip" @click="send(s)">{{ s }}</button>
          </div>
        </div>
        <div v-for="t in turns" :key="t.id" class="msg" :class="[t.role, { err: t.error }]">
          <div v-if="t.role === 'user'" class="bubble">{{ t.content }}</div>
          <template v-else>
            <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown escapes everything first -->
            <div class="md" @click="onClick($event, t)" v-html="renderMarkdown(t.content)" />
            <ProposalCard v-if="t.proposal" :proposal="t.proposal" :current="t.settingsAt ?? settings" :state="t.proposalState" :note="t.appliedNote"
              @apply="chat.apply(t.id)" @dismiss="chat.dismiss(t.id)" />
            <div v-if="t.model" class="meta">{{ t.model.split('/').pop() }}<template v-if="t.ms"> · {{ (t.ms / 1000).toFixed(1) }} s</template></div>
          </template>
        </div>
        <div v-if="chat.busy" class="msg assistant"><div class="thinking"><span /><span /><span /> Reading the library…</div></div>
      </div>
      <form class="box" @submit.prevent="send()">
        <textarea v-model="draft" rows="2" :disabled="!ready" :placeholder="ready ? 'Ask, or say what to prioritize…' : 'No library yet'" @keydown="onKey" />
        <button type="submit" class="send" :disabled="!ready || chat.busy || !draft.trim()">Send</button>
      </form>
    </template>
  </aside>
</template>

<style scoped>
.chat{display:flex;flex-direction:column;min-height:0;min-width:0;height:100%;border-left:1px solid var(--line);background:var(--surface-2)}
.chat.collapsed{align-items:center;padding-top:8px}
.rail{position:relative;width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--fg);cursor:pointer}
.rail .dot{position:absolute;top:4px;right:4px;width:6px;height:6px;border-radius:50%;background:var(--accent)}
.hd{display:flex;align-items:center;gap:6px;padding:9px 10px 8px 14px;border-bottom:1px solid var(--line)}
.hd .t{font:600 14px var(--font-display);margin-right:auto}
.ghost{border:0;background:none;color:var(--muted);cursor:pointer;font-size:12px;padding:3px 6px;border-radius:5px}
.ghost:hover{background:var(--surface);color:var(--fg)}
.list{flex:1;overflow-y:auto;padding:12px 12px 4px;display:flex;flex-direction:column;gap:12px;min-height:0}
.empty p{color:var(--muted);font-size:13px;margin:4px 2px 10px;line-height:1.45}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--line-2);background:var(--surface);color:var(--fg);border-radius:999px;padding:5px 11px;font-size:12.5px;cursor:pointer;text-align:left}
.chip:hover{border-color:var(--seed);color:var(--seed)}
.msg.user{align-self:flex-end;max-width:88%}
.bubble{background:var(--seed);color:#fff;border-radius:12px 12px 3px 12px;padding:7px 11px;font-size:13px;white-space:pre-wrap;word-break:break-word}
.msg.assistant{font-size:13px;line-height:1.5;color:var(--fg)}
.msg.err .md{color:var(--crit)}
.md :deep(p){margin:0 0 6px}
.md :deep(p.h){font-weight:600}
.md :deep(ul),.md :deep(ol){margin:2px 0 6px;padding-left:18px}
.md :deep(li){margin:2px 0}
.md :deep(code){font:12px var(--font-mono);background:var(--surface);padding:0 3px;border-radius:3px}
.md :deep(a.cite){color:var(--seed);font-weight:600;text-decoration:none;border-bottom:1px dotted var(--seed)}
.md :deep(a.cite:hover){background:var(--seed-soft)}
.meta{margin-top:4px;font:500 10.5px var(--font-mono);color:var(--muted)}
.thinking{display:flex;align-items:center;gap:4px;color:var(--muted);font-size:12.5px}
.thinking span{width:5px;height:5px;border-radius:50%;background:var(--muted);animation:b 1s infinite ease-in-out}
.thinking span:nth-child(2){animation-delay:.15s}.thinking span:nth-child(3){animation-delay:.3s;margin-right:4px}
@keyframes b{0%,80%,100%{opacity:.25}40%{opacity:1}}
@media (prefers-reduced-motion: reduce){ .thinking span{animation:none} }
.box{display:flex;gap:6px;padding:8px 10px 10px;border-top:1px solid var(--line)}
textarea{flex:1;resize:none;border:1px solid var(--line-2);border-radius:8px;padding:7px 9px;font:13px/1.4 var(--font-body);background:var(--surface);color:var(--fg);min-width:0}
.send{align-self:flex-end;border:0;border-radius:8px;padding:7px 12px;background:var(--seed);color:#fff;font-weight:600;font-size:12.5px;cursor:pointer}
.send:disabled{opacity:.45;cursor:default}
</style>
