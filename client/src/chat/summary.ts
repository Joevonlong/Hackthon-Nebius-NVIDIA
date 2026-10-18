// Lane F1 (CR-7 Q-3b/c). A clean one-line summary of a chat proposal for the user (the "Applied from chat" banner),
// built from the proposal fields only, never from the model's rationale. Weights read as normalized % shares.
import { Labels, type Proposal, type Weights } from '@shared/library'
import type { LibSettings } from './libApi'

const KEYS: (keyof Weights)[] = ['relevance', 'graph', 'citations', 'venue', 'authors', 'llm']
const NAME: Record<keyof Weights, string> = { relevance: 'relevance', graph: 'links to your papers', citations: 'citations', venue: 'venue', authors: 'authors', llm: 'LLM read' }
const KINDS = Labels.shape.kind.options as readonly string[]
const KIND_NAME: Record<string, string> = {
  'journal-article': 'articles', 'conference-paper': 'conference papers', preprint: 'preprints', review: 'reviews', 'systematic-review': 'systematic reviews',
  'meta-analysis': 'meta-analyses', book: 'books', 'book-chapter': 'book chapters', dataset: 'datasets', thesis: 'theses', editorial: 'editorials', other: 'other',
}
const ARTICLE_REVIEW = ['journal-article', 'review', 'systematic-review', 'meta-analysis']

/** Normalized share of the total in % (same rule as the proposal card and the weight sliders). */
export function weightPct(w: Weights, k: keyof Weights): number {
  const s = KEYS.reduce((a, x) => a + (w[x] ?? 0), 0) || 1
  return Math.round(((w[k] ?? 0) / s) * 100)
}

const names = (ks: string[]) => ks.map(k => KIND_NAME[k] ?? k).join(', ')

/** e.g. "Recent (≥2023), no preprints, articles & reviews only, relevance ↑ 36%". */
export function summarizeProposal(p: Proposal, cur: LibSettings): string {
  const parts: string[] = []
  const f = p.filters
  if (f) {
    if (f.minYear != null && f.maxYear != null) parts.push(`Years ${f.minYear}–${f.maxYear}`)
    else if (f.minYear != null) parts.push(`Recent (≥${f.minYear})`)
    else if (f.maxYear != null) parts.push(`Up to ${f.maxYear}`)
    if (f.kinds?.length) {
      const excluded = KINDS.filter(k => !f.kinds!.includes(k))
      if (excluded.includes('preprint')) parts.push('no preprints')
      const rest = excluded.filter(k => k !== 'preprint')
      if (f.kinds.every(k => ARTICLE_REVIEW.includes(k)) && rest.length > 2) parts.push('articles & reviews only')
      else if (rest.length && rest.length <= 2) parts.push(`no ${names(rest)}`)
      else if (rest.length) parts.push(`only ${names(f.kinds)}`)
    }
    if (f.openAccessOnly) parts.push('open access only')
    if (f.peerReviewedOnly) parts.push('peer-reviewed only')
  }
  if (p.weights) {
    const next = { ...cur.weights, ...p.weights } as Weights
    for (const k of KEYS) {
      if (p.weights[k] == null) continue
      const a = weightPct(cur.weights, k), b = weightPct(next, k)
      if (a !== b) parts.push(`${NAME[k]} ${b > a ? '↑' : '↓'} ${b}%`)
    }
  }
  if (p.topPercent != null || p.threshold != null) parts.push(`pass: top ${p.topPercent ?? cur.topPercent}% · min ${(p.threshold ?? cur.threshold).toFixed(2)}`)
  const s = parts.join(', ')
  return s ? s[0].toUpperCase() + s.slice(1) : 'Settings updated'
}
