// Owner: lane L1. Raw search hits → candidates; identifier helpers, title similarity, dedupe + merge, cap.
import { createHash } from 'node:crypto'
import type { Hit, SourceName } from '@shared/library'
import { normDoi, shortId } from '../../sources/openalex'
import type { ArxivEntry } from './arxiv'
import type { PubmedRecord } from './pubmed-lib'

export type Relation = { type: 'cites' | 'cited_by' | 'similar' | 'same_query'; paperId: string; note?: string }

/** One search result (or merged group of results) before enrichment. */
export interface Cand {
  ids: { openalex?: string; doi?: string; pmid?: string; pmcid?: string; arxiv?: string }
  title: string | null
  year: number | null
  authors: string[]
  venue: string | null
  work?: any // raw OpenAlex work (LIB_SELECT fields)
  pubmed?: PubmedRecord
  arxiv?: ArxivEntry
  scholar?: { citedBy: number | null; link: string; snippet: string | null; resultId: string | null }
  europepmc?: { abstract: string | null }
  hits: Hit[]
  relations: Relation[]
}

export function newCand(p: Partial<Cand> & { hits: Hit[] }): Cand {
  return { ids: {}, title: null, year: null, authors: [], venue: null, relations: [], ...p }
}

// ---------- identifiers ----------
export const ARXIV_RE = /(\d{4}\.\d{4,5})(v\d+)?/
export const cleanArxivId = (s: string | null | undefined): string | null => {
  if (!s) return null
  const m = String(s).match(ARXIV_RE)
  return m ? m[1] : null
}
export const arxivDoi = (id: string) => `10.48550/arxiv.${id}`

/** Classifies a known-paper identifier string from the vault. */
export function parseKnownId(raw: string): { kind: 'doi' | 'pmid' | 'arxiv' | 'openalex'; value: string } | null {
  const s = raw.trim()
  const w = s.match(/\b(W\d{5,})\b/i); if (w && /^(https?:\/\/openalex\.org\/)?W\d+$/i.test(s)) return { kind: 'openalex', value: w[1].toUpperCase() }
  if (/10\.\d{4,9}\//.test(s)) {
    const d = normDoi(s.replace(/^.*?(10\.\d{4,9}\/)/, '$1'))
    const ax = d?.match(/^10\.48550\/arxiv\.(\d{4}\.\d{4,5})/)
    if (ax) return { kind: 'arxiv', value: ax[1] }
    return d ? { kind: 'doi', value: d } : null
  }
  const p = s.match(/^(?:pmid:?\s*)?(\d{5,9})$/i); if (p) return { kind: 'pmid', value: p[1] }
  const a = s.match(/^(?:arxiv:\s*)?(\d{4}\.\d{4,5})(v\d+)?$/i); if (a) return { kind: 'arxiv', value: a[1] }
  if (w) return { kind: 'openalex', value: w[1].toUpperCase() }
  return null
}

// ---------- titles ----------
export function normTitle(t: string | null | undefined): string {
  return (t || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
}

const tokens = (t: string) => normTitle(t).split(' ').filter(Boolean)

/** Dice coefficient over word bigrams (falls back to unigrams for 1-word titles). 1 = identical. */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b)
  if (!ta.length || !tb.length) return 0
  if (ta.join(' ') === tb.join(' ')) return 1
  const grams = (t: string[]) => {
    const m = new Map<string, number>()
    const xs = t.length > 1 ? t.slice(1).map((w, i) => t[i] + ' ' + w) : t
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
    return m
  }
  const ga = grams(ta), gb = grams(tb)
  let inter = 0, na = 0, nb = 0
  for (const v of ga.values()) na += v
  for (const v of gb.values()) nb += v
  for (const [k, v] of ga) inter += Math.min(v, gb.get(k) ?? 0)
  return (2 * inter) / (na + nb)
}

/** Strict check used when resolving a title-only hit to an OpenAlex work by title search. */
export const sameTitle = (a: string, b: string, yearA?: number | null, yearB?: number | null) =>
  titleSimilarity(a, b) >= 0.9 && (yearA == null || yearB == null || Math.abs(yearA - yearB) <= 1)

export const titleHash = (t: string) => createHash('sha1').update(normTitle(t)).digest('hex').slice(0, 12)

// ---------- dedupe + merge ----------
export function candKeys(c: Cand): string[] {
  const k: string[] = []
  if (c.ids.openalex) k.push('oa:' + c.ids.openalex)
  if (c.ids.doi) k.push('doi:' + c.ids.doi)
  if (c.ids.pmid) k.push('pmid:' + c.ids.pmid)
  if (c.ids.arxiv) { k.push('arxiv:' + c.ids.arxiv); k.push('doi:' + arxivDoi(c.ids.arxiv)) }
  const nt = normTitle(c.title)
  if (nt.length >= 12 && c.year) k.push(`t:${nt}|${c.year}`)
  return k
}

/** Copies identifiers and fields from an OpenAlex work onto a candidate. */
export function attachWork(c: Cand, w: any): void {
  c.work = w
  c.ids.openalex = shortId(w.id)
  const d = normDoi(w.doi); if (d && !c.ids.doi) c.ids.doi = d
  if (w.ids?.pmid && !c.ids.pmid) c.ids.pmid = shortId(w.ids.pmid)
  if (w.ids?.pmcid && !c.ids.pmcid) c.ids.pmcid = shortId(String(w.ids.pmcid).replace(/\/$/, ''))
  const ax = d?.match(/^10\.48550\/arxiv\.(\d{4}\.\d{4,5})/); if (ax && !c.ids.arxiv) c.ids.arxiv = ax[1]
  c.title = w.display_name || w.title || c.title
  c.year = w.publication_year ?? c.year
}

function mergeInto(a: Cand, b: Cand): void {
  for (const k of Object.keys(b.ids) as (keyof Cand['ids'])[]) if (!a.ids[k] && b.ids[k]) a.ids[k] = b.ids[k]
  if (b.work && !a.work) a.work = b.work
  if (b.pubmed && !a.pubmed) a.pubmed = b.pubmed
  if (b.arxiv && !a.arxiv) a.arxiv = b.arxiv
  if (b.scholar && !a.scholar) a.scholar = b.scholar
  if (b.europepmc && !a.europepmc) a.europepmc = b.europepmc
  if (!a.title || (b.work && b.title)) a.title = a.work ? (a.work.display_name || a.title || b.title) : (a.title || b.title)
  a.year = a.work?.publication_year ?? a.year ?? b.year
  if (!a.authors.length) a.authors = b.authors
  a.venue = a.venue ?? b.venue
  const seen = new Set(a.hits.map(h => `${h.source}|${h.via}|${h.query}|${h.url}`))
  for (const h of b.hits) { const k = `${h.source}|${h.via}|${h.query}|${h.url}`; if (!seen.has(k)) { seen.add(k); a.hits.push(h) } }
  const rs = new Set(a.relations.map(r => `${r.type}|${r.paperId}`))
  for (const r of b.relations) { const k = `${r.type}|${r.paperId}`; if (!rs.has(k)) { rs.add(k); a.relations.push(r) } }
}

/** Union-find dedupe by DOI, PMID, arXiv id, OpenAlex id, then normalized title + year. Hits and relations are merged. */
export function dedupe(cands: Cand[]): Cand[] {
  const parent = cands.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const owner = new Map<string, number>()
  cands.forEach((c, i) => {
    for (const k of candKeys(c)) {
      const j = owner.get(k)
      if (j === undefined) owner.set(k, i)
      else { const a = find(j), b = find(i); if (a !== b) parent[b] = a }
    }
  })
  const groups = new Map<number, Cand>()
  cands.forEach((c, i) => {
    const r = find(i)
    const g = groups.get(r)
    if (!g) groups.set(r, { ...c, ids: { ...c.ids }, hits: [...c.hits], relations: [...c.relations], authors: [...c.authors] })
    else mergeInto(g, c)
  })
  return [...groups.values()]
}

export const sourcesOf = (c: Cand): SourceName[] => [...new Set(c.hits.map(h => h.source))]

/** Keeps papers found by more sources / more queries first (ties: graph links, then best rank). */
export function capPile(cands: Cand[], max: number): Cand[] {
  const score = (c: Cand) => {
    const queries = new Set(c.hits.map(h => `${h.source}|${h.query ?? h.via}`)).size
    const best = Math.min(...c.hits.map(h => h.rank ?? 999))
    return [sourcesOf(c).length, queries, c.relations.length, -best]
  }
  const sc = new Map(cands.map(c => [c, score(c)]))
  return [...cands].sort((a, b) => {
    const x = sc.get(a)!, y = sc.get(b)!
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]
    return 0
  }).slice(0, max)
}

/** Stable record key: OpenAlex W-id, else arxiv:/pmid:/doi:/scholar:. */
export function recordKey(c: Cand): string {
  if (c.ids.openalex) return c.ids.openalex
  if (c.ids.arxiv) return `arxiv:${c.ids.arxiv}`
  if (c.ids.pmid) return `pmid:${c.ids.pmid}`
  if (c.ids.doi) return `doi:${c.ids.doi}`
  return `scholar:${titleHash(c.title || c.hits[0]?.url || '')}`
}
