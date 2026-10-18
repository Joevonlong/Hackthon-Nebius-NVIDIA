// Owner: lane L2. Library files: ${DATA_DIR}/library/<id>/{goals.json, library.json, papers/<paperId>.json}.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { Goals, LibPaper, LibraryRequest } from '@shared/library'
import { env } from '../env'
import type { LibraryState } from './pipeline'

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/
export const libraryRoot = () => resolve(env.dataDir, 'library')
export const isSafeId = (id: string) => ID_RE.test(id)

export function libraryDir(id: string): string | null {
  if (!isSafeId(id)) return null
  const dir = resolve(libraryRoot(), id)
  return dir.startsWith(libraryRoot() + sep) ? dir : null
}

/** Writes all files; returns the library folder (or null on failure — files are a cache, never break the run). */
export function writeLibraryFiles(s: LibraryState): string | null {
  try {
    const dir = libraryDir(s.id)
    if (!dir) return null
    mkdirSync(join(dir, 'papers'), { recursive: true })
    writeFileSync(join(dir, 'goals.json'), JSON.stringify(s.goals, null, 2))
    const { notes, ...rest } = s.request
    const library = {
      libraryId: s.id,
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
    writeFileSync(join(dir, 'library.json'), JSON.stringify(library, null, 2))
    for (const p of s.papers) writeFileSync(join(dir, p.file), JSON.stringify(p, null, 2))
    return dir
  } catch (e) {
    console.warn(`[library ${s.id}] writing files failed`, (e as Error).message)
    return null
  }
}

export interface StoredLibrary { goals: Goals | null; papers: LibPaper[]; request: Omit<LibraryRequest, 'notes'> & { notes: { path: string; title: string; chars: number }[] } }

export function readLibrary(id: string): StoredLibrary | null {
  const dir = libraryDir(id)
  if (!dir || !existsSync(join(dir, 'library.json'))) return null
  try {
    const lib = JSON.parse(readFileSync(join(dir, 'library.json'), 'utf8'))
    const goals = existsSync(join(dir, 'goals.json')) ? JSON.parse(readFileSync(join(dir, 'goals.json'), 'utf8')) : null
    const papersDir = join(dir, 'papers')
    const papers: LibPaper[] = existsSync(papersDir)
      ? readdirSync(papersDir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(papersDir, f), 'utf8')) as LibPaper).sort((a, b) => a.rank - b.rank)
      : []
    return { goals, papers, request: lib.request }
  } catch { return null }
}

/** Reads papers/<paperId>.json. Rejects anything that is not a plain file id inside this library's papers folder. */
export function readPaperFile(id: string, paperId: string): LibPaper | null | 'bad' {
  const dir = libraryDir(id)
  if (!dir) return 'bad'
  const name = paperId.replace(/\.json$/, '')
  if (!/^[A-Za-z0-9._-]{1,130}$/.test(name) || name.startsWith('.') || name.includes('..')) return 'bad'
  const papersDir = join(dir, 'papers')
  const file = resolve(papersDir, `${name}.json`)
  if (!file.startsWith(papersDir + sep)) return 'bad'
  if (!existsSync(file)) return null
  try { return JSON.parse(readFileSync(file, 'utf8')) as LibPaper } catch { return null }
}
