// Live check for lane L1: runs gather() for the melanoma topic with DEFAULT LibraryRequest settings.
// Usage: pnpm tsx scripts/try-gather.ts   (traces in logs/runs/try-gather/; TRACE_CONSOLE=0 to silence trace lines)
import '../server/env'
import { LibraryRequest, type Goals } from '../shared/library'
import { gather, lastGatherStats } from '../server/library/sources'
import type { SourceCall } from '../server/library/types'
import { withRun } from '../server/trace'

const goals: Goals = {
  topic: 'Single-cell profiling of immune cells in melanoma',
  question: 'Which single-cell methods help study melanoma immune cells?',
  goals: ['Find single-cell methods used on melanoma immune cells', 'Compare T cell state findings', 'Identify markers of immunotherapy response'],
  subtopics: [
    { name: 'scRNA-seq of melanoma TILs', query: 'single-cell RNA sequencing melanoma tumor-infiltrating lymphocytes' },
    { name: 'T cell states and checkpoint response', query: 'T cell states response immune checkpoint blockade melanoma single-cell' },
    { name: 'Myeloid cells in melanoma', query: 'macrophages myeloid cells melanoma single-cell transcriptomics' },
    { name: 'Spatial and multimodal methods', query: 'spatial transcriptomics CITE-seq melanoma tumor microenvironment' },
    { name: 'Resistance programs', query: 'immunotherapy resistance program melanoma single-cell' },
  ],
  keywords: ['melanoma', 'single-cell RNA-seq', 'tumor-infiltrating lymphocytes', 'T cell exhaustion', 'immune checkpoint blockade',
    'tumor microenvironment', 'CITE-seq', 'spatial transcriptomics', 'macrophages', 'immunotherapy resistance'],
  knownPapers: ['10.1126/science.aad0501', '10.1016/j.cell.2018.10.038', '10.1038/s41586-021-03704-y', '10.1038/s41586-022-04682-5', '10.1158/1078-0432.CCR-21-1694'],
  evidence: [],
  model: null,
}

const req = LibraryRequest.parse({ notes: [{ path: 'Notes/Question.md', title: 'Question', content: goals.question }] })

async function main() {
  const calls: SourceCall[] = []
  const t0 = Date.now()
  const recs = await withRun('try-gather', () => gather(goals, req, c => calls.push(c)))
  const ms = Date.now() - t0
  console.log(`\n=== gather() ${ms} ms · sources ${req.sources.join(',')} · maxCandidates ${req.maxCandidates}`)
  console.log(`phases ${Object.entries(lastGatherStats?.ms ?? {}).map(([k, v]) => `${k} ${v} ms`).join(' · ')} · source calls ${calls.length} · stragglers ${lastGatherStats?.stragglers.length ?? 0}${lastGatherStats?.stragglers.length ? ' — ' + lastGatherStats.stragglers.join(' | ') : ''}`)
  const by = new Map<string, { calls: number; count: number; ms: number; errors: string[] }>()
  for (const c of calls) {
    const s = by.get(c.source) ?? { calls: 0, count: 0, ms: 0, errors: [] }
    s.calls++; s.count += c.count; s.ms = Math.max(s.ms, c.ms); if (c.error) s.errors.push(c.error)
    by.set(c.source, s)
  }
  for (const [s, v] of by) console.log(`${s.padEnd(9)} calls ${String(v.calls).padStart(3)} · results ${String(v.count).padStart(4)} · slowest ${v.ms} ms · errors ${v.errors.length}${v.errors.length ? ' — ' + [...new Set(v.errors.map(e => e.slice(0, 90)))].slice(0, 2).join(' | ') : ''}`)
  const n = (f: (r: (typeof recs)[number]) => boolean) => recs.filter(f).length
  console.log(`pile ${recs.length} · abstracts ${n(r => !!r.paper.abstract)} · OpenAlex works ${n(r => /^W\d+$/.test(r.key))} · venue h-index ${n(r => r.venue.hIndex != null)} · author h-index ${n(r => r.authors.some(a => a.hIndex != null))} · PubMed types ${n(r => r.extra.pubmedTypes.length > 0)} · MeSH ${n(r => r.extra.mesh.length > 0)} · arXiv ${n(r => !!r.extra.arxiv)} · with relations ${n(r => r.relations.length > 0)} · multi-source ${n(r => new Set(r.hits.map(h => h.source)).size > 1)}`)
  console.log(`in pile by source: ${['openalex', 'pubmed', 'arxiv', 'tavily', 'scholar'].map(s => `${s} ${n(r => r.hits.some(h => h.source === s))}`).join(' · ')} · graph: ${['references', 'cited_by', 'similar'].map(v => `${v} ${n(r => r.hits.some(h => h.via === v))}`).join(' · ')}`)
  console.log(`keys: ${['W', 'pmid:', 'arxiv:', 'doi:', 'scholar:'].map(p => `${p} ${n(r => r.key.startsWith(p))}`).join(' · ')}`)
  console.log('stats', JSON.stringify({ ...lastGatherStats, enrich: { ...lastGatherStats?.enrich, errors: lastGatherStats?.enrich.errors.length } }))
  const notKnown = (r: (typeof recs)[number]) => !r.hits.some(h => h.via === 'known_paper')
  const sample = [recs.find(r => notKnown(r) && r.extra.pubmedTypes.length && r.hits.some(h => h.source === 'tavily')) ?? recs.find(r => notKnown(r) && r.extra.pubmedTypes.length),
    recs.find(r => r.extra.arxiv), recs.find(r => notKnown(r) && r.relations.some(x => x.type === 'cites'))].filter(Boolean)
  for (const r of sample) {
    console.log('\n--', r!.key, '|', r!.paper.title.slice(0, 100))
    console.log(JSON.stringify({ year: r!.paper.year, doi: r!.paper.doi, pmid: r!.paper.pmid, venue: r!.venue, firstAuthor: r!.authors[0], abstract: r!.paper.abstract?.slice(0, 120), hits: r!.hits.slice(0, 4), relations: r!.relations.slice(0, 2), extra: { ...r!.extra, mesh: r!.extra.mesh.slice(0, 5) } }))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
