// Owner: lane L2. Library pipeline: goals → search (L1 gather) → label (+ embedding relevance) → score → llm → re-score → select.
// Runs inside trace.withRun(libraryId, …) (the route does that); every LibraryEvent is kept for SSE replay and traced.
import type { RunConfig } from '@shared/config'
import { LibraryEvent, type Goals, type LibPaper, type LibraryRequest } from '@shared/library'
import { embed } from '../ai/embed'
import { hasKey } from '../ai/http'
import { env } from '../env'
import { trace } from '../trace'
import { deriveGoals, knownBySource } from './goals'
import { labelRecord, markFieldUncertain, pickSubtopics, subtopicsByKeywords } from './labels'
import { llmReadAll } from './llmread'
import { passSummary, scoreLibrary, type LlmReadT, type RelevanceSignal, type ScoreItem } from './score'
import { addEuropePmcReferences, type RefsOptions } from './references'
import { addCitationFallback, fallbackSummary, type FallbackOptions } from './sources/citations-fallback'
import { isBlocked } from '../data/http'
import { writeLibraryFiles } from './store'
import { writeLibraryReport } from './report'
import type { EnrichedRecord, SourceCall, SourcesApi } from './types'

// ---------- registry (in-memory; SSE replays events then follows) ----------
export interface LibraryState {
  id: string
  request: LibraryRequest
  startedAt: number
  events: LibraryEvent[]
  listeners: Set<(e: LibraryEvent) => void>
  done: boolean
  goals: Goals | null
  papers: LibPaper[] // all scored, ranked
  calls: SourceCall[]
  relevanceMethod: 'embedding' | 'keywords' | 'none'
  llmReads: number
  stageMs: Record<string, number>
  dir: string | null
}

const libs = new Map<string, LibraryState>()

export function createLibraryState(id: string, request: LibraryRequest): LibraryState {
  const s: LibraryState = { id, request, startedAt: Date.now(), events: [], listeners: new Set(), done: false, goals: null, papers: [], calls: [], relevanceMethod: 'none', llmReads: 0, stageMs: {}, dir: null }
  libs.set(id, s)
  return s
}
export const getLibraryState = (id: string) => libs.get(id)

export function emitLib(s: LibraryState, e: LibraryEvent) {
  if (s.done) return
  const copy = structuredClone(e)
  const check = LibraryEvent.safeParse(copy)
  if (!check.success) console.warn(`[library ${s.id}] event ${e.type} fails contract:`, check.error.issues.slice(0, 3))
  s.events.push(copy)
  trace('events', copy.type === 'papers'
    ? { type: 'papers', total: copy.total, passed: copy.passed, sent: copy.papers.length, top: copy.papers.slice(0, 5).map(p => `#${p.rank} ${p.total.toFixed(3)} ${p.paper.title.slice(0, 80)}`) }
    : (copy as Record<string, unknown>), s.id)
  if (copy.type === 'done') s.done = true
  for (const l of s.listeners) { try { l(copy) } catch { /* listener gone */ } }
}

export function subscribeLib(s: LibraryState, fn: (e: LibraryEvent) => void): () => void {
  s.listeners.add(fn)
  return () => s.listeners.delete(fn)
}

// ---------- relevance ----------
const EMBED_CAP = 800
const docText = (r: EnrichedRecord) => `${r.paper.title}\n${r.paper.abstract ?? ''}`.trim()

export interface RelevanceResult { rel: Map<string, RelevanceSignal>; subtopics: Map<string, string[]>; method: 'embedding' | 'keywords'; docs: number; queries: number }

/** Keyword fallback: share of goal keywords / subtopic terms present in title+abstract. */
export function keywordRelevance(goals: Goals, recs: EnrichedRecord[]): RelevanceResult {
  const rel = new Map<string, RelevanceSignal>()
  const subtopics = new Map<string, string[]>()
  const kws = goals.keywords.map(k => k.toLowerCase()).filter(Boolean)
  for (const r of recs) {
    const text = docText(r).toLowerCase()
    const kwHit = kws.filter(k => text.includes(k)).length
    const subs = subtopicsByKeywords(r, goals)
    const qWords = [...new Set(goals.question.toLowerCase().match(/[a-z0-9+-]{4,}/g) ?? [])]
    const qHit = qWords.filter(w => text.includes(w)).length
    const score = 0.6 * (kws.length ? kwHit / kws.length : 0) + 0.4 * (qWords.length ? qHit / qWords.length : 0)
    rel.set(r.key, { cos: score, best: subs[0] ?? (kwHit ? `${kwHit}/${kws.length} keywords` : ''), bestKind: 'keywords', method: 'keywords' })
    subtopics.set(r.key, subs)
  }
  return { rel, subtopics, method: 'keywords', docs: recs.length, queries: kws.length }
}

function quantile(xs: number[], q: number): number {
  if (!xs.length) return Infinity
  const s = xs.slice().sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

export async function embeddingRelevance(goals: Goals, recs: EnrichedRecord[], timeoutMs: number): Promise<RelevanceResult | null> {
  if (!hasKey() || !recs.length) return null
  const docs = [...recs].sort((a, b) => b.hits.length - a.hits.length).slice(0, EMBED_CAP)
  const queries = [{ name: goals.question, kind: 'question' as const, text: goals.question }, ...goals.subtopics.map(s => ({ name: s.name, kind: 'subtopic' as const, text: s.query }))]
  const cfg = { timeoutMs } as unknown as RunConfig // embed() only reads cfg.timeoutMs
  const [qv, dv] = await Promise.all([embed(queries.map(q => q.text), 'query', cfg), embed(docs.map(docText), 'document', cfg)])
  if (!qv || !dv || qv.length !== queries.length || dv.length !== docs.length) return null
  const dot = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }
  const M = dv.map(d => qv.map(q => dot(d, q)))
  const subIdx = queries.map((q, j) => (q.kind === 'subtopic' ? j : -1)).filter(j => j >= 0)
  const subNames = subIdx.map(j => queries[j].name)
  const subRows = M.map(row => subIdx.map(j => row[j]))
  // D-28: the library's 60th percentile of each paper's best subtopic cosine
  const p60 = quantile(subRows.map(r => (r.length ? Math.max(...r) : -Infinity)), 0.6)
  const rel = new Map<string, RelevanceSignal>()
  const subtopics = new Map<string, string[]>()
  docs.forEach((r, i) => {
    const row = M[i]
    let bj = 0
    for (let j = 1; j < row.length; j++) if (row[j] > row[bj]) bj = j
    rel.set(r.key, { cos: row[bj], best: queries[bj].name, bestKind: queries[bj].kind, method: 'embedding' })
    const subs = pickSubtopics(subRows[i], subNames, p60)
    subtopics.set(r.key, subs)
  })
  return { rel, subtopics, method: 'embedding', docs: docs.length, queries: queries.length }
}

// ---------- pipeline ----------
/** D-32 / J-2: the LLM reads at least every returned paper: max(llmReadTopK, topK), capped at 60; 0 keeps it off. */
export const effectiveLlmReadK = (req: Pick<LibraryRequest, 'llmReadTopK' | 'topK'>) => (req.llmReadTopK === 0 ? 0 : Math.min(60, Math.max(req.llmReadTopK, req.topK)))

export interface PipelineDeps {
  gather: SourcesApi['gather']
  now?: () => Date
  /** CR-10 E-2 Europe PMC reference fallback. Default: on (EPMC_REFS=0 turns it off; off under vitest unless injected). */
  references?: RefsOptions | false
  /** CR-14 Europe PMC / Crossref cited-by + cached-venue fallback. Default: on (CITES_FALLBACK=0 off; off under vitest unless injected). */
  citations?: FallbackOptions | false
}

type Stage = 'goals' | 'search' | 'enrich' | 'label' | 'score' | 'llm' | 'select'
const timed = async <T>(s: LibraryState, stage: Stage, fn: () => Promise<T>) => {
  stageStart(s, stage)
  const t0 = Date.now()
  const out = await fn()
  s.stageMs[stage] = (s.stageMs[stage] ?? 0) + (Date.now() - t0)
  return { out, ms: Date.now() - t0 }
}
function stageStart(s: LibraryState, stage: Stage, message?: string) {
  emitLib(s, { type: 'stage', stage, status: 'start', ...(message ? { message } : {}) })
}

export async function runLibrary(s: LibraryState, deps: PipelineDeps): Promise<void> {
  const req = s.request
  const now = deps.now?.() ?? new Date()
  emitLib(s, { type: 'library', libraryId: s.id, request: { topK: req.topK, threshold: req.threshold, sources: req.sources, weights: req.weights } })

  // 1. goals
  const g = await timed(s, 'goals', () => deriveGoals(req.notes, { timeoutMs: Number(env.raw.LIBRARY_PLANNER_TIMEOUT_MS || 60000), notesAsKnown: req.notesAsKnown }))
  const goals = g.out
  s.goals = goals
  emitLib(s, { type: 'goals', goals })
  emitLib(s, { type: 'stage', stage: 'goals', status: 'done', count: goals.subtopics.length, ms: g.ms, message: `${goals.model ? `planner ${goals.model}` : 'deterministic fallback (no planner)'} · ${goals.goals.length} goals · ${goals.subtopics.length} subtopics · ${goals.keywords.length} keywords · ${goals.knownPapers.length} known papers (${knownBySource(req.notes).fromNotes.length} from your notes ${req.notesAsKnown === false ? 'excluded' : 'treated as known'}) · ${goals.evidence.length} verified note quotes` })

  // 2. search (L1)
  const sr = await timed(s, 'search', async () => {
    try {
      return await deps.gather(goals, req, c => { s.calls.push(c); emitLib(s, { type: 'source', source: c.source, query: c.query, count: c.count, ms: c.ms, ...(c.error ? { error: c.error } : {}) }) })
    } catch (e) {
      emitLib(s, { type: 'stage', stage: 'search', status: 'error', message: (e as Error).message?.slice(0, 300) })
      return [] as EnrichedRecord[]
    }
  })
  const recs = [...sr.out].sort((a, b) => b.hits.length - a.hits.length).slice(0, req.maxCandidates)
  emitLib(s, { type: 'stage', stage: 'search', status: 'done', count: recs.length, ms: sr.ms, message: `${s.calls.length} source calls · ${sr.out.length} records${sr.out.length > recs.length ? ` (capped to ${recs.length})` : ''}` })

  // 2b. CR-14: cited-by counts (Europe PMC / Crossref) and cached-venue matches for papers OpenAlex gave nothing
  const cfOpts = deps.citations ?? (env.raw.CITES_FALLBACK === '0' || process.env.VITEST ? false : {})
  if (cfOpts === false) emitLib(s, { type: 'stage', stage: 'enrich', status: 'skipped', message: 'citation/venue fallback: off' })
  else {
    const cf = await timed(s, 'enrich', () => addCitationFallback(recs, cfOpts))
    emitLib(s, { type: 'stage', stage: 'enrich', status: 'done', count: cf.out.citations, ms: cf.ms, message: fallbackSummary(cf.out) })
  }
  const openalexDown = isBlocked('openalex')

  // 3. label (+ relevance, which feeds subtopic labels)
  const lb = await timed(s, 'label', async () => {
    const emb = await embeddingRelevance(goals, recs, Number(env.raw.LIBRARY_EMBED_TIMEOUT_MS || 60000)).catch(() => null)
    const rel = emb ?? keywordRelevance(goals, recs)
    const items: ScoreItem[] = recs.map(rec => ({
      rec, labels: labelRecord(rec, goals, { subtopics: rel.subtopics.get(rec.key), now }), rel: rel.rel.get(rec.key) ?? null, llm: null,
    }))
    return { items, rel }
  })
  const { items, rel } = lb.out
  s.relevanceMethod = recs.length ? rel.method : 'none'
  emitLib(s, { type: 'stage', stage: 'label', status: 'done', count: items.length, ms: lb.ms, message: `relevance by ${rel.method === 'embedding' ? `${env.models.embed} (${rel.docs} docs × ${rel.queries} queries)` : 'keyword overlap (no embeddings)'}` })

  // 4. pre-LLM score
  const rule = { topPercent: req.topPercent, threshold: req.threshold }
  const sc = await timed(s, 'score', async () => scoreLibrary(items, goals, { weights: req.weights, threshold: req.threshold, topPercent: req.topPercent, now, openalexDown }))
  const pre = sc.out
  emitLib(s, { type: 'stage', stage: 'score', status: 'done', count: pre.length, ms: sc.ms, message: `pre-LLM score · ${passSummary(pre, rule)}` })

  // 5. LLM read (D-32 / J-2): cover every paper returned to the UI — read the top max(llmReadTopK, topK) (cap 60),
  //    then re-score and top up any newcomer in that top that was not read yet (at most 5 extra rounds).
  const byKey = new Map(items.map(i => [i.rec.paper.id, i]))
  const readK = effectiveLlmReadK(req)
  const attempted = new Set<string>()
  const reads = new Map<string, LlmReadT>()
  const pick = (ranked: LibPaper[]) => ranked.filter(p => !p.excluded && p.paper.abstract).slice(0, readK)
    .map(p => byKey.get(p.paper.id)).filter((i): i is ScoreItem => !!i && !attempted.has(i.rec.key))
  const first = readK > 0 ? pick(pre) : []
  if (!hasKey() || readK === 0 || !first.length) {
    emitLib(s, { type: 'stage', stage: 'llm', status: 'skipped', message: !hasKey() ? 'no TOKEN_FACTORY_API_KEY' : readK === 0 ? 'llmReadTopK = 0' : 'no papers with an abstract' })
  } else {
    const lr = await timed(s, 'llm', async () => {
      let batch = first
      for (let round = 0; round < 6 && batch.length; round++) {
        batch.forEach(i => attempted.add(i.rec.key))
        const out = await llmReadAll(goals, batch.map(i => i.rec), { concurrency: 8, timeoutMs: Number(env.raw.LIBRARY_LLM_TIMEOUT_MS || 30000) })
        for (const [k, v] of out) reads.set(k, v)
        for (const it of items) it.llm = reads.get(it.rec.key) ?? null
        batch = pick(scoreLibrary(items, goals, { weights: req.weights, threshold: req.threshold, topPercent: req.topPercent, now, openalexDown }))
      }
    })
    s.llmReads = reads.size
    emitLib(s, { type: 'stage', stage: 'llm', status: 'done', count: reads.size, ms: lr.ms, message: `${env.models.judge} read ${reads.size}/${attempted.size} abstracts (top ${readK}) · ${[...reads.values()].filter(r => r.verified).length} quotes verified` })
  }
  for (const it of items) {
    it.llm = reads.get(it.rec.key) ?? null
    if (!it.llm) it.llmNote = !hasKey() ? 'no model key' : attempted.has(it.rec.key) ? 'the model call failed or timed out' : !it.rec.paper.abstract ? 'no abstract to read' : `outside the top ${readK} by the other components`
  }

  // 6. re-score + select
  const se = await timed(s, 'select', async () => scoreLibrary(items, goals, { weights: req.weights, threshold: req.threshold, topPercent: req.topPercent, now, openalexDown }))
  s.papers = markFieldUncertain(se.out)

  // 6b. CR-10 E-2: reference lists from Europe PMC for passed papers OpenAlex gave none (429 / PubMed-only records)
  const refsOpts = deps.references ?? (env.raw.EPMC_REFS === '0' || process.env.VITEST ? false : {})
  if (refsOpts === false) {
    emitLib(s, { type: 'stage', stage: 'expand', status: 'skipped', message: 'europepmc refs: off' })
  } else {
    emitLib(s, { type: 'stage', stage: 'expand', status: 'start', message: 'europepmc refs' })
    try {
      const r = await addEuropePmcReferences(s.papers, goals.knownPapers, refsOpts)
      s.stageMs.expand = r.ms
      emitLib(s, { type: 'stage', stage: 'expand', status: 'done', count: r.papersLinked, ms: r.ms,
        message: `europepmc refs: ${r.papersWithRefs} papers, ${r.links} links · ${r.calls}/${r.candidates} calls${r.errors ? ` · ${r.errors} errors` : ''}${r.timedOut ? ` · ${r.timedOut} timed out` : ''}` })
    } catch (e) { // never fails the build
      emitLib(s, { type: 'stage', stage: 'expand', status: 'error', message: `europepmc refs: ${(e as Error).message?.slice(0, 200)}` })
    }
  }
  const passed = s.papers.filter(p => p.passed).length
  const top = s.papers.slice(0, req.topK)
  emitLib(s, { type: 'papers', papers: top, total: s.papers.length, passed })
  emitLib(s, { type: 'stage', stage: 'select', status: 'done', count: top.length, ms: se.ms, message: `${passSummary(s.papers, rule)} · ${s.papers.filter(p => p.excluded).length} excluded · top ${top.length} sent` })

  // 7. files + report
  s.dir = writeLibraryFiles(s)
  writeLibraryReport(s)
  emitLib(s, { type: 'done', libraryId: s.id, total: s.papers.length, passed, ms: Date.now() - s.startedAt, dir: s.dir ?? '' })
}
