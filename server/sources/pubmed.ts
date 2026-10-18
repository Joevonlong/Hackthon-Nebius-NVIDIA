// Owner: lane A1. NCBI E-utilities: efetch abstracts (XML → text) and elink pubmed_pubmed neighbours (R3).
// Throttled to ≤3 req/s by the 'pubmed' gate in server/data/http.ts; cached like every other GET.
import { cachedGet, mapLimit } from '../data/http'

const EU = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

function url(tool: string, params: Record<string, string | number>): string {
  const u = new URL(`${EU}/${tool}.fcgi`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  u.searchParams.set('tool', 'papertrail')
  if (process.env.OPENALEX_MAILTO) u.searchParams.set('email', process.env.OPENALEX_MAILTO)
  if (process.env.NCBI_API_KEY) u.searchParams.set('api_key', process.env.NCBI_API_KEY)
  return u.toString()
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export function decodeXml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

/** Parses an efetch PubmedArticleSet into pmid → abstract (AbstractText sections joined, labels kept). */
export function parseEfetchAbstracts(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  const articles = xml.split(/<PubmedArticle[\s>]/).slice(1)
  for (const a of articles) {
    const pmid = a.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1]
    const abs = a.match(/<Abstract>([\s\S]*?)<\/Abstract>/)?.[1]
    if (!pmid || !abs) continue
    const parts: string[] = []
    for (const m of abs.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)) {
      const label = m[1].match(/Label="([^"]+)"/)?.[1]
      const text = decodeXml(m[2]).replace(/\s+/g, ' ').trim()
      if (text) parts.push(label ? `${label}: ${text}` : text)
    }
    if (parts.length) out.set(pmid, parts.join('\n'))
  }
  return out
}

/** Abstracts for PMIDs, 200 per request. */
export async function fetchAbstracts(pmids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(pmids.filter(Boolean))]
  const chunks: string[][] = []
  for (let i = 0; i < uniq.length; i += 200) chunks.push(uniq.slice(i, i + 200))
  const out = new Map<string, string>()
  await mapLimit(chunks, 1, async c => {
    const r = await cachedGet('pubmed', url('efetch', { db: 'pubmed', id: c.join(','), retmode: 'xml', rettype: 'abstract' }), { timeoutMs: 45000 })
    for (const [k, v] of parseEfetchAbstracts(r.body)) out.set(k, v)
  })
  return out
}

/** R3: PubMed "similar articles" for one PMID, best first (rank 1 = most similar), excluding itself. */
export async function similar(pmid: string, n: number): Promise<{ pmids: { pmid: string; rank: number; score: number | null }[]; url: string; hash: string }> {
  const r = await cachedGet('pubmed', url('elink', { dbfrom: 'pubmed', db: 'pubmed', id: pmid, linkname: 'pubmed_pubmed', cmd: 'neighbor_score', retmode: 'json' }))
  const j = JSON.parse(r.body)
  const links: { pmid: string; score: number | null }[] = []
  for (const ls of j.linksets || []) for (const ld of ls.linksetdbs || []) {
    if (ld.linkname !== 'pubmed_pubmed') continue
    for (const l of ld.links || []) {
      const id = typeof l === 'object' ? String(l.id) : String(l)
      if (id !== pmid) links.push({ pmid: id, score: typeof l === 'object' && l.score != null ? Number(l.score) : null })
    }
  }
  return { pmids: links.slice(0, n).map((l, i) => ({ ...l, rank: i + 1 })), url: r.url, hash: r.hash }
}
