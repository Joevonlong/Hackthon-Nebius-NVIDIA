// Owner: lane L2. Quality score (spec §5): six components, each with `how` + evidence lines with source links.
// Pure functions: no I/O. Every percentile is computed within the current library and says "of N".
import type { z } from 'zod'
import type { Evidence, Goals, Labels, LibPaper, LlmRead, ScoreComponent, Weights } from '@shared/library'
import type { EnrichedRecord } from './types'

export type LlmReadT = z.infer<typeof LlmRead>
export type ComponentKey = ScoreComponent['key']

export interface RelevanceSignal { cos: number; best: string; bestKind: 'question' | 'subtopic' | 'keywords'; method: 'embedding' | 'keywords' }
export interface ScoreItem { rec: EnrichedRecord; labels: Labels; rel: RelevanceSignal | null; llm: LlmReadT | null; llmNote?: string }

export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  relevance: 'Relevance to the goals', graph: 'Links to your papers', citations: 'Citation impact',
  venue: 'Venue standing', authors: 'Author track record', llm: 'LLM read',
}
const ORDER: ComponentKey[] = ['relevance', 'graph', 'citations', 'venue', 'authors', 'llm']

// ---------- helpers ----------
const OA = 'https://openalex.org/'
export const openalexUrl = (id: string) => (id.startsWith('http') ? id : OA + id.replace(/^openalex:/, ''))
const pubmedUrl = (pmid: string) => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
const arxivUrl = (id: string) => `https://arxiv.org/abs/${id}`

/** The best page for this paper: OpenAlex work, else PubMed, else arXiv, else the first search hit. */
export function paperSource(rec: EnrichedRecord): Evidence['source'] {
  if (/^W\d+$/.test(rec.paper.id)) return { name: 'OpenAlex work', url: openalexUrl(rec.paper.id) }
  if (rec.paper.pmid) return { name: 'PubMed', url: pubmedUrl(rec.paper.pmid) }
  if (rec.extra.arxiv) return { name: 'arXiv', url: arxivUrl(rec.extra.arxiv.id) }
  return rec.hits[0] ? { name: rec.hits[0].source, url: rec.hits[0].url } : rec.paper.url ? { name: 'source', url: rec.paper.url } : undefined
}

/** Fraction of `sorted` (ascending) that is ≤ x. */
export function pct(sorted: number[], x: number): number {
  if (!sorted.length) return 0.5
  let lo = 0, hi = sorted.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= x) lo = mid + 1; else hi = mid }
  return lo / sorted.length
}
export function ordinal(p: number): string {
  // floor (with float slack) so 0.9994 reads 99th, not 100th; only p = 1 reads 100th
  const n = Math.max(0, Math.min(100, p >= 1 ? 100 : Math.floor(p * 100 + 1e-9)))
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${s}`
}
const fmt = (n: number) => n.toLocaleString('en-US')
const r2 = (n: number) => Math.round(n * 100) / 100
const asc = (xs: number[]) => xs.slice().sort((a, b) => a - b)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

// ---------- library context ----------
export interface KnownRef { label: string; id: string; title: string; url: string }
export interface LibraryContext {
  n: number
  rel: number[]; relMin: number; relMax: number
  venueH: number[]
  authorH: number[]
  logCites: number[]
  known: Map<string, KnownRef> // any id form (W-id, record key) → known paper
  knownKeys: Set<string> // record keys that ARE vault papers
  knownCount: number
  now: Date
}

const recIds = (r: EnrichedRecord) => [r.key, r.paper.id, r.paper.doi?.toLowerCase(), r.paper.pmid ? `pmid:${r.paper.pmid}` : null, r.extra.arxiv ? `arxiv:${r.extra.arxiv.id}` : null].filter(Boolean) as string[]

export function buildKnown(records: EnrichedRecord[], knownPapers: string[]): { known: Map<string, KnownRef>; knownKeys: Set<string> } {
  const byId = new Map<string, EnrichedRecord>()
  for (const r of records) for (const id of recIds(r)) if (!byId.has(id)) byId.set(id, r)
  const known = new Map<string, KnownRef>()
  const knownKeys = new Set<string>()
  knownPapers.forEach((kid, i) => {
    const label = `K${i + 1}`
    const r = byId.get(kid) ?? byId.get(kid.toLowerCase())
    if (r) {
      const ref: KnownRef = { label, id: kid, title: r.paper.title, url: paperSource(r)?.url ?? r.paper.url }
      for (const id of recIds(r)) known.set(id, ref)
      knownKeys.add(r.key)
    } else {
      known.set(kid, { label, id: kid, title: kid, url: /^W\d+$/.test(kid) ? openalexUrl(kid) : kid.startsWith('pmid:') ? pubmedUrl(kid.slice(5)) : kid.startsWith('arxiv:') ? arxivUrl(kid.slice(6)) : `https://doi.org/${kid}` })
    }
  })
  return { known, knownKeys }
}

const leadAuthors = (rec: EnrichedRecord) => rec.authors.filter(a => a.position === 'first' || a.position === 'last')
const bestAuthorH = (rec: EnrichedRecord) => { const hs = leadAuthors(rec).map(a => a.hIndex).filter((h): h is number => h != null); return hs.length ? Math.max(...hs) : null }

export function buildContext(items: ScoreItem[], goals: Goals, now = new Date()): LibraryContext {
  const recs = items.map(i => i.rec)
  const rel = asc(items.map(i => i.rel?.cos).filter((x): x is number => x != null))
  const { known, knownKeys } = buildKnown(recs, goals.knownPapers)
  return {
    n: items.length,
    rel, relMin: rel[0] ?? 0, relMax: rel[rel.length - 1] ?? 0,
    venueH: asc(recs.map(r => r.venue.hIndex).filter((h): h is number => h != null)),
    authorH: asc(recs.map(bestAuthorH).filter((h): h is number => h != null)),
    logCites: asc(recs.map(r => Math.log1p(r.paper.citedByCount))),
    known, knownKeys, knownCount: goals.knownPapers.length, now,
  }
}

// ---------- components ----------
export interface RawComponent { key: ComponentKey; value: number | null; how: string; evidence: Evidence[] }

export function relevanceComponent(item: ScoreItem, ctx: LibraryContext): RawComponent {
  const { rel, rec } = item
  const src = paperSource(rec)
  if (!rel) return { key: 'relevance', value: null, how: 'Not assessed: no embedding and no keyword signal for this paper.', evidence: [] }
  const span = ctx.relMax - ctx.relMin
  const value = span > 1e-9 ? clamp01((rel.cos - ctx.relMin) / span) : 0.5
  const p = `${ordinal(pct(ctx.rel, rel.cos))} pct of ${ctx.rel.length}`
  if (rel.method === 'embedding') {
    const what = rel.bestKind === 'question' ? 'the goal question' : `subtopic '${rel.best}'`
    return {
      key: 'relevance', value,
      how: 'Max cosine (Qwen3-Embedding) of title+abstract to the goal question and each subtopic query, rescaled min–max within this library.',
      evidence: [{ text: `best match: ${what} cos ${rel.cos.toFixed(2)} (${p})`, source: src }],
    }
  }
  return {
    key: 'relevance', value,
    how: 'No embeddings available: share of goal keywords and subtopic terms found in title+abstract, rescaled min–max within this library.',
    evidence: [{ text: `keyword overlap ${rel.cos.toFixed(2)}${rel.best ? ` (best: ${rel.best})` : ''} (${p})`, source: src }],
  }
}

export function graphComponent(item: ScoreItem, ctx: LibraryContext): RawComponent {
  const { rec } = item
  const how = 'Citation links to the papers named in your notes: 0 links = 0, 1 = 0.5, ≥2 = 1 (cites / cited by / PubMed similar).'
  if (!ctx.knownCount) return { key: 'graph', value: null, how: 'Not assessed: the notes name no papers (no DOI / PMID / arXiv / OpenAlex id found).', evidence: [] }
  if (ctx.knownKeys.has(rec.key)) {
    const k = ctx.known.get(rec.key)!
    return { key: 'graph', value: 1, how, evidence: [{ text: `this paper is in your notes (${k.label})`, source: { name: 'your notes', url: k.url } }] }
  }
  const links = new Map<string, Evidence>()
  const verb = { cites: 'cites', cited_by: 'is cited by', similar: 'is PubMed-similar to', same_query: 'shares a query with' } as const
  const via = { cites: 'OpenAlex referenced_works', cited_by: 'OpenAlex cites: filter', similar: 'PubMed elink pubmed_pubmed', same_query: 'search' } as const
  for (const r of rec.relations) {
    if (r.type === 'same_query') continue
    const k = ctx.known.get(r.paperId)
    if (!k) continue
    const key = `${k.label}:${r.type}`
    if (!links.has(key)) links.set(key, { text: `${verb[r.type]} ${k.label} "${k.title.slice(0, 70)}" (${via[r.type]})`, source: { name: k.label, url: k.url } })
  }
  for (const w of rec.paper.referencedWorks) {
    const k = ctx.known.get(w)
    if (k && !links.has(`${k.label}:cites`)) links.set(`${k.label}:cites`, { text: `cites ${k.label} "${k.title.slice(0, 70)}" (OpenAlex referenced_works)`, source: { name: k.label, url: k.url } })
  }
  const distinct = new Set([...links.keys()].map(k => k.split(':')[0])).size
  const value = distinct === 0 ? 0 : distinct === 1 ? 0.5 : 1
  const evidence = [...links.values()]
  if (!evidence.length) evidence.push({ text: `no citation link to any of the ${ctx.knownCount} papers in your notes` })
  return { key: 'graph', value, how, evidence }
}

export function citationsComponent(item: ScoreItem, ctx: LibraryContext): RawComponent {
  const { rec } = item
  const p = rec.paper
  const src = paperSource(rec)
  const scholar = rec.extra.scholarCitedBy != null ? [{ text: `Google Scholar cited by ${fmt(rec.extra.scholarCitedBy)} (SerpAPI)`, source: src }] : []
  if (p.citationPct != null) {
    return {
      key: 'citations', value: clamp01(p.citationPct),
      how: 'OpenAlex citation_normalized_percentile (normalized for field and publication year).',
      evidence: [{ text: `cited_by ${fmt(p.citedByCount)} · ${ordinal(p.citationPct)} percentile for field and year (OpenAlex)`, source: src }, ...scholar],
    }
  }
  const pub = p.publicationDate ? new Date(p.publicationDate) : p.year ? new Date(Date.UTC(p.year, 6, 1)) : null
  const ageYears = pub ? (ctx.now.getTime() - pub.getTime()) / (365.25 * 24 * 3600 * 1000) : null
  if (ageYears != null && ageYears < 2) {
    const f = rec.extra.fwci
    if (f != null) return { key: 'citations', value: clamp01(f / (f + 1)), how: 'Paper < 2 years old and no normalized percentile: FWCI mapped as fwci/(fwci+1) (FWCI 1 = field average → 0.5).', evidence: [{ text: `FWCI ${r2(f)} · cited_by ${fmt(p.citedByCount)} · ${ageYears.toFixed(1)} years old (OpenAlex)`, source: src }, ...scholar] }
    return { key: 'citations', value: 0.5, how: 'Paper < 2 years old with no normalized percentile or FWCI: neutral 0.5.', evidence: [{ text: `cited_by ${fmt(p.citedByCount)} · ${ageYears.toFixed(1)} years old — too new to judge by citations`, source: src }, ...scholar] }
  }
  const v = pct(ctx.logCites, Math.log1p(p.citedByCount))
  return {
    key: 'citations', value: v,
    how: 'No OpenAlex normalized percentile: percentile of log(cited_by+1) within this library.',
    evidence: [{ text: `cited_by ${fmt(p.citedByCount)} · ${ordinal(v)} pct of ${ctx.logCites.length} in this library`, source: src }, ...scholar],
  }
}

export function venueComponent(item: ScoreItem, ctx: LibraryContext): RawComponent {
  const { rec, labels } = item
  const v = rec.venue
  const vsrc = v.id ? { name: 'OpenAlex source', url: openalexUrl(v.id) } : paperSource(rec)
  const name = v.name ?? 'unknown venue'
  const vtype = (v.type || '').toLowerCase()
  if (labels.kind === 'preprint' || vtype === 'repository') {
    return { key: 'venue', value: 0.2, how: 'Repository / preprint server: fixed 0.2 (not peer reviewed).', evidence: [{ text: `${name} · ${vtype || 'preprint'}${rec.extra.arxiv ? ` · arXiv ${rec.extra.arxiv.id}` : ''}`, source: rec.extra.arxiv ? { name: 'arXiv', url: arxivUrl(rec.extra.arxiv.id) } : vsrc }] }
  }
  if (!v.id && !v.name) return { key: 'venue', value: null, how: 'Not assessed: no venue for this paper.', evidence: [] }
  if (v.hIndex == null && v.isCore == null) return { key: 'venue', value: null, how: 'Not assessed: OpenAlex gave no venue metrics (h-index, core status).', evidence: [{ text: `${name}${vtype ? ` · ${vtype}` : ''} · no venue metrics`, source: vsrc }] }
  let got = 0, max = 0
  const bits: string[] = [name]
  const missing: string[] = []
  if (v.hIndex != null) { const p = pct(ctx.venueH, v.hIndex); got += 0.6 * p; max += 0.6; bits.push(`h-index ${fmt(v.hIndex)} (${ordinal(p)} pct of ${ctx.venueH.length})`) } else missing.push('h-index')
  if (v.isCore != null) { got += v.isCore ? 0.2 : 0; max += 0.2; bits.push(v.isCore ? 'core source' : 'not a core source') } else missing.push('core status')
  max += 0.1; if (vtype === 'journal' || vtype === 'conference') { got += 0.1; bits.push(vtype) } else bits.push(vtype || 'type unknown')
  max += 0.1; const indexed = !!v.isInDoaj || !!v.issn; if (indexed) { got += 0.1; bits.push(v.isInDoaj ? 'in DOAJ' : `ISSN ${v.issn}`) }
  if (v.publisher) bits.push(v.publisher)
  const how = '0.6·pct(source h-index within library) + 0.2·core source + 0.1·journal/conference + 0.1·indexed (DOAJ or ISSN).'
    + (missing.length ? ` Missing ${missing.join(', ')}: rescaled over the available parts.` : '')
  return { key: 'venue', value: clamp01(got / max), how, evidence: [{ text: bits.join(' · ') + (v.id ? ` (OpenAlex ${v.id.replace(OA, '')})` : ''), source: vsrc }] }
}

export function authorsComponent(item: ScoreItem, ctx: LibraryContext): RawComponent {
  const { rec } = item
  const lead = leadAuthors(rec)
  const best = bestAuthorH(rec)
  if (best == null) return { key: 'authors', value: null, how: 'Not assessed: no h-index for the first or last author.', evidence: lead.length ? [{ text: `${lead.map(a => `${a.position} author ${a.name}`).join(', ')} · no author metrics` }] : [] }
  const hasRor = lead.some(a => a.institutions.some(i => !!i.ror))
  const p = pct(ctx.authorH, best)
  const value = clamp01(0.7 * p + 0.3 * (hasRor ? 1 : 0))
  const evidence: Evidence[] = lead.map(a => {
    const inst = a.institutions[0]
    const bits = [`${a.position} author ${a.name}`]
    if (a.hIndex != null) bits.push(`h-index ${fmt(a.hIndex)}`)
    if (a.worksCount != null) bits.push(`${fmt(a.worksCount)} works`)
    if (inst) bits.push(inst.name + (inst.ror ? ` (ROR ${inst.ror.replace('https://ror.org/', '')})` : ''))
    return { text: bits.join(', '), source: a.id ? { name: 'OpenAlex author', url: openalexUrl(a.id) } : undefined }
  })
  evidence.push({ text: `best lead-author h-index ${fmt(best)} = ${ordinal(p)} pct of ${ctx.authorH.length} in this library${hasRor ? ' · institution with ROR' : ' · no institution with ROR'}` })
  return { key: 'authors', value, how: '0.7·pct(max h-index of first/last author within library) + 0.3·has an institution with a ROR id.', evidence }
}

export const llmValue = (l: LlmReadT) => clamp01(((l.relevance + l.quality) / 6) * (l.verified ? 1 : 0.6))

export function llmComponent(item: ScoreItem): RawComponent {
  const l = item.llm
  if (!l) return { key: 'llm', value: null, how: `Not assessed: ${item.llmNote ?? 'not read (only the top papers by the other components are read)'}.`, evidence: [] }
  const src = paperSource(item.rec)
  const evidence: Evidence[] = [
    { text: `${l.model} read the ${l.read}: relevance ${l.relevance}/3, quality ${l.quality}/3 — ${l.why}`, source: src },
    { text: l.quote ? `${l.verified ? 'verified quote' : 'UNVERIFIED quote (×0.6)'}: "${l.quote}"` : 'no quote (×0.6)', source: src },
    ...l.concerns.map(c => ({ text: `concern: ${c}` })),
  ]
  return { key: 'llm', value: llmValue(l), how: '(relevance + quality)/6 from the judge model reading the abstract, ×0.6 if its quote is not found verbatim in the abstract.', evidence }
}

// ---------- combine ----------
export function combine(raw: RawComponent[], weights: Weights): { components: ScoreComponent[]; total: number } {
  const assessed = raw.filter(c => c.value != null)
  const S = assessed.reduce((s, c) => s + Math.max(0, weights[c.key]), 0)
  const missing = raw.filter(c => c.value == null).map(c => c.key)
  const all = raw.reduce((s, c) => s + Math.max(0, weights[c.key]), 0)
  let total = 0
  const components = raw.map(c => {
    const base = Math.max(0, weights[c.key])
    if (c.value == null || S <= 0) {
      return { key: c.key, label: COMPONENT_LABEL[c.key], weight: base, value: null, contribution: 0, how: c.how + (base > 0 && S > 0 ? ` Its weight ${r2(base)} is redistributed over the assessed components.` : ''), evidence: c.evidence }
    }
    const eff = base / S
    const contribution = eff * c.value
    total += contribution
    const note = missing.length || Math.abs(all - 1) > 1e-6 ? ` Weight ${r2(base)} → ${eff.toFixed(3)}${missing.length ? ` (not assessed: ${missing.join(', ')})` : ' (weights normalized to sum 1)'}.` : ''
    return { key: c.key, label: COMPONENT_LABEL[c.key], weight: eff, value: c.value, contribution, how: c.how + note, evidence: c.evidence }
  })
  return { components, total: clamp01(total) }
}

export function rawComponents(item: ScoreItem, ctx: LibraryContext): RawComponent[] {
  const fns: Record<ComponentKey, () => RawComponent> = {
    relevance: () => relevanceComponent(item, ctx), graph: () => graphComponent(item, ctx), citations: () => citationsComponent(item, ctx),
    venue: () => venueComponent(item, ctx), authors: () => authorsComponent(item, ctx), llm: () => llmComponent(item),
  }
  return ORDER.map(k => fns[k]())
}

// ---------- gates + ranking ----------
const normTitle = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()

/** key → kept key, for every record that duplicates an earlier (or better-supported) one. */
export function findDuplicates(records: EnrichedRecord[]): Map<string, string> {
  const order = records.map((r, i) => ({ r, i })).sort((a, b) => b.r.hits.length - a.r.hits.length || a.i - b.i)
  const owner = new Map<string, string>()
  const dup = new Map<string, string>()
  for (const { r } of order) {
    const ids = [r.paper.id, r.paper.doi ? `doi:${r.paper.doi.toLowerCase()}` : null, r.paper.pmid ? `pmid:${r.paper.pmid}` : null, r.extra.arxiv ? `arxiv:${r.extra.arxiv.id}` : null,
      r.paper.title && r.paper.year ? `t:${normTitle(r.paper.title)}|${r.paper.year}` : null].filter(Boolean) as string[]
    const hit = ids.map(id => owner.get(id)).find(k => k && k !== r.key)
    if (hit) { dup.set(r.key, hit); continue }
    for (const id of ids) owner.set(id, r.key)
  }
  return dup
}

export function gateOf(rec: EnrichedRecord, dupOf: string | undefined): string | null {
  if (rec.paper.isRetracted) return 'retracted'
  if (!rec.paper.title?.trim()) return 'no title'
  if (dupOf) return `duplicate of ${dupOf}`
  return null
}

export const safeFileId = (id: string) => id.replace(/^https?:\/\/openalex\.org\//, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '_').slice(0, 120) || 'paper'

// ---------- pass rule (D-27) ----------
export interface PassRule { topPercent: number; threshold: number }
export const DEFAULT_TOP_PERCENT = 25

/**
 * D-27: a paper passes when it is in the top `topPercent`% of the library's non-excluded papers by total
 * AND its total is at least `threshold` (the absolute floor). Pure; returns one boolean per input, in input order.
 * Top-k uses k = ceil(M × topPercent / 100) (at least 1 when M > 0); ties are broken by input order.
 */
export function passFlags(items: { total: number; excluded: string | null }[], rule: PassRule): boolean[] {
  const idx = items.map((p, i) => ({ p, i })).filter(x => !x.p.excluded).sort((a, b) => b.p.total - a.p.total || a.i - b.i)
  const pctl = Math.min(100, Math.max(0, rule.topPercent))
  const k = idx.length ? Math.max(1, Math.ceil((idx.length * pctl) / 100)) : 0
  const out = items.map(() => false)
  idx.forEach((x, r) => { if (r < k && x.p.total >= rule.threshold) out[x.i] = true })
  return out
}

/** "N of M pass (top X%, min Y)" — M counts non-excluded papers. */
export function passSummary(papers: { passed: boolean; excluded: string | null }[], rule: PassRule): string {
  const m = papers.filter(p => !p.excluded).length
  const n = papers.filter(p => p.passed).length
  return `${n} of ${m} pass (top ${rule.topPercent}%, min ${rule.threshold})`
}

/** Re-weights stored components (same rule as combine), re-applies the pass rule and re-ranks. Pure. */
export function rescorePapers(papers: LibPaper[], weights: Weights, rule: PassRule): LibPaper[] {
  const next = papers.map(p => {
    const assessed = p.components.filter(c => c.value != null)
    const sum = assessed.reduce((s, c) => s + (weights[c.key] ?? 0), 0)
    const components = p.components.map(c => {
      const weight = weights[c.key] ?? 0
      return { ...c, weight, contribution: c.value == null || sum <= 0 ? 0 : (weight * c.value) / sum }
    })
    return { ...p, components, total: clamp01(components.reduce((s, c) => s + c.contribution, 0)) }
  })
  const flags = passFlags(next, rule)
  next.forEach((p, i) => { p.passed = flags[i] })
  next.sort((a, b) => Number(!!a.excluded) - Number(!!b.excluded) || Number(b.passed) - Number(a.passed) || b.total - a.total || a.paper.title.localeCompare(b.paper.title))
  next.forEach((p, i) => { p.rank = i + 1 })
  return next
}

export interface ScoreOptions { weights: Weights; threshold: number; topPercent?: number; now?: Date }

export function scoreLibrary(items: ScoreItem[], goals: Goals, opts: ScoreOptions): LibPaper[] {
  const ctx = buildContext(items, goals, opts.now)
  const dups = findDuplicates(items.map(i => i.rec))
  const used = new Set<string>()
  const fileFor = (rec: EnrichedRecord) => {
    const base = safeFileId(rec.paper.id || rec.key)
    let name = base, n = 2
    while (used.has(name)) name = `${base}_${n++}`
    used.add(name)
    return `papers/${name}.json`
  }
  const scored = items.map(item => {
    const { components, total } = combine(rawComponents(item, ctx), opts.weights)
    // Track brief: "new" means absent from the starting collection — papers already in the vault are never recommended.
    const excluded = gateOf(item.rec, dups.get(item.rec.key)) ?? (ctx.knownKeys.has(item.rec.key) ? 'already in your vault' : null)
    const labels = ctx.knownKeys.has(item.rec.key) && !item.labels.tags.includes('in-vault') ? { ...item.labels, tags: [...item.labels.tags, 'in-vault'] } : item.labels
    const p: LibPaper = {
      paper: item.rec.paper, authors: item.rec.authors, venue: item.rec.venue, labels, hits: item.rec.hits, relations: item.rec.relations,
      components, total, passed: false, excluded, rank: 0, llmRead: item.llm, file: fileFor(item.rec),
    }
    return p
  })
  const flags = passFlags(scored, { topPercent: opts.topPercent ?? DEFAULT_TOP_PERCENT, threshold: opts.threshold })
  scored.forEach((p, i) => { p.passed = flags[i] })
  scored.sort((a, b) => Number(!!a.excluded) - Number(!!b.excluded) || Number(b.passed) - Number(a.passed) || b.total - a.total || a.paper.title.localeCompare(b.paper.title))
  scored.forEach((p, i) => { p.rank = i + 1 })
  return scored
}
