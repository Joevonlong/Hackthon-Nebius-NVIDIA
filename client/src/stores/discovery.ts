// Run state from the SSE stream. Owner: lane C.
import { defineStore } from 'pinia'
import { StageName, type Candidate, type Facet, type Lane, type RunEvent, type RunPreset, type Seed } from '@shared/contracts'
import { runDiscovery, type RunHandle, type RunMode } from '../api'
import { useVault } from './vault'
import { buildSeedNote } from '../discover/literatureNote'

export type StageStatus = 'pending' | 'start' | 'done' | 'skipped' | 'error'
export interface StageState { name: StageName; status: StageStatus; count?: number; ms?: number; message?: string }
export interface AgentStep { step: number; tool: string; input: string; output: string }
export type RejectReason = 'wrong disease' | 'wrong method' | 'wrong population' | 'too old' | 'review'
export const REJECT_REASONS: RejectReason[] = ['wrong disease', 'wrong method', 'wrong population', 'too old', 'review']
export interface Feedback { verdict: 'keep' | 'reject'; reason?: RejectReason; at: number }

export const STAGE_LABEL: Record<StageName, string> = {
  resolve: 'Resolve', r1: 'R1 refs', r2: 'R2 ≥2 seeds', r3: 'R3 PubMed similar', r4: 'R4 query', scout: 'Scout',
  lanes: 'Lanes', embed: 'Embed', rerank: 'Rerank', judge: 'Judge', verify: 'Verify',
}
const freshStages = (): StageState[] => StageName.options.map(name => ({ name, status: 'pending' as StageStatus }))

let handle: RunHandle | null = null

/** Lens score in 0..1 from judge facets (0–3) or embedding facets (0..1); null if neither. lens 0 = Evidence, 1 = Method. */
export function lensScore(c: Candidate, lens: number): { score: number; source: 'judge' | 'embed' } | null {
  const w = { topic: (1 - lens) * 0.6, population: (1 - lens) * 0.4, method: lens }
  const sum = w.topic + w.population + w.method
  if (c.judgement) {
    const f = c.judgement.facets
    const v = (w.topic * f.topic + w.population * f.population + w.method * f.method) / 3 / sum
    return { score: v * (c.judgement.verified ? 1 : 0.6), source: 'judge' }
  }
  if (c.features.eFacets) {
    const f = c.features.eFacets
    return { score: (w.topic * f.topic + w.population * f.population + w.method * f.method) / sum, source: 'embed' }
  }
  return null
}

// Stand-in facets while the judge has not graded anything: a title keyword rule (shown as "judge pending").
const KW_TOPIC_HI = /melanoma/i
const KW_TOPIC_MID = /cancer|tumou?r|neoantigen|immunotherap|checkpoint|pd-1|lymphocyte|t[- ]cell/i
const KW_METHOD = /single[- ]cell|scrna|rna[- ]seq|sequencing|transcriptom|multiomic|-omics|spatial|profil|align|aligner|toolkit|package|format|algorithm|framework|cluster/i

/** Title keyword facets in 0..1 (topic, method). */
export function keywordFacets(title: string): { topic: number; method: number } {
  return {
    topic: KW_TOPIC_HI.test(title) ? 1 : KW_TOPIC_MID.test(title) ? 0.55 : 0.2,
    method: KW_METHOD.test(title) ? 1 : 0.2,
  }
}
export function keywordScore(c: Candidate, lens: number): number {
  const f = keywordFacets(c.paper.title || '')
  return (1 - lens) * f.topic + lens * f.method
}

export type LensSource = 'judge' | 'embed' | 'keywords'
/** Which signal the Lens uses in a lane: judge facets, else embedding facets, else the title keyword stand-in. */
export function laneLensSource(items: Candidate[]): LensSource {
  if (items.some(c => c.judgement)) return 'judge'
  if (items.some(c => c.features.eFacets)) return 'embed'
  return 'keywords'
}

/**
 * Re-sorts one lane by the lens without moving papers across lanes. Slot-preserving per tier:
 * judged papers are re-ordered among the slots judged papers held; embed-only papers among theirs;
 * papers with neither keep their pre-judge position. When no paper in the lane has judge or embedding
 * facets, the whole lane is re-sorted by the title keyword stand-in (ties keep the pre-judge order).
 */
export function sortLane(items: Candidate[], lens: number): Candidate[] {
  const base = [...items].sort((a, b) => a.rank - b.rank)
  if (laneLensSource(base) === 'keywords') {
    return base.map(c => ({ c, s: keywordScore(c, lens) })).sort((a, b) => b.s - a.s || a.c.rank - b.c.rank).map(x => x.c)
  }
  const out = base.slice()
  for (const tier of ['judge', 'embed'] as const) {
    const slots: number[] = []
    const members: { c: Candidate; s: number }[] = []
    base.forEach((c, i) => { const ls = lensScore(c, lens); if (ls?.source === tier) { slots.push(i); members.push({ c, s: ls.score }) } })
    members.sort((a, b) => b.s - a.s || a.c.rank - b.c.rank)
    slots.forEach((slot, k) => { out[slot] = members[k].c })
  }
  return out
}

export const useDiscovery = defineStore('discovery', {
  state: () => ({
    runId: null as string | null,
    question: 'Which single-cell methods help study melanoma immune cells?',
    seedInputs: ['10.1126/science.aad0501', '10.1016/j.cell.2018.10.038', '10.1038/s41586-021-03704-y', '10.1038/s41586-022-04682-5', '10.1158/1078-0432.CCR-21-1694'],
    preset: 'demo' as RunPreset,
    seeds: [] as Seed[],
    facets: [] as Facet[],
    candidates: [] as Candidate[],
    counts: {} as Record<string, number>,
    total: 0,
    events: [] as RunEvent[],
    status: 'idle' as 'idle' | 'running' | 'done' | 'error',
    stages: freshStages(),
    agent: [] as AgentStep[],
    error: null as string | null,
    errorStage: null as StageName | null,
    mode: null as RunMode | null,
    notice: null as string | null,
    ms: null as number | null,
    runCount: 0,
    feedback: {} as Record<string, Feedback>,
  }),
  getters: {
    byId: s => (id: string) => s.candidates.find(c => c.paper.id === id),
    inLane: s => (lane: Lane) => s.candidates.filter(c => c.lane === lane),
    kept: s => s.candidates.filter(c => s.feedback[c.paper.id]?.verdict === 'keep'),
    keptIds(): string[] { return Object.entries(this.feedback).filter(([, f]) => f.verdict === 'keep').map(([id]) => id) },
    judgedCount: s => s.candidates.filter(c => c.judgement).length,
  },
  actions: {
    reset() {
      handle?.close(); handle = null
      this.runId = null; this.seeds = []; this.facets = []; this.candidates = []; this.counts = {}; this.total = 0
      this.events = []; this.status = 'idle'; this.stages = freshStages(); this.agent = []; this.error = null
      this.errorStage = null; this.mode = null; this.notice = null; this.ms = null
    },

    async start() {
      this.reset()
      const seeds = this.seedInputs.map(s => s.trim()).filter(s => s.length >= 3)
      if (this.question.trim().length < 3 || !seeds.length) { this.status = 'error'; this.error = 'Enter a question and at least one seed (DOI, PMID or OpenAlex id).'; return }
      this.status = 'running'
      this.runCount++
      const myRun = this.runCount
      try {
        handle = await runDiscovery({ question: this.question.trim(), seeds: seeds.slice(0, 20), preset: this.preset }, {
          onEvent: ev => { if (myRun === this.runCount) this.apply(ev) },
          onTransportError: msg => { if (myRun === this.runCount && this.status === 'running') { this.status = 'error'; this.error = msg } },
        })
        if (myRun === this.runCount) this.mode = handle.mode
      } catch (e) {
        if (myRun !== this.runCount) return
        this.status = 'error'; this.error = (e as Error).message || String(e)
      }
    },

    /** F-15: kept papers' DOIs (or OpenAlex ids) join the seeds for the next round. */
    async growAgain() {
      const extra = this.kept.map(c => c.paper.doi || c.paper.id)
      const have = new Set(this.seedInputs.map(s => s.trim().toLowerCase()))
      for (const x of extra) if (!have.has(x.toLowerCase())) this.seedInputs.push(x)
      await this.start()
    },

    setFeedback(paperId: string, verdict: 'keep' | 'reject' | null, reason?: RejectReason) {
      if (!verdict) { delete this.feedback[paperId]; return }
      this.feedback[paperId] = { verdict, reason, at: Date.now() }
    },

    apply(ev: RunEvent) {
      this.events.push(ev)
      switch (ev.type) {
        case 'run': this.runId = ev.runId; this.preset = ev.preset; break
        case 'stage': {
          const st = this.stages.find(s => s.name === ev.stage)
          if (st) { st.status = ev.status; if (ev.count != null) st.count = ev.count; if (ev.ms != null) st.ms = ev.ms; if (ev.message) st.message = ev.message }
          break
        }
        case 'seeds': {
          this.seeds = ev.seeds
          const vault = useVault()
          for (const s of ev.seeds) {
            const note = buildSeedNote(s)
            if (!vault.byPath(note.path)) void vault.upsert({ ...note, kind: 'seed', paperId: s.id })
          }
          break
        }
        case 'facets': this.facets = ev.facets; break
        case 'candidates': {
          // Keep judgements that already arrived for papers in the new batch.
          const prev = new Map(this.candidates.map(c => [c.paper.id, c.judgement]))
          this.candidates = ev.candidates.map(c => (c.judgement || !prev.get(c.paper.id)) ? c : { ...c, judgement: prev.get(c.paper.id)! })
          this.counts = ev.counts; this.total = ev.total
          break
        }
        case 'judgement': {
          const c = this.candidates.find(x => x.paper.id === ev.paperId)
          if (c) c.judgement = ev.judgement
          break
        }
        case 'agent': this.agent.push({ step: ev.step, tool: ev.tool, input: ev.input, output: ev.output }); break
        case 'done':
          this.status = 'done'; this.counts = ev.counts; this.total = ev.total; this.ms = ev.ms; this.runId = ev.runId
          for (const st of this.stages) if (st.status === 'start') st.status = 'done'
          break
        case 'error':
          this.status = 'error'; this.error = ev.message; this.errorStage = ev.stage ?? null
          if (ev.stage) { const st = this.stages.find(s => s.name === ev.stage); if (st) st.status = 'error' }
          break
      }
    },
  },
})
