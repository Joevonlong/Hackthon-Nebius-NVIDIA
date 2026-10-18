// Owner: lane L1. PubMed for Library mode: esearch (relevance) → efetch XML with PublicationType + MeSH.
// GETs go through the raw cache + 'pubmed' gate (≤3 req/s) in server/data/http.ts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from '../../data/db'
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
  const r = await cachedGet('pubmed', euUrl('esearch', { db: 'pubmed', term, sort: 'relevance', retmax, retmode: 'json' }), { timeoutMs: 20000, retries: 4 })
  const j = JSON.parse(r.body)
  return { pmids: (j?.esearchresult?.idlist ?? []).map(String), url: r.url }
}

export const EFETCH_CHUNK = 100

/** efetch records, ≤100 PMIDs per request, 3 requests in parallel (the 'pubmed' gate keeps ≤3 req/s). PMIDs are sorted so
 *  the chunk URLs — and so the raw-cache keys — do not depend on the order sources answered in. Failed chunks are skipped (onError). */
export async function efetch(pmids: string[], onError?: (e: unknown) => void): Promise<Map<string, PubmedRecord>> {
  const all = [...new Set(pmids.filter(Boolean))].sort((a, b) => Number(a) - Number(b))
  const out = new Map<string, PubmedRecord>()
  // per-record cache (parsed records, ${DATA_DIR}/raw/pubmed-rec/<pmid>.json): a warm build whose PMID set shifted by a few
  // ids still needs no request; the raw efetch XML of each chunk stays in the raw cache as before
  const recDir = join(dataDir(), 'raw', 'pubmed-rec')
  for (const p of all) {
    const f = join(recDir, `${p}.json`)
    if (existsSync(f)) try { out.set(p, JSON.parse(readFileSync(f, 'utf8'))) } catch { /* refetch */ }
  }
  const uniq = all.filter(p => !out.has(p))
  const chunks: string[][] = []
  for (let i = 0; i < uniq.length; i += EFETCH_CHUNK) chunks.push(uniq.slice(i, i + EFETCH_CHUNK))
  await mapLimit(chunks, 3, async c => {
    try {
      const r = await cachedGet('pubmed', euUrl('efetch', { db: 'pubmed', id: c.join(','), retmode: 'xml' }), { timeoutMs: 30000, retries: 3 })
      const recs = parsePubmedXml(r.body)
      try { mkdirSync(recDir, { recursive: true }); for (const rec of recs) writeFileSync(join(recDir, `${rec.pmid}.json`), JSON.stringify(rec)) } catch { /* best effort */ }
      for (const rec of recs) out.set(rec.pmid, rec)
    } catch (e) { onError?.(e) }
  })
  return out
}
