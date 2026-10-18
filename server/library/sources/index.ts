// Owner: lane L1. gather() = search all sources → graph expansion → normalize/resolve/dedupe → cap → enrich.
// One failing source never fails gather(): every call is wrapped, timed, and reported through onCall.
import type { Goals, Hit, LibraryRequest, SourceName } from '@shared/library'
import { mapLimit } from '../../data/http'
import { getWork } from '../../sources/openalex'
import { similar } from '../../sources/pubmed'
import { trace } from '../../trace'
import type { EnrichedRecord, SourceCall } from '../types'
import { type ArxivEntry, arxivByIds, arxivQuery, arxivSearch } from './arxiv'
import { enrich, type EnrichStats, fillWorksAndPubmed } from './enrich'
import { epmcByDoi, epmcByTitle } from './europepmc-lib'
import { arxivDoi, attachWork, capPile, type Cand, dedupe, newCand, parseKnownId, sameTitle } from './normalize'
import { citedByWorks, OaBudget, openalexBlocked, searchTitle, searchWorks, worksBy } from './openalex-lib'
import { efetch, esearch } from './pubmed-lib'
import { hasSerpApiKey, scholarSearch } from './scholar'
import { hasTavilyKey, TavilyBudget, tavilyLib } from './tavily-lib'

export { titleSimilarity, dedupe, normTitle } from './normalize'

// Per-call cap (a single slow request) and a whole-search-stage budget: calls still running when the budget ends are reported as
// skipped stragglers and their late results are ignored, so one slow source never holds the build.
const CALL_TIMEOUT_MS = 20000
const searchBudgetMs = () => Number(process.env.LIB_SEARCH_BUDGET_MS || 20000)
const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replace(/\s+/g, ' ').slice(0, 200)

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout after ${ms} ms (${what})`)), ms)
    p.then(v => { clearTimeout(t); res(v) }, e => { clearTimeout(t); rej(e) })
  })
}

/** Splits keywords into groups of 3–4. */
export function keywordGroups(keywords: string[]): string[][] {
  const ks = [...new Set(keywords.map(k => k.trim()).filter(Boolean))]
  if (!ks.length) return []
  if (ks.length <= 4) return [ks]
  const n = Math.ceil(ks.length / 4)
  const out: string[][] = Array.from({ length: n }, () => [])
  ks.forEach((k, i) => out[i % n].push(k))
  return out
}

export interface QueryPlan { text: string; via: 'keyword' | 'subtopic'; label: string; subtopic?: string; isQuestion?: boolean }

export function planQueries(goals: Goals): QueryPlan[] {
  const qs: QueryPlan[] = []
  if (goals.question.trim()) qs.push({ text: goals.question.trim(), via: 'subtopic', label: 'question', isQuestion: true })
  for (const s of goals.subtopics) if (s.query.trim()) qs.push({ text: s.query.trim(), via: 'subtopic', label: s.name, subtopic: s.name })
  for (const g of keywordGroups(goals.keywords)) qs.push({ text: g.join(' '), via: 'keyword', label: g.join(', ') })
  const seen = new Set<string>()
  return qs.filter(q => { const k = q.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
}

const hit = (source: SourceName, via: Hit['via'], query: string | null, rank: number | null, url: string): Hit => ({ source, via, query, rank, url })
const oaUrlOf = (w: any) => `https://openalex.org/${String(w.id).split('/').pop()}`

function arxivCand(e: ArxivEntry, h: Hit): Cand {
  return newCand({ ids: { arxiv: e.id, ...(e.doi ? { doi: e.doi } : {}) }, title: e.title, year: e.year, authors: e.authors, venue: e.journalRef, arxiv: e, hits: [h] })
}

/** Order-insensitive key for a search string: two queries with the same word set hit OpenAlex once. */
export function queryKey(q: string): string {
  return [...new Set(q.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean))].sort().join(' ')
}

/** Groups plans whose query text is equivalent under `keyOf`; the first plan of each group is the one sent. */
export function groupQueries<T extends { text: string }>(qs: T[], keyOf: (q: T) => string): T[][] {
  const m = new Map<string, T[]>()
  for (const q of qs) { const k = keyOf(q); const g = m.get(k); if (g) g.push(q); else m.set(k, [q]) }
  return [...m.values()]
}

export interface GatherStats { ms: Record<string, number>; stragglers: string[]; raw: number; deduped: number; capped: number; dropped: { noTitle: number; unresolvedWeb: number }; openalexRequests: number; tavilyCalls: number; enrich: EnrichStats }
export let lastGatherStats: GatherStats | null = null

export async function gather(goals: Goals, req: LibraryRequest, onCall: (c: SourceCall) => void): Promise<EnrichedRecord[]> {
  const enabled = new Set<SourceName>(req.sources)
  const budget = new OaBudget(120)
  const tb = new TavilyBudget(25)
  const cands: Cand[] = []
  const unresolvedWeb: Cand[] = [] // Tavily / Scholar hits with no identifier, resolved by title later
  const queries = planQueries(goals)
  const tStart = Date.now()
  const ms: Record<string, number> = {}
  const stragglers: string[] = []

  // While the search stage is open, results are collected; once it closes (all done or budget spent) late results are dropped.
  let searchOpen = true
  const pending = new Map<number, { source: SourceName; query: string; t0: number }>()
  let callSeq = 0
  const add = (c: Cand) => { if (searchOpen) cands.push(c) }
  const addWeb = (c: Cand) => { if (searchOpen) unresolvedWeb.push(c) }

  const call = async (source: SourceName, query: string, fn: () => Promise<number>) => {
    const t0 = Date.now()
    const id = ++callSeq
    pending.set(id, { source, query, t0 })
    try {
      const count = await withTimeout(fn(), CALL_TIMEOUT_MS, `${source} ${query.slice(0, 40)}`)
      if (pending.delete(id)) onCall({ source, query, count, ms: Date.now() - t0 })
    } catch (e) {
      if (pending.delete(id)) onCall({ source, query, count: 0, ms: Date.now() - t0, error: errMsg(e) })
    }
  }

  // ---------- 1. search ----------
  const openalex = async () => {
    // equivalent queries (same word set) are sent once; every plan in the group still gets its own Hit (provenance unchanged)
    const jobs: { group: QueryPlan[]; page: number }[] = []
    for (const group of groupQueries(queries, q => queryKey(q.text))) {
      jobs.push({ group, page: 1 })
      const sub = group.filter(q => q.subtopic)
      if (sub.length) jobs.push({ group: sub, page: 2 })
    }
    await mapLimit(jobs, 8, ({ group, page }) => call('openalex', page > 1 ? `${group[0].text} (page ${page})` : group[0].text, async () => {
      const r = await searchWorks(budget, group[0].text, page, 50)
      for (const q of group) r.works.forEach((w, i) => { const c = newCand({ hits: [hit('openalex', q.via, q.text, (page - 1) * 50 + i + 1, oaUrlOf(w))] }); attachWork(c, w); add(c) })
      return r.works.length
    }))
  }

  const pubmed = async () => {
    const found: { pmid: string; h: Hit }[] = []
    await mapLimit(queries, 3, q => call('pubmed', q.text, async () => {
      const r = await esearch(q.text, 40)
      r.pmids.forEach((p, i) => found.push({ pmid: p, h: hit('pubmed', q.via, q.text, i + 1, `https://pubmed.ncbi.nlm.nih.gov/${p}/`) }))
      return r.pmids.length
    }))
    if (!searchOpen) return
    if (!found.length) return
    await call('pubmed', `efetch ${new Set(found.map(f => f.pmid)).size} records`, async () => {
      const recs = await efetch(found.map(f => f.pmid))
      for (const f of found) {
        const r = recs.get(f.pmid)
        add(newCand({ ids: { pmid: f.pmid, ...(r?.doi ? { doi: r.doi } : {}), ...(r?.pmcid ? { pmcid: r.pmcid } : {}) }, title: r?.title ?? null, year: r?.year ?? null, authors: r?.authors ?? [], venue: r?.journal ?? null, pubmed: r, hits: [f.h] }))
      }
      return recs.size
    })
  }

  const arxiv = async () => {
    // many plans collapse to the same 3-word arXiv query (anchored on the question): send each distinct query once
    const groups = groupQueries(queries, q => arxivQuery(q.text, goals.question) || `all:${q.text}`)
    await mapLimit(groups, 1, group => call('arxiv', group[0].text, async () => {
      const r = await arxivSearch(group[0].text, 30, goals.question)
      for (const q of group) r.entries.forEach((e, i) => add(arxivCand(e, hit('arxiv', q.via, q.text, i + 1, e.url))))
      return r.entries.length
    }))
  }

  const tavily = async () => {
    if (!hasTavilyKey()) { onCall({ source: 'tavily', query: '(all)', count: 0, ms: 0, error: 'skipped — no TAVILY_API_KEY' }); return }
    await mapLimit(queries, 9, q => call('tavily', q.text, async () => {
      const { items } = await tavilyLib(tb, q.text, q.subtopic ? 'advanced' : 'basic', 10)
      for (const it of items) {
        const h = hit('tavily', 'web', q.text, it.rank, it.url)
        const c = newCand({ ids: { ...(it.doi ? { doi: it.doi } : {}), ...(it.pmid ? { pmid: it.pmid } : {}), ...(it.pmcid ? { pmcid: it.pmcid } : {}), ...(it.arxiv ? { arxiv: it.arxiv } : {}) }, title: it.title || null, hits: [h] })
        if (it.doi || it.pmid || it.arxiv) add(c); else addWeb(c)
      }
      return items.length
    }))
  }

  const scholar = async () => {
    if (!hasSerpApiKey()) { onCall({ source: 'scholar', query: '(all)', count: 0, ms: 0, error: 'skipped — not configured (no SERPAPI_KEY)' }); return }
    await mapLimit(queries.filter(q => q.subtopic || q.isQuestion), 2, q => call('scholar', q.text, async () => {
      const r = await scholarSearch(q.text, 20)
      for (const it of r.items) {
        const c = newCand({ ids: { ...(it.doi ? { doi: it.doi } : {}), ...(it.pmid ? { pmid: it.pmid } : {}), ...(it.arxiv ? { arxiv: it.arxiv } : {}) }, title: it.title, year: it.year, authors: it.authors, venue: it.venue, scholar: { citedBy: it.citedBy, link: it.link, snippet: it.snippet, resultId: it.resultId }, hits: [hit('scholar', q.via, q.text, it.position, it.link)] })
        if (it.doi || it.pmid || it.arxiv) add(c); else addWeb(c) // title-only Scholar items still become records if unresolved
      }
      return r.items.length
    }))
  }

  // ---------- graph expansion of the vault's known papers ----------
  const expand = async () => {
    const known = goals.knownPapers.map(k => ({ raw: k, id: parseKnownId(k) })).filter(k => k.id)
    await mapLimit(known, 3, async k => {
      const id = k.id!
      let wid: string | null = id.kind === 'openalex' ? id.value : null
      let refs: string[] = []
      let pmid: string | null = id.kind === 'pmid' ? id.value : null
      let doi: string | null = id.kind === 'doi' ? id.value : id.kind === 'arxiv' ? arxivDoi(id.value) : null
      await call('openalex', `resolve known paper ${k.raw}`, async () => {
        const ref = id.kind === 'arxiv' ? { kind: 'doi' as const, value: arxivDoi(id.value) } : { kind: id.kind as 'openalex' | 'doi' | 'pmid', value: id.value }
        const f = await getWork(ref) // A1 helper: same cache as discovery mode
        if (!f) return 0
        wid = f.value.id; refs = f.value.referencedWorks; pmid = pmid ?? f.value.pmid; doi = doi ?? f.value.doi
        return 1
      })
      if (!pmid && doi) { // OpenAlex unreachable or no PMID: Europe PMC knows the PMID for most biomedical DOIs
        try { const m = await epmcByDoi([doi]); pmid = m.get(doi)?.pmid ?? null } catch { /* ignore */ }
      }
      const kp = wid ?? (pmid ? `pmid:${pmid}` : doi ? `doi:${doi}` : `arxiv:${id.value}`)
      add(newCand({ ids: { ...(wid ? { openalex: wid } : {}), ...(pmid ? { pmid } : {}), ...(doi ? { doi } : {}), ...(id.kind === 'arxiv' ? { arxiv: id.value } : {}) }, hits: [hit(wid ? 'openalex' : 'pubmed', 'known_paper', k.raw, null, wid ? `https://openalex.org/${wid}` : pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : `https://doi.org/${doi}`)] }))
      const tasks: Promise<void>[] = []
      if (wid && enabled.has('openalex')) {
        refs.forEach((r, i) => add(newCand({ ids: { openalex: r }, hits: [hit('openalex', 'references', k.raw, i + 1, `https://openalex.org/${r}`)], relations: [{ type: 'cited_by', paperId: kp, note: 'in the known paper\'s referenced_works (OpenAlex)' }] })))
        onCall({ source: 'openalex', query: `references of ${k.raw}`, count: refs.length, ms: 0 })
        tasks.push(call('openalex', `cited by ${k.raw}`, async () => {
          const r = await citedByWorks(budget, wid!, 50)
          r.works.forEach((w, i) => { const c = newCand({ hits: [hit('openalex', 'cited_by', k.raw, i + 1, oaUrlOf(w))], relations: [{ type: 'cites', paperId: kp, note: 'cites the known paper (OpenAlex cites: filter)' }] }); attachWork(c, w); add(c) })
          return r.works.length
        }))
      }
      if (pmid && enabled.has('pubmed')) {
        tasks.push(call('pubmed', `similar to PMID ${pmid}`, async () => {
          const r = await similar(pmid!, 20)
          r.pmids.forEach(p => add(newCand({ ids: { pmid: p.pmid }, hits: [hit('pubmed', 'similar', k.raw, p.rank, `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`)], relations: [{ type: 'similar', paperId: kp, note: `PubMed similar articles rank ${p.rank}` }] })))
          return r.pmids.length
        }))
      }
      await Promise.all(tasks)
    })
  }

  const runners: Record<SourceName, () => Promise<void>> = { openalex, pubmed, arxiv, tavily, scholar }
  const all = Promise.all([...[...enabled].map(s => runners[s]().catch(e => onCall({ source: s, query: '(source)', count: 0, ms: 0, error: errMsg(e) }))), expand().catch(e => onCall({ source: 'openalex', query: '(graph expansion)', count: 0, ms: 0, error: errMsg(e) }))])
  let budgetTimer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([all, new Promise<void>(res => { budgetTimer = setTimeout(res, searchBudgetMs()) })])
  clearTimeout(budgetTimer)
  searchOpen = false
  for (const [id, p] of pending) { // stragglers: report once, ignore whatever they return later
    pending.delete(id)
    stragglers.push(`${p.source}: ${p.query.slice(0, 60)}`)
    onCall({ source: p.source, query: p.query, count: 0, ms: Date.now() - p.t0, error: `straggler skipped — search budget ${searchBudgetMs()} ms spent` })
  }
  all.catch(() => {})
  ms.search = Date.now() - tStart

  // ---------- 2. resolve to OpenAlex, else to PubMed / Europe PMC ----------
  // Two independent branches run in parallel: (a) identifier hits -> OpenAlex by DOI / PMID -> Europe PMC / arXiv for the rest,
  // (b) title-only web / Scholar hits -> OpenAlex title search -> Europe PMC title search.
  const t1 = Date.now()
  const errors: string[] = []
  const rawCount = cands.length + unresolvedWeb.length
  const noOa = cands.filter(c => !c.ids.openalex)
  const byIds = async () => {
    const doiNeed = [...new Set(noOa.flatMap(c => [c.ids.doi, c.ids.arxiv ? arxivDoi(c.ids.arxiv) : undefined]).filter((x): x is string => !!x))]
    const [byDoi, byPmid] = await Promise.all([
      worksBy(budget, 'doi', doiNeed, e => errors.push('openalex doi: ' + errMsg(e))),
      worksBy(budget, 'pmid', [...new Set(noOa.filter(c => !c.ids.doi).map(c => c.ids.pmid).filter((x): x is string => !!x))], e => errors.push('openalex pmid: ' + errMsg(e))),
    ])
    const doiMap = new Map(byDoi.map(w => [String(w.doi ?? '').toLowerCase().replace(/^https?:\/\/doi\.org\//, ''), w]))
    const pmidMap = new Map(byPmid.map(w => [String(w.ids?.pmid ?? '').split('/').pop(), w]))
    for (const c of noOa) {
      const w = (c.ids.doi && doiMap.get(c.ids.doi)) || (c.ids.arxiv && doiMap.get(arxivDoi(c.ids.arxiv))) || (c.ids.pmid && pmidMap.get(c.ids.pmid))
      if (w) attachWork(c, w)
    }
    // DOI-only web hits that OpenAlex could not resolve: Europe PMC gives PMID / title / journal / abstract
    const doiOnly = cands.filter(c => !c.ids.openalex && !c.ids.pmid && !c.ids.arxiv && c.ids.doi)
    // arXiv ids seen only on the web: fetch the entries
    const axOnly = cands.filter(c => c.ids.arxiv && !c.arxiv && !c.work)
    await Promise.all([
      (async () => {
        if (!doiOnly.length) return
        const m = await epmcByDoi(doiOnly.map(c => c.ids.doi!), e => errors.push('europepmc doi: ' + errMsg(e)))
        for (const c of doiOnly) {
          const r = m.get(c.ids.doi!)
          if (!r) continue
          if (r.pmid) c.ids.pmid = r.pmid
          if (r.pmcid) c.ids.pmcid = r.pmcid
          c.title = r.title || c.title; c.year = r.year ?? c.year; c.venue = r.journal ?? c.venue
          if (!c.authors.length) c.authors = r.authors
          if (r.abstract) c.europepmc = { abstract: r.abstract }
        }
      })(),
      (async () => {
        if (!axOnly.length || !enabled.has('arxiv')) return
        try {
          const es = new Map((await arxivByIds(axOnly.map(c => c.ids.arxiv!))).map(e => [e.id, e]))
          for (const c of axOnly) { const e = es.get(c.ids.arxiv!); if (e) { c.arxiv = e; c.title = e.title; c.year = e.year; if (!c.authors.length) c.authors = e.authors } }
        } catch (e) { errors.push('arxiv ids: ' + errMsg(e)) }
      })(),
    ])
  }
  // Title-only web / Scholar hits: OpenAlex title search (strict), else Europe PMC title search
  let droppedWeb = 0
  const titled = unresolvedWeb.filter(c => (c.title ?? '').length >= 20).slice(0, 30)
  droppedWeb += unresolvedWeb.length - titled.length
  const byTitle = async () => {
    const oaTitled = openalexBlocked() ? [] : titled.slice(0, 15)
    await mapLimit(oaTitled, 5, async c => {
      try { const w = (await searchTitle(budget, c.title!)).find(x => sameTitle(x.display_name ?? '', c.title!, x.publication_year, c.year)); if (w) attachWork(c, w) } catch (e) { errors.push('openalex title: ' + errMsg(e)) }
    })
    const rest = titled.filter(c => !c.work)
    const ep = await epmcByTitle(rest.map(c => ({ title: c.title!, year: c.year })), e => errors.push('europepmc title: ' + errMsg(e)))
    rest.forEach((c, i) => { const r = ep[i]; if (r) { if (r.pmid) c.ids.pmid = r.pmid; if (r.doi) c.ids.doi = r.doi; if (r.pmcid) c.ids.pmcid = r.pmcid; c.title = r.title; c.year = r.year; c.venue = r.journal; c.authors = r.authors; if (r.abstract) c.europepmc = { abstract: r.abstract } } })
  }
  await Promise.all([byIds(), byTitle()])
  for (const c of titled) {
    if (c.work || c.ids.pmid || c.ids.doi) cands.push(c)
    else if (c.scholar) cands.push(c) // unresolved Scholar items stay as scholar:<hash> records
    else droppedWeb++
  }
  ms.resolve = Date.now() - t1

  // ---------- 3. dedupe, cap, enrich ----------
  const t2 = Date.now()
  let pile = dedupe(cands)
  const deduped = pile.length
  pile = capPile(pile, req.maxCandidates)
  const capped = pile.length
  const st: EnrichStats = { works: 0, venues: 0, authors: 0, pubmed: 0, epmcAbstracts: 0, errors }
  await fillWorksAndPubmed(pile, budget, st)
  pile = dedupe(pile) // identifiers learned during enrichment can reveal more duplicates
  const before = pile.length
  pile = pile.filter(c => !!(c.title || c.work?.display_name || c.pubmed?.title || c.arxiv?.title))
  ms.fill = Date.now() - t2
  const t3 = Date.now()
  const records = await enrich(pile, budget, st)
  ms.enrich = Date.now() - t3
  ms.total = Date.now() - tStart
  lastGatherStats = { ms, stragglers, raw: rawCount, deduped, capped, dropped: { noTitle: before - pile.length, unresolvedWeb: droppedWeb }, openalexRequests: budget.used, tavilyCalls: tb.used, enrich: st }
  trace('events', { type: 'library_gather', ...lastGatherStats, errors: st.errors.slice(0, 20) })
  return records
}
