// Owner: lane A1. Pure ranking logic (spec §2): seed-link features with the date check, lanes, within-lane
// order before/after the judge, and the deterministic "why ranked here" string. No I/O here.
import type { Candidate, Features, Judgement, Lane, Paper, RouteId, Seed, Signal } from '@shared/contracts'

export interface PoolItem {
  paper: Paper
  routes: Set<RouteId>
  signals: Signal[]
  /** seed numbers whose reference list contains this paper (before the date check) */
  inRaw: Set<number>
  pubmedRank: number | null
}

export interface SeedLite { n: number; id: string; year: number | null; label: string; shortName: string }

const OA = (id: string) => ({ name: 'OpenAlex', url: `https://api.openalex.org/works/${id}` })

/** Date check (spec §1.4): an in-link from seed s to candidate c counts only if year(c) ≤ year(s) + 1. */
export function inLinkAllowed(candYear: number | null, seedYear: number | null): boolean {
  if (candYear == null || seedYear == null) return true
  return candYear <= seedYear + 1
}

/** Computes out/in/links and adds cites_seed / link_dropped_date signals. Mutates item.signals. */
export function computeLinks(item: PoolItem, seeds: SeedLite[]): Pick<Features, 'links' | 'out' | 'in'> {
  const refs = new Set(item.paper.referencedWorks)
  const out = seeds.filter(s => refs.has(s.id)).map(s => s.n)
  const inn: number[] = []
  for (const n of [...item.inRaw].sort((a, b) => a - b)) {
    const s = seeds.find(x => x.n === n)!
    if (inLinkAllowed(item.paper.year, s.year)) inn.push(n)
    else item.signals.push({
      kind: 'link_dropped_date', route: 'R1', seedNs: [n], source: OA(s.id),
      note: `${s.label} (${s.year}) lists this ${item.paper.year} paper as a reference; link dropped by the date check`,
    })
  }
  if (out.length && !item.signals.some(g => g.kind === 'cites_seed')) {
    const route: RouteId = item.routes.has('R2') ? 'R2' : [...item.routes][0] ?? 'R1'
    item.signals.push({ kind: 'cites_seed', route, seedNs: out, source: OA(item.paper.id), note: `cites ${out.map(n => 'S' + n).join(', ')}` })
  }
  const links = new Set([...out, ...inn]).size
  return { links, out, in: inn }
}

export function freshCutoff(months: number, today = new Date()): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, today.getUTCDate()))
  return d.toISOString().slice(0, 10)
}

/** Lane precedence (spec §2.2): Retracted > NotAssessable > Core > Fresh > Linked > Bridges. */
export function assignLane(p: Pick<Paper, 'isRetracted' | 'abstract' | 'publicationDate' | 'year'>, links: number, freshFrom: string): Lane {
  if (p.isRetracted) return 'Retracted'
  if (!p.abstract && links < 3) return 'NotAssessable'
  if (links >= 2) return 'Core'
  const date = p.publicationDate ?? (p.year ? `${p.year}-12-31` : '')
  if (date && date >= freshFrom && links < 2) return 'Fresh'
  if (links === 1) return 'Linked'
  return 'Bridges'
}

/** Mid-rank percentile of each value within the list (0..1). */
export function percentiles(values: number[]): number[] {
  const n = values.length
  if (!n) return []
  const sorted = [...values].sort((a, b) => a - b)
  const lower = (v: number) => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m } return lo }
  const upper = (v: number) => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m } return lo }
  return values.map(v => { const l = lower(v), u = upper(v); return (l + (u - l) / 2) / n })
}

/** Pre-judge comparator within a lane: links desc, citedByCount desc (Bridges: pubmedRank asc). */
export function preJudgeCompare(lane: Lane) {
  return (a: Candidate, b: Candidate) => {
    if (lane === 'Bridges') {
      const ra = a.features.pubmedRank ?? 1e9, rb = b.features.pubmedRank ?? 1e9
      if (ra !== rb) return ra - rb
      const ea = a.features.eQuestion ?? -1, eb = b.features.eQuestion ?? -1
      if (ea !== eb) return eb - ea
      return b.paper.citedByCount - a.paper.citedByCount
    }
    if (a.features.links !== b.features.links) return b.features.links - a.features.links
    if (a.paper.citedByCount !== b.paper.citedByCount) return b.paper.citedByCount - a.paper.citedByCount
    return a.paper.id < b.paper.id ? -1 : 1
  }
}

/** J (lens-neutral): mean facet grade / 3 × (verified ? 1 : 0.6). */
export function judgeScore(j: Judgement): number {
  const f = j.facets
  return ((f.topic + f.method + f.population) / 3 / 3) * (j.verified ? 1 : 0.6)
}

export interface ScoreParts { J: number; R: number; G: number; impact: number }
export const WEIGHTS = { a: 0.45, b: 0.2, c: 0.3, d: 0.05 }
export const combine = (p: ScoreParts) => WEIGHTS.a * p.J + WEIGHTS.b * p.R + WEIGHTS.c * p.G + WEIGHTS.d * p.impact

/**
 * Orders every lane and fills score + rank. Judged items (score formula) come first, unjudged keep the
 * pre-judge order below them. `rerankPct` maps paperId → rerank percentile (0..1) among reranked papers.
 */
export function orderLanes(cands: Candidate[], rerankPct: Map<string, number>, similarity?: (a: string, b: string) => number | null): Candidate[] {
  const gp = percentiles(cands.map(c => c.features.links))
  const G = new Map(cands.map((c, i) => [c.paper.id, gp[i]]))
  const byLane = new Map<Lane, Candidate[]>()
  for (const c of cands) { const l = byLane.get(c.lane) ?? []; l.push(c); byLane.set(c.lane, l) }
  const out: Candidate[] = []
  for (const [lane, list] of byLane) {
    for (const c of list) {
      const parts: ScoreParts = { J: c.judgement ? judgeScore(c.judgement) : 0, R: rerankPct.get(c.paper.id) ?? 0, G: G.get(c.paper.id) ?? 0, impact: c.features.impact ?? 0 }
      c.score = Math.round(combine(parts) * 1e4) / 1e4
    }
    const judged = list.filter(c => c.judgement).sort((a, b) => b.score - a.score || preJudgeCompare(lane)(a, b))
    const rest = list.filter(c => !c.judgement).sort(preJudgeCompare(lane))
    const ordered = [...judged, ...rest]
    if (similarity) diversify(ordered, similarity)
    ordered.forEach((c, i) => { c.rank = i + 1; out.push(c) })
  }
  return out
}

/** Spec §2.3 diversity: an item whose cosine with an item above exceeds 0.92 moves below the next one (top `k` only). */
export function diversify(list: Candidate[], similarity: (a: string, b: string) => number | null, k = 60, threshold = 0.92) {
  const n = Math.min(list.length, k)
  const moved = new Set<string>()
  for (let i = 1; i < n - 1; i++) {
    if (moved.has(list[i].paper.id)) continue
    const dup = list.slice(0, i).some(above => (similarity(above.paper.id, list[i].paper.id) ?? 0) > threshold)
    if (dup) { moved.add(list[i].paper.id); const t = list[i]; list[i] = list[i + 1]; list[i + 1] = t }
  }
}

function seedList(ns: number[], total: number, verb: string): string | null {
  if (!ns.length) return null
  if (ns.length === total && total > 1) return `${verb} all ${total} seeds`
  return `${verb} ${ns.map(n => 'S' + n).join(', ')}`
}

const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }

/** Deterministic "why ranked here" from features. Never LLM text. */
export function whyRanked(c: Candidate, nSeeds: number, rerankPct?: number | null): string {
  const f = c.features
  const parts = [`#${c.rank}`, c.lane === 'NotAssessable' ? 'Not assessable' : c.lane]
  if (c.lane === 'Retracted') parts.push('retracted (OpenAlex)')
  if (c.lane === 'NotAssessable') parts.push('no abstract')
  const cites = seedList(f.out, nSeeds, 'cites'); if (cites) parts.push(cites)
  const citedBy = seedList(f.in, nSeeds, 'cited by'); if (citedBy) parts.push(citedBy)
  if (!f.out.length && !f.in.length) parts.push('no seed links')
  if (f.pubmedRank != null) parts.push(`PubMed similar #${f.pubmedRank}`)
  parts.push(`${c.paper.citedByCount} citation${c.paper.citedByCount === 1 ? '' : 's'}`)
  if (c.paper.year) parts.push(String(c.paper.year))
  parts.push(`routes ${c.routes.join(', ')}`)
  if (rerankPct != null) parts.push(`question match ${ordinal(Math.round(rerankPct * 100))} pct`)
  if (c.judgement) {
    const j = c.judgement
    const mean = (j.facets.topic + j.facets.method + j.facets.population) / 3
    parts.push(`judge ${Number.isInteger(mean) ? mean : mean.toFixed(1)}/3 ${j.verified ? 'verified' : 'unverified'}`)
  }
  if (c.signals.some(s => s.kind === 'link_dropped_date')) parts.push('date check dropped a link')
  return parts.join(' · ')
}

export function toSeedLite(s: Seed): SeedLite { return { n: s.n, id: s.id, year: s.year, label: s.label, shortName: s.shortName } }
