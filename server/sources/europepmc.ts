// Owner: lane A1. Europe PMC: last step of the abstract waterfall (OpenAlex → PubMed → Europe PMC), by DOI.
import { cachedGet, cachedJson, mapLimit } from '../data/http'

const BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'

const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

/** DOI (lowercased) → abstract, 25 DOIs per OR query. */
export async function abstractsByDoi(dois: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(dois.filter(Boolean).map(d => d.toLowerCase()))].sort() // stable chunk URLs = stable cache keys
  const chunks: string[][] = []
  for (let i = 0; i < uniq.length; i += 25) chunks.push(uniq.slice(i, i + 25))
  const out = new Map<string, string>()
  await mapLimit(chunks, 4, async c => {
    const u = new URL(BASE)
    u.searchParams.set('query', c.map(d => `DOI:"${d}"`).join(' OR '))
    u.searchParams.set('resultType', 'core')
    u.searchParams.set('format', 'json')
    u.searchParams.set('pageSize', '100')
    const r = await cachedJson('europepmc', u.toString(), { timeoutMs: 20000 })
    for (const x of r.data?.resultList?.result ?? []) {
      if (x.doi && x.abstractText) out.set(String(x.doi).toLowerCase(), clean(x.abstractText))
    }
  })
  return out
}

// ---------- CR-10 E-2: reference lists (fallback when OpenAlex gave no referenced_works) ----------
const REST = 'https://www.ebi.ac.uk/europepmc/webservices/rest'

/** One entry of a paper's reference list as Europe PMC returns it (any field may be missing). */
export interface EpmcRef { pmid: string | null; doi: string | null; title: string | null; year: number | null }

export const referencesUrl = (pmid: string) => `${REST}/MED/${encodeURIComponent(pmid)}/references?format=json&pageSize=1000`

/** Parses a `/MED/<pmid>/references` JSON body. Only `source: MED` ids are PMIDs. */
export function parseReferences(data: any): EpmcRef[] {
  const list = data?.referenceList?.reference
  if (!Array.isArray(list)) return []
  return list.map((r: any): EpmcRef => ({
    pmid: r?.source === 'MED' && r?.id && /^\d+$/.test(String(r.id)) ? String(r.id) : null,
    doi: typeof r?.doi === 'string' && r.doi.trim() ? r.doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : null,
    title: typeof r?.title === 'string' && r.title.trim() ? clean(r.title) : null,
    year: Number.isFinite(Number(r?.pubYear)) && Number(r.pubYear) > 0 ? Number(r.pubYear) : null,
  }))
}

/** Reference list of one PubMed paper (free, no key). Raw-cached and traced (channel 'api') by cachedGet. */
export async function referencesByPmid(pmid: string, timeoutMs = 6000): Promise<EpmcRef[]> {
  const r = await cachedGet('europepmc', referencesUrl(pmid), { timeoutMs, retries: 1 })
  return parseReferences(JSON.parse(r.body))
}
