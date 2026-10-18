// Library mode state (lane L3). POST /api/library with every vault note, then the SSE stream of LibraryEvents.
// Falls back to the dev mock (client/src/library/mock.ts) with ?mock=1 or when the server route is missing.
import { defineStore } from 'pinia'
import { DEFAULT_WEIGHTS, LibPaper, LibraryEvent, LibraryRequest, SourceName, type Goals, type Weights } from '@shared/library'
import { Seed } from '@shared/contracts'
import { useVault } from './vault'
import { buildSeedNote } from '../discover/literatureNote'
import { rescore, sameWeights } from '../library/score'

export type LibStageName = 'goals' | 'search' | 'expand' | 'normalize' | 'enrich' | 'label' | 'score' | 'llm' | 'select'
export const LIB_STAGES: LibStageName[] = ['goals', 'search', 'expand', 'normalize', 'enrich', 'label', 'score', 'llm', 'select']
export const LIB_STAGE_LABEL: Record<LibStageName, string> = {
  goals: 'Goals', search: 'Search', expand: 'Expand', normalize: 'Dedupe', enrich: 'Enrich', label: 'Label', score: 'Score', llm: 'LLM read', select: 'Select',
}
export const SOURCE_LABEL: Record<SourceName, string> = { openalex: 'OpenAlex', pubmed: 'PubMed', arxiv: 'arXiv', tavily: 'Tavily', scholar: 'Google Scholar' }
export type LibMode = 'live' | 'mock'
export interface LibStage { name: LibStageName; status: 'pending' | 'start' | 'done' | 'skipped' | 'error'; count?: number; ms?: number; message?: string }
export interface SourceCall { source: SourceName; query: string; count: number; ms: number; error?: string }
type RunReq = Extract<LibraryEvent, { type: 'library' }>['request']

const freshStages = (): LibStage[] => LIB_STAGES.map(name => ({ name, status: 'pending' }))
const isMockParam = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('mock') === '1'
const EVENT_TYPES = ['library', 'stage', 'goals', 'source', 'papers', 'done', 'error']

let es: EventSource | null = null
let stopMock: (() => void) | null = null
let mockAll: LibPaper[] = []

function parse(raw: string): LibraryEvent | null {
  let json: unknown
  try { json = JSON.parse(raw) } catch { console.warn('[library] skipped non-JSON event', raw.slice(0, 120)); return null }
  const r = LibraryEvent.safeParse(json)
  if (!r.success) { console.warn('[library] skipped invalid LibraryEvent', r.error.issues.slice(0, 3)); return null }
  return r.data
}

export const useLibrary = defineStore('library', {
  state: () => ({
    // controls
    topK: 30, threshold: 0.55,
    sources: [...SourceName.options] as SourceName[],
    weights: { ...DEFAULT_WEIGHTS } as Weights,
    // run
    libraryId: null as string | null,
    status: 'idle' as 'idle' | 'running' | 'done' | 'error',
    mode: null as LibMode | null,
    notice: null as string | null,
    error: null as string | null,
    runRequest: null as RunReq | null,
    goals: null as Goals | null,
    calls: [] as SourceCall[],
    stages: freshStages(),
    papers: [] as LibPaper[], // top topK as streamed
    allPapers: [] as LibPaper[], // every scored paper (GET /api/library/:id), when available
    total: 0, passed: 0, ms: null as number | null, dir: null as string | null,
    runCount: 0,
    // result filters
    // seeds (D-23)
    seedBusy: false, seedAdded: [] as string[], seedErrors: [] as { input: string; message: string }[],
    filterKind: '' as string, passedOnly: false, filterSource: '' as '' | SourceName,
  }),
  getters: {
    /** Scholar skipped for lack of SERPAPI_KEY (reported by a source call or the search stage message). */
    scholarSkipped: s => s.calls.some(c => c.source === 'scholar' && /SERPAPI/i.test(c.error || '')) || s.stages.some(st => /SERPAPI/i.test(st.message || '')),
    /** True when the current weights or threshold differ from the ones the run used (scores are re-computed locally). */
    reweighted: s => !!s.runRequest && (!sameWeights(s.weights, s.runRequest.weights) || Math.abs(s.threshold - s.runRequest.threshold) > 1e-9),
    /** The whole scored pile with the current weights/threshold applied (server values untouched when unchanged). */
    scored(): LibPaper[] {
      const base = this.allPapers.length ? this.allPapers : this.papers
      if (!this.reweighted) return [...base].sort((a, b) => a.rank - b.rank)
      return rescore(base, this.weights, this.threshold)
    },
    /** Top topK of the scored pile (passed first). */
    top(): LibPaper[] { return this.scored.slice(0, this.topK) },
    filtered(): LibPaper[] {
      return this.top.filter(p => (!this.filterKind || p.labels.kind === this.filterKind)
        && (!this.passedOnly || p.passed) && (!this.filterSource || p.labels.sources.includes(this.filterSource)))
    },
    passedTop(): LibPaper[] { return this.top.filter(p => p.passed && !p.excluded) },
    /** Papers the pile has beyond what was streamed: true when topK exceeds what we hold. */
    short(): boolean { return this.topK > this.scored.length && this.scored.length < this.total },
    byId(): (id: string) => LibPaper | undefined { return (id: string) => this.scored.find(p => p.paper.id === id) },
  },
  actions: {
    reset() {
      es?.close(); es = null; stopMock?.(); stopMock = null; mockAll = []
      this.libraryId = null; this.status = 'idle'; this.mode = null; this.notice = null; this.error = null; this.runRequest = null
      this.goals = null; this.calls = []; this.stages = freshStages(); this.papers = []; this.allPapers = []
      this.total = 0; this.passed = 0; this.ms = null; this.dir = null
    },
    resetWeights() { this.weights = { ...DEFAULT_WEIGHTS } },

    request(): LibraryRequest {
      const notes = useVault().notes.map(n => ({ path: n.path, title: n.title, content: n.content }))
      return LibraryRequest.parse({ notes, topK: this.topK, threshold: this.threshold, sources: this.sources, weights: { ...this.weights } })
    },

    async start() {
      this.reset()
      let req: LibraryRequest
      try { req = this.request() } catch { this.status = 'error'; this.error = 'The vault has no notes to read. Write at least one note first.'; return }
      this.status = 'running'
      const my = ++this.runCount
      if (isMockParam()) return this.runMock(req, null)
      let libraryId: string
      try {
        const res = await fetch('/api/library', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) })
        if (my !== this.runCount) return
        if (!res.ok) {
          if ([404, 500, 502, 503, 504].includes(res.status)) return this.runMock(req, `POST /api/library → ${res.status}`)
          throw new Error(`POST /api/library → ${res.status}: ${(await res.text()).slice(0, 200)}`)
        }
        const body = await res.json() as { libraryId?: string }
        if (!body.libraryId) return this.runMock(req, 'POST /api/library returned no libraryId')
        libraryId = body.libraryId
      } catch (e) {
        if (my !== this.runCount) return
        if (e instanceof TypeError) return this.runMock(req, 'server unreachable')
        this.status = 'error'; this.error = (e as Error).message; return
      }
      this.mode = 'live'; this.libraryId = libraryId
      let got = false
      const src = new EventSource(`/api/library/${encodeURIComponent(libraryId)}/stream`)
      es = src
      const onData = (e: MessageEvent) => {
        if (my !== this.runCount) return
        const ev = parse(String(e.data)); if (!ev) return
        got = true
        this.apply(ev)
        if (ev.type === 'done' || ev.type === 'error') src.close()
      }
      src.addEventListener('message', onData)
      for (const t of EVENT_TYPES) src.addEventListener(t, onData as EventListener)
      src.onerror = () => {
        if (my !== this.runCount || this.status !== 'running') { src.close(); return }
        src.close()
        if (!got) void this.runMock(req, 'library stream unavailable')
        else { this.status = 'error'; this.error = 'Connection to the library stream was lost.' }
      }
    },

    async runMock(req: LibraryRequest, reason: string | null) {
      const { playLibraryMock } = await import('../library/mock')
      this.mode = 'mock'
      if (reason) { console.warn('[library] falling back to mock:', reason); this.notice = `Library server unavailable (${reason}); showing the dev mock.` }
      const my = this.runCount
      const m = playLibraryMock(req, ev => { if (my === this.runCount) this.apply(ev) })
      stopMock = m.stop; mockAll = m.all
    },

    apply(ev: LibraryEvent) {
      switch (ev.type) {
        case 'library': this.libraryId = ev.libraryId; this.runRequest = ev.request; break
        case 'stage': {
          const st = this.stages.find(s => s.name === ev.stage)
          if (st) { st.status = ev.status; if (ev.count != null) st.count = ev.count; if (ev.ms != null) st.ms = ev.ms; if (ev.message) st.message = ev.message }
          break
        }
        case 'goals': this.goals = ev.goals; break
        case 'source': this.calls.push({ source: ev.source, query: ev.query, count: ev.count, ms: ev.ms, error: ev.error }); break
        case 'papers': this.papers = ev.papers; this.total = ev.total; this.passed = ev.passed; break
        case 'done':
          this.status = 'done'; this.total = ev.total; this.passed = ev.passed; this.ms = ev.ms; this.dir = ev.dir; this.libraryId = ev.libraryId
          for (const st of this.stages) if (st.status === 'start') st.status = 'done'
          if (!this.runRequest) this.runRequest = { topK: this.topK, threshold: this.threshold, sources: [...this.sources], weights: { ...this.weights } }
          void this.loadAll()
          break
        case 'error': this.status = 'error'; this.error = ev.message; break
      }
    },

    /** Every scored paper, so topK / weights / threshold can be explored without another run. */
    async loadAll() {
      if (this.mode === 'mock') { this.allPapers = mockAll; return }
      if (!this.libraryId) return
      try {
        const res = await fetch(`/api/library/${encodeURIComponent(this.libraryId)}`)
        if (!res.ok) return
        const body = await res.json() as { papers?: unknown[] }
        const ok: LibPaper[] = []
        for (const p of body.papers || []) { const r = LibPaper.safeParse(p); if (r.success) ok.push(r.data) }
        if (ok.length) this.allPapers = ok
      } catch { /* keep the streamed top N */ }
    },

    /**
     * D-23: "Add seed papers" — resolves DOIs / PMIDs / arXiv ids (POST /api/seeds/resolve) and writes seed notes
     * 'Seeds/S<n> <shortName>.md' so their ids become knownPapers in the next library build.
     */
    async addSeeds(text: string) {
      const inputs = [...new Set(text.split(/[\n,;\s]+/).map(s => s.trim()).filter(s => s.length >= 3))].slice(0, 50)
      this.seedErrors = []; this.seedAdded = []
      if (!inputs.length) { this.seedErrors = [{ input: '', message: 'Paste at least one DOI, PMID, arXiv or OpenAlex id.' }]; return }
      this.seedBusy = true
      let out: { seeds: Seed[]; errors: { input: string; message: string }[] }
      try {
        if (isMockParam()) throw new TypeError('mock')
        const res = await fetch('/api/seeds/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inputs }) })
        if (!res.ok) {
          if ([404, 500, 502, 503, 504].includes(res.status)) throw new TypeError(String(res.status))
          throw new Error(`POST /api/seeds/resolve → ${res.status}`)
        }
        const body = await res.json() as { seeds?: unknown[]; errors?: { input: string; message: string }[] }
        out = { seeds: (body.seeds || []).map(s => Seed.safeParse(s)).filter(r => r.success).map(r => r.data!), errors: body.errors || [] }
      } catch (e) {
        if (!(e instanceof TypeError)) { this.seedBusy = false; this.seedErrors = [{ input: '', message: (e as Error).message }]; return }
        const { mockResolveSeeds } = await import('../library/mock')
        out = mockResolveSeeds(inputs)
      }
      const vault = useVault()
      let n = vault.notes.filter(x => x.kind === 'seed').reduce((m, x) => Math.max(m, Number(x.path.match(/^Seeds\/S(\d+)/)?.[1] || 0)), 0)
      for (const s of out.seeds) {
        const existing = vault.byPaper(s.id)
        if (existing) { this.seedAdded.push(existing.path); continue }
        n++
        const note = buildSeedNote({ ...s, n, label: 'S' + n })
        await vault.upsert({ ...note, kind: 'seed', paperId: s.id })
        this.seedAdded.push(note.path)
      }
      this.seedErrors = out.errors
      this.seedBusy = false
    },

    /** The per-paper JSON file (GET /api/library/:id/papers/:paperId); the mock serves it from memory. */
    async fetchPaperJson(paperId: string): Promise<unknown> {
      if (this.mode === 'mock' || !this.libraryId) {
        const p = mockAll.find(x => x.paper.id === paperId) || this.papers.find(x => x.paper.id === paperId)
        if (!p) throw new Error(`Paper ${paperId} is not in this library.`)
        return JSON.parse(JSON.stringify(p))
      }
      const res = await fetch(`/api/library/${encodeURIComponent(this.libraryId)}/papers/${encodeURIComponent(paperId)}`)
      if (!res.ok) throw new Error(`GET /api/library/${this.libraryId}/papers/${paperId} → ${res.status}`)
      return res.json()
    },
  },
})
