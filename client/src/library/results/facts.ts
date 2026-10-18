// F-60 (D-34) helpers for the tiles / table views: view preference, short meta line, the 3 tile chips, sparkbar
// tooltips and table sorting. Pure functions (tested in facts.test.ts).
import type { LibPaper, ScoreComponent } from '@shared/library'
import { lastName, firstAuthor } from '../../discover/literatureNote'
import { COMPONENT_META, f2, grade, keyNumber, reason, type ComponentKey } from '../score'

export type ResultsView = 'tiles' | 'table'
export const VIEW_KEY = 'papertrail.library.view'
export function loadView(): ResultsView {
  try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'tiles' } catch { return 'tiles' }
}
export function saveView(v: ResultsView) { try { localStorage.setItem(VIEW_KEY, v) } catch { /* storage blocked */ } }

export const status = (p: LibPaper) => p.excluded ? 'excluded' : p.passed ? 'passed' : 'below'
export const statusTip = (p: LibPaper) => p.excluded ? 'hard gate: ' + p.excluded : p.passed ? 'inside the top X% and above the minimum score' : 'outside the top X% or under the minimum score'
export const authorYear = (p: LibPaper) => `${lastName(firstAuthor(p.paper))}${p.paper.authors.length > 1 ? ' et al.' : ''} ${p.paper.year ?? 'n.d.'}`
export const tavilyUrl = (p: LibPaper) => p.hits.find(h => h.source === 'tavily')?.url

/** At most 3 chips: kind, Fresh/Recent (labels.recency), OA. */
export function tileChips(p: LibPaper): { text: string; cls: string; title: string }[] {
  const l = p.labels
  const out: { text: string; cls: string; title: string }[] = [{ text: l.kind, cls: 'kind', title: 'kind' }]
  if (l.recency === 'fresh') out.push({ text: 'Fresh', cls: 'fresh', title: 'published within the last 18 months' })
  else if (l.recency === 'recent') out.push({ text: 'Recent', cls: '', title: 'published within the last 5 years' })
  if (l.openAccess && l.openAccess !== 'closed') out.push({ text: 'OA', cls: '', title: 'open access: ' + l.openAccess })
  return out
}

export const comp = (p: LibPaper, k: ComponentKey) => p.components.find(c => c.key === k)
export function compTip(c: ScoreComponent | undefined, deK: (t: string) => string = t => t): string {
  if (!c) return 'no component'
  const head = `${COMPONENT_META[c.key].label}: `
  if (c.value == null) return head + 'not assessed (weight redistributed)'
  return `${head}${f2(c.value)} · grade ${grade(c.value)} · ${reason(c)}\n${deK(keyNumber(c))}`
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
