// Owner: lane D (infra). Demo mode: replays server/demo/recordings/melanoma.json (client uses it with ?demo=1).
//   GET /api/demo/stream    text/event-stream, one unnamed `data: <RunEvent JSON>` message per event, ~5 s in total
//   GET /api/demo/snapshot  RunSnapshot
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RunSnapshot, type RunEvent } from '../../shared/contracts'

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
