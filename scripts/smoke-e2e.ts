// End-to-end AI check with live keys: question → planner (facets, queries) → Tavily search → page text
// (Tavily snippet, or Tavily extract when the snippet is short) → embedding similarity (D-19) → Nemotron judge
// reads the text → verbatim quote verification. Exits 1 if any stage fails.
// Run: pnpm exec tsx scripts/smoke-e2e.ts ["research question"]   (never prints keys)
import { resolveConfig } from '../shared/config'
import type { Paper } from '../shared/contracts'
import { env } from '../server/env'
import { embed, expandQueries, facets, judge } from '../server/ai/index'
import { SCIENCE_DOMAINS, identify, tavilyExtract, tavilySearch } from '../server/sources/tavily'

process.env.TRACE_CONSOLE ??= '0'
const cfg = resolveConfig('demo', env.raw)
const question = process.argv.slice(2).join(' ').trim() || 'Which transcriptional cell states in melanoma drive resistance to targeted therapy?'
const READ_N = 5
const SHORT = 800 // snippets shorter than this are replaced by the extracted page

const t0 = () => performance.now()
const ms = (t: number) => `${Math.round(performance.now() - t)} ms`
const fails: string[] = []
const check = (stage: string, ok: boolean, detail: string) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${stage.padEnd(14)} ${detail}`); if (!ok) fails.push(stage) }
const one = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }

async function main() {
  console.log(`question: ${question}\ntoken factory ${env.tokenFactoryKey ? 'present' : 'MISSING'} · tavily ${env.tavilyKey ? 'present' : 'MISSING'}\n`)
  if (!env.tokenFactoryKey || !env.tavilyKey) { console.log('Both TOKEN_FACTORY_API_KEY and TAVILY_API_KEY are needed in .env.local.'); process.exit(1) }

  // 1. planner
  let t = t0()
  const fs = await facets(question, [], cfg)
  check('facets', fs.some(f => f.query !== question), `${fs.map(f => `${f.key}="${f.query}"`).join(' ')} (${ms(t)})`)
  t = t0()
  const qs = await expandQueries(question, fs, cfg)
  check('expandQueries', qs.length >= 2, `${qs.length}: ${qs.join(' | ')} (${ms(t)})`)

  // 2. Tavily search: the question (advanced) + the first expanded query (basic), scholarly hosts
  t = t0()
  const [a, b] = await Promise.all([
    tavilySearch(question, { searchDepth: 'advanced', maxResults: 10, includeDomains: [...SCIENCE_DOMAINS, 'pubmed.ncbi.nlm.nih.gov', 'pmc.ncbi.nlm.nih.gov'] }),
    qs[0] ? tavilySearch(qs[0], { maxResults: 5, includeDomains: SCIENCE_DOMAINS }) : Promise.resolve([]),
  ])
  const byUrl = new Map([...a, ...b].map(h => [h.url, h]))
  const hits = [...byUrl.values()].sort((x, y) => y.score - x.score)
  const withIds = hits.map(h => ({ ...h, ids: identify(h.url, h.content) }))
  check('tavily search', hits.length > 0, `${hits.length} unique hits, ${withIds.filter(h => h.ids.doi || h.ids.pmid).length} with DOI/PMID (${ms(t)})`)
  if (!hits.length) return

  // 3. read: snippet, or the extracted page when the snippet is short
  const pick = withIds.slice(0, READ_N)
  const short = pick.filter(h => h.content.length < SHORT).map(h => h.url)
  t = t0()
  const pages = short.length ? await tavilyExtract(short) : []
  const pageText = new Map(pages.map(p => [p.url, p.text]))
  const docs = pick.map(h => ({ ...h, text: pageText.get(h.url) ?? h.content, via: pageText.has(h.url) ? 'extract' : 'snippet' }))
  check('tavily extract', !short.length || pages.length > 0, `${short.length} short snippets → ${pages.length} pages read (${ms(t)})`)

  // 4. embedding similarity to the question (the D-19 stand-in for the missing reranker)
  t = t0()
  const [qv] = (await embed([question], 'query', cfg)) ?? [null]
  const dv = await embed(docs.map(d => `${d.title}\n${d.text}`), 'document', cfg)
  const cos = qv && dv ? dv.map(v => v.reduce((s, x, i) => s + x * qv[i], 0)) : null
  check('embed cos', !!cos, cos ? `${cos.map(c => c.toFixed(3)).join(' / ')} (${ms(t)})` : 'no vectors')

  // 5. Nemotron judge reads each text; the quote must be found verbatim in what it read
  t = t0()
  const judged = await Promise.all(docs.map(d => {
    const paper: Paper = {
      id: d.url, doi: d.ids.doi, pmid: d.ids.pmid, pmcid: d.ids.pmcid, title: d.title, authors: [], year: null, publicationDate: null,
      venue: null, type: d.ids.kind, citedByCount: 0, citationPct: null, isRetracted: false, isOa: false, oaUrl: null,
      abstract: d.text, abstractSource: null, referencedWorks: [], url: d.url,
    }
    const features = { links: 0, out: [], in: [], coupling: null, eSeed: null, eQuestion: null, eFacets: null, rerank: null, impact: null, pubmedRank: null }
    return judge({ question, facets: fs, seeds: [], paper, features }, cfg)
  }))
  const ok = judged.filter(Boolean).length
  const verified = judged.filter(j => j?.verified).length
  check('judge read', ok === docs.length, `${ok}/${docs.length} judged, ${verified} quotes verified verbatim (${ms(t)})`)
  check('quotes', verified > 0, `${verified}/${ok} verified`)

  console.log('\n| # | source | via | chars | cos | rel | verified | title / quote |\n|---|---|---|---|---|---|---|---|')
  docs.forEach((d, i) => {
    const j = judged[i]
    console.log(`| ${i + 1} | ${d.ids.kind}${d.ids.doi ? ' doi:' + d.ids.doi : d.ids.pmid ? ' pmid:' + d.ids.pmid : ''} | ${d.via} | ${d.text.length} | ${cos ? cos[i].toFixed(3) : '-'} | ${j?.relevance ?? '-'} | ${j ? (j.verified ? 'yes' : 'no') : '-'} | ${one(d.title, 70)}${j?.quote ? ` — "${one(j.quote, 110)}"` : ''} |`)
  })
}

main()
  .then(() => { if (fails.length) { console.log(`\nfailed: ${fails.join(', ')}`); process.exit(1) } console.log('\nall stages OK') })
  .catch(e => { console.error('smoke-e2e failed:', e?.message || e); process.exit(1) })
