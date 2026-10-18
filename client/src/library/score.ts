// Library score helpers (lane U1). The formula follows docs/LIBRARY_SPEC.md §5:
// contribution_i = w_i × value_i / Σ_{assessed} w_j  (null value = not assessed → its weight is redistributed).
// Pass rule (D-27): passed = rank within the top X% of the scored, non-excluded papers AND total ≥ the floor.
// Grades and verdicts (D-25): A ≥ 0.85, B ≥ 0.70, C ≥ 0.55, D ≥ 0.40, else E; one plain sentence per paper.
import type { Filters, LibPaper, ScoreComponent, Weights } from '@shared/library'

export type ComponentKey = ScoreComponent['key']
export const COMPONENT_KEYS: ComponentKey[] = ['relevance', 'graph', 'citations', 'venue', 'authors', 'llm']
export const COMPONENT_META: Record<ComponentKey, { label: string; short: string; plain: string }> = {
  relevance: { label: 'Relevance to goals', short: 'Relevance', plain: 'relevance' },
  graph: { label: 'Links to vault papers', short: 'Graph', plain: 'links to your papers' },
  citations: { label: 'Citation impact', short: 'Citations', plain: 'citations' },
  venue: { label: 'Venue standing', short: 'Venue', plain: 'venue' },
  authors: { label: 'Author track record', short: 'Authors', plain: 'author record' },
  llm: { label: 'LLM read', short: 'LLM', plain: 'LLM read' },
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E'
export const grade = (v: number): Grade => v >= 0.85 ? 'A' : v >= 0.7 ? 'B' : v >= 0.55 ? 'C' : v >= 0.4 ? 'D' : 'E'

/** Re-weights components in place of the server: same rule, so equal weights reproduce the server totals. */
export function combine(components: ScoreComponent[], weights: Weights): { components: ScoreComponent[]; total: number } {
  const assessed = components.filter(c => c.value != null)
  const sum = assessed.reduce((s, c) => s + (weights[c.key] ?? 0), 0)
  const out = components.map(c => {
    const weight = weights[c.key] ?? 0
    const contribution = c.value == null || sum <= 0 ? 0 : (weight * c.value) / sum
    return { ...c, weight, contribution }
  })
  return { components: out, total: out.reduce((s, c) => s + c.contribution, 0) }
}

/** How many of `n` scored, non-excluded papers fall inside the top X% (at least 1 when n > 0). */
export const passCut = (n: number, topPercent: number) => n <= 0 ? 0 : Math.max(1, Math.ceil(n * Math.min(100, Math.max(1, topPercent)) / 100))

export interface PassRule { topPercent: number; threshold: number }

/**
 * Re-scores (only when `weights` is given), re-ranks and re-gates a scored pile: excluded papers last, then by total;
 * passed = within the top X% of the non-excluded papers and total ≥ threshold.
 */
export function rescore(papers: LibPaper[], rule: PassRule & { weights?: Weights }): LibPaper[] {
  const next = papers.map(p => {
    if (!rule.weights) return { ...p }
    const { components, total } = combine(p.components, rule.weights)
    return { ...p, components, total }
  })
  // same order as server/library/score.ts: the cut is taken by total (ties: title), then excluded last, passed first,
  // total desc, title — so client ranks match the server's and the chat's after re-weighting.
  next.sort((a, b) => Number(!!a.excluded) - Number(!!b.excluded) || b.total - a.total || a.paper.title.localeCompare(b.paper.title))
  const cut = passCut(next.filter(p => !p.excluded).length, rule.topPercent)
  next.forEach((p, i) => { p.passed = !p.excluded && i < cut && p.total >= rule.threshold - 1e-12 })
  next.sort((a, b) => Number(!!a.excluded) - Number(!!b.excluded) || Number(b.passed) - Number(a.passed) || b.total - a.total || a.paper.title.localeCompare(b.paper.title))
  next.forEach((p, i) => { p.rank = i + 1 })
  return next
}

/** Result filters (shared Filters contract): kinds, year range, open access only, peer reviewed only. */
export function matchesFilters(p: LibPaper, f: Filters): boolean {
  if (f.kinds?.length && !f.kinds.includes(p.labels.kind)) return false
  const y = p.paper.year
  if (f.minYear != null && (y == null || y < f.minYear)) return false
  if (f.maxYear != null && (y == null || y > f.maxYear)) return false
  if (f.openAccessOnly && (!p.labels.openAccess || p.labels.openAccess === 'closed')) return false
  if (f.peerReviewedOnly && p.labels.peerReviewed !== true) return false
  return true
}
export const activeFilterCount = (f: Filters) =>
  (f.kinds?.length ? 1 : 0) + (f.minYear != null ? 1 : 0) + (f.maxYear != null ? 1 : 0) + (f.openAccessOnly ? 1 : 0) + (f.peerReviewedOnly ? 1 : 0)

// ---- Verdict (result row) -------------------------------------------------------------------------------------
export interface Verdict { sentence: string; strengths: ScoreComponent[]; weakness: ScoreComponent | null; grade: Grade }

/** Deterministic plain-language verdict from the components: top 2 strengths and the main weakness. */
export function verdict(p: LibPaper): Verdict {
  const assessed = p.components.filter(c => c.value != null && c.weight > 0)
    .sort((a, b) => b.value! - a.value! || b.weight - a.weight || COMPONENT_KEYS.indexOf(a.key) - COMPONENT_KEYS.indexOf(b.key))
  const strengths = assessed.slice(0, 2).filter(c => c.value! >= 0.55)
  const last = assessed.length > 2 ? assessed[assessed.length - 1] : null
  const weakness = last && !strengths.includes(last) && last.value! < 0.7 ? last : null
  const names = (cs: ScoreComponent[]) => cs.map(c => COMPONENT_META[c.key].plain).join(' and ')
  let sentence: string
  if (!assessed.length) sentence = 'Could not be assessed on any component'
  else if (strengths.length) {
    const low = Math.min(...strengths.map(c => c.value!))
    sentence = `${low >= 0.85 ? 'Excellent' : low >= 0.7 ? 'Strong' : 'Fair'} on ${names(strengths)}`
  } else sentence = `Weak across the board; best on ${COMPONENT_META[assessed[0].key].plain}`
  if (weakness) sentence += `; ${weakness.value! < 0.4 ? 'weak' : 'weaker'} on ${COMPONENT_META[weakness.key].plain}`
  else if (strengths.length && assessed.length > 2) sentence += '; no weak spot'
  return { sentence, strengths, weakness, grade: grade(p.total) }
}

// ---- Report card ("Why this score") ----------------------------------------------------------------------------
const PHRASES: Record<ComponentKey, [string, string, string]> = {
  relevance: ['Very close to your goals', 'Partly matches your goals', 'Far from your goals'],
  graph: ['Linked to several of your papers', 'Linked to one of your papers', 'No citation links to your papers'],
  citations: ['Highly cited for its field and year', 'Average citation impact', 'Rarely cited for its field and year'],
  venue: ['Published in a leading venue', 'Solid venue', 'Weak or unranked venue'],
  authors: ['Authors with a strong track record', 'Authors with a moderate track record', 'Authors with a thin track record'],
  llm: ['The judge model rates it highly', 'The judge model is lukewarm', 'The judge model rates it low'],
}

/** One-line plain reason for a component, by its value (graph uses its 0 / 0.5 / 1 steps). */
export function reason(c: ScoreComponent): string {
  if (c.value == null) return 'Not assessed'
  const [hi, mid, lo] = PHRASES[c.key]
  if (c.key === 'graph') return c.value >= 0.75 ? hi : c.value > 0 ? mid : lo
  return c.value >= 0.7 ? hi : c.value >= 0.4 ? mid : lo
}

/** The concrete number behind a component, taken from its evidence lines (shortened). */
export function keyNumber(c: ScoreComponent): string {
  if (c.value == null) return ''
  if (c.key === 'graph') {
    const n = c.evidence.filter(e => /^(cites|is cited by|similar|this paper is in your notes)/i.test(e.text)).length || c.evidence.length
    return n ? `${n} link${n === 1 ? '' : 's'} to your papers` : '0 links to your papers'
  }
  const line = (c.key === 'authors' ? c.evidence.find(e => /^best/i.test(e.text)) : null) ?? c.evidence[0]
  if (!line) return `value ${f2(c.value)}`
  let t = line.text
  if (c.key === 'llm') { const m = t.match(/relevance \d\/3, quality \d\/3/); if (m) return m[0] }
  t = t.split(' · ').slice(0, c.key === 'venue' ? 2 : 3).join(' · ')
  return t.length > 96 ? t.slice(0, 95) + '…' : t
}

/** Why a component was not assessed, from its rule text ("Not assessed: <why>. Its weight … redistributed …"). */
export function notAssessedWhy(c: ScoreComponent): string {
  const m = c.how.match(/not assessed:\s*([^.]+)/i)
  return m ? m[1].trim() : (c.evidence[0]?.text || 'no data for this component')
}
/** First sentence of a rule text, without the server's "Weight a → b (not assessed: …)" suffix. */
export const ruleText = (how: string) => how.replace(/\s*Weight [\d.]+ → [\d.]+.*$/, '').trim()

export const sameWeights = (a: Weights, b: Weights) => COMPONENT_KEYS.every(k => Math.abs(a[k] - b[k]) < 1e-9)
export const weightSum = (w: Weights) => COMPONENT_KEYS.reduce((s, k) => s + w[k], 0)
export const pct = (v: number) => Math.round(v * 100)
export const f2 = (v: number | null | undefined) => v == null ? 'n/a' : v.toFixed(2)
