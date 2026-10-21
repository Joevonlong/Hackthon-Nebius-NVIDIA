// F-60 (D-34) helpers for the tiles / table views: view preference, short meta line, the 3 tile chips, sparkbar
// tooltips and table sorting. Pure functions (tested in facts.test.ts).
import type { LibPaper, ScoreComponent } from '@shared/library'
import { lastName, firstAuthor } from '../../discover/literatureNote'
import { COMPONENT_KEYS, COMPONENT_META, f2, grade, keyNumber, reason, relativeNote, type ComponentKey } from '../score'
import { RECENT_FROM } from '../../stores/library'

export type ResultsView = 'tiles' | 'table'
export const VIEW_KEY = 'papertrail.library.view'
export function loadView(): ResultsView {
  try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'tiles' } catch { return 'tiles' }
}
export function saveView(v: ResultsView) { try { localStorage.setItem(VIEW_KEY, v) } catch { /* storage blocked */ } }

/**
 * Q-5: a total that sits within 0.005 of the minimum is shown with enough decimals that its display never contradicts
 * passed / below (0.8496 vs minimum 0.85 reads "0.850"-ish only when it truly is; otherwise 3 or 4 decimals).
 */
export function fmtScore(total: number, threshold: number): string {
  if (Math.abs(total - threshold) >= 0.005) return f2(total)
  const pass = total >= threshold - 1e-12
  for (const d of [3, 4, 5]) {
    const t = total.toFixed(d), m = threshold.toFixed(d)
    if (pass ? Number(t) >= Number(m) : Number(t) < Number(m)) return t
  }
  return total.toFixed(5)
}
/** Q-8: rank change per paper id between two scored piles (positive = moved up); unchanged papers are left out. */
export function rankMoves(prev: LibPaper[], next: LibPaper[]): Record<string, number> {
  const before = new Map(prev.map(p => [p.paper.id, p.rank]))
  const out: Record<string, number> = {}
  for (const p of next) { const b = before.get(p.paper.id); if (b != null && b !== p.rank) out[p.paper.id] = b - p.rank }
  return out
}
export const status = (p: LibPaper) => p.excluded ? 'excluded' : p.passed ? 'passed' : 'below'
export const statusTip = (p: LibPaper, rule?: { topPercent: number; threshold: number }) => {
  const top = rule ? `top ${rule.topPercent}%` : 'the top share'
  const min = rule ? `the minimum score ${f2(rule.threshold)}` : 'the minimum score'
  return p.excluded ? 'hard gate: ' + p.excluded : p.passed ? `inside the ${top} and above ${min}` : `outside the ${top}, under ${min} or below the topic-fit floor`
}
export const authorYear = (p: LibPaper) => `${lastName(firstAuthor(p.paper))}${p.paper.authors.length > 1 ? ' et al.' : ''} ${p.paper.year ?? 'n.d.'}`
export const tavilyUrl = (p: LibPaper) => p.hits.find(h => h.source === 'tavily')?.url

/** At most 3 chips: kind, Fresh/Recent (labels.recency), OA. */
export function tileChips(p: LibPaper): { text: string; cls: string; title: string }[] {
  const l = p.labels
  const out: { text: string; cls: string; title: string }[] = [{ text: l.kind, cls: 'kind', title: 'kind' }]
  if (l.recency === 'fresh') out.push({ text: 'Fresh', cls: 'fresh', title: 'published within the last 18 months' })
  // "Recent" is the same cut-off as the Recent filter in the results bar (RECENT_FROM), not the server's 5-year label
  else if (l.recency === 'recent' && (p.paper.year ?? 0) >= RECENT_FROM) out.push({ text: 'Recent', cls: '', title: `published ${RECENT_FROM} or later (same as the Recent filter)` })
  if (l.openAccess && l.openAccess !== 'closed') out.push({ text: 'OA', cls: '', title: 'open access: ' + l.openAccess })
  return out
}

/** Radar axes that are drawn into the shape: assessed ones only (a not-assessed axis is a dashed ring, never a 0). */
export const radarShapeKeys = (cs: ScoreComponent[]): ComponentKey[] => COMPONENT_KEYS.filter(k => cs.find(c => c.key === k)?.value != null)

export const comp = (p: LibPaper, k: ComponentKey) => p.components.find(c => c.key === k)
export function compTip(c: ScoreComponent | undefined, deK: (t: string) => string = t => t, n = 0): string {
  if (!c) return 'no component'
  const head = `${COMPONENT_META[c.key].label}: `
  if (c.value == null) return head + 'not assessed (weight redistributed)'
  const rel = n ? relativeNote(c, n) : ''
  return `${head}${f2(c.value)} · grade ${grade(c.value)} · ${reason(c)}\n${deK(keyNumber(c))}${rel ? '\n' + rel : ''}`
}

export type SortKey = 'rank' | 'title' | 'year' | 'kind' | 'total' | 'passed' | ComponentKey
export function sortPapers(list: LibPaper[], key: SortKey, dir: 1 | -1): LibPaper[] {
  const val = (p: LibPaper): number | string | null => {
    switch (key) {
      case 'rank': return p.rank
      case 'title': return p.paper.title.toLowerCase()
      case 'year': return p.paper.year
      case 'kind': return p.labels.kind
      case 'total': return p.total
      case 'passed': return p.excluded ? -1 : p.passed ? 1 : 0
      default: return comp(p, key)?.value ?? null
    }
  }
  return [...list].sort((a, b) => {
    const x = val(a), y = val(b)
    if (x == null && y == null) return a.rank - b.rank
    if (x == null) return 1 // missing values always last
    if (y == null) return -1
    const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)
    return c * dir || a.rank - b.rank
  })
}
