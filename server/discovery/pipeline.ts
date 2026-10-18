// Owner: lane A1. The discovery run: resolve → R1..R5 → lanes → embed → rerank → judge → verify → order.
// Every stage emits start/done (or skipped/error) with counts and ms; one failing route never kills the run.
import { Judgement as JudgementSchema, LANE_ORDER, type Candidate, type Facet, type Lane, type Paper, type RouteId, type Seed, type Signal } from '@shared/contracts'
import type { RunConfig } from '@shared/config'
import type { StageName } from '@shared/contracts'
import * as ai from '../ai/index'
import { mapLimit } from '../data/http'
import * as repo from '../data/repo'
import { citingBoth, getWorksBy, search } from '../sources/openalex'
import { similar } from '../sources/pubmed'
import { emit, snapshotOf, type RunState } from './registry'
import { assignLane, computeLinks, freshCutoff, orderLanes, percentiles, preJudgeCompare, toSeedLite, whyRanked, type PoolItem, type SeedLite } from './rank'
import { fillAbstractsFromPubmed, resolveSeeds } from './seeds'

interface Item extends PoolItem { feat?: ReturnType<typeof computeLinks> }
type Pool = Map<string, Item>

const EMBED_MODEL = () => process.env.EMBED_MODEL || 'Qwen/Qwen3-Embedding-8B'
const EMBED_DIMS = () => Number(process.env.EMBED_DIMS || 1024)

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(fallback) })
  })
}

async function stage<T>(run: RunState, name: StageName, fallback: T, fn: () => Promise<{ value: T; count?: number; message?: string; skipped?: boolean }>): Promise<T> {
  const t0 = Date.now()
  emit(run, { type: 'stage', stage: name, status: 'start' })
  try {
    const r = await fn()
    emit(run, { type: 'stage', stage: name, status: r.skipped ? 'skipped' : 'done', count: r.count, message: r.message, ms: Date.now() - t0 })
    return r.value
  } catch (e) {
    const message = (e as Error).message?.slice(0, 300) || String(e)
    console.warn(`[run ${run.id}] stage ${name} failed:`, message)
    emit(run, { type: 'stage', stage: name, status: 'error', message, ms: Date.now() - t0 })
    return fallback
  }
}

function addToPool(pool: Pool, seedIds: Set<string>, paper: Paper, route: RouteId, signal?: Signal): Item | null {
  if (seedIds.has(paper.id)) return null
  let it = pool.get(paper.id)
  if (!it) { it = { paper, routes: new Set(), signals: [], inRaw: new Set(), pubmedRank: null }; pool.set(paper.id, it) }
  else if (!it.paper.abstract && paper.abstract) it.paper = { ...paper, referencedWorks: it.paper.referencedWorks.length ? it.paper.referencedWorks : paper.referencedWorks }
  it.routes.add(route)
  if (signal) it.signals.push(signal)
  return it
}

const docText = (p: Paper) => `${p.title}\n\n${p.abstract ?? ''}`.trim()
const cos = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i]; return s }

export function laneCounts(cands: Candidate[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(LANE_ORDER.map(l => [l, 0]))
  for (const c of cands) counts[c.lane] = (counts[c.lane] ?? 0) + 1
  return counts
}

/** Top `perLane` of each lane, in LANE_ORDER then rank. */
export function topPerLane(cands: Candidate[], perLane: number): Candidate[] {
  return LANE_ORDER.flatMap(l => cands.filter(c => c.lane === l).sort((a, b) => a.rank - b.rank).slice(0, perLane))
}

export async function runPipeline(run: RunState, seedInputs: string[]): Promise<void> {
  const cfg = run.cfg
  const prov: repo.ProvenanceRow[] = []
  emit(run, { type: 'run', runId: run.id, question: run.question, preset: run.preset, config: { ...cfg } as Record<string, number | boolean | string> })

  // ---- resolve seeds --------------------------------------------------------------------------------
  const seeds = await stage<Seed[]>(run, 'resolve', [], async () => {
    const r = await resolveSeeds(seedInputs)
    for (const q of r.requests) prov.push({ paperId: q.paperId, route: 'seed', api: 'openalex', requestUrl: q.url, rawHash: q.hash })
    const message = r.errors.length ? r.errors.map(e => `${e.input}: ${e.message}`).join('; ') : undefined
    return { value: r.seeds, count: r.seeds.length, message }
  })
  run.seeds = seeds
  emit(run, { type: 'seeds', seeds })
  if (!seeds.length) {
    emit(run, { type: 'error', message: 'No seed could be resolved', stage: 'resolve' })
    return finish(run, [], 'error')
  }
  const seedIds = new Set(seeds.map(s => s.id))
  const lite: SeedLite[] = seeds.map(toSeedLite)
  const pool: Pool = new Map()

  // facets in parallel with the graph routes; R4 and the Scout need them
  const facetsP: Promise<Facet[]> = withTimeout(ai.facets(run.question, seeds, cfg), cfg.timeoutMs, [] as Facet[]).then(f => {
    run.facets = f?.length ? f : [{ key: 'topic', label: 'Topic', query: run.question }, { key: 'method', label: 'Method', query: run.question }, { key: 'population', label: 'Population', query: run.question }]
    emit(run, { type: 'facets', facets: run.facets })
    return run.facets
  })

  // ---- R1 references of seeds -----------------------------------------------------------------------
  const r1 = stage(run, 'r1', 0, async () => {
    const inBy = new Map<string, Set<number>>()
    for (const s of seeds) for (const ref of s.referencedWorks) { if (!inBy.has(ref)) inBy.set(ref, new Set()); inBy.get(ref)!.add(s.n) }
    const ids = [...inBy.keys()].filter(id => !seedIds.has(id))
    const { papers, requests } = await getWorksBy('openalex_id', ids)
    for (const p of papers) {
      const ns = [...(inBy.get(p.id) ?? [])]
      const it = addToPool(pool, seedIds, p, 'R1')
      if (!it) continue
      for (const n of ns) {
        it.inRaw.add(n)
        it.signals.push({ kind: 'cited_by_seed', route: 'R1', seedNs: [n], source: { name: 'OpenAlex', url: `https://api.openalex.org/works/${seeds[n - 1].id}` }, note: `in the reference list of S${n}` })
      }
      prov.push({ paperId: p.id, route: 'R1', viaSeedId: seeds[ns[0] - 1]?.id, api: 'openalex', requestUrl: requests[0]?.url, rawHash: requests[0]?.hash })
    }
    return { value: papers.length, count: papers.length, message: `${ids.length} references, ${papers.length} resolved` }
  })

  // ---- R2 works citing ≥2 seeds (pairwise AND filters) ----------------------------------------------
  const r2 = stage(run, 'r2', 0, async () => {
    if (seeds.length < 2) return { value: 0, count: 0, skipped: true, message: 'needs ≥2 seeds' }
    const pairs: [Seed, Seed][] = []
    for (let i = 0; i < seeds.length; i++) for (let j = i + 1; j < seeds.length; j++) pairs.push([seeds[i], seeds[j]])
    let failed = 0
    const found = new Set<string>()
    await mapLimit(pairs, 8, async ([a, b]) => {
      try {
        const r = await citingBoth(a.id, b.id, cfg.r2MaxPerPair)
        for (const p of r.value) {
          if (addToPool(pool, seedIds, p, 'R2')) {
            if (!found.has(p.id)) prov.push({ paperId: p.id, route: 'R2', viaSeedId: a.id, api: 'openalex', requestUrl: r.url, rawHash: r.hash })
            found.add(p.id)
          }
        }
      } catch (e) { failed++; console.warn('R2 pair failed', a.label, b.label, (e as Error).message) }
    })
    return { value: found.size, count: found.size, message: `${pairs.length} seed pairs${failed ? `, ${failed} failed` : ''}` }
  })

  // ---- R3 PubMed similar articles → OpenAlex by pmid ------------------------------------------------
  const r3 = stage(run, 'r3', 0, async () => {
    const withPmid = seeds.filter(s => s.pmid)
    if (!withPmid.length) return { value: 0, count: 0, skipped: true, message: 'no seed has a PMID' }
    const best = new Map<string, { rank: number; seeds: Map<number, number> }>()
    for (const s of withPmid) {
      try {
        const r = await similar(s.pmid!, cfg.r3PerSeed)
        for (const l of r.pmids) {
          const b = best.get(l.pmid) ?? { rank: 1e9, seeds: new Map() }
          b.rank = Math.min(b.rank, l.rank); b.seeds.set(s.n, l.rank); best.set(l.pmid, b)
        }
      } catch (e) { console.warn('R3 elink failed', s.label, (e as Error).message) }
    }
    const { papers, requests } = await getWorksBy('pmid', [...best.keys()])
    for (const p of papers) {
      const b = p.pmid ? best.get(p.pmid) : undefined
      if (!b) continue
      const it = addToPool(pool, seedIds, p, 'R3')
      if (!it) continue
      it.pubmedRank = Math.min(it.pubmedRank ?? 1e9, b.rank)
      for (const [n, rank] of b.seeds) it.signals.push({ kind: 'pubmed_similar', route: 'R3', seedNs: [n], value: rank, source: { name: 'PubMed', url: `https://pubmed.ncbi.nlm.nih.gov/?linkname=pubmed_pubmed&from_uid=${seeds[n - 1].pmid}` }, note: `#${rank} similar to S${n}` })
      prov.push({ paperId: p.id, route: 'R3', viaSeedId: seeds[[...b.seeds.keys()][0] - 1]?.id, api: 'pubmed+openalex', requestUrl: requests[0]?.url, rawHash: requests[0]?.hash })
    }
    return { value: papers.length, count: papers.length, message: `${best.size} PubMed neighbours, ${papers.length} in OpenAlex` }
  })

  // ---- R4 query expansion ---------------------------------------------------------------------------
  const r4 = facetsP.then(facets => stage(run, 'r4', 0, async () => {
    const queries = (await withTimeout(ai.expandQueries(run.question, facets, cfg), cfg.timeoutMs, [] as string[])) ?? []
    if (!queries.length) return { value: 0, count: 0, skipped: true, message: 'no queries (AI unavailable)' }
    let n = 0
    await mapLimit(queries.slice(0, 4), 4, async q => {
      const r = await search(q, 10)
      for (const p of r.value) if (addToPool(pool, seedIds, p, 'R4', { kind: 'query', route: 'R4', seedNs: [], source: { name: 'OpenAlex search', url: r.url }, note: q })) { n++; prov.push({ paperId: p.id, route: 'R4', api: 'openalex', requestUrl: r.url, rawHash: r.hash }) }
    })
    return { value: n, count: n, message: queries.join(' | ') }
  }))

  // ---- R5 Scout (runs alongside; merged after the first lane pass) ----------------------------------
  const scoutP = facetsP.then(facets => stage<Paper[] | null>(run, 'scout', null, async () => {
    const res = await withTimeout(ai.scout(run.question, seeds, facets, cfg, s => emit(run, { type: 'agent', ...s })), cfg.scoutMaxMs + 5000, { dois: [], openalexIds: [], webSources: [] })
    if (res.webSources.length) repo.addWebSources(run.id, res.webSources)
    if (!res.dois.length && !res.openalexIds.length) return { value: null, count: 0, skipped: !res.webSources.length, message: res.webSources.length ? `${res.webSources.length} web sources, no papers` : 'scout unavailable' }
    const a = await getWorksBy('doi', res.dois.map(d => d.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')))
    const b = await getWorksBy('openalex_id', res.openalexIds.map(x => x.split('/').pop()!))
    const papers = [...a.papers, ...b.papers]
    return { value: papers.map(p => ({ ...p, __web: res.webSources }) as any), count: papers.length, message: `${res.webSources.length} web sources` }
  }))

  await Promise.all([r1, r2, r3, r4])
  const routesMs = Date.now() - run.startedAt

  // ---- lanes ----------------------------------------------------------------------------------------
  const freshFrom = freshCutoff(cfg.freshMonths)
  const build = (): Candidate[] => {
    const out: Candidate[] = []
    for (const it of pool.values()) {
      if (!it.feat) it.feat = computeLinks(it, lite)
      const features = { ...it.feat, coupling: null, eSeed: null, eQuestion: null, eFacets: null, rerank: null, impact: it.paper.citationPct, pubmedRank: it.pubmedRank }
      out.push({ paper: it.paper, lane: assignLane(it.paper, it.feat.links, freshFrom), routes: [...it.routes].sort(), signals: it.signals, features, judgement: null, score: 0, rank: 0, whyRanked: '' })
    }
    return out
  }
  const publish = (cands: Candidate[], rerankPct = new Map<string, number>()) => {
    const ordered = orderLanes(cands, rerankPct)
    for (const c of ordered) c.whyRanked = whyRanked(c, seeds.length, rerankPct.get(c.paper.id))
    run.candidates = topPerLane(ordered, cfg.sendPerLane)
    run.counts = laneCounts(ordered)
    run.total = ordered.length
    emit(run, { type: 'candidates', candidates: run.candidates, counts: run.counts, total: run.total })
    return ordered
  }

  let cands = await stage<Candidate[]>(run, 'lanes', [], async () => {
    const missing = [...pool.values()].filter(it => !it.paper.abstract && (it.paper.pmid || it.paper.doi)).map(it => it.paper)
    const ab = await fillAbstractsFromPubmed(missing)
    const c = publish(build())
    try { repo.upsertPapers([...seeds, ...c.map(x => x.paper)]); repo.addProvenance(run.id, prov.splice(0)) } catch (e) { console.warn('store failed', (e as Error).message) }
    return { value: c, count: c.length, message: `routes ${(routesMs / 1000).toFixed(1)} s · abstracts +${ab.pubmed} PubMed +${ab.europepmc} Europe PMC · ${JSON.stringify(laneCounts(c))}` }
  })

  // merge Scout results, if any
  const scoutPapers = await scoutP
  if (scoutPapers?.length) {
    for (const p of scoutPapers as (Paper & { __web?: { url: string; title: string; snippet: string }[] })[]) {
      const web = p.__web?.find(w => (p.doi && (w.url.toLowerCase().includes(p.doi) || w.snippet.toLowerCase().includes(p.doi))))
      const { __web, ...paper } = p as any
      addToPool(pool, seedIds, paper as Paper, 'R5', { kind: 'web', route: 'R5', seedNs: [], source: web ? { name: web.title || 'web', url: web.url } : { name: 'Scout agent', url: `https://openalex.org/${paper.id}` } })
    }
    try { await fillAbstractsFromPubmed([...pool.values()].filter(it => it.routes.has('R5') && !it.paper.abstract).map(it => it.paper)) } catch { /* optional */ }
    cands = publish(build())
    try { repo.upsertPapers(cands.filter(c => c.routes.includes('R5')).map(c => c.paper)); repo.addProvenance(run.id, prov.splice(0)) } catch { /* ignore */ }
  }

  // ---- embeddings -----------------------------------------------------------------------------------
  const byLane = (lanes: Lane[]) => cands.filter(c => lanes.includes(c.lane) && c.paper.abstract).sort((a, b) => LANE_ORDER.indexOf(a.lane) - LANE_ORDER.indexOf(b.lane) || a.rank - b.rank)
  const facets = run.facets
  const embedded = await stage(run, 'embed', false, async () => {
    const bridges = byLane(['Bridges'])
    const main = byLane(['Core', 'Fresh', 'Linked'])
    const max = Math.max(0, cfg.embedMaxDocs - seeds.length)
    const nb = Math.min(bridges.length, Math.floor(max * 0.25))
    const chosen = [...main.slice(0, max - nb), ...bridges.slice(0, nb)]
    const docs = [...seeds.filter(s => s.abstract || s.title), ...chosen.map(c => c.paper)].map(p => ({ id: p.id, text: docText(p) }))
    const model = EMBED_MODEL(), dims = EMBED_DIMS()
    const cached = (() => { try { return repo.getEmbeddings('paper', model, dims, docs) } catch { return new Map<string, number[]>() } })()
    const todo = docs.filter(d => !cached.has(d.id))
    const queries = [run.question, ...facets.map(f => f.query)]
    const [qv, dv] = await Promise.all([
      withTimeout(ai.embed(queries, 'query', cfg), cfg.timeoutMs * 2, null),
      todo.length ? withTimeout(ai.embed(todo.map(d => d.text), 'document', cfg), cfg.timeoutMs * 3, null) : Promise.resolve([] as number[][]),
    ])
    if (!qv || !dv) return { value: false, count: 0, skipped: true, message: 'embeddings unavailable' }
    if (dv.length) {
      todo.forEach((d, i) => { if (dv[i]) cached.set(d.id, dv[i]) })
      try { repo.putEmbeddings('paper', model, dims, todo.filter((_, i) => dv[i]).map((d, i) => ({ ...d, vec: dv[i] }))) } catch { /* cache only */ }
    }
    const seedVecs = seeds.map(s => cached.get(s.id)).filter((v): v is number[] => !!v)
    const fq = (k: string) => { const i = facets.findIndex(f => f.key === k); return i >= 0 ? qv[i + 1] : qv[0] }
    let n = 0
    for (const c of chosen) {
      const v = cached.get(c.paper.id)
      if (!v) continue
      n++
      c.features.eSeed = seedVecs.length ? Math.max(...seedVecs.map(s => cos(v, s))) : null
      c.features.eQuestion = cos(v, qv[0])
      c.features.eFacets = { topic: cos(v, fq('topic')), method: cos(v, fq('method')), population: cos(v, fq('population')) }
    }
    return { value: true, count: n, message: `${todo.length} new, ${docs.length - todo.length} cached` }
  })

  // ---- rerank ---------------------------------------------------------------------------------------
  const gArr = percentiles(cands.map(x => x.features.links))
  const gPct = new Map(cands.map((c, i) => [c.paper.id, gArr[i]]))
  const eqVals = cands.map(c => c.features.eQuestion ?? -1)
  const eqPctArr = percentiles(eqVals)
  const eqPct = new Map(cands.map((c, i) => [c.paper.id, c.features.eQuestion == null ? 0 : eqPctArr[i]]))
  const pre = (c: Candidate) => 0.5 * (gPct.get(c.paper.id) ?? 0) + 0.35 * (eqPct.get(c.paper.id) ?? 0) + 0.15 * (c.features.impact ?? 0)
  const rerankPct = new Map<string, number>()
  await stage(run, 'rerank', null, async () => {
    const pickable = byLane(['Core', 'Fresh', 'Linked', 'Bridges'])
    const top = [...pickable].sort((a, b) => pre(b) - pre(a)).slice(0, cfg.rerankTopK)
    if (!top.length) return { value: null, count: 0, skipped: true, message: 'nothing to rerank' }
    const scores = await withTimeout(ai.rerank(run.question, top.map(c => docText(c.paper)), cfg), cfg.timeoutMs, null)
    if (!scores || scores.length !== top.length) return { value: null, count: 0, skipped: true, message: 'reranker unavailable' }
    top.forEach((c, i) => { c.features.rerank = scores[i] })
    const p = percentiles(scores)
    top.forEach((c, i) => rerankPct.set(c.paper.id, p[i]))
    return { value: null, count: top.length }
  })

  // ---- judge ----------------------------------------------------------------------------------------
  const mid = (c: Candidate) => 0.2 * (rerankPct.get(c.paper.id) ?? 0) + 0.3 * (gPct.get(c.paper.id) ?? 0) + 0.05 * (c.features.impact ?? 0) + 0.2 * (eqPct.get(c.paper.id) ?? 0)
  const judged = await stage(run, 'judge', [] as Candidate[], async () => {
    const main = byLane(['Core', 'Linked']).sort((a, b) => mid(b) - mid(a) || preJudgeCompare(a.lane)(a, b)).slice(0, cfg.judgeTopK)
    const extra = byLane(['Fresh', 'Bridges']).sort((a, b) => mid(b) - mid(a) || (a.features.pubmedRank ?? 1e9) - (b.features.pubmedRank ?? 1e9)).slice(0, cfg.judgeExtraK)
    const todo = [...main, ...extra]
    const done: Candidate[] = []
    await mapLimit(todo, cfg.judgeConcurrency, async c => {
      const j = await withTimeout(ai.judge({ question: run.question, facets, seeds, paper: c.paper, features: c.features }, cfg), cfg.timeoutMs * 1.5, null)
      if (!j) return
      const ok = JudgementSchema.safeParse(j)
      if (!ok.success) { console.warn('judge output fails contract', c.paper.id); return }
      c.judgement = ok.data
      done.push(c)
      emit(run, { type: 'judgement', paperId: c.paper.id, judgement: ok.data })
      try { repo.saveJudgement(run.id, c.paper.id, ok.data) } catch { /* ignore */ }
    })
    if (!done.length) return { value: done, count: 0, skipped: true, message: `judge unavailable (${todo.length} selected)` }
    return { value: done, count: done.length, message: `${done.length}/${todo.length} judged` }
  })

  await stage(run, 'verify', null, async () => {
    if (!judged.length) return { value: null, count: 0, skipped: true }
    const v = judged.filter(c => c.judgement?.verified).length
    return { value: null, count: v, message: `${v}/${judged.length} quotes verified verbatim` }
  })

  const final = publish(cands, rerankPct)
  finish(run, final, 'done')
}

function finish(run: RunState, all: Candidate[], status: 'done' | 'error') {
  emit(run, { type: 'done', runId: run.id, counts: run.counts, total: run.total, ms: Date.now() - run.startedAt })
  try {
    repo.finishRun(snapshotOf(run), status)
    if (all.length) repo.saveCandidates(run.id, all)
  } catch (e) { console.warn('persist run failed', (e as Error).message) }
}
