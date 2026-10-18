// Owner: lane A1. Europe PMC: last step of the abstract waterfall (OpenAlex → PubMed → Europe PMC), by DOI.
import { cachedJson, mapLimit } from '../data/http'

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
