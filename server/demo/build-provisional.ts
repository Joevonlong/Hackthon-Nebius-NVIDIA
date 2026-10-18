// Builds server/demo/recordings/melanoma.json from the measured fixtures in docs/data (provisional demo).
// Replaced by a real recording from scripts/record-demo.ts. Run: pnpm tsx server/demo/build-provisional.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { RunSnapshot, type Candidate, type Seed, type RunEvent, type Lane, type RouteId } from '../../shared/contracts'

const lanes = JSON.parse(readFileSync('docs/data/melanoma-lanes-snapshot.json', 'utf8'))
const citers: { id: string; title: string; year: number; cites: number; seeds: string[]; doi: string; type: string; venue: string; author: string }[] =
  JSON.parse(readFileSync('docs/data/melanoma-multi-seed-citers.json', 'utf8'))

const QUESTION = 'Which single-cell methods help study melanoma immune cells?'
const SEED_DEFS = [
  { n: 1, id: 'W2332292689', short: 'Tirosh 2016', title: 'Dissecting the multicellular ecosystem of metastatic melanoma by single-cell RNA-seq', venue: 'Science', year: 2016, cites: 4914, doi: '10.1126/science.aad0501', author: 'Itay Tirosh' },
  { n: 2, id: 'W2899145148', short: 'Sade-Feldman 2018', title: 'Defining T Cell States Associated with Response to Checkpoint Immunotherapy in Melanoma', venue: 'Cell', year: 2018, cites: 2040, doi: '10.1016/j.cell.2018.10.038', author: 'Moshe Sade-Feldman' },
  { n: 3, id: 'W3184584468', short: 'Oliveira 2021', title: 'Phenotype, specificity and avidity of antitumour CD8+ T cells in melanoma', venue: 'Nature', year: 2021, cites: 561, doi: '10.1038/s41586-021-03704-y', author: 'Giacomo Oliveira' },
  { n: 4, id: 'W4229030906', short: 'Oliveira 2022', title: 'Landscape of helper and regulatory antitumour CD4+ T cells in melanoma', venue: 'Nature', year: 2022, cites: 199, doi: '10.1038/s41586-022-04682-5', author: 'Giacomo Oliveira' },
  { n: 5, id: 'W3165815938', short: 'Smalley 2021', title: 'Single-Cell Characterization of the Immune Microenvironment of Melanoma Brain and Leptomeningeal Metastases', venue: 'Clin Cancer Res', year: 2021, cites: 161, doi: '10.1158/1078-0432.ccr-21-1694', author: 'Inna Smalley' },
]

const basePaper = (o: { id: string; doi: string | null; title: string; author: string; year: number | null; date: string | null; venue: string | null; type: string | null; cites: number; retracted?: boolean; oa?: boolean | null }) => ({
  id: o.id, doi: o.doi ? o.doi.toLowerCase().replace(/^https?:\/\/doi\.org\//, '') : null, pmid: null, pmcid: null,
  title: o.title, authors: o.author ? [o.author] : [], year: o.year, publicationDate: o.date, venue: o.venue || null, type: o.type,
  citedByCount: o.cites, citationPct: null, isRetracted: !!o.retracted, isOa: o.oa ?? null, oaUrl: null,
  abstract: null, abstractSource: null, referencedWorks: [], url: `https://openalex.org/${o.id}`,
})

const seeds: Seed[] = SEED_DEFS.map(s => ({
  ...basePaper({ id: s.id, doi: s.doi, title: s.title, author: s.author, year: s.year, date: null, venue: s.venue, type: 'article', cites: s.cites }),
  n: s.n, label: `S${s.n}`, shortName: s.short, input: s.doi,
}))

const SRC = { name: 'OpenAlex', url: 'https://api.openalex.org/works' }
const PUBMED = { name: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov' }
const nameOf = (n: number) => `S${n}`

function whyRanked(lane: Lane, out: number[], inn: number[], routes: RouteId[], pmr: number | null, cites: number, year: number | null): string {
  const links = [...new Set([...out, ...inn])].sort()
  const parts: string[] = []
  if (links.length) {
    const how: string[] = []
    if (out.length) how.push(`cites ${out.map(nameOf).join(', ')}`)
    if (inn.length) how.push(`cited by ${inn.map(nameOf).join(', ')}`)
    parts.push(`${links.length} of 5 seeds linked (${how.join('; ')})`)
  } else parts.push('no direct seed link; surfaced by PubMed similarity')
  if (pmr != null) parts.push(`PubMed similar rank ${pmr}`)
  parts.push(`found by ${routes.join(', ')}`)
  parts.push(`${cites.toLocaleString('en')} citations${year ? `, ${year}` : ''}`)
  if (lane === 'Retracted') parts.unshift('flagged as retracted in OpenAlex')
  return parts.join(' · ')
}

type Row = { id: string; t: string; y: number | null; dt: string | null; c: number; k: string | null; v: string; a: string; d: string; out: number[]; inn: number[]; n: number; routes: RouteId[]; pmr: number | null; retr: boolean; oa: boolean | null; lane: Lane }

function toCandidate(r: Row, rank: number): Candidate {
  const links = [...new Set([...r.out, ...r.inn])]
  const signals: Candidate['signals'] = []
  if (r.out.length) signals.push({ kind: 'cites_seed', route: r.routes.includes('R2') ? 'R2' : 'R1', seedNs: r.out, source: SRC, note: `cites ${r.out.map(nameOf).join(', ')}` })
  if (r.inn.length) signals.push({ kind: 'cited_by_seed', route: 'R1', seedNs: r.inn, source: SRC, note: `cited by ${r.inn.map(nameOf).join(', ')}` })
  if (r.pmr != null) signals.push({ kind: 'pubmed_similar', route: 'R3', seedNs: [], value: r.pmr, source: PUBMED })
  return {
    paper: basePaper({ id: r.id, doi: r.d || null, title: r.t, author: r.a, year: r.y, date: r.dt && /^\d{4}-\d{2}-\d{2}$/.test(r.dt) ? r.dt : null, venue: r.v, type: r.k, cites: r.c, retracted: r.retr, oa: r.oa }),
    lane: r.lane, routes: r.routes, signals,
    features: { links: links.length, out: r.out, in: r.inn, coupling: null, eSeed: null, eQuestion: null, eFacets: null, rerank: null, impact: null, pubmedRank: r.pmr },
    judgement: null,
    score: r.lane === 'Bridges' || r.lane === 'Retracted' ? 1 / (r.pmr ?? 100) : links.length + Math.log10(1 + r.c) / 10,
    rank, whyRanked: whyRanked(r.lane, r.out, r.inn, r.routes, r.pmr, r.c, r.y),
  }
}

// Core: snapshot top 10 + remaining top multi-seed citers (all R2: they cite the seeds), up to 40 per lane.
const SEND = 40
const core: Row[] = [...lanes.top.Core]
const have = new Set(core.map(r => r.id))
const extra = citers.filter(c => !have.has(c.id)).sort((a, b) => b.seeds.length - a.seeds.length || b.cites - a.cites)
for (const c of extra) {
  if (core.length >= SEND) break
  core.push({ id: c.id, t: c.title, y: c.year, dt: String(c.year), c: c.cites, k: c.type, v: c.venue, a: c.author, d: c.doi.replace(/^https?:\/\/doi\.org\//, ''), out: c.seeds.map(s => Number(s.slice(1))), inn: [], n: c.seeds.length, routes: ['R2'], pmr: null, retr: false, oa: null, lane: 'Core' })
}
const byLane: Record<string, Row[]> = { Core: core, Fresh: lanes.top.Fresh, Linked: lanes.top.Linked, Bridges: lanes.top.Bridges, Retracted: lanes.top.Retracted }
const candidates: Candidate[] = []
for (const lane of ['Core', 'Fresh', 'Linked', 'Bridges', 'Retracted']) byLane[lane].forEach((r, i) => candidates.push(toCandidate(r, i + 1)))

const counts: Record<string, number> = { Core: 545, Linked: 216, Bridges: 218, Retracted: 1 }
const total = 980
const facets = [
  { key: 'topic' as const, label: 'Topic', query: 'melanoma tumor-infiltrating immune cells' },
  { key: 'method' as const, label: 'Method', query: 'single-cell RNA sequencing' },
  { key: 'population' as const, label: 'Population', query: 'melanoma patients' },
]
const events: RunEvent[] = [
  { type: 'run', runId: 'demo-melanoma', question: QUESTION, preset: 'demo', config: { provisional: true, sendPerLane: SEND, seeds: 5 } },
  { type: 'stage', stage: 'resolve', status: 'start' },
  { type: 'seeds', seeds },
  { type: 'stage', stage: 'resolve', status: 'done', count: 5, ms: 1200 },
  { type: 'facets', facets },
  { type: 'stage', stage: 'r1', status: 'start' },
  { type: 'stage', stage: 'r1', status: 'done', count: 238, ms: 2100 },
  { type: 'stage', stage: 'r2', status: 'start' },
  { type: 'stage', stage: 'r2', status: 'done', count: 494, ms: 3400 },
  { type: 'stage', stage: 'r3', status: 'start' },
  { type: 'stage', stage: 'r3', status: 'done', count: 283, ms: 1800 },
  { type: 'stage', stage: 'lanes', status: 'start' },
  { type: 'candidates', candidates, counts, total },
  { type: 'stage', stage: 'lanes', status: 'done', count: total, ms: 90 },
  { type: 'done', runId: 'demo-melanoma', counts, total, ms: 8600 },
]
const snapshot = RunSnapshot.parse({ runId: 'demo-melanoma', question: QUESTION, preset: 'demo', seeds, facets, candidates, counts, total, events })
mkdirSync('server/demo/recordings', { recursive: true })
writeFileSync('server/demo/recordings/melanoma.json', JSON.stringify(snapshot, null, 1) + '\n')
console.log(`wrote melanoma.json: ${candidates.length} candidates, ${events.length} events`, counts)
