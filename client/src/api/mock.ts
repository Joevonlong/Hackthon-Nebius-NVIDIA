// Dev mock of the discovery stream. Owner: lane C.
// Turns docs/data/melanoma-lanes-snapshot.json (a real R1–R3 run, 13:00) into contract-valid RunEvents with
// realistic pacing. Abstracts, facet scores and judgements are NOT real: they are labeled "mock" so nobody
// mistakes them for model output. Used with ?mock=1 or when the server is unavailable.
import snapshot from '../../../docs/data/melanoma-lanes-snapshot.json'
import { RunEvent, type Candidate, type Judgement, type Lane, type Paper, type RouteId, type RunRequest, type Seed, type Signal } from '@shared/contracts'
import { PRESETS } from '@shared/config'

interface SnapItem { id: string; t: string; y: number; dt: string; c: number; k: string; v: string; a: string; d: string; out: number[]; inn: number[]; n: number; routes: string[]; pmr: number | null; retr: boolean; oa: boolean | null; lane: string }
const SNAP = snapshot as unknown as { counts: Record<string, number>; routes: Record<string, number>; union: number; top: Record<string, SnapItem[]> }

const BASE_SEEDS = [
  { id: 'W2332292689', doi: '10.1126/science.aad0501', short: 'Tirosh 2016', author: 'Itay Tirosh', t: 'Dissecting the multicellular ecosystem of metastatic melanoma by single-cell RNA-seq', v: 'Science', y: 2016, c: 4914 },
  { id: 'W2899145148', doi: '10.1016/j.cell.2018.10.038', short: 'Sade-Feldman 2018', author: 'Moshe Sade-Feldman', t: 'Defining T Cell States Associated with Response to Checkpoint Immunotherapy in Melanoma', v: 'Cell', y: 2018, c: 2040 },
  { id: 'W3184584468', doi: '10.1038/s41586-021-03704-y', short: 'Oliveira 2021', author: 'Giacomo Oliveira', t: 'Phenotype, specificity and avidity of antitumour CD8+ T cells in melanoma', v: 'Nature', y: 2021, c: 561 },
  { id: 'W4229030906', doi: '10.1038/s41586-022-04682-5', short: 'Oliveira 2022', author: 'Giacomo Oliveira', t: 'Landscape of helper and regulatory antitumour CD4+ T cells in melanoma', v: 'Nature', y: 2022, c: 199 },
  { id: 'W3165815938', doi: '10.1158/1078-0432.ccr-21-1694', short: 'Smalley 2021', author: 'Inna Smalley', t: 'Single-Cell Characterization of the Immune Microenvironment of Melanoma Brain and Leptomeningeal Metastases', v: 'Clinical Cancer Research', y: 2021, c: 161 },
]

const MOCK_TAG = '[mock abstract · dev fixture, not the real abstract] '
const mockAbstract = (it: { t: string }) => `${MOCK_TAG}${it.t}. This placeholder text stands in for the OpenAlex or PubMed abstract so the preview, quote highlighting and offsets can be built before the backend lands.`

const lastName = (a: string) => { const p = a.trim().split(/\s+/); return p[p.length - 1] || a }
const norm = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')

function toPaper(it: SnapItem): Paper {
  const abstract = mockAbstract(it)
  return {
    id: it.id, doi: it.d || null, pmid: null, pmcid: null, title: it.t, authors: [it.a], year: it.y,
    publicationDate: it.dt.length === 10 ? it.dt : null, venue: it.v || null, type: it.k, citedByCount: it.c,
    citationPct: null, isRetracted: it.retr, isOa: it.oa, oaUrl: null, abstract, abstractSource: 'openalex',
    referencedWorks: [], url: `https://openalex.org/${it.id}`,
  }
}

function seedFrom(n: number, input: string, s: typeof BASE_SEEDS[number]): Seed {
  return {
    id: s.id, doi: s.doi, pmid: null, pmcid: null, title: s.t, authors: [s.author], year: s.y, publicationDate: null,
    venue: s.v, type: 'article', citedByCount: s.c, citationPct: null, isRetracted: false, isOa: null, oaUrl: null,
    abstract: mockAbstract(s), abstractSource: 'openalex', referencedWorks: [], url: `https://openalex.org/${s.id}`,
    n, label: 'S' + n, shortName: s.short, input,
  }
}

// Title keyword rule as a stand-in for embedding facet scores (same rule as the docs/plan.html mockup).
const reTopic = /melanoma/i, reTopic2 = /cancer|tumou?r|neoantigen|immunotherap|checkpoint|pd-1|lymphocyte|t[- ]cell/i
const reMethod = /single[- ]cell|scrna|rna[- ]seq|sequencing|transcriptom|multiomic|-omics|spatial|profil|align|aligner|toolkit|package|format|algorithm|framework|cluster/i
const rePop = /patient|human|metasta|clinical|survival/i
const facetScores = (t: string) => ({
  topic: reTopic.test(t) ? 0.9 : reTopic2.test(t) ? 0.6 : 0.2,
  method: reMethod.test(t) ? 0.9 : 0.25,
  population: rePop.test(t) ? 0.8 : reTopic.test(t) ? 0.5 : 0.2,
})

const rangeList = (a: number[], total: number) => a.length === total ? `all ${total} seeds` : a.map(n => 'S' + n).join(', ')

function signalsFor(it: SnapItem, seedCount: number): Signal[] {
  const out: Signal[] = []
  const oa = { name: 'OpenAlex referenced_works', url: `https://api.openalex.org/works/${it.id}` }
  if (it.out.length) out.push({ kind: 'cites_seed', route: (it.routes.includes('R2') ? 'R2' : 'R1') as RouteId, seedNs: it.out, source: oa })
  if (it.inn.length) out.push({ kind: 'cited_by_seed', route: 'R1', seedNs: it.inn, source: oa })
  if (it.routes.includes('R3')) out.push({ kind: 'pubmed_similar', route: 'R3', seedNs: [1].filter(n => n <= seedCount), value: it.pmr ?? undefined, source: { name: 'PubMed similar articles (elink)', url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?cmd=neighbor_score' } })
  return out
}

function whyRanked(it: SnapItem, rank: number, seedCount: number): string {
  const parts = [`#${rank} · ${it.lane}`]
  if (it.out.length) parts.push(`cites ${rangeList(it.out, seedCount)} (OpenAlex)`)
  if (it.inn.length) parts.push(`cited by ${rangeList(it.inn, seedCount)} (OpenAlex)`)
  if (it.lane === 'Bridges' && it.pmr) parts.push(`PubMed similar #${it.pmr}`)
  parts.push(`${it.c.toLocaleString('en')} citations`, String(it.y), `routes ${it.routes.join('+')}`)
  return parts.join(' · ')
}

function toCandidate(it: SnapItem, rank: number, seedCount: number): Candidate {
  const lane = it.lane as Lane
  return {
    paper: toPaper(it), lane, routes: it.routes as RouteId[], signals: signalsFor(it, seedCount),
    features: {
      links: it.n, out: it.out, in: it.inn, coupling: null, eSeed: null, eQuestion: null,
      eFacets: lane === 'Retracted' ? null : facetScores(it.t), rerank: null, impact: null, pubmedRank: it.pmr,
    },
    judgement: null, score: 100 - rank, rank, whyRanked: whyRanked(it, rank, seedCount),
  }
}

function mockJudgement(c: Candidate, i: number): Judgement {
  const f = facetScores(c.paper.title)
  const g = (x: number) => Math.max(0, Math.min(3, Math.round(x * 3)))
  const abstract = c.paper.abstract || ''
  const start = abstract.indexOf(c.paper.title)
  const verified = i % 6 !== 4 // one in six left unverified to exercise the warning state
  const quote = verified ? c.paper.title : c.paper.title.replace(/\b(\w+)\b/, '$1 [paraphrased]')
  const seedLinks = [...c.features.out.map(n => ({ seedN: n, relation: 'cites' })), ...c.features.in.map(n => ({ seedN: n, relation: 'cited by' }))]
  return {
    model: 'mock-judge (dev fixture)', relevance: g((f.topic + f.method + f.population) / 3 + 0.15),
    facets: { topic: g(f.topic), method: g(f.method), population: g(f.population) },
    paperType: c.paper.type === 'review' ? 'review' : 'primary',
    why: `Mock judge sentence: placeholder for the Nemotron "why read it" line, tying "${c.paper.title.slice(0, 60)}…" to the question.`,
    quote, quoteRef: verified && start >= 0 ? { source: 'openalex', start, end: start + c.paper.title.length } : null,
    verified, uncertainty: 'Mock: the judge would say here what the abstract does not answer.', seedLinks,
  }
}

type Step = { at: number; ev: RunEvent }

export function buildMockTimeline(req: RunRequest): Step[] {
  const runId = 'mock-' + Date.now().toString(36)
  const allItems = Object.values(SNAP.top).flat()
  const seeds: Seed[] = []
  req.seeds.forEach(input => {
    const base = BASE_SEEDS.find(s => norm(s.doi) === norm(input) || s.id === input.trim())
    const kept = allItems.find(it => (it.d && norm(it.d) === norm(input)) || it.id === input.trim())
    const n = seeds.length + 1
    if (base) seeds.push(seedFrom(n, input, base))
    else if (kept) seeds.push(seedFrom(n, input, { id: kept.id, doi: kept.d, short: `${lastName(kept.a)} ${kept.y}`, author: kept.a, t: kept.t, v: kept.v, y: kept.y, c: kept.c }))
  })
  if (!seeds.length) BASE_SEEDS.forEach((s, i) => seeds.push(seedFrom(i + 1, s.doi, s)))
  const seedIds = new Set(seeds.map(s => s.id))
  const seedCount = Math.min(5, seeds.length)

  const candidates: Candidate[] = []
  for (const [lane, items] of Object.entries(SNAP.top)) {
    items.filter(it => !seedIds.has(it.id)).forEach((it, i) => candidates.push(toCandidate({ ...it, lane }, i + 1, seedCount)))
  }
  const counts: Record<string, number> = { Core: 0, Fresh: 0, Linked: 0, Bridges: 0, NotAssessable: 0, Retracted: 0, ...SNAP.counts }
  const cfg = PRESETS[req.preset ?? 'demo']
  const steps: Step[] = []
  let t = 0
  const at = (dt: number, ev: RunEvent) => { t += dt; steps.push({ at: t, ev }) }

  at(0, { type: 'run', runId, question: req.question, preset: req.preset ?? 'demo', config: { ...cfg, mock: true } })
  at(150, { type: 'stage', stage: 'resolve', status: 'start' })
  at(450, { type: 'seeds', seeds })
  at(50, { type: 'stage', stage: 'resolve', status: 'done', count: seeds.length, ms: 480 })
  at(100, { type: 'facets', facets: [
    { key: 'topic', label: 'Melanoma immune cells', query: 'melanoma tumor-infiltrating immune cells' },
    { key: 'method', label: 'Single-cell methods', query: 'single-cell RNA sequencing methods' },
    { key: 'population', label: 'Patients with melanoma', query: 'human melanoma patient samples' },
  ] })
  at(100, { type: 'stage', stage: 'r1', status: 'start' })
  at(150, { type: 'stage', stage: 'r2', status: 'start' })
  at(150, { type: 'stage', stage: 'r3', status: 'start' })
  at(350, { type: 'stage', stage: 'r1', status: 'done', count: SNAP.routes.R1, ms: 1210 })
  at(400, { type: 'stage', stage: 'r3', status: 'done', count: SNAP.routes.R3, ms: 1640 })
  at(350, { type: 'stage', stage: 'r2', status: 'done', count: SNAP.routes.R2, ms: 2380 })
  at(50, { type: 'stage', stage: 'r4', status: 'skipped', message: 'mock: query expansion not in snapshot' })
  at(50, { type: 'stage', stage: 'scout', status: 'start' })
  at(250, { type: 'agent', step: 1, tool: 'tavily_search', input: 'single-cell melanoma immune atlas 2025', output: 'mock: 5 web results, 2 with DOIs' })
  at(250, { type: 'agent', step: 2, tool: 'openalex_lookup', input: '2 DOIs from step 1', output: 'mock: both already in pool (R2)' })
  at(250, { type: 'agent', step: 3, tool: 'pubmed_similar', input: 'PMID of S5', output: 'mock: 0 new papers' })
  at(100, { type: 'stage', stage: 'scout', status: 'done', count: 0, ms: 900, message: 'mock: no new papers' })
  at(100, { type: 'stage', stage: 'lanes', status: 'start' })
  at(300, { type: 'candidates', candidates, counts, total: SNAP.union })
  at(50, { type: 'stage', stage: 'lanes', status: 'done', count: SNAP.union, ms: 120 })
  at(100, { type: 'stage', stage: 'embed', status: 'start' })
  at(500, { type: 'stage', stage: 'embed', status: 'done', count: 600, ms: 610, message: 'mock: title keyword rule stands in for facet embeddings' })
  at(50, { type: 'stage', stage: 'rerank', status: 'skipped', message: 'mock' })
  at(50, { type: 'stage', stage: 'judge', status: 'start' })
  const toJudge = [...candidates.filter(c => c.lane === 'Core'), ...candidates.filter(c => c.lane === 'Linked').slice(0, 4), ...candidates.filter(c => c.lane === 'Bridges').slice(0, 3)]
  toJudge.forEach((c, i) => at(110, { type: 'judgement', paperId: c.paper.id, judgement: mockJudgement(c, i) }))
  at(50, { type: 'stage', stage: 'judge', status: 'done', count: toJudge.length, ms: 1900 })
  at(50, { type: 'stage', stage: 'verify', status: 'done', count: toJudge.filter((_, i) => i % 6 !== 4).length, ms: 4 })
  at(100, { type: 'done', runId, counts, total: SNAP.union, ms: t + 100 })

  for (const s of steps) { const r = RunEvent.safeParse(s.ev); if (!r.success) console.warn('[mock] invalid event', s.ev.type, r.error.issues.slice(0, 2)) }
  return steps
}

/** Plays the mock timeline; returns a stop function. Reduced motion → events arrive almost at once. */
export function playMock(req: RunRequest, onEvent: (ev: RunEvent) => void): () => void {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const timers = buildMockTimeline(req).map(s => setTimeout(() => onEvent(s.ev), reduce ? s.at / 10 : s.at))
  return () => timers.forEach(clearTimeout)
}
