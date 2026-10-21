// Owner: lane W2 (D-37). One parent folder per research question on disk — the server is the source of truth:
//   ${WORKSPACE_DIR}/<question>/{Question.md, seeds/*.md, notes/*.md, libraries/<libraryId>/…, exports/}
// The question id IS the folder name (a safe file name). Deleting moves the folder to ${WORKSPACE_DIR}/.trash/.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { atomicWriteFileSync, atomicWriteJsonSync } from '../data/atomic'

export const workspaceRoot = () => resolve(process.env.WORKSPACE_DIR || './workspace')

const NAME_RE = /^[^\\/:*?"<>|#^[\]\x00-\x1f]{1,60}$/
/** A question folder name: no path separators, no dot-start, no reserved characters. */
export const isSafeQuestionId = (id: string) => NAME_RE.test(id) && !id.startsWith('.') && id.trim() === id && id !== '..'

export function questionDir(id: string): string | null {
  if (!isSafeQuestionId(id)) return null
  const root = workspaceRoot()
  const dir = resolve(root, id)
  return dir.startsWith(root + sep) && dirname(dir) === root ? dir : null
}

/** A note path inside a question folder ("Question.md", "seeds/S1 X.md", "notes/a.md"): .md only, no "..", no dot segments. */
export function notePathIn(id: string, rel: string): string | null {
  const dir = questionDir(id)
  if (!dir) return null
  const parts = rel.split('/')
  if (!rel.endsWith('.md') || rel.length > 200 || parts.some(p => !p || p.startsWith('.') || /[\\:*?"<>|\x00-\x1f]/.test(p))) return null
  if (parts[0] === 'libraries' || parts[0] === 'exports') return null
  const file = resolve(dir, rel)
  return file.startsWith(dir + sep) ? file : null
}

export interface QuestionInfo { id: string; name: string; text: string; created: string | null; notes: number; libraries: number }

const firstParagraph = (content: string) => {
  const lines = content.split('\n'); let i = 0
  if (lines[0]?.trim() === '---') { const c = lines.findIndex((l, k) => k > 0 && l.trim() === '---'); if (c > 0) i = c + 1 }
  const h1 = lines.findIndex((l, k) => k >= i && /^#\s/.test(l)); if (h1 >= 0) i = h1 + 1
  while (i < lines.length && !lines[i].trim()) i++
  const out: string[] = []
  while (i < lines.length && lines[i].trim() && !/^#{1,6}\s/.test(lines[i])) out.push(lines[i++].trim())
  return out.join(' ')
}

function walkMd(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const p = join(dir, name)
    const rel = relative(base, p).split(sep).join('/')
    if (rel === 'libraries' || rel === 'exports') continue
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walkMd(p, base))
    else if (name.endsWith('.md')) out.push(rel)
  }
  return out
}

export function listQuestions(): QuestionInfo[] {
  const root = workspaceRoot()
  if (!existsSync(root)) return []
  const out: QuestionInfo[] = []
  for (const id of readdirSync(root)) {
    const dir = questionDir(id)
    if (!dir || !existsSync(join(dir, 'Question.md'))) continue
    const content = readFileSync(join(dir, 'Question.md'), 'utf8')
    const libs = existsSync(join(dir, 'libraries')) ? readdirSync(join(dir, 'libraries')).filter(x => !x.startsWith('.')).length : 0
    out.push({ id, name: id, text: firstParagraph(content), created: content.match(/^created:\s*(.+)$/m)?.[1]?.trim() ?? null, notes: walkMd(dir).length, libraries: libs })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function createQuestion(id: string, content: string): QuestionInfo | 'exists' | null {
  const dir = questionDir(id)
  if (!dir) return null
  if (existsSync(dir)) return 'exists'
  for (const sub of ['seeds', 'notes', 'libraries', 'exports']) mkdirSync(join(dir, sub), { recursive: true })
  atomicWriteFileSync(join(dir, 'Question.md'), content)
  return listQuestions().find(q => q.id === id) ?? null
}

export function renameQuestion(id: string, next: string): 'ok' | 'exists' | null {
  const from = questionDir(id); const to = questionDir(next)
  if (!from || !to || !existsSync(from)) return null
  if (existsSync(to)) return 'exists'
  renameSync(from, to)
  // libraries keep pointing at their question
  const libs = join(to, 'libraries')
  if (existsSync(libs)) for (const l of readdirSync(libs)) {
    const f = join(libs, l, 'library.json')
    try { const j = JSON.parse(readFileSync(f, 'utf8')); j.questionId = next; j.questionName = next; atomicWriteJsonSync(f, j) } catch { /* skip */ }
  }
  return 'ok'
}

export function trashQuestion(id: string): boolean {
  const dir = questionDir(id)
  if (!dir || !existsSync(dir)) return false
  const trash = join(workspaceRoot(), '.trash')
  mkdirSync(trash, { recursive: true })
  let dest = join(trash, id); let k = 2
  while (existsSync(dest)) dest = join(trash, `${id} ${k++}`)
  renameSync(dir, dest)
  return true
}

export interface WsNote { path: string; content: string; updatedAt: number }

export function listNotes(id: string): WsNote[] | null {
  const dir = questionDir(id)
  if (!dir || !existsSync(dir)) return null
  return walkMd(dir).map(rel => ({ path: rel, content: readFileSync(join(dir, rel), 'utf8'), updatedAt: statSync(join(dir, rel)).mtimeMs }))
}

export function writeNote(id: string, rel: string, content: string): boolean {
  const file = notePathIn(id, rel)
  if (!file || !existsSync(questionDir(id)!)) return false
  atomicWriteFileSync(file, content)
  return true
}

export function deleteNote(id: string, rel: string): boolean {
  const file = notePathIn(id, rel)
  if (!file || !existsSync(file) || rel === 'Question.md') return false
  rmSync(file)
  return true
}

/** Library folder of a build inside its question folder (created on demand), or null when the question has no folder. */
export function questionLibraryDir(questionId: string | undefined | null, libraryId: string): string | null {
  if (!questionId) return null
  const dir = questionDir(questionId)
  if (!dir || !existsSync(dir)) return null
  return join(dir, 'libraries', libraryId)
}

/** Finds workspace/<q>/libraries/<libraryId> for any question. */
export function findQuestionLibrary(libraryId: string): { dir: string; questionId: string } | null {
  const root = workspaceRoot()
  if (!existsSync(root)) return null
  for (const q of readdirSync(root)) {
    const dir = questionDir(q)
    if (!dir) continue
    const lib = join(dir, 'libraries', libraryId)
    if (existsSync(join(lib, 'library.json'))) return { dir: lib, questionId: q }
  }
  return null
}

/** Library folders of one question (for History). */
export function questionLibraryIds(questionId: string): string[] {
  const dir = questionDir(questionId)
  if (!dir || !existsSync(join(dir, 'libraries'))) return []
  return readdirSync(join(dir, 'libraries')).filter(x => !x.startsWith('.'))
}

/** Writes an export file into <question>/exports/ (best effort). */
export function writeExport(questionId: string | null | undefined, name: string, content: string | Uint8Array): string | null {
  if (!questionId) return null
  const dir = questionDir(questionId)
  if (!dir || !existsSync(dir)) return null
  try {
    const f = join(dir, 'exports', name.replace(/[\\/:*?"<>|]/g, '-'))
    atomicWriteFileSync(f, content)
    return relative(workspaceRoot(), f)
  } catch { return null }
}
