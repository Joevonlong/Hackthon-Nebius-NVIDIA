// Notes vault (IndexedDB). Owner: lane B. Lane C calls upsert() to add literature notes.
import { defineStore } from 'pinia'

export type NoteKind = 'seed' | 'lit' | 'note'
export interface Note { path: string; kind: NoteKind; title: string; content: string; paperId?: string; updatedAt: number }

export const useVault = defineStore('vault', {
  state: () => ({ notes: [] as Note[], ready: false }),
  getters: {
    byPath: s => (path: string) => s.notes.find(n => n.path === path),
    byPaper: s => (paperId: string) => s.notes.find(n => n.paperId === paperId),
  },
  actions: {
    async load() { this.ready = true }, // B: load from IndexedDB, seed with Question.md
    async upsert(note: Omit<Note, 'updatedAt'>) {
      const n = { ...note, updatedAt: Date.now() }
      const i = this.notes.findIndex(x => x.path === n.path)
      if (i >= 0) this.notes[i] = n; else this.notes.push(n)
    },
    async remove(path: string) { this.notes = this.notes.filter(n => n.path !== path) },
  },
})
