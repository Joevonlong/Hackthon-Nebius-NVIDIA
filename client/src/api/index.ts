// Discovery API client. Owner: lane C.
// startRun → POST /api/runs; stream → EventSource /api/runs/:id/stream (or /api/demo/stream with ?demo=1).
// R-3.1 / F-50: no automatic mock fallback; failures throw and the caller shows an error with Retry.
// The dev mock (./mock.ts) loads only in dev builds with ?mock=1 (dynamic import, dropped from production builds).
import { RunEvent, type RunRequest } from '@shared/contracts'

export type RunMode = 'live' | 'demo' | 'mock'
export interface RunHandle { mode: RunMode; close(): void }
export interface RunHandlers {
  onEvent(ev: RunEvent): void
  /** Transport failure after the stream started (not a pipeline 'error' event). */
  onTransportError(message: string): void
}

/**
 * D-08: the playground replays recordings and is off unless asked for. `/playground` is an alias of `/?demo=1`, so the
 * one flag (also read by stores/vault.ts and stores/library.ts) keeps its meaning. Runs once when this module loads.
 */
export function normalizePlayground(): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return
  if (/^\/playground\/?$/.test(location.pathname)) history.replaceState(null, '', '/?demo=1' + location.hash)
}
normalizePlayground()

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
export const isDemo = () => params().get('demo') === '1'
export const isMock = () => params().get('mock') === '1'

const EVENT_TYPES = ['run', 'stage', 'seeds', 'facets', 'candidates', 'judgement', 'agent', 'done', 'error'] as const

/** Parses and validates one SSE payload; invalid events are logged and skipped. */
export function parseEvent(raw: string): RunEvent | null {
  let json: unknown
  try { json = JSON.parse(raw) } catch { console.warn('[api] skipped non-JSON event', raw.slice(0, 120)); return null }
  const r = RunEvent.safeParse(json)
  if (!r.success) { console.warn('[api] skipped invalid RunEvent', r.error.issues.slice(0, 3), json); return null }
  return r.data
}

export class HttpError extends Error { constructor(public status: number, message: string) { super(message) } }

export async function startRun(req: RunRequest): Promise<{ runId: string }> {
  const res = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) })
  if (!res.ok) throw new HttpError(res.status, `POST /api/runs → ${res.status}`)
  const body = await res.json() as { runId?: string }
  if (!body.runId) throw new HttpError(500, 'POST /api/runs returned no runId')
  return { runId: body.runId }
}

/**
 * Opens an SSE stream and forwards validated events. Resolves `firstEvent` false if the stream
 * failed before any event arrived (the caller reports an error).
 */
export function stream(url: string, h: RunHandlers): { close(): void; firstEvent: Promise<boolean> } {
  const es = new EventSource(url)
  let got = false, finished = false
  let resolveFirst!: (ok: boolean) => void
  const firstEvent = new Promise<boolean>(r => { resolveFirst = r })
  const onData = (e: MessageEvent) => {
    const ev = parseEvent(String(e.data)); if (!ev) return
    if (!got) { got = true; resolveFirst(true) }
    h.onEvent(ev)
    if (ev.type === 'done' || ev.type === 'error') { finished = true; es.close() }
  }
  es.addEventListener('message', onData)
  for (const t of EVENT_TYPES) es.addEventListener(t, onData as EventListener)
  es.onerror = () => {
    if (finished) return
    es.close()
    if (!got) resolveFirst(false)
    else h.onTransportError('Connection to the run stream was lost.')
  }
  return { close: () => { finished = true; es.close() }, firstEvent }
}

/** Starts a discovery run in the right mode and streams its events into the handlers. */
export async function runDiscovery(req: RunRequest, h: RunHandlers): Promise<RunHandle> {
  if (import.meta.env.DEV && isMock()) {
    const { playMock } = await import('./mock')
    return { mode: 'mock', close: playMock(req, h.onEvent) }
  }
  if (isDemo()) {
    const s = stream('/api/demo/stream', h)
    if (!(await s.firstEvent)) throw new Error('GET /api/demo/stream is unavailable.')
    return { mode: 'demo', close: s.close }
  }
  let runId: string
  try { runId = (await startRun(req)).runId }
  catch (e) {
    if (e instanceof TypeError) throw new Error('POST /api/runs: the server is unreachable (network error).')
    throw e
  }
  const s = stream(`/api/runs/${encodeURIComponent(runId)}/stream`, h)
  if (!(await s.firstEvent)) throw new Error(`The stream for run ${runId} is unavailable.`)
  return { mode: 'live', close: s.close }
}
