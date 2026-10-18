// Owner: lane L1. Tavily web search (HIGH PRIORITY source, CR-1): question + every subtopic + every keyword group,
// restricted to scholarly hosts; extracts DOI / PMID / PMCID / arXiv id from URL + content.
// Uses A2's tavilySearch (traced to tavily.jsonl, [] without a key) and identify() helpers.
// Identical queries are served from an in-process cache; each library gets a call budget (≤ 25).
import { env } from '../../env'
import { identify, tavilySearch } from '../../sources/tavily'

export const LIB_DOMAINS = [
  // spec §2
  'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'biorxiv.org', 'medrxiv.org', 'arxiv.org', 'nature.com', 'cell.com', 'science.org', 'nejm.org',
  'thelancet.com', 'plos.org', 'frontiersin.org',
  // scholar-like hosts (CR-1)
  'semanticscholar.org', 'researchgate.net', 'europepmc.org', 'openreview.net', 'aclanthology.org', 'ieeexplore.ieee.org', 'dl.acm.org',
  'springer.com', 'sciencedirect.com', 'wiley.com',
]

export interface WebItem { url: string; title: string; content: string; rank: number; doi: string | null; pmid: string | null; pmcid: string | null; arxiv: string | null }

export const hasTavilyKey = () => !!env.tavilyKey

const memo = new Map<string, Promise<WebItem[]>>()

/** Per-library Tavily call budget (cache hits are free). */
export class TavilyBudget { used = 0; constructor(public max = 25) {} }

/** Strips site suffixes from page titles ("… - PubMed", "… | Nature Medicine"). */
export function cleanWebTitle(t: string): string {
  return t.replace(/\s+[-|–]\s+(PubMed|PMC|NCBI|Europe PMC|ScienceDirect|Semantic Scholar|ResearchGate|arXiv|bioRxiv|medRxiv|Nature[\w ]*|Cell[\w ]*|Science[\w ]*|Frontiers[\w ]*|PLOS[\w ]*|Wiley[\w ]*|Springer[\w ]*|IEEE[\w ]*|ACM[\w ]*|OpenReview)\s*$/i, '')
    .replace(/^\(PDF\)\s*/i, '').replace(/^\[[^\]]+\]\s*/, '').trim()
}

export function mapWebHit(h: { url: string; title: string; content: string }, i: number): WebItem {
  const ids = identify(h.url, h.content)
  return { url: h.url, title: cleanWebTitle(h.title), content: h.content, rank: i + 1, doi: ids.doi, pmid: ids.pmid, pmcid: ids.pmcid, arxiv: ids.arxiv }
}

export async function tavilyLib(budget: TavilyBudget, query: string, depth: 'basic' | 'advanced', maxResults = 10): Promise<{ items: WebItem[]; cached: boolean }> {
  const key = `${depth}|${maxResults}|${query.trim().toLowerCase()}`
  const hit = memo.get(key)
  if (hit) return { items: await hit, cached: true }
  if (budget.used >= budget.max) throw new Error(`tavily budget (${budget.max} calls) reached`)
  budget.used++
  const p = tavilySearch(query, { maxResults, includeDomains: LIB_DOMAINS, timeoutMs: depth === 'advanced' ? 30000 : 20000, searchDepth: depth })
    .then(hits => hits.map(mapWebHit))
  memo.set(key, p)
  const items = await p
  if (!items.length) memo.delete(key) // do not pin empty / failed results
  return { items, cached: false }
}
