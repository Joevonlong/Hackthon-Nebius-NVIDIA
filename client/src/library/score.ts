// Library score helpers (lane L3). The formula follows docs/LIBRARY_SPEC.md §5:
// contribution_i = w_i × value_i / Σ_{assessed} w_j  (null value = not assessed → its weight is redistributed).
import type { LibPaper, ScoreComponent, Weights } from '@shared/library'

export type ComponentKey = ScoreComponent['key']
export const COMPONENT_KEYS: ComponentKey[] = ['relevance', 'graph', 'citations', 'venue', 'authors', 'llm']
export const COMPONENT_META: Record<ComponentKey, { label: string; color: string; short: string }> = {
  relevance: { label: 'Relevance to goals', short: 'Relevance', color: 'var(--seed)' },
  graph: { label: 'Links to vault papers', short: 'Graph', color: 'var(--cand)' },
  citations: { label: 'Citation impact', short: 'Citations', color: 'var(--gap)' },
  venue: { label: 'Venue standing', short: 'Venue', color: 'var(--ok)' },
  authors: { label: 'Author track record', short: 'Authors', color: 'var(--warn)' },
  llm: { label: 'LLM read', short: 'LLM', color: 'var(--line-2)' },
}

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

/** Re-scores, re-gates and re-ranks a scored pile with new weights and threshold (passed first, then by total). */
export function rescore(papers: LibPaper[], weights: Weights, threshold: number): LibPaper[] {
  const next = papers.map(p => {
    const { components, total } = combine(p.components, weights)
    return { ...p, components, total, passed: !p.excluded && total >= threshold }
  })
  next.sort((a, b) => Number(!!a.excluded) - Number(!!b.excluded) || Number(b.passed) - Number(a.passed) || b.total - a.total)
  next.forEach((p, i) => { p.rank = i + 1 })
  return next
}

export const sameWeights = (a: Weights, b: Weights) => COMPONENT_KEYS.every(k => Math.abs(a[k] - b[k]) < 1e-9)
export const weightSum = (w: Weights) => COMPONENT_KEYS.reduce((s, k) => s + w[k], 0)
export const pct = (v: number) => Math.round(v * 100)
export const f2 = (v: number | null | undefined) => v == null ? 'n/a' : v.toFixed(2)
