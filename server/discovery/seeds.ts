// Owner: lane A1. Seed input parsing (DOI / PMID / PMCID / OpenAlex W-id / URLs) and resolution to Seed.
import type { Paper, Seed } from '@shared/contracts'
import { getWork, normDoi } from '../sources/openalex'
import { fetchAbstracts } from '../sources/pubmed'
import { abstractsByDoi } from '../sources/europepmc'
import { logServerError } from '../security/errors'
import { openAlexProblem, resolveWithoutOpenAlex, type FallbackSource } from './seed-fallback'

export type SeedRef = { kind: 'openalex' | 'doi' | 'pmid' | 'pmcid'; value: string }

/** Parses one user input. Returns null if it is not a recognisable identifier. */
export function parseSeedInput(raw: string): SeedRef | null {
  let s = raw.trim()
  if (!s) return null
  try { s = decodeURIComponent(s) } catch { /* keep as is */ }
  // DOI: bare, doi: prefix, doi.org URL, or anywhere in a publisher URL
  const doi = s.match(/(?:^|doi\.org\/|doi:\s*|\/)(10\.\d{4,9}\/[^\s?#"<>]+)/i)
  if (doi && /(^|\/)\.\.?(\/|$)/.test(doi[1])) return null // dot segments are never part of a DOI (#35)
  if (doi && !/openalex\.org/i.test(s)) return { kind: 'doi', value: normDoi(doi[1].replace(/[.,;)]+$/, ''))! }
  const oa = s.match(/(?:^|openalex\.org\/(?:works\/)?)(W\d+)$/i)
  if (oa) return { kind: 'openalex', value: oa[1].toUpperCase() }
  const pmc = s.match(/(?:^|\/|pmcid:\s*)(PMC\d+)\/?$/i)
  if (pmc) return { kind: 'pmcid', value: pmc[1].toUpperCase() }
  const pm = s.match(/^(?:pmid:?\s*)?(\d{1,9})$/i) || s.match(/pubmed(?:\.ncbi\.nlm\.nih\.gov)?\/(\d{1,9})\/?$/i)
  if (pm) return { kind: 'pmid', value: pm[1] }
  return null
}

/** "Tirosh 2016": last name of the first author + year. */
export function shortName(p: Pick<Paper, 'authors' | 'year' | 'title'>): string {
  const first = p.authors[0]
  let last = ''
  if (first) {
    const parts = first.replace(/,?\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').trim().split(/\s+/)
    // PubMed-style "Yan M" / "Smith JA" (surname first, then initials) → the surname
    last = parts.length > 1 && /^[A-Z]{1,3}$/.test(parts[parts.length - 1]) ? parts[0] : parts[parts.length - 1] ?? ''
  } else {
    last = p.title.split(/\s+/).slice(0, 2).join(' ')
  }
  return [last, p.year ?? ''].filter(Boolean).join(' ').trim()
}

/** Abstract waterfall after OpenAlex: PubMed by PMID, then Europe PMC by DOI. Mutates the papers. */
export async function fillAbstractsFromPubmed<T extends Paper>(papers: T[]): Promise<{ filled: number; pubmed: number; europepmc: number }> {
  let pubmed = 0, europepmc = 0
  const need = papers.filter(p => !p.abstract && p.pmid)
  if (need.length) {
    try {
      const abs = await fetchAbstracts(need.map(p => p.pmid!))
      for (const p of need) {
        const a = abs.get(p.pmid!)
        if (a) { p.abstract = a; p.abstractSource = 'pubmed'; pubmed++ }
      }
    } catch (e) { console.warn('PubMed abstracts failed', (e as Error).message) }
  }
  const rest = papers.filter(p => !p.abstract && p.doi)
  if (rest.length) {
    try {
      const abs = await abstractsByDoi(rest.map(p => p.doi!))
      for (const p of rest) {
        const a = abs.get(p.doi!)
        if (a) { p.abstract = a; p.abstractSource = 'europepmc'; europepmc++ }
      }
    } catch (e) { console.warn('Europe PMC abstracts failed', (e as Error).message) }
  }
  return { filled: pubmed + europepmc, pubmed, europepmc }
}

/** Q2-6: OpenAlex gets this long per seed before the Crossref / PubMed / Europe PMC fallback answers instead. */
const OPENALEX_SEED_TIMEOUT_MS = Number(process.env.SEED_OPENALEX_TIMEOUT_MS || 10000)

export interface ResolvedVia { input: string; paperId: string; source: FallbackSource; reason: string }
export interface ResolveResult {
  seeds: Seed[]
  errors: { input: string; message: string }[]
  requests: { url: string; hash: string; paperId: string }[]
  /** Q2-6: seeds resolved without OpenAlex, and one plain notice for the UI ("OpenAlex rate-limited — resolved via Crossref"). */
  resolvedVia: ResolvedVia[]
  warning: string | null
}

export async function resolveSeeds(inputs: string[], deps: { getWork?: typeof getWork; fallback?: typeof resolveWithoutOpenAlex } = {}): Promise<ResolveResult> {
  const work = deps.getWork ?? getWork
  const fallback = deps.fallback ?? resolveWithoutOpenAlex
  const errors: { input: string; message: string }[] = []
  const requests: { url: string; hash: string; paperId: string }[] = []
  const via: ResolvedVia[] = []
  const found = await Promise.all(inputs.map(async input => {
    const ref = parseSeedInput(input)
    if (!ref) { errors.push({ input, message: 'Not a DOI, PMID, PMCID or OpenAlex id' }); return null }
    let problem: unknown = null
    try {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('OpenAlex timed out')), OPENALEX_SEED_TIMEOUT_MS) })
      const r = await Promise.race([work(ref), timeout]).finally(() => clearTimeout(timer))
      if (r) { requests.push({ url: r.url, hash: r.hash, paperId: r.value.id }); return { input, paper: r.value } }
    } catch (e) { problem = e }
    // OpenAlex 429 / 401 / down / not indexed → Crossref, PubMed or Europe PMC
    const hit = await fallback(ref)
    const reason = openAlexProblem(problem)
    if (hit) { via.push({ input, paperId: hit.paper.id, source: hit.source, reason }); return { input, paper: hit.paper } }
    if (problem) logServerError('seeds/resolve', problem)
    errors.push({ input, message: problem ? `${reason}; not found via Crossref / PubMed / Europe PMC either` : `Not found in OpenAlex, Crossref, PubMed or Europe PMC (${ref.kind}:${ref.value})` })
    return null
  }))
  const seen = new Map<string, string>()
  const papers: { input: string; paper: Paper }[] = []
  for (const x of found) {
    if (!x) continue
    if (seen.has(x.paper.id)) { errors.push({ input: x.input, message: `Same paper as ${seen.get(x.paper.id)} (${x.paper.id})` }); continue }
    seen.set(x.paper.id, x.input); papers.push(x)
  }
  try { await fillAbstractsFromPubmed(papers.map(p => p.paper)) } catch { /* abstracts are optional */ }
  const seeds: Seed[] = papers.map((p, i) => ({ ...p.paper, n: i + 1, label: `S${i + 1}`, shortName: shortName(p.paper), input: p.input }))
  const resolvedVia = via.filter(v => seeds.some(s => s.input === v.input))
  return { seeds, errors, requests, resolvedVia, warning: viaWarning(resolvedVia) }
}

/** "OpenAlex rate-limited — resolved via Crossref" (one line for all fallback seeds; counts when only some). */
export function viaWarning(via: ResolvedVia[]): string | null {
  if (!via.length) return null
  const reasons = [...new Set(via.map(v => v.reason))]
  const sources = [...new Set(via.map(v => v.source))]
  const n = via.length
  return `${reasons.join(' / ')} — ${n === 1 ? '' : `${n} seeds `}resolved via ${sources.join(' and ')} (no OpenAlex citation, venue or author metrics for ${n === 1 ? 'it' : 'them'}).`
}
