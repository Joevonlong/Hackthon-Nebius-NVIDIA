// Owner: lane L1. Europe PMC as a resolver when OpenAlex cannot be reached: DOI / title → PMID, title, journal, year, abstract.
import { cachedJson, mapLimit } from '../../data/http'
import { sameTitle } from './normalize'

const BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'
const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

export interface EpmcRecord { pmid: string | null; pmcid: string | null; doi: string | null; title: string; year: number | null; journal: string | null; authors: string[]; abstract: string | null; pubTypes: string[]; mesh: string[]; language: string | null }

export function mapEpmc(x: any): EpmcRecord {
  return {
    pmid: x.pmid ? String(x.pmid) : null,
    pmcid: x.pmcid ? String(x.pmcid) : null,
    doi: x.doi ? String(x.doi).toLowerCase() : null,
    title: clean(String(x.title ?? '')).replace(/\.$/, ''),
    year: x.pubYear ? Number(x.pubYear) : null,
    journal: x.journalInfo?.journal?.title ?? x.bookOrReportDetails?.publisher ?? null,
    authors: (x.authorList?.author ?? []).map((a: any) => a.fullName || a.collectiveName).filter(Boolean),
    abstract: x.abstractText ? clean(x.abstractText) : null,
    pubTypes: x.pubTypeList?.pubType ?? [],
    mesh: (x.meshHeadingList?.meshHeading ?? []).map((m: any) => m.descriptorName).filter(Boolean),
    language: x.language ?? null,
  }
}

async function query(q: string, pageSize: number): Promise<EpmcRecord[]> {
  const u = new URL(BASE)
  u.searchParams.set('query', q)
  u.searchParams.set('resultType', 'core')
  u.searchParams.set('format', 'json')
  u.searchParams.set('pageSize', String(pageSize))
  const r = await cachedJson('europepmc', u.toString(), { timeoutMs: 20000 })
  return (r.data?.resultList?.result ?? []).map(mapEpmc)
}

/** DOI (lowercase) → record, 25 DOIs per OR query. */
export async function epmcByDoi(dois: string[], onError?: (e: unknown) => void): Promise<Map<string, EpmcRecord>> {
  const uniq = [...new Set(dois.filter(Boolean).map(d => d.toLowerCase()))].sort() // stable chunk URLs = stable cache keys
  const chunks: string[][] = []
  for (let i = 0; i < uniq.length; i += 25) chunks.push(uniq.slice(i, i + 25))
  const out = new Map<string, EpmcRecord>()
  await mapLimit(chunks, 4, async c => {
    try { for (const r of await query(c.map(d => `DOI:"${d}"`).join(' OR '), 100)) if (r.doi) out.set(r.doi, r) } catch (e) { onError?.(e) }
  })
  return out
}

/** Title → record, strictly checked (title similarity ≥ 0.9, year ±1). */
export async function epmcByTitle(items: { title: string; year: number | null }[], onError?: (e: unknown) => void): Promise<(EpmcRecord | null)[]> {
  return mapLimit(items, 5, async it => {
    try {
      const t = it.title.replace(/["\\]/g, ' ').slice(0, 250)
      const rs = await query(`TITLE:"${t}"`, 5)
      return rs.find(r => sameTitle(r.title, it.title, r.year, it.year)) ?? null
    } catch (e) { onError?.(e); return null }
  })
}
