// Library mode state (lanes L3, U1). POST /api/library with every vault note, then the SSE stream of LibraryEvents.
// R-3.1 / F-50: no automatic mock fallback. A failed request shows an error with Retry. The dev mock
// (client/src/library/mock.ts) loads only in dev builds with ?mock=1 (dynamic import, dropped from production builds).
// ?demo=1 replays a recorded REAL run: GET /api/demo/library/stream + /api/demo/library (+ /papers/:paperId).
// D-27: passed = rank within the top X% of the scored, non-excluded papers AND total ≥ the minimum score; re-computed
// in the browser whenever weights, the pass rule or the filters change. Lane U2's chat uses applyProposal() / currentSettings().
import { defineStore } from 'pinia'
import { DEFAULT_WEIGHTS, LibPaper, LibraryEvent, LibraryRequest, LibrarySummary, SourceName, type Filters, type Goals, type Proposal, type Weights } from '@shared/library'
import { Seed } from '@shared/contracts'
import { useVault, seedsFolder } from './vault'
import { noteName, parseFrontMatter } from './vault-utils'
import { buildSeedNote, firstAuthor, lastName } from '../discover/literatureNote'
import { matchesFilters, passCut, rescore, sameWeights } from '../library/score'

export type LibStageName = 'goals' | 'search' | 'expand' | 'normalize' | 'enrich' | 'label' | 'score' | 'llm' | 'select'
export const LIB_STAGES: LibStageName[] = ['goals', 'search', 'expand', 'normalize', 'enrich', 'label', 'score', 'llm', 'select']
export const LIB_STAGE_LABEL: Record<LibStageName, string> = {
  goals: 'Goals', search: 'Search', expand: 'Expand', normalize: 'Dedupe', enrich: 'Enrich', label: 'Label', score: 'Score', llm: 'LLM read', select: 'Select',
}
export const SOURCE_LABEL: Record<SourceName, string> = { openalex: 'OpenAlex', pubmed: 'PubMed', arxiv: 'arXiv', tavily: 'Tavily', scholar: 'Google Scholar' }
/** Sources offered in the UI and sent with a build: Google Scholar is dropped (D-21, J-5). */
export const UI_SOURCES: SourceName[] = SourceName.options.filter(s => s !== 'scholar')
/** J-3: "Recent (≤ 3 years)" = published in or after this year. */
export const RECENT_FROM = new Date().getFullYear() - 3
export type LibMode = 'live' | 'demo' | 'mock'
export interface LibStage { name: LibStageName; status: 'pending' | 'start' | 'done' | 'skipped' | 'error'; count?: number; ms?: number; message?: string }
export interface SourceCall { source: SourceName; query: string; count: number; ms: number; error?: string }
export interface LibSettings { weights: Weights; topPercent: number; threshold: number; filters: Filters }
type RunReq = Extract<LibraryEvent, { type: 'library' }>['request']

/** Q2-2: the settings a library starts with when nothing else is known (LibraryRequest defaults, no filters). */
export const DEFAULT_SETTINGS = { topK: 30, threshold: 0.5, topPercent: 25 } as const
const freshStages = (): LibStage[] => LIB_STAGES.map(name => ({ name, status: 'pending' }))
const param = (k: string) => typeof location !== 'undefined' && new URLSearchParams(location.search).get(k) === '1'
const isDemoParam = () => param('demo')
const EVENT_TYPES = ['library', 'stage', 'goals', 'source', 'papers', 'done', 'error']
const DEMO_BASE = '/api/demo/library'

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
const httpMessage = (what: string, status: number) =>
  status === 404 ? `${what} → 404: the server has no such route or library.` : status >= 500 ? `${what} → ${status}: the server failed.` : `${what} → ${status}.`
const netMessage = (what: string) => `${what}: the server is unreachable (network error). Is it running?`
/** D-36: one row of the seed table (status of the last add / import attempt for that input). */
export interface SeedRow { input: string; status: 'resolved' | 'not found' | 'duplicate'; path?: string; message?: string; via?: string }
/** Q2-6: a seed resolved without OpenAlex (POST /api/seeds/resolve `resolvedVia`). */
export interface SeedVia { input: string; paperId?: string; source: string; reason?: string }
/** D-35: the last opened library per question (localStorage; '' = no question). */
const LAST_KEY = (q: string | null) => `papertrail:lastLibrary:${q ?? ''}`
export const lastOpened = (q: string | null) => { try { return localStorage.getItem(LAST_KEY(q)) } catch { return null } }
/** Q-1: the viewer's pass rule / weights / filters / topK per library (restored when the library is reopened). */
export const LIB_SETTINGS_KEY = (id: string) => `papertrail:libSettings:${id}`
const setLastOpened =(q: string | null, id: string | null) => { try { if (id) localStorage.setItem(LAST_KEY(q), id); else localStorage.removeItem(LAST_KEY(q)) } catch { /* private mode */ } }
/** Seed note front matter -> table fields. */
export function seedInfo(content: string): { title: string; year: string; id: string; label: string } {
  const { data } = parseFrontMatter(content)
  return { title: data.title || '', year: data.year || '', id: data.doi || (data.pmid ? 'PMID:' + data.pmid : '') || data.paper_id || '', label: data.seed || '' }
}

export const useLibrary = defineStore('library', {
  state: () => ({
    // controls
    topK: DEFAULT_SETTINGS.topK as number,
    threshold: DEFAULT_SETTINGS.threshold as number, // D-27: minimum score (absolute floor)
    topPercent: DEFAULT_SETTINGS.topPercent as number, // D-27: pass = top X% of this library
    filters: {} as Filters,
    sources: [...UI_SOURCES] as SourceName[],
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
    streamed: [] as LibPaper[], // top topK as streamed
    allPapers: [] as LibPaper[], // every scored paper (GET /api/library/:id), when available
    total: 0, passed: 0, ms: null as number | null, dir: null as string | null,
    runCount: 0,
    // rank moves after a chat proposal was applied (cleared by the next build)
    rankBefore: null as Record<string, number> | null,
    lastApplied: null as { rationale: string; at: number } | null,
    // result-view-only filters
    passedOnly: false, filterSource: '' as '' | SourceName,
    // seeds (D-23)
    seedBusy: false, seedAdded: [] as string[], seedErrors: [] as { input: string; message: string }[],
    seedWarning: null as string | null, // Q2-6: e.g. "OpenAlex rate-limited — resolved via Crossref"
    seedRows: [] as SeedRow[], seedQuestion: null as string | null, importNote: null as string | null,
    // D-33 / D-35: the question this library belongs to + saved history
    questionId: null as string | null,
    history: [] as LibrarySummary[], historyBusy: false, historyError: null as string | null,
  }),
  getters: {
    /** Scholar skipped for lack of SERPAPI_KEY (reported by a source call or the search stage message). */
    scholarSkipped: s => s.calls.some(c => c.source === 'scholar' && /SERPAPI/i.test(c.error || '')) || s.stages.some(st => /SERPAPI/i.test(st.message || '')),
    /** True when the current weights differ from the ones the run used (totals are re-computed locally). */
    reweighted: s => !!s.runRequest && !sameWeights(s.weights, s.runRequest.weights),
    /** Every scored paper with the current weights and pass rule applied, ranked (excluded last). */
    papers(): LibPaper[] {
      const base = this.allPapers.length ? this.allPapers : this.streamed
      const out = rescore(base, { topPercent: this.topPercent, threshold: this.threshold, weights: this.reweighted ? this.weights : undefined })
      // D-27 is a rule over the WHOLE library: when only part of it is loaded (streamed top, or a demo replay that keeps
      // 150 of 599), keep the server's recorded passed flags instead of re-cutting the partial set.
      if (!this.complete) {
        const server = new Map(base.map(p => [p.paper.id, p.passed]))
        for (const p of out) p.passed = !!server.get(p.paper.id) && !p.excluded
        out.sort((a, b) => Number(!!a.excluded) - Number(!!b.excluded) || Number(b.passed) - Number(a.passed) || b.total - a.total || a.paper.title.localeCompare(b.paper.title))
        out.forEach((p, i) => { p.rank = i + 1 })
      }
      return out
    },
    /** True when every scored paper of the library is loaded (then the pass rule is re-applied in the browser). */
    complete(): boolean {
      const n = this.allPapers.length || this.streamed.length
      return !this.total || n >= this.total
    },
    /** Alias kept for older callers (App.vue status line). */
    scored(): LibPaper[] { return this.papers },
    /** Scored papers that match the result filters (kinds, years, OA, peer review). */
    view(): LibPaper[] { return this.papers.filter(p => matchesFilters(p, this.filters)) },
    /** Top topK of the filtered view. */
    top(): LibPaper[] { return this.view.slice(0, this.topK) },
    filtered(): LibPaper[] {
      return this.top.filter(p => (!this.passedOnly || p.passed) && (!this.filterSource || p.labels.sources.includes(this.filterSource)))
    },
    passedTop(): LibPaper[] { return this.top.filter(p => p.passed && !p.excluded) },
    /** Every passed paper in the filtered view (the graph layer). */
    passedAll(): LibPaper[] { return this.view.filter(p => p.passed && !p.excluded) },
    eligibleCount(): number { return this.complete ? this.papers.filter(p => !p.excluded).length : this.total },
    /** Q2-13: papers found = scored + excluded by a hard gate (one source for the results header and the status bar). */
    foundCount(): number { return this.complete ? this.papers.length : this.total },
    excludedCount(): number { return Math.max(0, this.foundCount - this.eligibleCount) },
    /** D-27 passed count (top X% of the non-excluded papers AND total >= the minimum score); the server's count while the library is partial. */
    passedCount(): number { return this.complete ? this.papers.filter(p => p.passed).length : this.passed },
    /** Number of papers inside the top X% (before the minimum score). */
    cutCount(): number { return passCut(this.eligibleCount, this.topPercent) },
    /** Papers the pile has beyond what was streamed: true when topK exceeds what we hold. */
    short(): boolean { return this.topK > this.view.length && this.papers.length < this.total },
    byId(): (id: string) => LibPaper | undefined { return (id: string) => this.papers.find(p => p.paper.id === id) },
    /**
     * J-5: readable name for a known-paper label "K<n>" (= goals.knownPapers[n-1]): the vault seed note's name
     * ("S1 Tirosh 2016"), else "Author Year" of the library paper with that id, else the raw id.
     */
    knownName(): (k: string) => string {
      const vault = useVault()
      return (k: string) => {
        const id = this.goals?.knownPapers[Number(k.replace(/^K/i, '')) - 1]?.replace(/[`'"]+$/, '').toLowerCase()
        if (!id) return k
        const bare = id.replace(/^pmid:/, '')
        const note = vault.notes.find(n => n.paperId?.toLowerCase() === id)
          || vault.notes.find(n => n.kind === 'seed' && n.content.toLowerCase().includes(bare))
        if (note) return noteName(note.path)
        const p = this.papers.find(x => x.paper.id.toLowerCase() === id || x.paper.doi?.toLowerCase() === id || (x.paper.pmid && 'pmid:' + x.paper.pmid === id))
        return p ? `${lastName(firstAuthor(p.paper))} ${p.paper.year ?? ''}`.trim() : id
      }
    },
    /** Replaces every K<n> label in an evidence text with the known paper's readable name. */
    deK(): (text: string) => string { return (text: string) => text.replace(/\bK(\d{1,3})\b/g, m => this.knownName(m)) },
    /** Rank change since the last applied proposal (positive = moved up), or null. */
    rankMove(): (id: string, rank: number) => number | null {
      return (id: string, rank: number) => {
        const b = this.rankBefore?.[id]
        return b == null || b === rank ? null : b - rank
      }
    },
  },
  actions: {
    reset() {
      es?.close(); es = null; stopMock?.(); stopMock = null; mockAll = []
      this.libraryId = null; this.status = 'idle'; this.mode = null; this.notice = null; this.error = null; this.runRequest = null
      this.goals = null; this.calls = []; this.stages = freshStages(); this.streamed = []; this.allPapers = []
      this.total = 0; this.passed = 0; this.ms = null; this.dir = null; this.rankBefore = null; this.lastApplied = null
      this.questionId = null
      this.resetSettings()
    },
    /**
     * Q2-2: weights, pass rule, topK and filters belong to ONE library. Opening another library or a question without
     * one starts from the request defaults (openStored then applies that library's request + its saved state).
     */
    resetSettings() {
      this.weights = { ...DEFAULT_WEIGHTS }; this.topK = DEFAULT_SETTINGS.topK
      this.threshold = DEFAULT_SETTINGS.threshold; this.topPercent = DEFAULT_SETTINGS.topPercent
      this.filters = {}; this.passedOnly = false; this.filterSource = ''
    },
    resetWeights() { this.weights = { ...DEFAULT_WEIGHTS } },

    /** The settings the chat agent sees (plain copies). */
    currentSettings(): LibSettings {
      return { weights: { ...this.weights }, topPercent: this.topPercent, threshold: this.threshold, filters: JSON.parse(JSON.stringify(this.filters)) }
    },

    /**
     * D-29: applies a chat proposal (weights / pass rule / filters merged into the current settings), re-scores in the
     * browser and returns the top-10 paper ids of the filtered view before and after. Rank moves show until the next build.
     */
    applyProposal(p: Proposal): { before: string[]; after: string[] } {
      const before = this.view.slice(0, 10).map(x => x.paper.id)
      this.rankBefore = Object.fromEntries(this.papers.map(x => [x.paper.id, x.rank]))
      if (p.weights) this.weights = { ...this.weights, ...Object.fromEntries(Object.entries(p.weights).filter(([, v]) => typeof v === 'number')) }
      if (p.topPercent != null) this.topPercent = Math.min(100, Math.max(1, Math.round(p.topPercent)))
      if (p.threshold != null) this.threshold = Math.min(1, Math.max(0, p.threshold))
      if (p.filters) this.filters = { ...this.filters, ...p.filters }
      this.lastApplied = { rationale: p.rationale, at: Date.now() }
      const after = this.view.slice(0, 10).map(x => x.paper.id)
      return { before, after }
    },
    clearFilters() { this.filters = {} },

    /** D-33: ONLY the current question folder's notes (Question.md, its seeds/ = knownPapers, the user's notes there). */
    request(): LibraryRequest {
      const vault = useVault()
      const q = vault.currentQuestion
      const notes = (q ? vault.notesIn(q.id) : []).map(n => ({ path: n.path, title: n.title, content: n.content }))
      return LibraryRequest.parse({ notes, topK: this.topK, threshold: this.threshold, topPercent: this.topPercent, sources: this.sources, weights: { ...this.weights }, questionId: q?.id, questionName: q?.name })
    },

    async start() {
      // Q2-2: a new build sends the weights / pass rule / topK shown in the sidebar when they are this question's (its
      // loaded library, or a draft with no library loaded); another question's applied settings are not carried over.
      // Result filters are view-only and never carry into a new library.
      const q = useVault().current
      const keep = !this.libraryId || this.questionId === q
        ? { weights: { ...this.weights }, topK: this.topK, threshold: this.threshold, topPercent: this.topPercent }
        : null
      this.reset()
      if (keep) Object.assign(this, keep)
      let req: LibraryRequest
      try { req = this.request() } catch { this.status = 'error'; this.error = 'No research question selected. Create a research question first.'; return }
      this.questionId = req.questionId ?? null
      this.status = 'running'
      const my = ++this.runCount
      if (import.meta.env.DEV && param('mock')) return this.runMock(req)
      if (isDemoParam()) { this.mode = 'demo'; this.libraryId = 'demo-melanoma'; return this.openStream(`${DEMO_BASE}/stream`, my) }
      let libraryId: string
      try {
        const res = await fetch('/api/library', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) })
        if (my !== this.runCount) return
        if (!res.ok) throw new Error(httpMessage('POST /api/library', res.status))
        const body = await res.json() as { libraryId?: string }
        if (!body.libraryId) throw new Error('POST /api/library returned no libraryId.')
        libraryId = body.libraryId
      } catch (e) {
        if (my !== this.runCount) return
        this.status = 'error'; this.error = e instanceof TypeError ? netMessage('POST /api/library') : (e as Error).message
        return
      }
      this.mode = 'live'; this.libraryId = libraryId
      this.openStream(`/api/library/${encodeURIComponent(libraryId)}/stream`, my)
    },

    openStream(url: string, my: number) {
      let got = false
      const src = new EventSource(url)
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
        src.close()
        if (my !== this.runCount || this.status !== 'running') return
        this.status = 'error'
        this.error = got ? 'Connection to the library stream was lost.' : `The library stream (${url}) is unavailable.`
      }
    },

    async runMock(req: LibraryRequest) {
      if (!import.meta.env.DEV) return
      const { playLibraryMock } = await import('../library/mock')
      this.mode = 'mock'
      this.notice = 'Dev mock (?mock=1): fixture data, not a real run.'
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
        case 'papers': this.streamed = ev.papers; this.total = ev.total; this.passed = ev.passed; break
        case 'done':
          this.status = 'done'; this.total = ev.total; this.passed = ev.passed; this.ms = ev.ms; this.dir = ev.dir
          if (this.mode !== 'demo') { this.libraryId = ev.libraryId; setLastOpened(this.questionId, ev.libraryId); void this.loadHistory(this.questionId) }
          for (const st of this.stages) if (st.status === 'start') st.status = 'done'
          if (!this.runRequest) this.runRequest = { topK: this.topK, threshold: this.threshold, sources: [...this.sources], weights: { ...this.weights } }
          void this.loadAll()
          break
        case 'error': this.status = 'error'; this.error = ev.message; break
      }
    },

    /** Every scored paper, so topK / weights / pass rule can be explored without another run. */
    async loadAll() {
      if (this.mode === 'mock') { this.allPapers = mockAll; return }
      if (!this.libraryId) return
      const url = this.mode === 'demo' ? DEMO_BASE : `/api/library/${encodeURIComponent(this.libraryId)}`
      try {
        const res = await fetch(url)
        if (!res.ok) { this.notice = `${httpMessage('GET ' + url, res.status)} Showing the streamed top ${this.streamed.length} only.`; return }
        const body = await res.json() as { papers?: unknown[] }
        const ok: LibPaper[] = []
        for (const p of body.papers || []) { const r = LibPaper.safeParse(p); if (r.success) ok.push(r.data) }
        if (ok.length) this.allPapers = ok
      } catch { this.notice = `${netMessage('GET ' + url)} Showing the streamed top ${this.streamed.length} only.` }
    },

    /**
     * D-23: "Add seed papers" — resolves DOIs / PMIDs / arXiv ids (POST /api/seeds/resolve) and writes seed notes
     * 'Seeds/S<n> <shortName>.md' so their ids become knownPapers in the next library build.
     */
    async addSeeds(text: string, question?: string) {
      const vault = useVault()
      const q = question ?? vault.current
      if (!q) { this.seedErrors = [{ input: '', message: 'Create a research question first: seeds belong to one question.' }]; return }
      const inputs = [...new Set(text.split(/[\n,;\s]+/).map(s => s.trim()).filter(s => s.length >= 3))].slice(0, 50)
      this.seedErrors = []; this.seedAdded = []; this.seedWarning = null
      if (this.seedQuestion !== q) { this.seedRows = []; this.seedQuestion = q }
      if (!inputs.length) { this.seedErrors = [{ input: '', message: 'Paste at least one DOI, PMID, arXiv or OpenAlex id.' }]; return }
      this.seedBusy = true
      let out: { seeds: Seed[]; errors: { input: string; message: string }[]; warning?: string | null; resolvedVia?: SeedVia[] }
      try {
        if (import.meta.env.DEV && param('mock')) {
          const { mockResolveSeeds } = await import('../library/mock')
          out = mockResolveSeeds(inputs)
        } else {
          const res = await fetch('/api/seeds/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inputs }) })
          if (!res.ok) throw new Error(httpMessage('POST /api/seeds/resolve', res.status))
          const body = await res.json() as { seeds?: unknown[]; errors?: { input: string; message: string }[]; warning?: unknown; resolvedVia?: unknown }
          out = {
            seeds: (body.seeds || []).map(s => Seed.safeParse(s)).filter(r => r.success).map(r => r.data!), errors: body.errors || [],
            warning: typeof body.warning === 'string' && body.warning.trim() ? body.warning.trim() : null,
            resolvedVia: Array.isArray(body.resolvedVia) ? (body.resolvedVia as SeedVia[]).filter(v => v && typeof v.input === 'string' && typeof v.source === 'string') : [],
          }
        }
      } catch (e) {
        this.seedBusy = false
        this.seedErrors = [{ input: '', message: e instanceof TypeError ? netMessage('POST /api/seeds/resolve') : (e as Error).message }]
        return
      }
      // D-36: seeds live in Questions/<q>/seeds/ and are never shared across questions (duplicate = already in THIS question)
      const dir = seedsFolder(q)
      const mine = () => vault.seedsIn(q)
      let n = mine().reduce((m, x) => Math.max(m, Number(x.path.split('/').pop()!.match(/^S(\d+)/)?.[1] || 0)), 0)
      const rows: SeedRow[] = []
      for (const s of out.seeds) {
        const existing = mine().find(x => x.paperId === s.id)
        if (existing) { rows.push({ input: s.input, status: 'duplicate', path: existing.path, message: 'already a seed of this question' }); continue }
        n++
        const note = buildSeedNote({ ...s, n, label: 'S' + n })
        const path = `${dir}/${note.path.split('/').pop()}`
        await vault.upsert({ ...note, path, kind: 'seed', paperId: s.id })
        this.seedAdded.push(path)
        rows.push({ input: s.input, status: 'resolved', path, via: out.resolvedVia?.find(v => v.input === s.input)?.source })
      }
      for (const e of out.errors) rows.push({ input: e.input, status: 'not found', message: e.message })
      this.seedRows = [...rows, ...this.seedRows.filter(r => !rows.some(x => x.input === r.input))].slice(0, 60)
      this.seedErrors = out.errors
      this.seedWarning = out.warning ?? null
      this.seedBusy = false
    },

    /** D-36: uploads a .bib / .ris / CSL JSON / .csv / .txt / .pdf to POST /api/seeds/import, then resolves the ids found. */
    async importSeedFile(file: File, question?: string) {
      this.importNote = null; this.seedErrors = []
      const q = question ?? useVault().current
      if (this.seedQuestion !== q) { this.seedRows = []; this.seedQuestion = q }
      const fd = new FormData(); fd.append('file', file)
      this.seedBusy = true
      let body: { ids?: string[]; format?: string; note?: string; error?: string }
      try {
        const res = await fetch('/api/seeds/import', { method: 'POST', body: fd })
        body = await res.json().catch(() => ({ error: httpMessage('POST /api/seeds/import', res.status) }))
        if (!res.ok) throw new Error(body.error || httpMessage('POST /api/seeds/import', res.status))
      } catch (e) {
        this.seedBusy = false
        this.seedErrors = [{ input: file.name, message: e instanceof TypeError ? netMessage('POST /api/seeds/import') : (e as Error).message }]
        return
      }
      this.seedBusy = false
      const ids = body.ids || []
      this.importNote = `${file.name} (${body.format}): ${ids.length} id${ids.length === 1 ? '' : 's'} found${body.note ? ' · ' + body.note : ''}`
      if (ids.length) await this.addSeeds(ids.join('\n'), question)
    },

    // ---- D-35: History ----
    async loadHistory(questionId: string | null) {
      this.historyBusy = true; this.historyError = null
      try {
        const res = await fetch(`/api/libraries?questionId=${encodeURIComponent(questionId ?? '')}`)
        if (!res.ok) throw new Error(httpMessage('GET /api/libraries', res.status))
        const body = await res.json() as { libraries?: unknown[] }
        this.history = (body.libraries || []).map(x => LibrarySummary.safeParse(x)).filter(r => r.success).map(r => r.data!)
      } catch (e) { this.historyError = e instanceof TypeError ? netMessage('GET /api/libraries') : (e as Error).message }
      finally { this.historyBusy = false }
    },
    /** Loads a stored library into the results without rebuilding. */
    async openStored(id: string, questionId: string | null) {
      const url = `/api/library/${encodeURIComponent(id)}`
      let body: { goals?: Goals | null; papers?: unknown[]; request?: { topK?: number; threshold?: number; topPercent?: number; sources?: SourceName[]; weights?: Weights } }
      try {
        const res = await fetch(url)
        if (!res.ok) { if (res.status === 404) setLastOpened(questionId, null); throw new Error(httpMessage('GET ' + url, res.status)) }
        body = await res.json()
      } catch (e) { this.historyError = e instanceof TypeError ? netMessage('GET ' + url) : (e as Error).message; return false }
      this.reset()
      ++this.runCount
      const ok: LibPaper[] = []
      for (const p of body.papers || []) { const r = LibPaper.safeParse(p); if (r.success) ok.push(r.data) }
      const rq = body.request || {}
      if (rq.topK) this.topK = rq.topK
      if (rq.threshold != null) this.threshold = rq.threshold
      if (rq.topPercent != null) this.topPercent = rq.topPercent
      this.runRequest = { topK: rq.topK ?? this.topK, threshold: rq.threshold ?? this.threshold, sources: rq.sources ?? [...this.sources], weights: rq.weights ?? { ...this.weights } }
      this.weights = { ...this.runRequest.weights }
      this.libraryId = id; this.questionId = questionId; this.mode = 'live'; this.status = 'done'
      this.goals = body.goals ?? null
      this.allPapers = ok; this.streamed = ok.slice(0, this.topK)
      this.total = ok.length; this.passed = ok.filter(p => p.passed).length
      for (const st of this.stages) st.status = 'done'
      // Q-1: the settings the viewer last used on this library win over the build's
      try {
        const s = JSON.parse(localStorage.getItem(LIB_SETTINGS_KEY(id)) || 'null') as Partial<LibSettings> & { topK?: number } | null
        if (s && typeof s === 'object') {
          if (s.weights) this.weights = { ...this.weights, ...s.weights }
          if (typeof s.topPercent === 'number') this.topPercent = s.topPercent
          if (typeof s.threshold === 'number') this.threshold = s.threshold
          if (s.filters && typeof s.filters === 'object') this.filters = s.filters
          if (typeof s.topK === 'number') this.topK = s.topK
        }
      } catch { /* storage blocked */ }
      setLastOpened(questionId, id)
      return true
    },
    async renameStored(id: string, name: string) {
      if (isDemoParam()) { this.historyError = 'Demo mode (?demo=1) is read-only: nothing is written to your workspace.'; return }
      const res = await fetch(`/api/library/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }).catch(() => null)
      if (!res?.ok) { this.historyError = res ? httpMessage('PATCH /api/library/' + id, res.status) : netMessage('PATCH /api/library'); return }
      const r = LibrarySummary.safeParse(await res.json())
      if (r.success) { const i = this.history.findIndex(h => h.libraryId === id); if (i >= 0) this.history[i] = r.data }
    },
    async deleteStored(id: string, questionId: string | null) {
      if (isDemoParam()) { this.historyError = 'Demo mode (?demo=1) is read-only: nothing is written to your workspace.'; return }
      const res = await fetch(`/api/library/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)
      if (!res?.ok) { this.historyError = res ? httpMessage('DELETE /api/library/' + id, res.status) : netMessage('DELETE /api/library'); return }
      this.history = this.history.filter(h => h.libraryId !== id)
      if (lastOpened(questionId) === id) setLastOpened(questionId, null)
      if (this.libraryId === id) this.reset()
    },
    exportUrl(id: string) { return `/api/library/${encodeURIComponent(id)}/export` },

    /** The per-paper JSON file (GET /api/library/:id/papers/:paperId); the dev mock serves it from memory. */
    async fetchPaperJson(paperId: string): Promise<unknown> {
      if (this.mode === 'mock') {
        const p = mockAll.find(x => x.paper.id === paperId) || this.streamed.find(x => x.paper.id === paperId)
        if (!p) throw new Error(`Paper ${paperId} is not in this library.`)
        return JSON.parse(JSON.stringify(p))
      }
      if (!this.libraryId) throw new Error('No library loaded.')
      const url = this.mode === 'demo'
        ? `${DEMO_BASE}/papers/${encodeURIComponent(paperId)}`
        : `/api/library/${encodeURIComponent(this.libraryId)}/papers/${encodeURIComponent(paperId)}`
      let res: Response
      try { res = await fetch(url) } catch { throw new Error(netMessage('GET ' + url)) }
      if (!res.ok) throw new Error(httpMessage('GET ' + url, res.status))
      return res.json()
    },
  },
})
