// Owner: lane L2 / W2. Library files: {goals.json, library.json, graph.json, papers/<paperId>.json} in
// ${WORKSPACE_DIR}/<question>/libraries/<id>/ (D-37) — or ${DATA_DIR}/library/<id>/ for builds without a question folder.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { HTTPException } from 'hono/http-exception'
import { randomUUID } from 'node:crypto'
import { atomicWriteJsonSync } from '../data/atomic'
import type { Goals, LibPaper, LibraryRequest, LibrarySummary } from '@shared/library'
import { env } from '../env'
import { cleanUrls } from '../ai/untrusted'
import type { LibraryState } from './pipeline'
import { safeFileId } from './score'
import { findQuestionLibrary, questionLibraryDir, questionLibraryIds, questionDir } from './workspace'

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/
export const libraryRoot = () => resolve(env.dataDir, 'library')
export const isSafeId = (id: string) => ID_RE.test(id)

/** Legacy location DATA_DIR/library/<id> (builds without a question folder, and builds before D-37). */
export function legacyLibraryDir(id: string): string | null {
  if (!isSafeId(id)) return null
  const dir = resolve(libraryRoot(), id)
  return dir.startsWith(libraryRoot() + sep) ? dir : null
}

/** D-37: WORKSPACE_DIR/<question>/libraries/<id> when it exists, else DATA_DIR/library/<id>. */
export function libraryDir(id: string): string | null {
  if (!isSafeId(id)) return null
  return findQuestionLibrary(id)?.dir ?? legacyLibraryDir(id)
}

/**
 * graph.json: what the graph view draws — the passed papers as nodes, the known papers (the question's seeds) they link to,
 * and the citation edges (source cites target). CR-10 E-1: paper→paper edges from referencedWorks (OpenAlex W ids, with or
 * without the https://openalex.org/ prefix) among the passed papers, keyed by paper.id.
 */
export function graphOf(papers: LibPaper[], knownPapers: string[]) {
  const passed = papers.filter(p => p.passed && !p.excluded)
  const ids = new Set(passed.map(p => p.paper.id))
  const byLower = new Map(passed.map(p => [p.paper.id.toLowerCase(), p.paper.id]))
  const known = new Map<string, number>()
  const edges: { source: string; target: string; type: 'cites' }[] = []
  for (const p of passed) for (const w of p.paper.referencedWorks ?? []) {
    const t = byLower.get(w.trim().replace(/^https?:\/\/openalex\.org\//i, '').toLowerCase())
    if (t && t !== p.paper.id) edges.push({ source: p.paper.id, target: t, type: 'cites' })
  }
  for (const p of passed) for (const r of p.relations) {
    if (r.type !== 'cites' && r.type !== 'cited_by') continue
    if (!ids.has(r.paperId)) known.set(r.paperId, (known.get(r.paperId) ?? 0) + 1)
    edges.push(r.type === 'cites' ? { source: p.paper.id, target: r.paperId, type: 'cites' } : { source: r.paperId, target: p.paper.id, type: 'cites' })
  }
  const seen = new Set<string>()
  return {
    nodes: [
      ...passed.map(p => ({ id: p.paper.id, kind: 'library' as const, rank: p.rank, title: p.paper.title, year: p.paper.year ?? null, total: Math.round(p.total * 1000) / 1000 })),
      ...[...known.entries()].map(([id, links]) => ({ id, kind: 'known' as const, links, inKnownPapers: knownPapers.some(k => k.toLowerCase() === id.toLowerCase()) })),
    ],
    edges: edges.filter(e => { const k = e.source + '>' + e.target; if (seen.has(k)) return false; seen.add(k); return true }),
  }
}

/** Writes all files; returns the library folder (or null on failure — files are a cache, never break the run). */
export function writeLibraryFiles(s: LibraryState): string | null {
  try {
    const dir = questionLibraryDir(s.request.questionId, s.id) ?? legacyLibraryDir(s.id)
    if (!dir) return null
    mkdirSync(join(dir, 'papers'), { recursive: true })
    cleanUrls(s.papers)
    atomicWriteJsonSync(join(dir, 'goals.json'), s.goals)
    const { notes, ...rest } = s.request
    const prev = readJson(join(dir, 'library.json')) as { name?: string | null } | null
    const library = {
      libraryId: s.id,
      questionId: s.request.questionId ?? null, // D-35: History is grouped by question
      questionName: s.request.questionName ?? s.request.questionId ?? null,
      question: s.goals?.question ?? null,
      name: prev?.name ?? null,
      createdAt: new Date(s.startedAt).toISOString(),
      request: { ...rest, notes: notes.map(n => ({ path: n.path, title: n.title, chars: n.content.length })) },
      summary: {
        ms: Date.now() - s.startedAt, total: s.papers.length, passed: s.papers.filter(p => p.passed).length,
        excluded: s.papers.filter(p => p.excluded).length, relevance: s.relevanceMethod, llmReads: s.llmReads,
        sourceCalls: s.calls.length, stageMs: s.stageMs,
        models: { planner: s.goals?.model ?? null, embed: s.relevanceMethod === 'embedding' ? env.models.embed : null, judge: s.llmReads ? env.models.judge : null },
      },
      papers: s.papers.map(p => ({ paperId: p.paper.id, rank: p.rank, total: Math.round(p.total * 1000) / 1000, passed: p.passed, excluded: p.excluded, file: p.file, title: p.paper.title })),
    }
    for (const p of s.papers) atomicWriteJsonSync(join(dir, p.file), p) // fsynced before library.json, which lists them
    atomicWriteJsonSync(join(dir, 'graph.json'), graphOf(s.papers, s.goals?.knownPapers ?? []))
    atomicWriteJsonSync(join(dir, 'library.json'), library) // last: library.json is what makes the library listable
    return dir
  } catch (e) {
    console.warn(`[library ${s.id}] writing files failed`, (e as Error).message)
    return null
  }
}

/** A library file exists but cannot be read: surfaced as a 422 with a clear message instead of the library vanishing. */
export class LibraryCorruptError extends HTTPException {
  constructor(public libraryId: string, public file: string) {
    const message = `Library ${libraryId} is damaged: ${file} could not be read. Nothing was deleted; restore the file from a backup or remove the folder.`
    super(422, { message, res: Response.json({ error: message, code: 'library_corrupt', libraryId, file }, { status: 422 }) })
  }
}

/** The build left a manifest but no results (killed before the first checkpoint): 409 with the status instead of a 404. */
export class LibraryUnfinishedError extends HTTPException {
  constructor(public libraryId: string, public buildStatus: string) { // not "status": HTTPException owns that name
    const message = `Library ${libraryId} has no results: ${buildStatus === 'failed' ? 'the build failed' : buildStatus === 'running' ? 'the build is still running' : 'the build was interrupted'} before anything was saved. Start the build again.`
    super(409, { message, res: Response.json({ error: message, code: 'library_unfinished', status: buildStatus, libraryId }, { status: 409 }) })
  }
}

// ---------- running manifest: manifest.json next to library.json ----------
/** One id per server process: a manifest saying "running" from another boot belongs to a build that was killed. */
const BOOT_ID = randomUUID()
export type BuildStatus = 'running' | 'done' | 'failed' | 'interrupted'
export interface Manifest { version: 1; libraryId: string; questionId: string | null; status: 'running' | 'done' | 'failed'; stage: string | null; startedAt: string; updatedAt: string; bootId: string; error?: string }

const buildDir = (s: LibraryState) => questionLibraryDir(s.request.questionId, s.id) ?? legacyLibraryDir(s.id)

/** Writes/updates manifest.json for a build (best effort: never breaks the run). */
export function writeManifest(s: LibraryState, patch: Partial<Pick<Manifest, 'status' | 'stage' | 'error'>> = {}): void {
  try {
    const dir = buildDir(s)
    if (!dir) return
    const prev = readJson(join(dir, 'manifest.json')) as Manifest | null
    const m: Manifest = {
      version: 1, libraryId: s.id, questionId: s.request.questionId ?? null, status: 'running', stage: null,
      startedAt: prev?.startedAt ?? new Date(s.startedAt).toISOString(), ...prev, ...patch, updatedAt: new Date().toISOString(), bootId: BOOT_ID,
    }
    if (patch.status && patch.status !== 'failed') delete m.error
    atomicWriteJsonSync(join(dir, 'manifest.json'), m)
  } catch (e) { console.warn(`[library ${s.id}] writing manifest failed`, (e as Error).message) }
}

/** 'running' only when this process wrote it; a "running" manifest from an earlier process is 'interrupted'. null = no manifest (old library). */
export function libraryStatus(id: string): BuildStatus | null {
  const dir = libraryDir(id)
  const m = dir ? readJson(join(dir, 'manifest.json')) as Manifest | null : null
  return m ? statusOf(m) : null
}
const statusOf = (m: Manifest): BuildStatus => (m.status === 'running' && m.bootId !== BOOT_ID ? 'interrupted' : m.status)

export interface StoredLibrary { goals: Goals | null; papers: LibPaper[]; request: Omit<LibraryRequest, 'notes'> & { notes: { path: string; title: string; chars: number }[] } }

export function readLibrary(id: string): StoredLibrary | null {
  const dir = libraryDir(id)
  if (!dir) return null
  if (!existsSync(join(dir, 'library.json'))) {
    if (existsSync(join(dir, 'manifest.json'))) throw new LibraryUnfinishedError(id, libraryStatus(id) ?? 'interrupted')
    return null
  }
  let file = 'library.json'
  try {
    const lib = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    file = 'goals.json'
    const goals = existsSync(join(dir, file)) ? JSON.parse(readFileSync(join(dir, file), 'utf8')) : null
    const papersDir = join(dir, 'papers')
    const papers: LibPaper[] = existsSync(papersDir)
      ? readdirSync(papersDir).filter(f => f.endsWith('.json')).map(f => { file = `papers/${f}`; return cleanUrls(JSON.parse(readFileSync(join(papersDir, f), 'utf8')) as LibPaper) }).sort((a, b) => a.rank - b.rank)
      : []
    return { goals, papers, request: lib.request }
  } catch { throw new LibraryCorruptError(id, file) }
}

/**
 * Reads papers/<file>.json for a paper id in either form: the file id ("pmid_38082384") or the paper id the client holds
 * ("pmid:38082384", "W123", a DOI). Q2-7: the id is mapped with the writer's own safeFileId(); library.json's paper -> file
 * list is checked first so de-duplicated names ("W1_2") resolve too. Rejects anything outside this library's papers folder.
 */
export function readPaperFile(id: string, paperId: string): LibPaper | null | 'bad' {
  const dir = libraryDir(id)
  if (!dir) return 'bad'
  const raw = paperId.replace(/\.json$/, '').trim()
  if (!raw || raw.length > 300 || raw.includes('..')) return 'bad'
  const listed = ((readJson(join(dir, 'library.json')) as { papers?: { paperId?: string; file?: string }[] } | null)?.papers ?? [])
    .find(p => p.paperId === raw)?.file?.replace(/^papers\//, '').replace(/\.json$/, '')
  const name = listed ?? safeFileId(raw)
  if (!/^[A-Za-z0-9._-]{1,130}$/.test(name) || name.startsWith('.') || name.includes('..')) return 'bad'
  const papersDir = join(dir, 'papers')
  const file = resolve(papersDir, `${name}.json`)
  if (!file.startsWith(papersDir + sep)) return 'bad'
  if (!existsSync(file)) return null
  try { return cleanUrls(JSON.parse(readFileSync(file, 'utf8')) as LibPaper) } catch { return null }
}

// ---------- D-35: history (list, rename, trash, export) ----------
function readJson(file: string): unknown {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null } catch { return null }
}

interface LibraryJson {
  libraryId?: string; questionId?: string | null; questionName?: string | null; question?: string | null; name?: string | null
  createdAt?: string; request?: { topK?: number; questionId?: string; questionName?: string }
  summary?: { total?: number; passed?: number }; papers?: { rank: number; title?: string }[]
}

export function summarize(id: string, lib: LibraryJson, goals: Goals | null, status: BuildStatus | null = null): LibrarySummary {
  const top = [...(lib.papers ?? [])].sort((a, b) => a.rank - b.rank)[0]
  const qid = lib.questionId ?? lib.request?.questionId ?? null
  return {
    libraryId: id,
    questionId: qid,
    questionName: lib.questionName ?? lib.request?.questionName ?? qid,
    question: lib.question ?? goals?.question ?? null,
    // LibrarySummary has no status field (shared contract); an unfinished build is named instead
    name: lib.name ?? (status === 'interrupted' ? 'Interrupted build (partial results)' : status === 'failed' ? 'Failed build (partial results)' : null),
    createdAt: lib.createdAt ?? '',
    total: lib.summary?.total ?? lib.papers?.length ?? 0,
    passed: lib.summary?.passed ?? 0,
    topK: lib.request?.topK ?? 30,
    topTitle: top?.title ?? null,
  }
}

/** Saved libraries, newest first; with questionId only that question's (null = libraries without a question). Dot folders (.trash) are skipped. */
export function listLibraries(questionId?: string | null): LibrarySummary[] {
  const out: LibrarySummary[] = []
  const add = (dir: string, id: string, qid?: string) => {
    const file = join(dir, 'library.json')
    const lib = readJson(file) as LibraryJson | null
    if (!lib && !existsSync(file) && existsSync(join(dir, 'manifest.json'))) {
      // killed before the first checkpoint: only the manifest exists
      const man = readJson(join(dir, 'manifest.json')) as Manifest | null
      const st = man ? statusOf(man) : 'interrupted'
      out.push({ libraryId: id, questionId: qid ?? man?.questionId ?? null, questionName: qid ?? man?.questionId ?? null, question: null,
        name: st === 'running' ? 'Build in progress (no results yet)' : `${st === 'failed' ? 'Failed' : 'Interrupted'} build (no results yet)`,
        createdAt: man?.startedAt ?? '', total: 0, passed: 0, topK: 30, topTitle: null })
      return
    }
    if (!lib) {
      // a damaged library.json stays listed (opening it gives the corrupt error) instead of vanishing
      if (existsSync(file)) out.push({ libraryId: id, questionId: qid ?? null, questionName: qid ?? null, question: null, name: 'Damaged library (library.json unreadable)', createdAt: '', total: 0, passed: 0, topK: 30, topTitle: null })
      return
    }
    const man = readJson(join(dir, 'manifest.json')) as Manifest | null
    const sum = summarize(id, lib, readJson(join(dir, 'goals.json')) as Goals | null, man ? statusOf(man) : null)
    if (qid) { sum.questionId = qid; sum.questionName = qid }
    out.push(sum)
  }
  // D-37: WORKSPACE_DIR/<question>/libraries/<id>
  if (questionId) {
    const qdir = questionDir(questionId)
    if (qdir) for (const id of questionLibraryIds(questionId)) if (isSafeId(id)) add(join(qdir, 'libraries', id), id, questionId)
  }
  // legacy DATA_DIR/library/<id> (old builds without questionId are "Earlier libraries")
  const root = libraryRoot()
  if (existsSync(root)) for (const id of readdirSync(root)) {
    if (id.startsWith('.') || !isSafeId(id) || out.some(l => l.libraryId === id)) continue
    add(join(root, id), id)
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return questionId === undefined ? out : out.filter(l => (l.questionId ?? null) === questionId)
}

export function renameLibrary(id: string, name: string): LibrarySummary | null {
  const dir = libraryDir(id)
  if (!dir) return null
  const file = join(dir, 'library.json')
  const lib = readJson(file) as LibraryJson | null
  if (!lib) return null
  lib.name = name.trim().slice(0, 120) || null
  atomicWriteJsonSync(file, lib)
  return summarize(id, lib, readJson(join(dir, 'goals.json')) as Goals | null)
}

/** Moves the library folder to .trash/<id> next to it (question libraries/.trash or DATA_DIR/library/.trash); never hard-deletes. */
export function trashLibrary(id: string): boolean {
  const dir = libraryDir(id)
  if (!dir || !existsSync(dir)) return false
  const trash = join(dir, '..', '.trash')
  mkdirSync(trash, { recursive: true })
  let dest = join(trash, id); let k = 2
  while (existsSync(dest)) dest = join(trash, `${id}_${k++}`)
  renameSync(dir, dest)
  return true
}

/** One JSON document with library.json, goals.json and every paper file. */
export function exportLibrary(id: string): { library: unknown; goals: Goals | null; papers: LibPaper[] } | null {
  const dir = libraryDir(id)
  if (!dir) return null
  const library = readJson(join(dir, 'library.json'))
  const stored = readLibrary(id)
  if (!library || !stored) return null
  return { library, goals: stored.goals, papers: stored.papers }
}
