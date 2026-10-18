// Owner: lane A1. In-memory run registry: events log + live listeners (SSE replays the log, then follows).
import { RunEvent, type Candidate, type Facet, type RunPreset, type RunSnapshot, type Seed } from '@shared/contracts'
import type { RunConfig } from '@shared/config'
import { trace } from '../trace'

export interface RunState {
  id: string
  question: string
  preset: RunPreset
  cfg: RunConfig
  startedAt: number
  events: RunEvent[]
  listeners: Set<(e: RunEvent) => void>
  done: boolean
  seeds: Seed[]
  facets: Facet[]
  candidates: Candidate[]
  counts: Record<string, number>
  total: number
}

const runs = new Map<string, RunState>()

export function createRunState(id: string, question: string, preset: RunPreset, cfg: RunConfig): RunState {
  const r: RunState = { id, question, preset, cfg, startedAt: Date.now(), events: [], listeners: new Set(), done: false, seeds: [], facets: [], candidates: [], counts: {}, total: 0 }
  runs.set(id, r)
  return r
}

export const getRunState = (id: string) => runs.get(id)

/** Appends an event (deep-copied so later mutation never changes the replay) and notifies listeners. */
export function emit(run: RunState, e: RunEvent) {
  if (run.done) return // e.g. a late Scout step after the run finished
  const copy = structuredClone(e)
  const check = RunEvent.safeParse(copy)
  if (!check.success) console.warn(`[run ${run.id}] event ${e.type} fails contract:`, check.error.issues.slice(0, 3))
  run.events.push(copy)
  trace('events', copy.type === 'candidates'
    ? { type: 'candidates', total: copy.total, counts: copy.counts, sent: copy.candidates.length, top: copy.candidates.slice(0, 5).map(c => `${c.lane} #${c.rank} ${c.paper.title.slice(0, 80)}`) }
    : copy.type === 'seeds' ? { type: 'seeds', seeds: copy.seeds.map(s => ({ n: s.n, id: s.id, shortName: s.shortName, title: s.title, abstractSource: s.abstractSource, references: s.referencedWorks.length })) }
    : (copy as Record<string, unknown>), run.id)
  if (copy.type === 'done') run.done = true
  for (const l of run.listeners) { try { l(copy) } catch { /* listener gone */ } }
}

export function subscribe(run: RunState, fn: (e: RunEvent) => void): () => void {
  run.listeners.add(fn)
  return () => run.listeners.delete(fn)
}

export function snapshotOf(run: RunState): RunSnapshot {
  return { runId: run.id, question: run.question, preset: run.preset, seeds: run.seeds, facets: run.facets, candidates: run.candidates, counts: run.counts, total: run.total, events: run.events }
}
