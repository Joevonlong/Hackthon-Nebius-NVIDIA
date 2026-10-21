// Owner: lane A1 (pipeline). Implements POST /api/runs, GET /api/runs/:id/stream (SSE), GET /api/runs/:id,
// POST /api/seeds/resolve, GET /api/papers/:id — see shared/contracts.ts.
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { RunRequest, type RunEvent } from '@shared/contracts'
import { resolveConfig } from '@shared/config'
import * as repo from '../data/repo'
import { runPipeline } from '../discovery/pipeline'
import { withRun } from '../trace'
import { logServerError } from '../security/errors'
import { createRunState, emit, getRunState, snapshotOf, subscribe } from '../discovery/registry'
import { parseSeedInput, resolveSeeds } from '../discovery/seeds'
import { getWork } from '../sources/openalex'

export const runs = new Hono()

const ResolveBody = z.object({ inputs: z.array(z.string()).min(1).max(50) })

runs.post('/seeds/resolve', async c => {
  const body = ResolveBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Body must be { inputs: string[] }', issues: body.error.issues }, 400)
  const r = await resolveSeeds(body.data.inputs)
  try { repo.upsertPapers(r.seeds) } catch { /* cache only */ }
  // Q2-6: `warning` + `resolvedVia` are additive (shared/contracts.ts documents only { seeds, errors })
  return c.json({ seeds: r.seeds, errors: r.errors, warning: r.warning, resolvedVia: r.resolvedVia })
})

runs.post('/runs', async c => {
  const body = RunRequest.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Invalid RunRequest', issues: body.error.issues }, 400)
  const { question, seeds, preset } = body.data
  const cfg = resolveConfig(preset, process.env)
  const runId = `run_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}_${randomUUID().slice(0, 6)}`
  const run = createRunState(runId, question, preset, cfg)
  try { repo.createRun({ id: runId, question, preset, params: cfg, models: { embed: process.env.EMBED_MODEL, rerank: process.env.RERANK_MODEL, judge: process.env.JUDGE_MODEL } }) } catch (e) { console.warn('createRun failed', (e as Error).message) }
  withRun(run.id, () => runPipeline(run, seeds)).catch(e => {
    logServerError(`run ${runId}`, e)
    emit(run, { type: 'error', message: 'run failed (details are in the server log)' })
    emit(run, { type: 'done', runId, counts: run.counts, total: run.total, ms: Date.now() - run.startedAt })
  })
  return c.json({ runId })
})

runs.get('/runs/:id/stream', c => {
  const id = c.req.param('id')
  const run = getRunState(id)
  const stored = run ? null : repo.getRunSnapshot(id)
  if (!run && !stored) return c.json({ error: 'run not found' }, 404)
  return streamSSE(c, async stream => {
    let seq = 0
    const send = (e: RunEvent) => stream.writeSSE({ event: e.type, data: JSON.stringify(e), id: String(seq++) })
    if (!run) { for (const e of stored!.events) await send(e); return }
    // replay, then follow live events until 'done'
    const queue: RunEvent[] = [...run.events]
    let wake: (() => void) | null = null
    const unsub = subscribe(run, e => { queue.push(e); wake?.() })
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

runs.get('/runs/:id', c => {
  const id = c.req.param('id')
  const run = getRunState(id)
  if (run) return c.json(snapshotOf(run))
  const s = repo.getRunSnapshot(id)
  return s ? c.json(s) : c.json({ error: 'run not found' }, 404)
})

runs.get('/papers/:id{.+}', async c => {
  const id = c.req.param('id')
  const local = repo.getPaper(id) ?? (() => { const ref = parseSeedInput(id); return ref ? repo.getPaper(`${ref.kind === 'openalex' ? '' : ref.kind + ':'}${ref.value}`) : null })()
  if (local) return c.json(local)
  const ref = parseSeedInput(id)
  if (!ref) return c.json({ error: 'unknown id' }, 400)
  // The upstream call and the cache write below are side effects, so a page on another site must not be able to trigger them with a plain GET (#41).
  // Browsers always send Sec-Fetch-Site; the app itself never calls this route from a foreign origin.
  const site = c.req.header('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return c.json({ error: 'Forbidden: cross-site request' }, 403)
  try {
    const r = await getWork(ref)
    if (!r) return c.json({ error: 'not found' }, 404)
    try { repo.upsertPapers([r.value]) } catch { /* ignore */ }
    return c.json(r.value)
  } catch (e) {
    logServerError('papers', e)
    return c.json({ error: 'The source did not answer; try again later.', code: 'upstream_error' }, 502)
  }
})
