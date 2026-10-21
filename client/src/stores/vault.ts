// Notes vault (IndexedDB via idb-keyval). Owner: lane B / W2. Lane C calls upsert() to add literature notes.
// D-33: one folder per research question: Questions/<name>/Question.md (type: question) + Questions/<name>/seeds/S<n> ….md
// (+ any other notes the user puts in that folder). The default vault is EMPTY. Other folders (Discovered/, Notes/) are kept.
import { defineStore } from 'pinia'
import { get, update } from 'idb-keyval'

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
/** A short default folder name from the question text (first ~6 meaningful words of the question). */
export function nameFromQuestion(text: string): string {
  const stop = new Set('a an and are can do does for from how in is of on or the to what which who why with help helps study'.split(' '))
  const w = text.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(x => x && !stop.has(x.toLowerCase())).slice(0, 6)
  return safeQuestionName(w.join(' ')) || 'Question'
}

export function questionNote (question: string, name?: string): Omit<Note, 'updatedAt'> {
  return {
    path: name ? questionPath(name) : QUESTION_PATH,
    kind: 'note',
    title: 'Question',
    content: `---\ntype: question\ncreated: ${new Date().toISOString().slice(0, 10)}\n---\n${question}\n\n## Seeds\n\nAdd trusted papers in the **Library** tab (paste ids or upload a .bib / .ris / CSL JSON / CSV / PDF). Their notes land in seeds/ next to this note, and only this question's builds read them.\n\n## Kept so far\n\n- [ ] Build the library from this question\n- [ ] Keep the papers worth reading\n`,
  }
}

const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* private mode */ } }

const META_KEY = 'papertrail:vault:sync:v1'
const CHANNEL = 'papertrail:vault'

// ---- D-37: write-through to the server's question folders (WORKSPACE_DIR/<question>/…) ----
// Safety model (issue #13): the browser copy is never the casualty. A note is "dirty" while its content hash differs from the
// hash the server last confirmed (`synced`), so unsaved edits survive reloads and are retried until the server accepts them.
// Renames and deletes are queued ops that run only after the new copy is saved. Several tabs merge by updatedAt, not overwrite.
/** "Questions/<q>/<rel>" → { q, rel } (rel = path inside the question folder). */
export function splitQuestionPath(path: string): { q: string; rel: string } | null {
  const m = path.match(/^Questions\/([^/]+)\/(.+\.md)$/)
  return m ? { q: m[1], rel: m[2] } : null
}
const qUrl = (q: string) => `/api/questions/${encodeURIComponent(q)}`
const noteUrl = (q: string, rel: string) => `${qUrl(q)}/notes/${rel.split('/').map(encodeURIComponent).join('/')}`
/** CR-9: ?demo=1 replays a recording; the vault is then in memory only (no server writes, no IndexedDB). */
const isDemo = () => { try { return new URLSearchParams(location.search).get('demo') === '1' } catch { return false } }
async function call(url: string, init?: RequestInit): Promise<Response | null> {
  if (init?.method && init.method !== 'GET' && isDemo()) return null
  try { return await fetch(url, init) } catch { return null }
}
const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({ method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
/** Conditional write: only overwrite the server copy we last saw (server/routes/library.ts answers 412 otherwise); a never-synced note must not replace an existing file. */
const ifBase = (base: string | undefined): Record<string, string> => base ? { 'if-match': `"${base}"` } : { 'if-none-match': '*' }
/** FNV-1a + length: a cheap change detector, not security. */
export function hashText(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return `${(h >>> 0).toString(36)}:${s.length}`
}

/** A flagged conflict: `server` holds the OTHER copy. origin 'server' = the server's file (`hash` is what it holds), 'tab' = another tab's unsaved-to-server copy. */
export interface Conflict { server: string; origin?: 'server' | 'tab'; hash?: string }
type Op = { op: 'delete'; path: string; after?: string; base?: string } | { op: 'rmq'; name: string } | { op: 'mvq'; from: string; to: string }
const opKey = (o: Op) => JSON.stringify(o)
interface Sync {
  synced: Record<string, string>   // path → hash of the content the server has confirmed
  ops: Op[]                        // queued note deletes / folder renames / folder deletes (persisted)
  done: Set<string>; removed: Set<string>  // since the last IndexedDB write: finished ops, paths deleted here
  rejected: Record<string, string> // path → hash the server refused with a permanent 4xx (not retried until the content changes)
  tomb: Record<string, number>     // path → when it was deleted/renamed away (0 = revived); other tabs' saves must not bring it back
  disk: Record<string, string>     // path → hash of the copy this tab last read from / wrote to IndexedDB (base for cross-tab conflicts)
  pulled: boolean                  // pull() has reached the server once: only then are never-synced notes uploaded
  timer?: ReturnType<typeof setTimeout>; saveTimer?: ReturnType<typeof setTimeout>
  id: string; backoff: number; running: boolean; hooked: boolean; lastRefresh: number
}
const syncs = new WeakMap<object, Sync>()
const S = (store: object): Sync => {
  let s = syncs.get(store)
  if (!s) syncs.set(store, s = { synced: {}, ops: [], done: new Set(), removed: new Set(), rejected: {}, tomb: {}, disk: {}, pulled: false, id: Math.random().toString(36).slice(2), backoff: 1000, running: false, hooked: false, lastRefresh: 0 })
  return s
}
/** A question folder with a queued delete / rename-away: pull() must not bring it back. */
const TOMB_TTL = 30 * 864e5
/** A save older than a delete of the same path (from any tab) must not resurrect it; a tie keeps the note. */
const buried = (tomb: Record<string, number>, n: Note) => (tomb[n.path] ?? 0) > n.updatedAt
const hashes = new WeakMap<object, { c: string; h: string }>()
/** hashText of a note's content, cached per note object so persist() does not rehash every note on every save. */
function noteHash(n: Note): string {
  const e = hashes.get(n)
  if (e && e.c === n.content) return e.h
  const h = hashText(n.content); hashes.set(n, { c: n.content, h }); return h
}
const hiddenByOps = (s: Sync, q: string) => s.ops.some(o => (o.op === 'rmq' && o.name === q) || (o.op === 'mvq' && o.from === q))
const pendingDelete = (s: Sync, path: string) => s.ops.some(o => o.op === 'delete' && o.path === path)

type Store = ReturnType<typeof useVault>
const exitPushers = new Set<() => void>()
/** An editor registers how to push its pending (debounced) text into the store; pagehide runs these first, then flushes once. */
export function onVaultExit(push: () => void): () => void { exitPushers.add(push); return () => { exitPushers.delete(push) } }
function exitNow(store: Store) { for (const p of exitPushers) { try { p() } catch { /* keep going */ } } store.flushOnExit() }
/** Not on the server yet (or changed since): only notes inside Questions/ sync; an untouched "New note" stub stays local (Q2-15). */
const unsaved = (s: Sync, n: Note) => !!splitQuestionPath(n.path) && !isStub(n.path, n.content) && s.synced[n.path] !== noteHash(n)
const refused = (s: Sync, n: Note) => unsaved(s, n) && s.rejected[n.path] === noteHash(n)
const wantsPush = (s: Sync, store: Store, n: Note) => unsaved(s, n) && s.rejected[n.path] !== noteHash(n) && !store.conflicts[n.path]
/** Statuses that may pass on a later try (guard cookie refresh = 401/403, overload, server error). Any other 4xx is a refusal. */
const transient = (status: number) => status >= 500 || status === 401 || status === 403 || status === 408 || status === 429
/** Make the server's question folder exist (offline-created questions). True only when we created it: a 409 means a folder of that name is already there and is never written into. */
async function ensureQuestion(store: Store, q: string): Promise<boolean> {
  const note = store.notes.find(n => n.path === questionPath(q))
  const r = await call('/api/questions', json('POST', { id: q, content: note?.content ?? '' }))
  return !!r && r.ok
}
/** Names of the server's question folders, or null when unreachable. */
async function serverQuestions(): Promise<Set<string> | null> {
  const r = await call('/api/questions')
  if (!r?.ok) return null
  const { questions = [] } = await r.json().catch(() => ({})) as { questions?: { id: string }[] }
  return new Set(questions.map(q => q.id))
}
/** Moves the local notes of one question folder to another name; saved copies stay saved because the server renames the folder too. */
function moveNotes(store: Store, from: string, to: string) {
  const s = S(store)
  const prefix = questionFolder(from) + '/'
  const map = new Map<string, string>()
  for (const n of store.notes) if (n.path.startsWith(prefix)) {
    const old = n.path
    n.path = questionFolder(to) + '/' + old.slice(prefix.length); n.updatedAt = Date.now()
    map.set(old, n.path)
    if (s.synced[old]) s.synced[n.path] = s.synced[old]
    if (store.conflicts[old]) store.conflicts[n.path] = store.conflicts[old]
    forget(store, old); revive(s, n.path)
  }
  retarget(s, o => map.get(o))
}
/** Queued deletes that wait on a path which just moved on must wait on its new path, or they would delete an unconfirmed original. */
function retarget(s: Sync, to: (path: string) => string | undefined) {
  s.ops = s.ops.map(o => {
    const next = o.op === 'delete' && o.after ? to(o.after) : undefined
    if (!next || o.op !== 'delete') return o
    s.done.add(opKey(o)); const m: Op = { ...o, after: next }; s.done.delete(opKey(m)); return m
  })
}
function schedule(store: Store, ms = 300) {
  if (isDemo()) return
  const s = S(store); clearTimeout(s.timer)
  s.timer = setTimeout(() => { void store.flush() }, ms)
}
/** The note exists again: drop a queued delete of it and let persist() keep it. */
function revive(s: Sync, path: string) {
  s.ops = s.ops.filter(o => !(o.op === 'delete' && o.path === path)); s.removed.delete(path)
  if (s.tomb[path]) s.tomb[path] = 0
}
function queue(s: Sync, op: Op) { if (!s.ops.some(o => opKey(o) === opKey(op))) s.ops.push(op); s.done.delete(opKey(op)) }
/** A queued delete of `path` now expects the server to hold `hash`. */
function rebase(s: Sync, path: string, hash: string) {
  s.ops = s.ops.map(o => {
    if (o.op !== 'delete' || o.path !== path) return o // also a delete queued before the first PUT landed (no base yet)
    s.done.add(opKey(o)); const m: Op = { ...o, base: hash }; s.done.delete(opKey(m)); return m
  })
}
function forget(store: Store, path: string) {
  const s = S(store); delete s.synced[path]; delete store.conflicts[path]; s.removed.add(path); s.tomb[path] = Date.now()
}

/** Writes notes + sync metadata to IndexedDB, merged with what other tabs wrote (newer updatedAt wins; deletes from any tab win over older saves). */
async function writeNow(store: Store) {
  if (isDemo()) return
  const s = S(store)
  const removed = new Set(s.removed), done = new Set(s.done)
  const mine = JSON.parse(JSON.stringify(store.notes)) as Note[]
  const mineHash = new Map(store.notes.map(n => [n.path, noteHash(n)]))
  const myTomb = { ...s.tomb }
  let tomb: Record<string, number> = {}
  await update<{ synced?: Record<string, string>; ops?: Op[]; tomb?: Record<string, number> } | undefined>(META_KEY, stored => {
    const synced = { ...(stored?.synced ?? {}), ...s.synced }
    for (const p of removed) delete synced[p]
    tomb = { ...(stored?.tomb ?? {}), ...myTomb }
    const now = Date.now()
    for (const [p, at] of Object.entries(tomb)) if (at < now - TOMB_TTL) delete tomb[p]
    const ops = new Map<string, Op>()
    for (const o of [...(stored?.ops ?? []), ...s.ops]) if (!done.has(opKey(o))) ops.set(opKey(o), o)
    return { synced, ops: [...ops.values()], tomb }
  })
  const wrote: Record<string, string> = {}
  await update<Note[] | undefined>(DB_KEY, stored => {
    const by = new Map<string, Note>()
    for (const n of Array.isArray(stored) ? stored : []) if (!removed.has(n.path) && !buried(tomb, n)) by.set(n.path, n)
    for (const n of mine) {
      if (buried(tomb, n)) continue
      const o = by.get(n.path)
      if (!o || o.updatedAt <= n.updatedAt) { by.set(n.path, n); wrote[n.path] = mineHash.get(n.path) ?? hashText(n.content) }
    }
    return [...by.values()]
  })
  Object.assign(s.disk, wrote)
  for (const p of removed) s.removed.delete(p)
  for (const k of done) s.done.delete(k)
  try { if (typeof BroadcastChannel !== 'undefined') { const bc = new BroadcastChannel(CHANNEL); bc.postMessage(s.id); bc.close() } } catch { /* no channel */ }
}

/** Page hide / tab close / back online / another tab saved. */
function hook(store: Store) {
  const s = S(store)
  if (s.hooked || isDemo()) return
  s.hooked = true
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => exitNow(store))
    window.addEventListener('focus', () => store.refresh())
    window.addEventListener('online', () => { void store.flush() })
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') exitNow(store); else store.refresh() })
  try { if (typeof BroadcastChannel !== 'undefined') new BroadcastChannel(CHANNEL).onmessage = e => { if (e.data !== s.id) void store.mergeFromDisk() } } catch { /* no channel */ }
  // Ask the browser not to evict the vault under storage pressure.
  try { void navigator.storage?.persist?.() } catch { /* unsupported */ }
}

const paperIdOf = (content: string) => content.match(/^paper_id:\s*(\S+)/m)?.[1]
/** seeds/ → seed; a note with a paper_id (a library / discovery paper added to the vault, Q2-5) → lit; else note. */
const kindOf = (rel: string, content = ''): NoteKind => rel.startsWith('seeds/') ? 'seed' : paperIdOf(content) && /^role:\s*literature\s*$/m.test(content) ? 'lit' : 'note'
/** Q2-5: notes/<Author Year title>.md of a library paper (written by "Add to vault"); the graph links it by paperId. */
export const questionNotePath = (question: string, name: string) => `${questionFolder(question)}/notes/${name}.md`
/** Q2-15: the untouched body vault.create() gives a new note; it stays in the browser until the user writes in it. */
const isStub = (path: string, content: string) => content === `# ${path.split('/').pop()!.replace(/\.md$/, '')}\n\n`

const topFolder = (p: string) => (p.includes('/') ? p.split('/')[0] : '')

export const useVault = defineStore('vault', {
  state: () => ({ notes: [] as Note[], ready: false, error: '' as string, current: null as string | null, conflicts: {} as Record<string, Conflict>, syncError: '' as string, unsynced: 0, refused: [] as string[] }),
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
    async load() {
      const s = S(this)
      if (!isDemo()) {
        try {
          const stored = await get<Note[]>(DB_KEY)
          const meta = await get<{ synced?: Record<string, string>; ops?: Op[]; tomb?: Record<string, number> }>(META_KEY)
          // Keep notes lane C may have upserted before load finished.
          const fresh = this.notes
          s.tomb = { ...(meta?.tomb ?? {}), ...s.tomb }
          this.notes = (Array.isArray(stored) ? stored : []).filter(n => !buried(s.tomb, n))
          for (const n of this.notes) s.disk[n.path] = hashText(n.content)
          for (const n of fresh) { const i = this.notes.findIndex(x => x.path === n.path); if (i >= 0) this.notes[i] = n; else this.notes.push(n) }
          s.synced = { ...(meta?.synced ?? {}), ...s.synced }
          for (const o of meta?.ops ?? []) queue(s, o)
        } catch {
          this.error = 'Could not open the browser vault (IndexedDB). Notes will not persist.'
        }
      }
      this.migrate()
      await this.pull()
      // CR-8: the inline title replaces the generic "# Question" heading of older question notes
      for (const q of this.questions) {
        const n = this.byPath(q.path)
        const m = n?.content.match(/^(---\n[\s\S]*?\n---\n)# Question\n+/)
        if (n && m) await this.upsert({ path: n.path, kind: n.kind, title: n.title, paperId: n.paperId, content: m[1] + n.content.slice(m[0].length) })
      }
      const saved = lsGet(CURRENT_KEY)
      this.current = this.questions.find(q => q.id === saved)?.id ?? this.questions[0]?.id ?? null
      this.ready = true
      this.persist()
      hook(this)
      await this.flush()
    },
    /**
     * D-37: the server's question folders are merged into the browser copy, never blindly over it. A note changed here and not
     * yet saved is kept; a note this browser never synced that differs from the server's, or one both sides changed, is flagged in
     * `conflicts` (resolve with resolveConflict). Local-only question folders are created on the server; their notes upload in
     * flush(). Without a server the local cache is used.
     */
    async pull() {
      const s = S(this)
      const res = await call('/api/questions')
      if (!res?.ok) { this.error = this.error || (res ? '' : 'Server unreachable: question folders are only in this browser for now.'); return }
      const { questions = [] } = await res.json().catch(() => ({})) as { questions?: { id: string }[] }
      const onServer = new Set(questions.map(q => q.id))
      for (const q of questions) {
        if (hiddenByOps(s, q.id)) continue
        // what this folder looked like before the GET: anything that moved meanwhile (a save, a rename) is newer than the server data below
        const before = new Map(this.notesIn(q.id).map(n => [n.path, [s.synced[n.path], noteHash(n)] as const]))
        const r = await call(`${qUrl(q.id)}/notes`)
        if (!r?.ok) continue
        const { notes = [] } = await r.json().catch(() => ({})) as { notes?: { path: string; content: string; updatedAt: number }[] }
        const prefix = questionFolder(q.id) + '/'
        const seen = new Set<string>()
        for (const sn of notes) {
          const path = prefix + sn.path
          seen.add(path)
          if (pendingDelete(s, path)) continue
          const sh = hashText(sn.content)
          const i = this.notes.findIndex(n => n.path === path)
          const local = this.notes[i]
          const was = before.get(path)
          if (local ? !was || was[0] !== s.synced[path] || was[1] !== noteHash(local) : was) continue // changed while we were asking: the next pull sees it
          const adopt = () => {
            const kind = kindOf(sn.path, sn.content)
            const n: Note = { path, kind, title: path.split('/').pop()!.replace(/\.md$/, ''), content: sn.content, paperId: kind === 'note' ? undefined : paperIdOf(sn.content), updatedAt: sn.updatedAt }
            if (i >= 0) this.notes[i] = n; else this.notes.push(n)
            s.synced[path] = sh; delete this.conflicts[path]
          }
          if (!local) { adopt(); continue }
          if (noteHash(local) === sh) { s.synced[path] = sh; delete this.conflicts[path]; continue }
          const base = s.synced[path]
          // unchanged here since the last sync → the server wins; local edit on an unchanged server copy → ours is pushed;
          // otherwise (both changed, or this browser never synced it) keep ours and flag it. Never guess by timestamps.
          if (base === noteHash(local)) adopt()
          else if (base !== sh) this.conflicts[path] = { server: sn.content, origin: 'server', hash: sh }
        }
        for (const n of this.notesIn(q.id)) if (!seen.has(n.path)) delete s.synced[n.path] // the server lost it: upload again
      }
      s.pulled = true
      // a folder that is the target of a queued rename is created by that rename, not here
      for (const q of this.questions.filter(x => !onServer.has(x.id) && !hiddenByOps(s, x.id) && !s.ops.some(o => o.op === 'mvq' && o.to === x.id))) await ensureQuestion(this, q.id)
    },
    /**
     * Pushes every unsaved note (PUT), then runs queued renames/deletes. A failed call keeps the note unsaved and retries
     * with backoff; a rename deletes the old file only after the new one is saved. Resolves when this pass is over.
     */
    async flush() {
      const s = S(this)
      if (isDemo() || s.running) return
      s.running = true; clearTimeout(s.timer)
      let fail = false; let changed = false
      try {
        // never upload into a folder before seeing what the server has (a same-named folder from another browser)
        if (!s.pulled) await this.pull()
        if (!s.pulled) fail = true
        // 1. folder renames / deletes (2xx = done; 404/409 on a rename = the target name is taken or the source is gone)
        for (let guard = 0; !fail && guard < 50; guard++) {
          const op = s.ops.find(o => o.op !== 'delete') as Exclude<Op, { op: 'delete' }> | undefined
          if (!op) break
          const r = op.op === 'rmq' ? await call(qUrl(op.name), { method: 'DELETE' }) : await call(qUrl(op.from), json('PATCH', { name: op.to }))
          if (!r) { fail = true; break }
          const finish = () => { s.ops = s.ops.filter(o => opKey(o) !== opKey(op)); s.done.add(opKey(op)); changed = true }
          if (r.ok || (op.op === 'rmq' && r.status === 404)) { finish(); continue }
          if (op.op === 'rmq' || (r.status !== 404 && r.status !== 409)) { fail = true; break }
          // the new name exists on the server: never write into that folder. Take a free name and try again.
          const names = await serverQuestions()
          if (!names) { fail = true; break }
          if (!names.has(op.to) && r.status === 404) { for (const n of this.notesIn(op.to)) delete s.synced[n.path]; finish(); continue } // source gone: upload the notes instead
          let k = 2; let name = op.to
          do { const suffix = ` (${k++})`; name = op.to.slice(0, 60 - suffix.length).trimEnd() + suffix } while (names.has(name) || this.notesIn(name).length) // the server caps folder names at 60 characters
          const wasCurrent = this.current === op.to
          finish(); moveNotes(this, op.to, name); queue(s, { op: 'mvq', from: op.from, to: name })
          if (wasCurrent) this.setCurrent(name)
          changed = true
        }
        if (!fail) for (const n of [...this.notes]) { // 2. unsaved notes
          if (!wantsPush(s, this, n)) continue
          const path = n.path; const sp = splitQuestionPath(path)!
          const content = n.content; const h = hashText(content)
          const base = s.synced[path]
          const put = () => call(noteUrl(sp.q, sp.rel), json('PUT', { content }, ifBase(base)))
          let r = await put()
          if (r?.status === 400 && await ensureQuestion(this, sp.q)) r = await put()
          if (!r || transient(r.status)) { fail = true; break }
          if (r.status === 412) {
            // the server copy changed since we last saw it (edited elsewhere): never overwrite, flag it
            const j = await r.json().catch(() => ({})) as { content?: unknown; hash?: unknown }
            if (typeof j.content === 'string') this.conflicts[path] = { server: j.content, origin: 'server', hash: typeof j.hash === 'string' ? j.hash : hashText(j.content) }
            else delete s.synced[path] // deleted on the server meanwhile: upload it again as new
            continue
          }
          if (r.ok) {
            // the note may have been renamed or removed while the PUT was in flight: only a note still at this path counts as saved
            if (this.notes.some(x => x.path === path)) s.synced[path] = h
            else rebase(s, path, h) // moved on meanwhile: a queued delete of this path must expect the copy we just wrote
            changed = true
          } else s.rejected[path] = h
        }
        if (!fail) for (const op of [...s.ops]) { // 3. deletes (old file of a rename only once the new one is saved)
          if (op.op !== 'delete') continue
          const next = op.after ? this.notes.find(n => n.path === op.after) : undefined
          if (next && unsaved(s, next)) continue
          const sp = splitQuestionPath(op.path)
          // only ever delete a file we saved: no base = this browser never wrote it. 412 = changed elsewhere since: keep it (pull restores it).
          if (sp && op.base) {
            const r = await call(noteUrl(sp.q, sp.rel), { method: 'DELETE', headers: { 'if-match': `"${op.base}"` } })
            if (!r || !(r.ok || r.status === 404 || r.status === 412)) { fail = true; break }
            if (r.status === 412) s.pulled = false
          }
          s.ops = s.ops.filter(o => opKey(o) !== opKey(op)); s.done.add(opKey(op)); changed = true
        }
      } finally { s.running = false }
      const left = this.notes.filter(n => wantsPush(s, this, n)).length
      const turned = this.notes.filter(n => refused(s, n)).length
      this.refused = this.notes.filter(n => refused(s, n)).map(n => n.path)
      this.unsynced = this.notes.filter(n => unsaved(s, n)).length
      if (fail) {
        this.syncError = `Server not reachable or refusing requests: ${this.unsynced || 'some'} change${this.unsynced === 1 ? '' : 's'} saved only in this browser, retrying.`
        s.backoff = Math.min(s.backoff * 2, 30_000); schedule(this, s.backoff)
      } else {
        s.backoff = 1000; if (left) schedule(this)
        this.syncError = turned ? `The server refused ${turned} note${turned === 1 ? '' : 's'}; kept in this browser.` : ''
      }
      if (changed) this.persist()
    },
    /** Window focus / tab visible: look at the server again so edits made elsewhere show up (or flag a conflict) before the next save. */
    async refresh() {
      const s = S(this)
      if (isDemo() || s.running || Date.now() - s.lastRefresh < 3000) return
      s.lastRefresh = Date.now()
      s.running = true // a flush must not interleave with the pull (it would see its own just-saved text as stale)
      try { await this.pull() } finally { s.running = false }
      schedule(this, 0)
    },
    /** pagehide / tab hidden: write IndexedDB now and fire the unsaved PUTs with keepalive (retried on the next load if they don't land). */
    flushOnExit() {
      if (isDemo()) return
      const s = S(this)
      clearTimeout(s.saveTimer)
      void writeNow(this).catch(() => { /* the debounced copy already ran or will on next edit */ })
      if (!s.pulled) return // never-seen folders are uploaded only after pull() (next load)
      for (const n of this.notes) {
        if (!wantsPush(s, this, n)) continue
        const sp = splitQuestionPath(n.path)!
        try { void fetch(noteUrl(sp.q, sp.rel), { ...json('PUT', { content: n.content }, ifBase(s.synced[n.path])), keepalive: true }).catch(() => {}) } catch { /* body over the keepalive limit */ }
      }
    },
    /**
     * Another tab saved: adopt its newer notes and deletes without losing ours. A note both tabs changed since this tab last
     * read the shared copy is flagged in `conflicts` (server = the other tab's copy), never silently dropped.
     */
    async mergeFromDisk() {
      if (isDemo()) return
      const s = S(this)
      try {
        const stored = await get<Note[]>(DB_KEY)
        const meta = await get<{ synced?: Record<string, string>; tomb?: Record<string, number> }>(META_KEY)
        for (const [p, at] of Object.entries(meta?.tomb ?? {})) if (at > (s.tomb[p] ?? 0)) s.tomb[p] = at
        const gone = this.notes.filter(n => buried(s.tomb, n))
        if (gone.length) { this.notes = this.notes.filter(n => !buried(s.tomb, n)); for (const n of gone) { delete s.synced[n.path]; delete s.disk[n.path]; delete this.conflicts[n.path] } }
        for (const n of Array.isArray(stored) ? stored : []) {
          if (s.removed.has(n.path) || buried(s.tomb, n)) continue
          const i = this.notes.findIndex(x => x.path === n.path)
          const sh = hashText(n.content)
          const adopt = () => { if (i < 0) this.notes.push(n); else this.notes[i] = n; s.disk[n.path] = sh; if (meta?.synced?.[n.path]) s.synced[n.path] = meta.synced[n.path]; delete this.conflicts[n.path] }
          if (i < 0) { adopt(); continue }
          const lh = noteHash(this.notes[i])
          if (lh === sh) { s.disk[n.path] = sh; continue }
          const base = s.disk[n.path]
          if (base === lh) adopt()                    // only the other tab changed it
          else if (base !== sh) this.conflicts[n.path] = { server: n.content, origin: 'tab' } // both changed it
        }
      } catch { /* IndexedDB unavailable: nothing to merge */ }
    },
    /**
     * Settle a flagged conflict: keep this browser's copy ('local') or take the other copy ('server' = the conflict's other side).
     * The copy that loses is never discarded: it is saved as a sibling note "<name> (conflict yyyy-mm-dd hh-mm).md" in the same folder.
     * A path counts as synced only when the kept copy is exactly what the server confirmed; anything else stays unsaved and uploads.
     */
    async resolveConflict(path: string, keep: 'local' | 'server') {
      const c = this.conflicts[path]; const s = S(this)
      const n = this.notes.find(x => x.path === path)
      if (!c || !n) { delete this.conflicts[path]; return }
      const mine = n.content
      const loser = keep === 'local' ? c.server : mine
      const winner = keep === 'local' ? mine : c.server
      if (loser !== winner) {
        const d = new Date(); const p2 = (x: number) => String(x).padStart(2, '0')
        const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}-${p2(d.getMinutes())}`
        const stem = path.replace(/\.md$/, '') + ` (conflict ${stamp})`
        let copy = stem + '.md'; let k = 2
        while (this.notes.some(x => x.path === copy)) copy = `${stem} ${k++}.md`
        await this.upsert({ path: copy, kind: 'note', title: copy.split('/').pop()!.replace(/\.md$/, ''), content: loser })
      }
      if (keep === 'server') { n.content = c.server; n.updatedAt = Date.now() } else n.updatedAt = Date.now() // newer than the other tab's copy, so it wins the next merge
      if (c.origin === 'server') s.synced[path] = c.hash ?? hashText(c.server) // the server really holds that copy; "keep mine" then uploads over it
      else s.disk[path] = hashText(c.server)                                    // another tab's copy: the server has not confirmed it, so it stays unsaved
      delete this.conflicts[path]
      this.persist(); schedule(this)
    },
    /** One-time D-33 migration: Notes/Question.md + Seeds/* → Questions/<name>/{Question.md, seeds/}. User notes stay. */
    migrate() {
      if (isDemo() || lsGet(MIGRATED_KEY)) return
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
      if (isDemo()) return
      const s = S(this)
      this.unsynced = this.notes.filter(n => unsaved(s, n)).length
      clearTimeout(s.saveTimer)
      s.saveTimer = setTimeout(() => { void this.saveNow() }, 150)
    },
    /** Writes to IndexedDB now (persist() debounces this by 150 ms). */
    async saveNow() {
      clearTimeout(S(this).saveTimer)
      try { await writeNow(this) } catch { this.error = 'Saving to IndexedDB failed.' }
    },
    setCurrent(id: string | null) { this.current = id; if (!isDemo()) lsSet(CURRENT_KEY, id) },
    /** Creates Questions/<name>/Question.md; returns the folder name (made unique) or null without a name. */
    async createQuestion(rawName: string, text: string): Promise<string | null> {
      const base = safeQuestionName(rawName) || nameFromQuestion(text)
      if (!base) return null
      let name = base; let k = 2
      const note = (n: string) => questionNote(text.trim() || 'Write your research question here.', n)
      while (this.notes.some(n => n.path.toLowerCase().startsWith(questionFolder(name).toLowerCase() + '/'))) name = `${base} ${k++}`
      // D-37: create the folder on the server first (409 = a folder with that name exists there: take the next name)
      for (let tries = 0; tries < 20; tries++) {
        const r = await call('/api/questions', json('POST', { id: name, content: note(name).content }))
        if (!r || r.ok || r.status !== 409) break
        name = `${base} ${k++}`
      }
      await this.upsert(note(name))
      this.setCurrent(name)
      return name
    },
    /** Moves every note under Questions/<old>/ to Questions/<new>/ (the server folder is renamed by a queued op, retried until it works). */
    renameQuestion(oldName: string, rawNew: string): string | null {
      const next = safeQuestionName(rawNew)
      if (!next || next === oldName) return null
      if (this.notes.some(n => n.path.toLowerCase().startsWith(questionFolder(next).toLowerCase() + '/'))) return null
      const s = S(this)
      moveNotes(this, oldName, next)
      if (this.current === oldName) this.setCurrent(next)
      queue(s, { op: 'mvq', from: oldName, to: next })
      this.persist(); schedule(this)
      try { const last = localStorage.getItem(`papertrail:lastLibrary:${oldName}`); if (last) { localStorage.setItem(`papertrail:lastLibrary:${next}`, last); localStorage.removeItem(`papertrail:lastLibrary:${oldName}`) } } catch { /* private mode */ }
      return next
    },
    /** Removes the whole question folder (Question.md, seeds, notes in it); the server moves it to workspace/.trash/. */
    deleteQuestion(name: string) {
      const s = S(this)
      const from = questionFolder(name) + '/'
      for (const n of this.notes) if (n.path.startsWith(from)) forget(this, n.path)
      this.notes = this.notes.filter(n => !n.path.startsWith(from))
      if (this.current === name) this.setCurrent(this.questions[0]?.id ?? null)
      queue(s, { op: 'rmq', name })
      this.persist(); schedule(this)
    },
    async upsert(note: Omit<Note, 'updatedAt'>) {
      const n = { ...note, updatedAt: Date.now() }
      const i = this.notes.findIndex(x => x.path === n.path)
      if (i >= 0) this.notes[i] = n; else this.notes.push(n)
      revive(S(this), n.path)
      this.persist()
      schedule(this) // Q2-15: stubs are skipped by flush(); the note is written on the first real edit
    },
    /** The editor's debounced save. If the stored copy changed behind the editor's back (another tab, a pull) the other copy is flagged, not overwritten silently. */
    async saveEdit(note: Omit<Note, 'updatedAt'>, base: string) {
      const cur = this.byPath(note.path)
      if (cur && cur.content !== base && cur.content !== note.content && !this.conflicts[note.path]) {
        const fromServer = S(this).synced[note.path] === hashText(cur.content)
        this.conflicts[note.path] = fromServer ? { server: cur.content, origin: 'server', hash: hashText(cur.content) } : { server: cur.content, origin: 'tab' }
      }
      await this.upsert(note)
    },
    async remove(path: string) {
      const s = S(this)
      this.notes = this.notes.filter(n => n.path !== path)
      const base = s.synced[path]
      forget(this, path)
      if (splitQuestionPath(path)) queue(s, { op: 'delete', path, base })
      this.persist(); schedule(this)
    },
    /** Moves a note. The new copy is saved first; the old file is deleted only after that PUT succeeds, so a failure never loses it. */
    async rename(path: string, newPath: string) {
      if (!newPath.endsWith('.md')) newPath += '.md'
      if (path === newPath || this.notes.some(n => n.path === newPath)) return false
      const n = this.notes.find(x => x.path === path); if (!n) return false
      const s = S(this)
      n.path = newPath
      n.title = newPath.split('/').pop()!.replace(/\.md$/, '')
      n.updatedAt = Date.now()
      if (this.conflicts[path]) this.conflicts[newPath] = this.conflicts[path]
      const base = s.synced[path]
      forget(this, path); revive(s, newPath)
      retarget(s, p => (p === path ? newPath : undefined)) // X→X2→X3: the delete of X must wait for X3, not X2
      if (splitQuestionPath(path)) queue(s, { op: 'delete', path, after: newPath, base })
      this.persist(); schedule(this)
      return true
    },
    /**
     * CR-8 (F-64): the inline title renames the note. For Questions/<q>/Question.md the title is the question's subject =
     * its folder name, so the folder is renamed. [[old name]] links in every note are rewritten. Returns the new path or null.
     */
    async retitle(path: string, rawTitle: string): Promise<string | null> {
      const title = safeQuestionName(rawTitle)
      if (!title) return null
      const q = path.match(/^Questions\/([^/]+)\/Question\.md$/)?.[1]
      let newPath: string
      const oldName = q ?? path.split('/').pop()!.replace(/\.md$/, '')
      if (oldName === title) return path
      if (q) {
        const next = this.renameQuestion(q, title)
        if (!next) return null
        newPath = questionPath(next)
      } else {
        const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
        newPath = `${folder}${title}.md`
        if (!(await this.rename(path, newPath))) return null
      }
      // [[old]] / [[old|alias]] / [[old#heading]] → new name
      const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`\\[\\[${esc}(?=[|#\\]])`, 'gi')
      for (const n of this.notes) if (re.test(n.content)) { re.lastIndex = 0; await this.upsert({ ...n, content: n.content.replace(re, `[[${title}`) }) }
      return newPath
    },
    /** Creates an empty note with a unique name (in the current question's notes/ folder by default) and returns its path. */
    async create(name = 'Untitled', folder?: string) {
      const dir = folder ?? (this.current ? questionFolder(this.current) + '/notes' : 'Notes')
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
