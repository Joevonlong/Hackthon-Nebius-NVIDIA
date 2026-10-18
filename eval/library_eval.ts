// Library-mode hold-out eval (same spirit as eval/holdout.py, docs/RANKING_AND_STORAGE.md §1).
// For each real review: keep 5 of its references as the vault (seed notes with DOIs + a Question note = review title),
// hide the rest, run the real Library pipeline (POST /api/library), and count how many hidden references come back.
// Baselines: PubMed esearch (relevance) and OpenAlex search with the review title, top 30.
// Ablation: re-score the stored papers offline with one component's weight set to 0.
//
// Run (server must be up on the same DATA_DIR so the raw cache is shared):
//   PORT=3022 DATA_DIR=./data npx tsx server/index.ts
//   DATA_DIR=./data npx tsx eval/library_eval.ts W4365143025 W3005326482
// Re-running reuses the stored library (eval/out_library/<review>.json keeps the libraryId); pass --fresh to re-run.
import '../server/env'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { cachedJson } from '../server/data/http'
import { DEFAULT_WEIGHTS, type LibPaper, type Weights } from '../shared/library'

const BASE = process.env.LIB_BASE || 'http://localhost:3022'
const DATA = resolve(process.env.DATA_DIR || './data')
const OUT = resolve(process.env.LIB_OUT || join(import.meta.dirname, 'out_library'))
const K = 30
const N_SEEDS = 5
const args = process.argv.slice(2)
const FRESH = args.includes('--fresh')
const REVIEWS = args.filter(a => /^W\d+$/.test(a))
const CAP = args.includes('--cap') ? Number(args[args.indexOf('--cap') + 1]) : null // maxCandidates override (default 600)

const short = (x: string) => String(x).split('/').pop()!
const normDoi = (d: string | null | undefined) => (d ? d.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : null)
const pmidOf = (w: any) => (w?.ids?.pmid ? short(w.ids.pmid) : null)

function oaUrl(path: string, params: Record<string, string | number>) {
  const u = new URL(`https://api.openalex.org/${path}`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  if (process.env.OPENALEX_MAILTO) u.searchParams.set('mailto', process.env.OPENALEX_MAILTO)
  if (process.env.OPENALEX_API_KEY) u.searchParams.set('api_key', process.env.OPENALEX_API_KEY)
  return u.toString()
}
const SEL = 'id,doi,display_name,publication_date,publication_year,ids,referenced_works,cited_by_count,type'
async function oaBatch(ids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>()
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const r = await cachedJson('openalex', oaUrl('works', { filter: 'openalex_id:' + chunk.join('|'), 'per-page': 50, select: SEL }))
    for (const w of r.data.results) out.set(short(w.id), w)
  }
  return out
}

// Deterministic PRNG (mulberry32) so the seed choice is reproducible.
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function sample<T>(xs: T[], n: number, seed: number): T[] { const a = xs.slice(), r = rng(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a.slice(0, n) }

interface Truth { ids: Set<string>; dois: Set<string>; pmids: Set<string>; n: number; list: { id: string; doi: string | null; pmid: string | null; title: string; date: string }[] }
function matchTruth(t: Truth, p: { id?: string | null; doi?: string | null; pmid?: string | null }): string | null {
  if (p.id && t.ids.has(short(p.id))) return short(p.id)
  const d = normDoi(p.doi); if (d) { const hit = t.list.find(x => x.doi === d); if (hit) return hit.id }
  if (p.pmid) { const hit = t.list.find(x => x.pmid === String(p.pmid)); if (hit) return hit.id }
  return null
}
const countHits = (t: Truth, ps: { id?: string | null; doi?: string | null; pmid?: string | null }[]) => new Set(ps.map(p => matchTruth(t, p)).filter(Boolean) as string[])

async function prep(review: string) {
  const rv = (await oaBatch([review])).get(review)
  if (!rv) throw new Error(`review ${review} not found`)
  const refs: string[] = rv.referenced_works.map(short)
  const meta = await oaBatch(refs)
  const cutoff: string = rv.publication_date
  const withDoi = refs.filter(r => meta.get(r)?.doi && meta.get(r)?.display_name)
  const seeds = sample(withDoi, N_SEEDS, 42)
  const hidden = refs.filter(r => !seeds.includes(r))
  const before = hidden.filter(r => meta.get(r) && meta.get(r).publication_date < cutoff)
  const list = before.map(r => { const w = meta.get(r); return { id: r, doi: normDoi(w.doi), pmid: pmidOf(w), title: w.display_name, date: w.publication_date } })
  const truth: Truth = { ids: new Set(before), dois: new Set(list.map(x => x.doi).filter(Boolean) as string[]), pmids: new Set(list.map(x => x.pmid).filter(Boolean) as string[]), n: before.length, list }
  return { rv, refs, meta, seeds, truth, cutoff, unresolved: refs.filter(r => !meta.get(r)).length, hiddenTotal: hidden.length }
}

function notesFor(title: string, seeds: string[], meta: Map<string, any>) {
  return [
    { path: 'Question.md', title: 'Question', content: `# Question\n\n${title}\n` },
    ...seeds.map((s, i) => { const w = meta.get(s); return { path: `seeds/seed-${i + 1}.md`, title: w.display_name, content: `# ${w.display_name}\n\nDOI: ${normDoi(w.doi)}\n` } }),
  ]
}

async function runLibrary(notes: unknown[]): Promise<{ id: string; ms: number }> {
  const t0 = Date.now()
  const r = await fetch(`${BASE}/api/library`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes, topK: K, threshold: 0.5, topPercent: 25, ...(CAP ? { maxCandidates: CAP } : {}) }) })
  if (!r.ok) throw new Error(`POST /api/library ${r.status}: ${await r.text()}`)
  const { libraryId } = await r.json() as { libraryId: string }
  console.log(`  library ${libraryId} started`)
  for (;;) {
    await new Promise(res => setTimeout(res, 5000))
    const g = await fetch(`${BASE}/api/library/${libraryId}`).then(x => x.json()) as { done: boolean; papers: unknown[] }
    if (g.done) return { id: libraryId, ms: Date.now() - t0 }
    process.stdout.write('.')
  }
}

function loadPapers(id: string): LibPaper[] {
  const dir = join(DATA, 'library', id, 'papers')
  return readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')) as LibPaper).sort((a, b) => a.rank - b.rank)
}
const libKey = (p: LibPaper) => ({ id: p.paper.id, doi: p.paper.doi, pmid: p.paper.pmid })

// Offline re-score: same rule as score.ts combine() — total = Σ w·v over assessed components / Σ w over assessed.
function rescore(papers: LibPaper[], w: Weights): LibPaper[] {
  const tot = (p: LibPaper) => { let s = 0, S = 0; for (const c of p.components) if (c.value != null) { const b = Math.max(0, w[c.key]); s += b * c.value; S += b } return S > 0 ? s / S : 0 }
  return papers.filter(p => !p.excluded).map(p => ({ p, t: tot(p) })).sort((a, b) => b.t - a.t || a.p.paper.title.localeCompare(b.p.paper.title)).map(x => x.p)
}

async function pubmedTop(title: string, exclude: (x: any) => boolean, maxDate?: string) {
  const u = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi')
  u.searchParams.set('db', 'pubmed'); u.searchParams.set('term', title); u.searchParams.set('retmax', '40'); u.searchParams.set('retmode', 'json'); u.searchParams.set('sort', 'relevance'); u.searchParams.set('tool', 'papertrail')
  if (maxDate) { u.searchParams.set('datetype', 'pdat'); u.searchParams.set('mindate', '1900/01/01'); u.searchParams.set('maxdate', maxDate.replace(/-/g, '/')) }
  if (process.env.OPENALEX_MAILTO) u.searchParams.set('email', process.env.OPENALEX_MAILTO)
  if (process.env.NCBI_API_KEY) u.searchParams.set('api_key', process.env.NCBI_API_KEY)
  const r = await cachedJson('pubmed', u.toString())
  const pmids: string[] = r.data.esearchresult?.idlist ?? []
  return { count: Number(r.data.esearchresult?.count ?? 0), translation: r.data.esearchresult?.querytranslation ?? '', items: pmids.map(p => ({ pmid: p })).filter(x => !exclude(x)).slice(0, K) }
}
async function openalexTop(title: string, exclude: (x: any) => boolean, maxDate?: string) {
  const r = await cachedJson('openalex', oaUrl('works', { search: title, 'per-page': 50, select: 'id,doi,ids,display_name,publication_date', ...(maxDate ? { filter: `to_publication_date:${maxDate}` } : {}) }))
  return { count: r.data.meta.count, items: r.data.results.map((w: any) => ({ id: short(w.id), doi: normDoi(w.doi), pmid: pmidOf(w), date: w.publication_date })).filter((x: any) => !exclude(x)).slice(0, K) }
}

const f3 = (x: number) => x.toFixed(3)

async function main() {
  mkdirSync(OUT, { recursive: true })
  const summary: any[] = []
  for (const review of REVIEWS) {
    console.log(`\n=== ${review}`)
    const { rv, refs, meta, seeds, truth, cutoff, unresolved, hiddenTotal } = await prep(review)
    console.log(`  "${rv.display_name}" (${cutoff}) refs ${refs.length} · unresolved ${unresolved} · seeds ${seeds.join(' ')} · hidden ${hiddenTotal} · truth (published before review) ${truth.n}`)
    const outFile = join(OUT, `${review}${CAP ? `_cap${CAP}` : ''}.json`)
    const prev = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null
    let libraryId: string = prev?.libraryId, ms: number = prev?.libraryMs
    if (!libraryId || FRESH || !existsSync(join(DATA, 'library', libraryId))) {
      const r = await runLibrary(notesFor(rv.display_name, seeds, meta)); libraryId = r.id; ms = r.ms
      console.log(`\n  done in ${(ms / 1000).toFixed(1)} s`)
    }
    const all = loadPapers(libraryId)
    const lib = JSON.parse(readFileSync(join(DATA, 'library', libraryId, 'library.json'), 'utf8'))
    const goals = JSON.parse(readFileSync(join(DATA, 'library', libraryId, 'goals.json'), 'utf8'))
    const ranked = all.filter(p => !p.excluded)
    const top = ranked.slice(0, K)
    const seedSet = new Set(seeds)
    const isReviewOrSeed = (x: any) => (x.id && (x.id === review || seedSet.has(x.id))) || (x.pmid && (x.pmid === pmidOf(rv) || seeds.some(s => pmidOf(meta.get(s)) === x.pmid)))

    const reach = countHits(truth, all.map(libKey))
    const reachRanked = countHits(truth, ranked.map(libKey))
    const hitTop = countHits(truth, top.map(libKey))
    const passed = ranked.filter(p => p.passed)
    const hitPassed = countHits(truth, passed.map(libKey))
    const topPctN = Math.max(1, Math.ceil(ranked.length * 0.25))
    const postReviewTop = top.filter(p => (p.paper.publicationDate ?? `${p.paper.year}-12-31`) >= cutoff).length

    const pm = await pubmedTop(rv.display_name, isReviewOrSeed)
    // map PubMed PMIDs → truth via the truth list's PMIDs
    const pmHits = countHits(truth, pm.items)
    const oa = await openalexTop(rv.display_name, isReviewOrSeed)
    const oaHits = countHits(truth, oa.items)
    const oaPost = oa.items.filter((x: any) => x.date && x.date >= cutoff).length

    // date-restricted variants: only candidates published before the review (the review could not cite later work)
    const dayBefore = new Date(Date.parse(cutoff) - 86400000).toISOString().slice(0, 10)
    const preTop = ranked.filter(p => (p.paper.publicationDate ?? `${p.paper.year}-01-01`) < cutoff).slice(0, K)
    const preHits = countHits(truth, preTop.map(libKey))
    const pmD = await pubmedTop(rv.display_name, isReviewOrSeed, dayBefore)
    const pmDHits = countHits(truth, pmD.items)
    const plain = rv.display_name.replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    const pmP = plain !== rv.display_name ? await pubmedTop(plain, isReviewOrSeed) : pm
    const pmPHits = countHits(truth, pmP.items)
    const oaD = await openalexTop(rv.display_name, isReviewOrSeed, dayBefore)
    const oaDHits = countHits(truth, oaD.items)
    // how many hidden refs the vault's own seeds cite (what references-expansion can reach before the pile cap)
    const seedRefs = new Set(seeds.flatMap(s => (meta.get(s)?.referenced_works ?? []).map(short)))
    const seedRefReach = truth.list.filter(x => seedRefs.has(x.id)).length
    const reviewRank = ranked.findIndex(p => short(p.paper.id) === review) + 1

    const abl: Record<string, { hits: number; p: number; r: number }> = {}
    const evalW = (name: string, w: Weights) => { const rk = rescore(all, w).slice(0, K); const h = countHits(truth, rk.map(libKey)).size; abl[name] = { hits: h, p: h / K, r: h / truth.n } }
    evalW('full (default weights)', DEFAULT_WEIGHTS)
    for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[]) evalW(`- ${k}`, { ...DEFAULT_WEIGHTS, [k]: 0 })
    for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[]) evalW(`only ${k}`, { relevance: 0, graph: 0, citations: 0, venue: 0, authors: 0, llm: 0, [k]: 1 })

    const res = {
      review, title: rv.display_name, date: cutoff, refs: refs.length, unresolvedRefs: unresolved, seeds, hidden: hiddenTotal, truth: truth.n,
      libraryId, libraryMs: ms, summary: lib.summary, goalsModel: goals.model, knownPapers: goals.knownPapers, subtopics: goals.subtopics.map((s: any) => s.query),
      library: { pile: all.length, ranked: ranked.length, excluded: all.length - ranked.length, reach: reach.size, reachRanked: reachRanked.size, hits30: hitTop.size, p30: hitTop.size / K, r30: hitTop.size / truth.n, postReviewInTop30: postReviewTop, passed: passed.length, hitsPassed: hitPassed.size, topPctN, hitsTopPct: countHits(truth, ranked.slice(0, topPctN).map(libKey)).size, hitIds: [...hitTop] },
      pubmed: { count: pm.count, returned: pm.items.length, translation: pm.translation.slice(0, 400), hits30: pmHits.size, p30: pmHits.size / K, r30: pmHits.size / truth.n },
      openalex: { count: oa.count, returned: oa.items.length, hits30: oaHits.size, p30: oaHits.size / K, r30: oaHits.size / truth.n, postReviewInTop30: oaPost },
      dateRestricted: {
        library: { candidates: ranked.filter(p => (p.paper.publicationDate ?? `${p.paper.year}-01-01`) < cutoff).length, hits30: preHits.size, p30: preHits.size / K, r30: preHits.size / truth.n },
        pubmed: { count: pmD.count, returned: pmD.items.length, hits30: pmDHits.size, p30: pmDHits.size / K, r30: pmDHits.size / truth.n },
        openalex: { count: oaD.count, returned: oaD.items.length, hits30: oaDHits.size, p30: oaDHits.size / K, r30: oaDHits.size / truth.n },
      },
      pubmedPlainTitle: { query: plain, count: pmP.count, returned: pmP.items.length, hits30: pmPHits.size, p30: pmPHits.size / K, r30: pmPHits.size / truth.n },
      seedRefReach, reviewRankInLibrary: reviewRank || null,
      ablation: abl,
      truthWithPmid: truth.list.filter(x => x.pmid).length,
    }
    writeFileSync(outFile, JSON.stringify(res, null, 2))
    summary.push(res)
    const L = res.library
    console.log(`  Library: pile ${L.pile} (ranked ${L.ranked}) · reach ${L.reach}/${truth.n} · top30 hits ${L.hits30} → P@30 ${f3(L.p30)} R@30 ${f3(L.r30)} · post-review in top30 ${L.postReviewInTop30} · passed ${L.passed} (hits ${L.hitsPassed}) · top25% n=${L.topPctN} hits ${L.hitsTopPct}`)
    console.log(`  PubMed : count ${pm.count} returned ${pm.items.length} · hits ${pmHits.size} → P@30 ${f3(res.pubmed.p30)} R@30 ${f3(res.pubmed.r30)}`)
    console.log(`  OpenAlex: count ${oa.count} returned ${oa.items.length} · hits ${oaHits.size} → P@30 ${f3(res.openalex.p30)} R@30 ${f3(res.openalex.r30)} · post-review ${oaPost}`)
    const D = res.dateRestricted
    console.log(`  pre-review only: Library hits ${D.library.hits30} (P@30 ${f3(D.library.p30)}) · PubMed hits ${D.pubmed.hits30}/${D.pubmed.returned} (count ${D.pubmed.count}) · OpenAlex hits ${D.openalex.hits30}/${D.openalex.returned}`)
    console.log(`  PubMed plain title "${plain}": count ${pmP.count} hits ${pmPHits.size}`)
    console.log(`  seeds cite ${seedRefReach}/${truth.n} hidden refs · review itself at Library rank ${reviewRank || '-'}`)
    for (const [k, v] of Object.entries(abl)) console.log(`  ablation ${k.padEnd(24)} hits ${String(v.hits).padStart(2)}  P@30 ${f3(v.p)}  R@30 ${f3(v.r)}`)
  }
  writeFileSync(join(OUT, `summary${CAP ? `_cap${CAP}` : ''}.json`), JSON.stringify(summary, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) })
