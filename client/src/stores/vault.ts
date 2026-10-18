// Notes vault (IndexedDB via idb-keyval). Owner: lane B. Lane C calls upsert() to add literature notes.
// Folders are path prefixes: Seeds/, Discovered/, Notes/.
import { defineStore } from 'pinia'
import { get, set } from 'idb-keyval'

export type NoteKind = 'seed' | 'lit' | 'note'
export interface Note { path: string; kind: NoteKind; title: string; content: string; paperId?: string; updatedAt: number }
export interface Folder { name: string; notes: Note[] }

const DB_KEY = 'papertrail:vault:v1'
export const FOLDERS = ['Seeds', 'Discovered', 'Notes'] as const
export const QUESTION_PATH = 'Notes/Question.md'

export function questionNote (question: string): Omit<Note, 'updatedAt'> {
  return {
    path: QUESTION_PATH,
    kind: 'note',
    title: 'Question',
    content: `---\ntype: question\ncreated: ${new Date().toISOString().slice(0, 10)}\n---\n# Question\n\n${question}\n\n## Seeds\n\nAdd trusted papers with **Add seed papers** in the **Library** tab. Their notes land in Seeds/ and every library build expands from them.\n\n## Kept so far\n\n- [ ] Build the library from the vault\n- [ ] Keep the papers worth reading\n`,
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

export const useVault = defineStore('vault', {
  state: () => ({ notes: [] as Note[], ready: false, error: '' as string }),
  getters: {
    byPath: s => (path: string) => s.notes.find(n => n.path === path),
    byPaper: s => (paperId: string) => s.notes.find(n => n.paperId === paperId),
    folders: (s): Folder[] => {
      const names = new Set<string>(FOLDERS)
      for (const n of s.notes) names.add(n.path.includes('/') ? n.path.split('/')[0] : '')
      return [...names].map(name => ({
        name,
        notes: s.notes.filter(n => (n.path.includes('/') ? n.path.split('/')[0] : '') === name)
          .sort((a, b) => a.path.localeCompare(b.path)),
      }))
    },
  },
  actions: {
    async load(question = 'Which single-cell methods help study melanoma immune cells?') {
      try {
        const stored = await get<Note[]>(DB_KEY)
        // Keep notes lane C may have upserted before load finished.
        const fresh = this.notes
        this.notes = Array.isArray(stored) ? stored : []
        for (const n of fresh) { const i = this.notes.findIndex(x => x.path === n.path); if (i >= 0) this.notes[i] = n; else this.notes.push(n) }
      } catch (e) {
        this.error = 'Could not open the browser vault (IndexedDB). Notes will not persist.'
      }
      if (!this.notes.length) this.notes.push({ ...questionNote(question), updatedAt: Date.now() })
      this.ready = true
      this.persist()
    },
    persist() {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        set(DB_KEY, JSON.parse(JSON.stringify(this.notes))).catch(() => { this.error = 'Saving to IndexedDB failed.' })
      }, 150)
    },
    async upsert(note: Omit<Note, 'updatedAt'>) {
      const n = { ...note, updatedAt: Date.now() }
      const i = this.notes.findIndex(x => x.path === n.path)
      if (i >= 0) this.notes[i] = n; else this.notes.push(n)
      this.persist()
    },
    async remove(path: string) { this.notes = this.notes.filter(n => n.path !== path); this.persist() },
    async rename(path: string, newPath: string) {
      if (!newPath.endsWith('.md')) newPath += '.md'
      if (path === newPath || this.notes.some(n => n.path === newPath)) return false
      const n = this.notes.find(x => x.path === path); if (!n) return false
      n.path = newPath
      n.title = newPath.split('/').pop()!.replace(/\.md$/, '')
      n.updatedAt = Date.now()
      this.persist()
      return true
    },
    /** Creates an empty note under Notes/ with a unique name and returns its path. */
    async create(name = 'Untitled', folder = 'Notes') {
      let path = `${folder}/${name}.md`; let k = 2
      while (this.notes.some(n => n.path.toLowerCase() === path.toLowerCase())) path = `${folder}/${name} ${k++}.md`
      const title = path.split('/').pop()!.replace(/\.md$/, '')
      await this.upsert({ path, kind: 'note', title, content: `# ${title}\n\n` })
      return path
    },
  },
})
