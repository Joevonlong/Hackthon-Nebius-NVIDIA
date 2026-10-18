// Library chat state (lane U2, D-26 / D-29). History per libraryId, persisted in localStorage (best effort).
// POST /api/library/:id/chat for each user turn; Apply on a proposal → useLibrary().applyProposal → POST /applied.
import { defineStore } from 'pinia'
import { ChatResponse, type Proposal } from '@shared/library'
import { useLibrary } from './library'
import { applyProposal, currentSettings, movedIn, type LibLike, type LibSettings } from '../chat/libApi'

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  cited?: ChatResponse['cited']
  proposal?: Proposal | null
  proposalState?: 'open' | 'applied' | 'dismissed'
  appliedNote?: string
  prompt?: string // the user message that led to this assistant turn
  model?: string | null
  error?: boolean
  ms?: number
  settingsAt?: LibSettings // the settings the proposal was made against (for the diff card)
}

const KEY = (id: string) => `papertrail:chat:${id}`
const uid = () => Math.random().toString(36).slice(2, 10)

function loadTurns(id: string): ChatTurn[] {
  try { const raw = localStorage.getItem(KEY(id)); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : [] } catch { return [] }
}
function saveTurns(id: string, turns: ChatTurn[]) {
  try { localStorage.setItem(KEY(id), JSON.stringify(turns.slice(-60))) } catch { /* storage blocked or full */ }
}

export const SUGGESTED = ['Which papers are reviews?', 'Prioritize recent clinical studies', 'Why is #3 above #4?']

export const useChat = defineStore('chat', {
  state: () => ({
    byLib: {} as Record<string, ChatTurn[]>,
    busy: false,
    error: null as string | null,
  }),
  getters: {
    libraryId: () => (useLibrary() as unknown as LibLike).libraryId,
    turns(): ChatTurn[] { const id = this.libraryId; return id ? this.byLib[id] ?? [] : [] },
  },
  actions: {
    ensure(id: string): ChatTurn[] {
      if (!this.byLib[id]) this.byLib[id] = loadTurns(id)
      return this.byLib[id]
    },
    persist(id: string) { saveTurns(id, this.byLib[id] ?? []) },
    clear() { const id = this.libraryId; if (!id) return; this.byLib[id] = []; this.persist(id) },

    async send(text: string) {
      const content = text.trim()
      const id = this.libraryId
      if (!content || !id || this.busy) return
      const turns = this.ensure(id)
      turns.push({ id: uid(), role: 'user', content })
      this.persist(id)
      this.busy = true; this.error = null
      const t0 = performance.now()
      const lib = useLibrary() as unknown as LibLike
      const cur = currentSettings(lib)
      const messages = turns.filter(t => !t.error).slice(-20).map(t => ({ role: t.role, content: t.content }))
      try {
        const res = await fetch(`/api/library/${encodeURIComponent(id)}/chat`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages, current: cur }),
        })
        if (!res.ok) throw new Error(res.status === 404 ? 'This library is not on the server (rebuild it to chat).' : `Chat failed (${res.status}).`)
        const parsed = ChatResponse.safeParse(await res.json())
        if (!parsed.success) throw new Error('The server sent an unexpected chat reply.')
        const r = parsed.data
        this.ensure(id).push({ id: uid(), role: 'assistant', content: r.reply, cited: r.cited, proposal: r.proposal, proposalState: r.proposal ? 'open' : undefined, prompt: content, model: r.model, error: !r.model, ms: Math.round(performance.now() - t0), settingsAt: cur })
      } catch (e) {
        const msg = e instanceof TypeError ? 'Server unreachable. Check that it is running and try again.' : (e as Error).message
        this.ensure(id).push({ id: uid(), role: 'assistant', content: msg, error: true })
      } finally {
        this.busy = false
        this.persist(id)
      }
    },

    async apply(turnId: string) {
      const id = this.libraryId
      if (!id) return
      const turn = this.ensure(id).find(t => t.id === turnId)
      if (!turn?.proposal || turn.proposalState !== 'open') return
      try {
        const r = await applyProposal(useLibrary() as unknown as LibLike, turn.proposal)
        const n = movedIn(r)
        turn.proposalState = 'applied'
        turn.appliedNote = n ? `Applied: ${n} paper${n === 1 ? '' : 's'} moved into the top 10` : 'Applied: the top 10 kept the same papers'
        this.persist(id)
        void fetch(`/api/library/${encodeURIComponent(id)}/applied`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: turn.prompt ?? '', proposal: turn.proposal, before: r.before, after: r.after }),
        }).catch(() => { /* logging is best effort */ })
      } catch (e) {
        turn.appliedNote = `Could not apply: ${(e as Error).message}`
        this.persist(id)
      }
    },
    dismiss(turnId: string) {
      const id = this.libraryId
      if (!id) return
      const turn = this.ensure(id).find(t => t.id === turnId)
      if (turn && turn.proposalState === 'open') { turn.proposalState = 'dismissed'; this.persist(id) }
    },
  },
})
