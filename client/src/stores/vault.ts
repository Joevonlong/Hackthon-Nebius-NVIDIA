// Notes vault (IndexedDB via idb-keyval). Owner: lane B / W2. Lane C calls upsert() to add literature notes.
// D-33: one folder per research question: Questions/<name>/Question.md (type: question) + Questions/<name>/seeds/S<n> ….md
// (+ any other notes the user puts in that folder). The default vault is EMPTY. Other folders (Discovered/, Notes/) are kept.
import { defineStore } from 'pinia'
import { get, set } from 'idb-keyval'

export type NoteKind = 'seed' | 'lit' | 'note'
export interface Note { path: string; kind: NoteKind; title: string; content: string; paperId?: string; updatedAt: number }
export interface Folder { name: string; notes: Note[] }
export interface Question { id: string; name: string; folder: string; path: string; text: string }

const DB_KEY = 'papertrail:vault:v1'
const MIGRATED_KEY = 'papertrail:vault:questions-migrated'
const CURRENT_KEY = 'papertrail:question:current'
export const QUESTIONS_DIR = 'Questions'
export const FOLDERS = [QUESTIONS_DIR] as const
/** Legacy (pre D-33) single question note; migrated into a question folder on first load. */
export const QUESTION_PATH = 'Notes/Question.md'

export const questionFolder = (name: string) => `${QUESTIONS_DIR}/${name}`
export const questionPath = (name: string) => `${questionFolder(name)}/Question.md`
export const seedsFolder = (name: string) => `${questionFolder(name)}/seeds`
/** File-system-safe folder name for a question. */
export const safeQuestionName = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60)
/** A short default folder name from the question text ("Which single-cell methods help…" → "single-cell methods melanoma immune"). */
export function nameFromQuestion(text: string): string {
  const stop = new Set('a an and are can do does for from how in is of on or the to what which who why with help helps study'.split(' '))
  const w = text.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(x => x && !stop.has(x.toLowerCase())).slice(0, 4)
  return safeQuestionName(w.join(' ')) || 'Question'
}

export function questionNote (question: string, name?: string): Omit<Note, 'updatedAt'> {
  return {
    path: name ? questionPath(name) : QUESTION_PATH,
    kind: 'note',
    title: 'Question',
    content: `---\ntype: question\ncreated: ${new Date().toISOString().slice(0, 10)}\n---\n# Question\n\n${question}\n\n## Seeds\n\nAdd trusted papers in the **Library** tab (paste ids or upload a .bib / .ris / CSL JSON / CSV / PDF). Their notes land in seeds/ next to this note, and only this question's builds read them.\n`,
  }
}

const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* private mode */ } }

let saveTimer: ReturnType<typeof setTimeout> | undefined

const topFolder = (p: string) => (p.includes('/') ? p.split('/')[0] : '')

export const useVault = defineStore('vault', {
  state: () => ({ notes: [] as Note[], ready: false, error: '' as string, current: null as string | null }),
  getters: {
    byPath: s => (path: string) => s.notes.find(n => n.path === path),
    byPaper: s => (paperId: string) => s.notes.find(n => n.paperId === paperId),
    folders: (s): Folder[] => {
      const names = new Set<string>(FOLDERS)
      for (const n of s.notes) names.add(topFolder(n.path))
      return [...names].map(name => ({
        name,
        notes: s.notes.filter(n => topFolder(n.path) === name).sort((a, b) => a.path.localeCompare(b.path)),
      }))
    },
    /** D-33: every research question folder (Questions/<name>/Question.md), sorted by name. */
    questions: (s): Question[] => s.notes
      .map(n => ({ n, m: n.path.match(/^Questions\/([^/]+)\/Question\.md$/) }))
      .filter(x => x.m)
      .map(({ n, m }) => ({ id: m![1], name: m![1], folder: questionFolder(m![1]), path: n.path, text: readQuestionText(n.content) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    currentQuestion(): Question | null { return this.questions.find(q => q.id === this.current) ?? null },
    /** Notes inside one question folder (Question.md, seeds/, the user's own notes there). */
    notesIn: s => (name: string) => s.notes.filter(n => n.path.startsWith(questionFolder(name) + '/')),
    seedsIn: s => (name: string) => s.notes.filter(n => n.path.startsWith(seedsFolder(name) + '/')).sort((a, b) => seedNo(a.path) - seedNo(b.path)),
  },
  actions: {
    async load(_legacyQuestion?: string) {
      try {
        const stored = await get<Note[]>(DB_KEY)
        // Keep notes lane C may have upserted before load finished.
        const fresh = this.notes
        this.notes = Array.isArray(stored) ? stored : []
        for (const n of fresh) { const i = this.notes.findIndex(x => x.path === n.path); if (i >= 0) this.notes[i] = n; else this.notes.push(n) }
      } catch {
        this.error = 'Could not open the browser vault (IndexedDB). Notes will not persist.'
      }
      this.migrate()
      const saved = lsGet(CURRENT_KEY)
      this.current = this.questions.find(q => q.id === saved)?.id ?? this.questions[0]?.id ?? null
      this.ready = true
      this.persist()
    },
    /** One-time D-33 migration: Notes/Question.md + Seeds/* → Questions/<name>/{Question.md, seeds/}. User notes stay. */
    migrate() {
      if (lsGet(MIGRATED_KEY)) return
      const q = this.notes.find(n => n.path === QUESTION_PATH)
      const seeds = this.notes.filter(n => n.path.startsWith('Seeds/'))
      if (q || seeds.length) {
        const text = q ? readQuestionText(q.content) : ''
        let name = nameFromQuestion(text || 'Migrated question'); let k = 2
        while (this.notes.some(n => n.path.startsWith(questionFolder(name) + '/'))) name = `${nameFromQuestion(text || 'Migrated question')} ${k++}`
        if (q) {
          q.path = questionPath(name)
          if (!/^---\n[\s\S]*?type:\s*question/.test(q.content)) q.content = `---\ntype: question\n---\n${q.content}`
          q.updatedAt = Date.now()
        } else this.notes.push({ ...questionNote(text || 'Write your research question here.', name), updatedAt: Date.now() })
        for (const s of seeds) { s.path = `${seedsFolder(name)}/${s.path.slice('Seeds/'.length)}`; s.updatedAt = Date.now() }
        lsSet(CURRENT_KEY, name)
      }
      lsSet(MIGRATED_KEY, '1')
    },
    persist() {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        set(DB_KEY, JSON.parse(JSON.stringify(this.notes))).catch(() => { this.error = 'Saving to IndexedDB failed.' })
      }, 150)
    },
    setCurrent(id: string | null) { this.current = id; lsSet(CURRENT_KEY, id) },
    /** Creates Questions/<name>/Question.md; returns the folder name (made unique) or null without a name. */
    async createQuestion(rawName: string, text: string): Promise<string | null> {
      const base = safeQuestionName(rawName) || nameFromQuestion(text)
      if (!base) return null
      let name = base; let k = 2
      while (this.notes.some(n => n.path.toLowerCase().startsWith(questionFolder(name).toLowerCase() + '/'))) name = `${base} ${k++}`
      await this.upsert(questionNote(text.trim() || 'Write your research question here.', name))
      this.setCurrent(name)
      return name
    },
    /** Moves every note under Questions/<old>/ to Questions/<new>/. */
    renameQuestion(oldName: string, rawNew: string): string | null {
      const next = safeQuestionName(rawNew)
      if (!next || next === oldName) return null
      if (this.notes.some(n => n.path.toLowerCase().startsWith(questionFolder(next).toLowerCase() + '/'))) return null
      const from = questionFolder(oldName) + '/'
      for (const n of this.notes) if (n.path.startsWith(from)) { n.path = questionFolder(next) + '/' + n.path.slice(from.length); n.updatedAt = Date.now() }
      if (this.current === oldName) this.setCurrent(next)
      this.persist()
      return next
    },
    /** Removes the whole question folder (Question.md, seeds, notes in it). */
    deleteQuestion(name: string) {
      const from = questionFolder(name) + '/'
      this.notes = this.notes.filter(n => !n.path.startsWith(from))
      if (this.current === name) this.setCurrent(this.questions[0]?.id ?? null)
      this.persist()
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
    /** Creates an empty note with a unique name (in the current question folder by default) and returns its path. */
    async create(name = 'Untitled', folder?: string) {
      const dir = folder ?? (this.current ? questionFolder(this.current) : 'Notes')
      let path = `${dir}/${name}.md`; let k = 2
      while (this.notes.some(n => n.path.toLowerCase() === path.toLowerCase())) path = `${dir}/${name} ${k++}.md`
      const title = path.split('/').pop()!.replace(/\.md$/, '')
      await this.upsert({ path, kind: 'note', title, content: `# ${title}\n\n` })
      return path
    },
  },
})

function seedNo(path: string): number { return Number(path.split('/').pop()!.match(/^S(\d+)/)?.[1] || 9999) }

/** First paragraph under the H1 (same rule as client/src/library/question.ts readQuestion). */
function readQuestionText(content: string): string {
  const lines = content.split('\n')
  let i = 0
  if (lines[0]?.trim() === '---') { const c = lines.findIndex((l, k) => k > 0 && l.trim() === '---'); if (c > 0) i = c + 1 }
  const h1 = lines.findIndex((l, k) => k >= i && /^#\s/.test(l)); if (h1 >= 0) i = h1 + 1
  while (i < lines.length && !lines[i].trim()) i++
  const out: string[] = []
  while (i < lines.length && lines[i].trim() && !/^#{1,6}\s/.test(lines[i])) out.push(lines[i++].trim())
  return out.join(' ')
}
