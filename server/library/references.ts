// CR-10 E-2. Europe PMC reference fallback: when OpenAlex gave a paper no referenced_works (429 / no key / PubMed-only
// record), fetch its reference list from Europe PMC by PMID and match each reference to papers in THIS library by
// PMID, DOI, then normalized title + year. Matches become `cites` / `cited_by` relations and paper.referencedWorks
// entries, so the graph draws them like OpenAlex references. Never throws; time-boxed; every result traced ('references').
import type { LibPaper } from '@shared/library'
import { referencesByPmid, type EpmcRef } from '../sources/europepmc'
import { trace } from '../trace'

export type RefFetcher = (pmid: string, timeoutMs: number) => Promise<EpmcRef[]>

export interface RefsOptions {
  fetch?: RefFetcher
  concurrency?: number // default 6
  requestTimeoutMs?: number // default 6000
  totalTimeoutMs?: number // default 12000: settle whatever finished by then
  maxPapers?: number // default 120 (best-ranked first)
}

export interface RefsResult {
  candidates: number // papers that qualified (PMID, no references yet)
  calls: number // Europe PMC requests started
  ok: number // requests that returned
  errors: number
  timedOut: number // per-request timeouts + requests still running at the time box
  papersWithRefs: number // papers whose reference list was non-empty
  refsReturned: number
  papersLinked: number // citing papers with ≥ 1 match in the library
  links: number // new cites edges
  ms: number
}

export const NOTE = 'Europe PMC references'

const digits = (s: string | null | undefined) => (s && /^\d+$/.test(s.trim()) ? s.trim() : null)
export const pmidOf = (p: LibPaper): string | null => digits(p.paper.pmid) ?? (p.paper.id.startsWith('pmid:') ? digits(p.paper.id.slice(5)) : null)
const normDoi = (d: string | null | undefined) => (d ? d.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:/, '') || null : null)
export const normTitle = (t: string | null | undefined) =>
  (t ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
const titleKey = (t: string | null | undefined, y: number | null | undefined) => {
  const n = normTitle(t)
  return n.split(' ').length >= 4 && y ? `${n}|${y}` : null // short titles ("Caffeine.") are too ambiguous to match on
}

function addRel(p: LibPaper, type: 'cites' | 'cited_by', paperId: string): boolean {
  if (p.relations.some(r => r.type === type && r.paperId === paperId)) return false
  p.relations.push({ type, paperId, note: NOTE })
  return true
}

const sleep = (ms: number) => new Promise<void>(r => { const t = setTimeout(r, ms); (t as { unref?: () => void }).unref?.() })
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

/**
 * Mutates `papers` (all scored papers of the library) in place. Citing set: passed, non-excluded papers plus the
 * question's known papers (goals.knownPapers) that are in the library — each with a PMID and empty referencedWorks.
 */
export async function addEuropePmcReferences(papers: LibPaper[], knownPapers: string[], opts: RefsOptions = {}): Promise<RefsResult> {
  const t0 = Date.now()
  const fetchRefs = opts.fetch ?? referencesByPmid
  const reqMs = opts.requestTimeoutMs ?? 6000
  const totalMs = opts.totalTimeoutMs ?? 12000
  const res: RefsResult = { candidates: 0, calls: 0, ok: 0, errors: 0, timedOut: 0, papersWithRefs: 0, refsReturned: 0, papersLinked: 0, links: 0, ms: 0 }

  // index of this library
  const byId = new Map<string, LibPaper>()
  const byPmid = new Map<string, LibPaper>()
  const byDoi = new Map<string, LibPaper>()
  const byTitle = new Map<string, LibPaper>()
  for (const p of papers) {
    byId.set(p.paper.id, p)
    const pm = pmidOf(p); if (pm && !byPmid.has(pm)) byPmid.set(pm, p)
    const d = normDoi(p.paper.doi); if (d && !byDoi.has(d)) byDoi.set(d, p)
    const tk = titleKey(p.paper.title, p.paper.year); if (tk && !byTitle.has(tk)) byTitle.set(tk, p)
  }

  // known papers (seeds) that are in the library
  const knownIds = new Set<string>()
  for (const k of knownPapers) {
    const raw = k.trim()
    const pm = digits(raw.replace(/^pmid:\s*/i, ''))
    const hit = byId.get(raw) ?? (pm ? byPmid.get(pm) : undefined) ?? byDoi.get(normDoi(raw) ?? '')
    if (hit) knownIds.add(hit.paper.id)
  }

  const citing = papers
    .filter(p => ((p.passed && !p.excluded) || knownIds.has(p.paper.id)) && pmidOf(p) && p.paper.referencedWorks.length === 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, opts.maxPapers ?? 120)
  res.candidates = citing.length

  let closed = false // after the time box, late results are dropped (files and events are already being written)
  const apply = (p: LibPaper, pmid: string, refs: EpmcRef[], ms: number) => {
    res.ok++
    res.refsReturned += refs.length
    if (refs.length) res.papersWithRefs++
    const matched: { id: string; by: 'pmid' | 'doi' | 'title' }[] = []
    const seen = new Set<string>()
    for (const r of refs) {
      let m: LibPaper | undefined; let by: 'pmid' | 'doi' | 'title' = 'pmid'
      if (r.pmid && (m = byPmid.get(r.pmid))) by = 'pmid'
      else if (r.doi && (m = byDoi.get(normDoi(r.doi) ?? ''))) by = 'doi'
      else if ((m = byTitle.get(titleKey(r.title, r.year) ?? ''))) by = 'title'
      if (!m || m === p || seen.has(m.paper.id)) continue
      seen.add(m.paper.id)
      matched.push({ id: m.paper.id, by })
      if (addRel(p, 'cites', m.paper.id)) res.links++
      addRel(m, 'cited_by', p.paper.id)
      if (!p.paper.referencedWorks.includes(m.paper.id)) p.paper.referencedWorks.push(m.paper.id)
    }
    if (matched.length) res.papersLinked++
    trace('references', { paperId: p.paper.id, pmid, refs: refs.length, matched: matched.length, ms, ids: matched })
  }

  let next = 0
  let inflight = 0
  const worker = async () => {
    while (!closed && next < citing.length) {
      const p = citing[next++]
      const pmid = pmidOf(p)!
      res.calls++
      const s0 = Date.now()
      inflight++
      try {
        const refs = await withTimeout(fetchRefs(pmid, reqMs), reqMs)
        if (closed) { trace('references', { paperId: p.paper.id, pmid, error: 'finished after the time box (dropped)', ms: Date.now() - s0 }); continue }
        apply(p, pmid, refs, Date.now() - s0)
      } catch (e) {
        if (closed) continue
        const msg = String((e as Error)?.message ?? e).slice(0, 200)
        if (/timeout|abort/i.test(msg)) res.timedOut++; else res.errors++
        trace('references', { paperId: p.paper.id, pmid, error: msg, ms: Date.now() - s0 })
      } finally { inflight-- }
    }
  }
  const all = Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 6, citing.length) }, worker))
  await Promise.race([all, sleep(totalMs)])
  closed = true
  res.timedOut += inflight // still running at the time box: their results are dropped
  res.ms = Date.now() - t0
  trace('references', { summary: true, ...res })
  return res
}
