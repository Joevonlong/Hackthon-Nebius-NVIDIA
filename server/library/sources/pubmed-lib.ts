// Owner: lane L1. PubMed for Library mode: esearch (relevance) → efetch XML with PublicationType + MeSH.
// GETs go through the raw cache + 'pubmed' gate (≤3 req/s) in server/data/http.ts.
import { cachedGet, mapLimit } from '../../data/http'
import { decodeXml } from '../../sources/pubmed'

const EU = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

export function euUrl(tool: string, params: Record<string, string | number>): string {
  const u = new URL(`${EU}/${tool}.fcgi`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  u.searchParams.set('tool', 'papertrail')
  if (process.env.OPENALEX_MAILTO) u.searchParams.set('email', process.env.OPENALEX_MAILTO)
  if (process.env.NCBI_API_KEY) u.searchParams.set('api_key', process.env.NCBI_API_KEY)
  return u.toString()
}

export interface PubmedRecord {
  pmid: string
  title: string | null
  abstract: string | null
  journal: string | null
  year: number | null
  doi: string | null
  pmcid: string | null
  authors: string[]
  language: string | null
  publicationTypes: string[]
  mesh: string[]
  grants: string[] // GrantList Agency names (deduped)
}

const txt = (s: string | undefined) => (s == null ? null : decodeXml(s).replace(/\s+/g, ' ').trim() || null)

/** Parses an efetch PubmedArticleSet (retmode=xml). */
export function parsePubmedXml(xml: string): PubmedRecord[] {
  const out: PubmedRecord[] = []
  for (const part of xml.split(/<PubmedArticle[\s>]/).slice(1)) {
    const a = part.split(/<\/PubmedArticle>/)[0]
    const pmid = a.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1]
    if (!pmid) continue
    const head = a.split(/<ReferenceList[\s>]/)[0] // references carry their own ArticleIdList
    const abs = a.match(/<Abstract>([\s\S]*?)<\/Abstract>/)?.[1]
    const parts: string[] = []
    if (abs) for (const m of abs.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)) {
      const label = m[1].match(/Label="([^"]+)"/)?.[1]
      const t = txt(m[2])
      if (t) parts.push(label ? `${label}: ${t}` : t)
    }
    const pubDate = a.match(/<PubDate>([\s\S]*?)<\/PubDate>/)?.[1] ?? ''
    const year = Number(pubDate.match(/<Year>(\d{4})<\/Year>/)?.[1] ?? pubDate.match(/(\d{4})/)?.[1] ?? NaN)
    const authors: string[] = []
    const al = a.match(/<AuthorList[^>]*>([\s\S]*?)<\/AuthorList>/)?.[1] ?? ''
    for (const m of al.matchAll(/<Author[\s>][\s\S]*?<\/Author>/g)) {
      const last = txt(m[0].match(/<LastName>([\s\S]*?)<\/LastName>/)?.[1])
      const fore = txt(m[0].match(/<ForeName>([\s\S]*?)<\/ForeName>/)?.[1])
      const coll = txt(m[0].match(/<CollectiveName>([\s\S]*?)<\/CollectiveName>/)?.[1])
      const n = last ? (fore ? `${fore} ${last}` : last) : coll
      if (n) authors.push(n)
    }
    const doi = head.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/)?.[1] ?? a.match(/<ELocationID EIdType="doi"[^>]*>([^<]+)<\/ELocationID>/)?.[1]
    const pmc = head.match(/<ArticleId IdType="pmc">([^<]+)<\/ArticleId>/)?.[1]
    out.push({
      pmid,
      title: txt(a.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/)?.[1]),
      abstract: parts.length ? parts.join('\n') : null,
      journal: txt(a.match(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/)?.[1]),
      year: Number.isFinite(year) ? year : null,
      doi: doi ? decodeXml(doi).trim().toLowerCase() : null,
      pmcid: pmc ? pmc.trim().toUpperCase() : null,
      authors,
      language: a.match(/<Language>([a-z]+)<\/Language>/)?.[1] ?? null,
      publicationTypes: [...a.matchAll(/<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g)].map(m => txt(m[1])!).filter(Boolean),
      mesh: [...a.matchAll(/<DescriptorName[^>]*>([\s\S]*?)<\/DescriptorName>/g)].map(m => txt(m[1])!).filter(Boolean),
      grants: [...new Set([...a.matchAll(/<Agency>([\s\S]*?)<\/Agency>/g)].map(m => txt(m[1])!).filter(Boolean))],
    })
  }
  return out
}

/** esearch, relevance-sorted. Returns PMIDs best first. */
export async function esearch(term: string, retmax = 40): Promise<{ pmids: string[]; url: string }> {
  const r = await cachedGet('pubmed', euUrl('esearch', { db: 'pubmed', term, sort: 'relevance', retmax, retmode: 'json' }), { timeoutMs: 20000, retries: 2 })
  const j = JSON.parse(r.body)
  return { pmids: (j?.esearchresult?.idlist ?? []).map(String), url: r.url }
}

/** efetch records, 200 PMIDs per request. Failed chunks are skipped (reported via onError). */
export async function efetch(pmids: string[], onError?: (e: unknown) => void): Promise<Map<string, PubmedRecord>> {
  const uniq = [...new Set(pmids.filter(Boolean))]
  const chunks: string[][] = []
  for (let i = 0; i < uniq.length; i += 200) chunks.push(uniq.slice(i, i + 200))
  const out = new Map<string, PubmedRecord>()
  await mapLimit(chunks, 1, async c => {
    try {
      const r = await cachedGet('pubmed', euUrl('efetch', { db: 'pubmed', id: c.join(','), retmode: 'xml' }), { timeoutMs: 45000, retries: 2 })
      for (const rec of parsePubmedXml(r.body)) out.set(rec.pmid, rec)
    } catch (e) { onError?.(e) }
  })
  return out
}
