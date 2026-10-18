// Tavily web search + ingestion helpers (spec §3.2 steps 1–2: classify URL, extract identifiers).
// Owner: lane A2. Returns [] without TAVILY_API_KEY; never throws.
import { env } from '../env'
import { clip, trace } from '../trace'

export const SCIENCE_DOMAINS = ['biorxiv.org', 'medrxiv.org', 'ncbi.nlm.nih.gov', 'europepmc.org', 'clinicaltrials.gov', 'nature.com', 'cell.com', 'science.org']

export interface TavilyHit { url: string; title: string; content: string; score: number }

export type UrlKind = 'publisher' | 'preprint' | 'pmc' | 'pubmed' | 'trial' | 'news' | 'other'

export interface WebIds { kind: UrlKind; doi: string | null; pmid: string | null; pmcid: string | null; nct: string | null; arxiv: string | null }

/** HTTP status of the last Tavily call (smoke script / diagnostics). */
export let lastTavilyStatus = 0

export async function tavilySearch(query: string, opts: { maxResults?: number; includeDomains?: string[]; timeoutMs?: number } = {}): Promise<TavilyHit[]> {
  if (!env.tavilyKey || !query.trim()) return []
  try {
    const call = () => fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.tavilyKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query.slice(0, 380),
        search_depth: 'basic',
        max_results: opts.maxResults ?? 5,
        ...(opts.includeDomains?.length ? { include_domains: opts.includeDomains } : {}),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 12000),
    })
    const t0 = Date.now()
    let res = await call()
    if (res.status === 429) { // one retry, honouring Retry-After (capped at 3 s)
      const ra = Number(res.headers.get('retry-after'))
      await new Promise(r => setTimeout(r, Math.min(Number.isNaN(ra) || !ra ? 1500 : ra * 1000, 3000)))
      res = await call()
    }
    lastTavilyStatus = res.status
    if (!res.ok) { trace('tavily', { query, includeDomains: opts.includeDomains, status: res.status, ms: Date.now() - t0, count: 0 }); return [] }
    const data: any = await res.json()
    const hits: TavilyHit[] = (Array.isArray(data?.results) ? data.results : [])
      .filter((r: any) => typeof r?.url === 'string')
      .map((r: any) => ({ url: r.url, title: String(r.title ?? ''), content: String(r.content ?? ''), score: Number(r.score ?? 0) }))
    trace('tavily', { query, includeDomains: opts.includeDomains, status: res.status, ms: Date.now() - t0, count: hits.length, results: hits.map(h => ({ title: h.title, url: h.url, score: h.score, content: clip(h.content, 400) })) })
    return hits
  } catch {
    return []
  }
}

const host = (url: string) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const onHost = (h: string, list: string[]) => list.some(d => h === d || h.endsWith('.' + d))

const PREPRINT = ['biorxiv.org', 'medrxiv.org', 'arxiv.org', 'researchsquare.com', 'ssrn.com', 'preprints.org', 'chemrxiv.org', 'osf.io']
const TRIAL = ['clinicaltrials.gov', 'clinicaltrialsregister.eu', 'isrctn.com', 'anzctr.org.au', 'trialsearch.who.int', 'euclinicaltrials.eu']
const PUBLISHER = ['nature.com', 'cell.com', 'science.org', 'sciencedirect.com', 'springer.com', 'link.springer.com', 'wiley.com', 'onlinelibrary.wiley.com',
  'nejm.org', 'thelancet.com', 'jamanetwork.com', 'bmj.com', 'plos.org', 'frontiersin.org', 'mdpi.com', 'academic.oup.com', 'aacrjournals.org',
  'pnas.org', 'elifesciences.org', 'embopress.org', 'tandfonline.com', 'karger.com', 'sagepub.com', 'biomedcentral.com', 'jci.org', 'ashpublications.org',
  'ascopubs.org', 'rupress.org', 'lww.com', 'annualreviews.org', 'jimmunol.org', 'genome.cshlp.org', 'cshlp.org', 'acs.org', 'pubs.acs.org', 'jamanetwork.org', 'doi.org']
const NEWS = ['sciencedaily.com', 'eurekalert.org', 'medicalxpress.com', 'statnews.com', 'fiercebiotech.com', 'genengnews.com', 'the-scientist.com',
  'theguardian.com', 'nytimes.com', 'reuters.com', 'bbc.com', 'bbc.co.uk', 'cnn.com', 'forbes.com', 'medscape.com', 'healio.com', 'newsweek.com',
  'technologyreview.com', 'wired.com', 'scientificamerican.com', 'newscientist.com', 'sciencenews.org', 'news-medical.net', 'medium.com', 'substack.com']

export function classifyUrl(url: string): UrlKind {
  const h = host(url)
  if (!h) return 'other'
  let path = ''
  try { path = new URL(url).pathname } catch { /* ignore */ }
  if (onHost(h, TRIAL)) return 'trial'
  if (onHost(h, PREPRINT)) return 'preprint'
  if (h === 'pmc.ncbi.nlm.nih.gov' || (h.endsWith('ncbi.nlm.nih.gov') && /\/pmc\//i.test(path)) || (h === 'europepmc.org' && /\/PMC\d+/i.test(path))) return 'pmc'
  if (h === 'pubmed.ncbi.nlm.nih.gov' || (h.endsWith('ncbi.nlm.nih.gov') && /\/pubmed\//i.test(path)) || (h === 'europepmc.org' && /\/(MED|abstract\/MED)\/\d+/i.test(path))) return 'pubmed'
  if (h === 'europepmc.org') return 'pmc'
  if (h === 'nature.com' && /^\/(news|articles\/d41586)/.test(path)) return 'news'
  if (h === 'science.org' && /^\/content\/article\//.test(path)) return 'news'
  if (onHost(h, NEWS)) return 'news'
  if (onHost(h, PUBLISHER)) return 'publisher'
  return 'other'
}

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>\]\[{}|\\^`]+)/i

/** Lowercase, strip resolver prefixes, trailing punctuation and page-type suffixes. */
export function cleanDoi(raw: string): string | null {
  let d = decodeURIComponentSafe(raw).trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '')
  const m = d.match(DOI_RE)
  if (!m) return null
  d = m[1]
  d = d.split(/[?#]/)[0]
  d = d.replace(/[.,;:)\]}>'"]+$/, '')
  d = d.replace(/\/(full|abstract|pdf|epdf|fulltext|summary|meta|figures|references|supplementary-material|html)(\/.*)?$/i, '')
  d = d.replace(/\.(full|abstract|pdf|full\.pdf|full-text|article-info|article-metrics|supplementary-material)$/i, '')
  if (/^10\.1101\//.test(d)) d = d.replace(/v\d+$/i, '') // bioRxiv / medRxiv version suffix
  d = d.replace(/[.,;:]+$/, '')
  return /^10\.\d{4,9}\/\S+$/.test(d) ? d.toLowerCase() : null
}

function decodeURIComponentSafe(s: string) { try { return decodeURIComponent(s) } catch { return s } }

export function extractDoi(url: string, content = ''): string | null {
  const h = host(url)
  let path = ''
  try { path = new URL(url).pathname } catch { /* ignore */ }
  // 1. DOI in the URL path (doi.org, science.org/doi/…, biorxiv.org/content/10.1101/…, wiley /doi/…)
  const fromUrl = cleanDoi(decodeURIComponentSafe(path))
  if (fromUrl) return fromUrl
  // 2. Publisher-specific URL patterns
  if (h === 'nature.com') { const m = path.match(/^\/articles\/(s\d{5}-\d{3}-[\w-]+|[a-z]+\d{4,})/i); if (m && !/^d41586/.test(m[1])) return `10.1038/${m[1].toLowerCase()}` }
  // 3. citation_doi meta tag / "DOI:" text in the page content
  const meta = content.match(/citation_doi["']?\s*(?:content=)?["']?\s*[:=]?\s*["']?(10\.\d{4,9}\/[^\s"'<>]+)/i)
  if (meta) { const d = cleanDoi(meta[1]); if (d) return d }
  const txt = content.match(/\bdoi(?:\.org\/|:\s*|\s+)(10\.\d{4,9}\/[^\s"'<>]+)/i)
  if (txt) { const d = cleanDoi(txt[1]); if (d) return d }
  // 4. Any DOI-looking string in the content
  const any = content.match(DOI_RE)
  return any ? cleanDoi(any[1]) : null
}

export function extractPmid(url: string, content = ''): string | null {
  const m = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{4,9})/i) || url.match(/ncbi\.nlm\.nih\.gov\/pubmed\/(\d{4,9})/i) || url.match(/europepmc\.org\/(?:abstract|article)\/MED\/(\d{4,9})/i)
  if (m) return m[1]
  const t = content.match(/\bPMID:?\s*(\d{4,9})\b/)
  return t ? t[1] : null
}

export function extractPmcid(url: string, content = ''): string | null {
  const m = url.match(/\b(PMC\d{4,9})\b/i) || content.match(/\b(PMC\d{4,9})\b/)
  return m ? m[1].toUpperCase() : null
}

export function extractNct(url: string, content = ''): string | null {
  const m = url.match(/\b(NCT\d{8})\b/i) || content.match(/\b(NCT\d{8})\b/)
  return m ? m[1].toUpperCase() : null
}

export function extractArxiv(url: string): string | null {
  const m = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i)
  return m ? m[1] : null
}

/** Steps 1–2 of the ingestion flow for one web hit. */
export function identify(url: string, content = ''): WebIds {
  const kind = classifyUrl(url)
  return {
    kind,
    doi: extractDoi(url, content), // news pages may still cite a DOI; we keep it
    pmid: extractPmid(url, kind === 'pubmed' ? content : ''),
    pmcid: extractPmcid(url, kind === 'pmc' ? content : ''),
    nct: extractNct(url, content),
    arxiv: extractArxiv(url),
  }
}
