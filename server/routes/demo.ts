// Owner: lane D (infra). Demo mode: replays server/demo/recordings/melanoma.json (client uses it with ?demo=1).
//   GET /api/demo/stream    text/event-stream, one unnamed `data: <RunEvent JSON>` message per event, ~5 s in total
//   GET /api/demo/snapshot  RunSnapshot
// Library demo (CR-3): replays server/demo/recordings/library-melanoma.json, a REAL Library run recorded by scripts/record-library.ts.
//   GET /api/demo/library/stream             SSE of LibraryEvent (named events like /api/library/:id/stream), ~6 s (DEMO_LIBRARY_REPLAY_MS)
//   GET /api/demo/library                    { libraryId: 'demo-melanoma', goals, papers (all recorded), request, notes, total, passed, done: true }
//   GET /api/demo/library/papers/:paperId    one LibPaper (by paper.id, or the file basename)
// Aliases, same payloads, so a client that already knows /api/library/:id can use the id `demo-melanoma`
// (registered before routes/library.ts in server/index.ts, so these win over its `:id` routes):
//   GET /api/library/demo-melanoma · /stream · /papers/:paperId
import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RunSnapshot, type RunEvent } from '../../shared/contracts'
import { LibPaper, LibraryEvent, Goals } from '../../shared/library'
import { z } from 'zod'

export const demo = new Hono()

const REPLAY_MS = Number(process.env.DEMO_REPLAY_MS || 5000)

function recordingPath(): string | null {
  const name = 'server/demo/recordings/melanoma.json'
  const candidates = [
    process.env.DEMO_RECORDING,
    resolve(process.cwd(), name),
    fileURLToPath(new URL(`../../${name}`, import.meta.url)), // dev: server/routes -> repo root
    fileURLToPath(new URL(`../../../${name}`, import.meta.url)), // bundled: dist/server -> repo root
  ]
  return candidates.find((p): p is string => !!p && existsSync(p)) ?? null
}

let cache: RunSnapshot | null = null
function load(): RunSnapshot {
  if (cache) return cache
  const p = recordingPath()
  if (!p) throw new Error('demo recording not found: server/demo/recordings/melanoma.json')
  cache = RunSnapshot.parse(JSON.parse(readFileSync(p, 'utf8')))
  return cache
}

/** Pause before each event so the whole replay takes REPLAY_MS; judgement/agent events are light, stage events heavy. */
function delays(events: RunEvent[], totalMs: number): number[] {
  const weight = (e: RunEvent) => (e.type === 'judgement' || e.type === 'agent' ? 1 : 4)
  const sum = events.reduce((s, e) => s + weight(e), 0) || 1
  return events.map(e => (weight(e) / sum) * totalMs)
}

demo.get('/demo/snapshot', c => {
  try { return c.json(load()) } catch (e) { return c.json({ error: (e as Error).message }, 404) }
})

demo.get('/demo/stream', c => {
  let snap: RunSnapshot
  try { snap = load() } catch (e) { return c.json({ error: (e as Error).message }, 404) }
  const wait = delays(snap.events, REPLAY_MS)
  return streamSSE(c, async stream => {
    for (let i = 0; i < snap.events.length; i++) {
      await stream.sleep(wait[i])
      if (stream.aborted) return
      await stream.writeSSE({ data: JSON.stringify(snap.events[i]) })
    }
  })
})

// ---- Library demo (CR-3) ------------------------------------------------------------------------------
export const DEMO_LIBRARY_ID = 'demo-melanoma'
const LIB_REPLAY_MS = Number(process.env.DEMO_LIBRARY_REPLAY_MS || 6000)
const SOURCE_EVENT_MS = 40

const LibraryRecording = z.object({
  recordedAt: z.string().optional(),
  sourceLibraryId: z.string().optional(),
  request: z.record(z.string(), z.unknown()),
  events: z.array(LibraryEvent),
  library: z.object({ goals: Goals, papers: z.array(LibPaper), total: z.number().optional() }),
  notes: z.array(z.object({ path: z.string(), title: z.string(), content: z.string() })),
})
type LibraryRecording = z.infer<typeof LibraryRecording>

function libraryRecordingPath(): string | null {
  const name = 'server/demo/recordings/library-melanoma.json'
  const candidates = [
    process.env.DEMO_LIBRARY_RECORDING,
    resolve(process.cwd(), name),
    fileURLToPath(new URL(`../../${name}`, import.meta.url)),
    fileURLToPath(new URL(`../../../${name}`, import.meta.url)),
  ]
  return candidates.find((p): p is string => !!p && existsSync(p)) ?? null
}

let libCache: LibraryRecording | null = null
function loadLibrary(): LibraryRecording {
  if (libCache) return libCache
  const p = libraryRecordingPath()
  if (!p) throw new Error('demo library recording not found: server/demo/recordings/library-melanoma.json (run scripts/record-library.ts)')
  libCache = LibraryRecording.parse(JSON.parse(readFileSync(p, 'utf8')))
  return libCache
}

/** Pause before each event: 'source' events are quick, the remaining time goes to stages / goals / papers by weight. */
function libraryDelays(events: LibraryEvent[], totalMs: number): number[] {
  const weight = (e: LibraryEvent) => (e.type === 'papers' ? 6 : e.type === 'goals' ? 2 : e.type === 'stage' ? 1 : e.type === 'done' ? 0.2 : 0.5)
  const nSource = events.filter(e => e.type === 'source').length
  const rest = Math.max(totalMs - nSource * SOURCE_EVENT_MS, totalMs / 3)
  const sum = events.reduce((s, e) => s + (e.type === 'source' ? 0 : weight(e)), 0) || 1
  return events.map(e => (e.type === 'source' ? SOURCE_EVENT_MS : (weight(e) / sum) * rest))
}

function libraryBody(rec: LibraryRecording) {
  const { papers, goals, total } = rec.library
  return {
    libraryId: DEMO_LIBRARY_ID, goals, papers, request: rec.request, notes: rec.notes,
    total: total ?? papers.length, passed: papers.filter(p => p.passed).length, recordedAt: rec.recordedAt, done: true,
  }
}

function findPaper(rec: LibraryRecording, raw: string): LibPaper | undefined {
  const id = decodeURIComponent(raw).replace(/\.json$/, '')
  return rec.library.papers.find(p => p.paper.id === id || p.file.split('/').pop()?.replace(/\.json$/, '') === id)
}

const notFound = (e: unknown) => ({ error: (e as Error).message })

const libraryStream = (c: Context) => {
  let rec: LibraryRecording
  try { rec = loadLibrary() } catch (e) { return c.json(notFound(e), 404) }
  const wait = libraryDelays(rec.events, LIB_REPLAY_MS)
  return streamSSE(c, async stream => {
    for (let i = 0; i < rec.events.length; i++) {
      await stream.sleep(wait[i])
      if (stream.aborted) return
      const e = rec.events[i]
      // The recorded 'library' event carries the original id; the replay is always `demo-melanoma`.
      const ev = e.type === 'library' ? { ...e, libraryId: DEMO_LIBRARY_ID } : e.type === 'done' ? { ...e, libraryId: DEMO_LIBRARY_ID } : e
      await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev), id: String(i) })
    }
  })
}
const libraryGet = (c: Context) => {
  try { return c.json(libraryBody(loadLibrary())) } catch (e) { return c.json(notFound(e), 404) }
}
const libraryPaper = (c: Context) => {
  let rec: LibraryRecording
  try { rec = loadLibrary() } catch (e) { return c.json(notFound(e), 404) }
  const p = findPaper(rec, c.req.param('paperId') ?? '')
  return p ? c.json(p) : c.json({ error: 'paper not found' }, 404)
}

demo.get('/demo/library/stream', libraryStream)
demo.get('/demo/library/papers/:paperId', libraryPaper)
demo.get('/demo/library', libraryGet)
demo.get(`/library/${DEMO_LIBRARY_ID}/stream`, libraryStream)
demo.get(`/library/${DEMO_LIBRARY_ID}/papers/:paperId`, libraryPaper)
demo.get(`/library/${DEMO_LIBRARY_ID}`, libraryGet)
