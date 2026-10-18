// Owner: lane L1. Tavily web search (HIGH PRIORITY source, CR-1): question + every subtopic + every keyword group,
// restricted to scholarly hosts; extracts DOI / PMID / PMCID / arXiv id from URL + content.
// Uses A2's tavilySearch (traced to tavily.jsonl, [] without a key) and identify() helpers.
// Identical queries are served from an in-process cache, then from a disk cache (${DATA_DIR}/raw/tavily/<sha>.json.gz, like
// cachedGet); each library gets a call budget (≤ 25). Network calls have a hard per-call budget (LIB_TAVILY_TIMEOUT_MS, 6 s):
// a straggler rejects and is reported as a failed source call instead of holding the whole search stage.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { dataDir } from '../../data/db'
import { sha256 } from '../../data/http'
import { env } from '../../env'
import { identify, type TavilyHit, tavilySearch } from '../../sources/tavily'
import { trace } from '../../trace'

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

export const tavilyTimeoutMs = () => Number(env.raw.LIB_TAVILY_TIMEOUT_MS || 6000)

function diskKey(query: string, depth: string, maxResults: number) {
  return sha256(JSON.stringify({ q: query.trim().toLowerCase(), depth, maxResults, domains: LIB_DOMAINS }))
}
function readDisk(hash: string): TavilyHit[] | null {
  const file = join(dataDir(), 'raw', 'tavily', `${hash}.json.gz`)
  if (!existsSync(file)) return null
  try { const env = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')); return Array.isArray(env.hits) ? env.hits : null } catch { return null }
}
function writeDisk(hash: string, query: string, depth: string, hits: TavilyHit[]) {
  try {
    const dir = join(dataDir(), 'raw', 'tavily')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${hash}.json.gz`), gzipSync(JSON.stringify({ query, depth, fetchedAt: new Date().toISOString(), hits })))
  } catch { /* cache is best effort */ }
}

export async function tavilyLib(budget: TavilyBudget, query: string, depth: 'basic' | 'advanced', maxResults = 10): Promise<{ items: WebItem[]; cached: boolean }> {
  const key = `${depth}|${maxResults}|${query.trim().toLowerCase()}`
  const hit = memo.get(key)
  if (hit) return { items: await hit, cached: true }
  const hash = diskKey(query, depth, maxResults)
  const disk = readDisk(hash)
  if (disk) {
    trace('tavily', { query, searchDepth: depth, cached: true, count: disk.length, raw: `data/raw/tavily/${hash}.json.gz` })
    const items = disk.map(mapWebHit)
    memo.set(key, Promise.resolve(items))
    return { items, cached: true }
  }
  if (budget.used >= budget.max) throw new Error(`tavily budget (${budget.max} calls) reached`)
  budget.used++
  const p = tavilySearch(query, { maxResults, includeDomains: LIB_DOMAINS, timeoutMs: tavilyTimeoutMs(), searchDepth: depth, throwOnError: true })
    .then(hits => { if (hits.length) writeDisk(hash, query, depth, hits); return hits.map(mapWebHit) })
  memo.set(key, p)
  try {
    const items = await p
    if (!items.length) memo.delete(key) // do not pin empty results
    return { items, cached: false }
  } catch (e) {
    memo.delete(key) // do not pin failures / stragglers
    throw e
  }
}
