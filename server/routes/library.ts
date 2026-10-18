// Owner: lane L2. Library mode HTTP API — see the comment at the end of shared/library.ts.
//   POST /api/library                       LibraryRequest -> { libraryId }
//   GET  /api/library/:id/stream            SSE of LibraryEvent (replay then live)
//   GET  /api/library/:id                   { goals, papers: LibPaper[] (all scored), request }
//   GET  /api/library/:id/papers/:paperId   the per-paper JSON file (LibPaper)
//   POST /api/library/:id/chat              ChatRequest -> ChatResponse (lane U2; logs/runs/<id>/chat.jsonl)
//   POST /api/library/:id/applied           { prompt, proposal, before, after } -> { ok, movedIn }
// LIBRARY_FIXTURE=1 swaps L1's gather() for the melanoma fixture source (server/library/fixtures.ts).
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { randomUUID } from 'node:crypto'
import { ChatRequest, LibraryRequest, type Goals, type LibPaper, type LibraryEvent } from '@shared/library'
import { withRun } from '../trace'
import { createLibraryState, emitLib, getLibraryState, runLibrary, subscribeLib } from '../library/pipeline'
import { gather } from '../library/sources'
import { fixtureGather } from '../library/fixtures'
import { exportLibrary, isSafeId, listLibraries, readLibrary, readPaperFile, renameLibrary, trashLibrary } from '../library/store'
import { AppliedBody, logApplied, runChat } from '../library/chat'
import { parseSeedPdf, parseSeedText } from '../library/seed-import'

export const library = new Hono()

// ---- D-35: History (lane W2) ----
library.get('/libraries', c => {
  const q = c.req.query('questionId')
  // ?questionId=  (empty) → libraries without a question ("Earlier libraries"); absent → all
  return c.json({ libraries: listLibraries(q === undefined ? undefined : q === '' ? null : q) })
})

library.patch('/library/:id', async c => {
  const id = c.req.param('id')
  if (!isSafeId(id)) return c.json({ error: 'bad id' }, 400)
  const body = await c.req.json().catch(() => null) as { name?: unknown } | null
  if (!body || typeof body.name !== 'string') return c.json({ error: 'Body must be { name: string }' }, 400)
  const r = renameLibrary(id, body.name)
  return r ? c.json(r) : c.json({ error: 'library not found' }, 404)
})

library.delete('/library/:id', c => {
  const id = c.req.param('id')
  if (!isSafeId(id)) return c.json({ error: 'bad id' }, 400)
  return trashLibrary(id) ? c.json({ ok: true }) : c.json({ error: 'library not found' }, 404)
})

library.get('/library/:id/export', c => {
  const id = c.req.param('id')
  if (!isSafeId(id)) return c.json({ error: 'bad id' }, 400)
  const r = exportLibrary(id)
  if (!r) return c.json({ error: 'library not found' }, 404)
  c.header('content-disposition', `attachment; filename="${id}.json"`)
  return c.json(r)
})

// ---- D-36: seed file import (lane W2). multipart field "file"; ids are resolved by the client via POST /api/seeds/resolve ----
const MAX_SEED_FILE = 25 * 1024 * 1024
library.post('/seeds/import', async c => {
  const form = await c.req.parseBody().catch(() => null)
  const file = form?.file
  if (!file || typeof file === 'string') return c.json({ error: 'Send a multipart form with a "file" field.' }, 400)
  if (file.size > MAX_SEED_FILE) return c.json({ error: 'File is larger than 25 MB.' }, 413)
  const name = file.name || 'upload'
  try {
    if (/\.pdf$/i.test(name) || file.type === 'application/pdf') {
      const r = await parseSeedPdf(new Uint8Array(await file.arrayBuffer()))
      return c.json({ file: name, format: r.format, ids: r.ids, note: r.ids.length ? undefined : 'No DOI or arXiv id on the first 2 pages.' })
    }
    const r = parseSeedText(name, await file.text())
    return c.json({ file: name, format: r.format, ids: r.ids })
  } catch (e) {
    return c.json({ error: `Could not read ${name}: ${(e as Error).message?.slice(0, 200)}` }, 422)
  }
})

const useFixture = () => process.env.LIBRARY_FIXTURE === '1'

library.post('/library', async c => {
  const body = LibraryRequest.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Invalid LibraryRequest', issues: body.error.issues.slice(0, 10) }, 400)
  const libraryId = `lib_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}_${randomUUID().slice(0, 6)}`
  const s = createLibraryState(libraryId, body.data)
  withRun(libraryId, () => runLibrary(s, { gather: useFixture() ? fixtureGather : gather })).catch(e => {
    console.error(`[library ${libraryId}] crashed`, e)
    emitLib(s, { type: 'error', message: (e as Error).message?.slice(0, 300) || 'library run failed' })
    emitLib(s, { type: 'done', libraryId, total: s.papers.length, passed: s.papers.filter(p => p.passed).length, ms: Date.now() - s.startedAt, dir: s.dir ?? '' })
  })
  return c.json({ libraryId, fixture: useFixture() || undefined })
})

library.get('/library/:id/stream', c => {
  const id = c.req.param('id')
  if (!isSafeId(id)) return c.json({ error: 'bad id' }, 400)
  const s = getLibraryState(id)
  const stored = s ? null : readLibrary(id)
  if (!s && !stored) return c.json({ error: 'library not found' }, 404)
  return streamSSE(c, async stream => {
    let seq = 0
    const send = (e: LibraryEvent) => stream.writeSSE({ event: e.type, data: JSON.stringify(e), id: String(seq++) })
    if (!s) {
      // finished in an earlier process: synthesize goals + papers + done from the files
      if (stored!.goals) await send({ type: 'goals', goals: stored!.goals })
      const passed = stored!.papers.filter(p => p.passed).length
      await send({ type: 'papers', papers: stored!.papers.slice(0, stored!.request.topK ?? 30), total: stored!.papers.length, passed })
      await send({ type: 'done', libraryId: id, total: stored!.papers.length, passed, ms: 0, dir: '' })
      return
    }
    const queue: LibraryEvent[] = [...s.events]
    let wake: (() => void) | null = null
    const unsub = subscribeLib(s, e => { queue.push(e); wake?.() })
    stream.onAbort(() => { unsub(); wake?.() })
    try {
      while (!stream.aborted) {
        while (queue.length) {
          const e = queue.shift()!
          await send(e)
          if (e.type === 'done') return
        }
        await new Promise<void>(r => { wake = r; setTimeout(r, 15000) })
        wake = null
        if (!queue.length && !stream.aborted) await stream.write(': keep-alive\n\n')
      }
    } finally { unsub() }
  })
})

library.get('/library/:id', c => {
  const id = c.req.param('id')
  if (!isSafeId(id)) return c.json({ error: 'bad id' }, 400)
  const s = getLibraryState(id)
  if (s) {
    const { notes, ...rest } = s.request
    return c.json({ goals: s.goals, papers: s.papers, request: { ...rest, notes: notes.map(n => ({ path: n.path, title: n.title, chars: n.content.length })) }, done: s.done })
  }
  const stored = readLibrary(id)
  return stored ? c.json({ ...stored, done: true }) : c.json({ error: 'library not found' }, 404)
})

library.get('/library/:id/papers/:paperId', c => {
  const r = readPaperFile(c.req.param('id'), decodeURIComponent(c.req.param('paperId')))
  if (r === 'bad') return c.json({ error: 'bad id' }, 400)
  if (!r) return c.json({ error: 'paper not found' }, 404)
  return c.json(r)
})

// ---- chat (lane U2, D-26 / D-29) ----
const libCache = new Map<string, { goals: Goals | null; papers: LibPaper[] }>()
function loadForChat(id: string): { goals: Goals | null; papers: LibPaper[] } | null {
  const s = getLibraryState(id)
  if (s && s.papers.length) return { goals: s.goals, papers: s.papers }
  const hit = libCache.get(id)
  if (hit) return hit
  const stored = readLibrary(id)
  if (!stored) return null
  const lib = { goals: stored.goals, papers: stored.papers }
  libCache.set(id, lib)
  if (libCache.size > 4) libCache.delete(libCache.keys().next().value!)
  return lib
}

library.post('/library/:id/chat', async c => {
  const id = c.req.param('id')
  if (!isSafeId(id)) return c.json({ error: 'bad id' }, 400)
  const body = ChatRequest.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Invalid ChatRequest', issues: body.error.issues.slice(0, 10) }, 400)
  if (body.data.messages[body.data.messages.length - 1].role !== 'user') return c.json({ error: 'the last message must be from the user' }, 400)
  const lib = loadForChat(id)
  if (!lib) return c.json({ error: 'library not found' }, 404)
  if (!lib.papers.length) return c.json({ error: 'library has no scored papers yet' }, 409)
  return c.json(await withRun(id, () => runChat(id, lib, body.data)))
})

library.post('/library/:id/applied', async c => {
  const id = c.req.param('id')
  if (!isSafeId(id)) return c.json({ error: 'bad id' }, 400)
  const body = AppliedBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Invalid applied body', issues: body.error.issues.slice(0, 10) }, 400)
  return c.json(logApplied(id, body.data))
})
