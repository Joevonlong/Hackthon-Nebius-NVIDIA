// Records a REAL Library run (melanoma demo vault) into server/demo/recordings/library-melanoma.json.
// Replayed by /api/demo/library/* (client uses it with ?demo=1). No mock data: every event comes from the live pipeline.
// Usage: pnpm tsx scripts/record-library.ts [baseUrl=http://localhost:3023] [out=server/demo/recordings/library-melanoma.json]
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { LibPaper, LibraryEvent, LibraryRequest, Goals, type VaultNote } from '../shared/library'

const base = (process.argv[2] || 'http://localhost:3023').replace(/\/$/, '')
const OUT = process.argv[3] || 'server/demo/recordings/library-melanoma.json'
const MAX_BYTES = 5 * 1024 * 1024
const KEEP_TOP = 150

const QUESTION = 'Which single-cell methods help study melanoma immune cells?'
const SEEDS: { id: string; doi: string; title: string; venue: string; year: number }[] = [
  { id: 'S1', doi: '10.1126/science.aad0501', title: 'Dissecting the multicellular ecosystem of metastatic melanoma by single-cell RNA-seq', venue: 'Science', year: 2016 },
  { id: 'S2', doi: '10.1016/j.cell.2018.10.038', title: 'Defining T Cell States Associated with Response to Checkpoint Immunotherapy in Melanoma', venue: 'Cell', year: 2018 },
  { id: 'S3', doi: '10.1038/s41586-021-03704-y', title: 'Phenotype, specificity and avidity of antitumour CD8+ T cells in melanoma', venue: 'Nature', year: 2021 },
  { id: 'S4', doi: '10.1038/s41586-022-04682-5', title: 'Landscape of helper and regulatory antitumour CD4+ T cells in melanoma', venue: 'Nature', year: 2022 },
  { id: 'S5', doi: '10.1158/1078-0432.CCR-21-1694', title: 'Single-Cell Characterization of the Immune Microenvironment of Melanoma Brain and Leptomeningeal Metastases', venue: 'Clinical Cancer Research', year: 2021 },
]

const NOTES: VaultNote[] = [
  {
    path: 'Notes/Question.md',
    title: 'Question',
    content: `# Question\n\n${QUESTION}\n\nI am reading about T cell states in melanoma and why some patients respond to checkpoint blockade while others do not. Single-cell RNA-seq of tumour-infiltrating lymphocytes (TIL profiling) seems to separate exhausted from memory-like T cells, and the balance of these states appears to predict checkpoint response. I want the methods that let me study these immune cells at single-cell resolution.\n`,
  },
  ...SEEDS.map(s => ({
    path: `Seeds/${s.id}.md`,
    title: s.title,
    content: `# ${s.title}\n\n${s.venue}, ${s.year}. DOI: ${s.doi}\n\nSeed paper for the melanoma immune-cell question; cite-chase from here.\n`,
  })),
]

async function main() {
  const request = LibraryRequest.parse({ notes: NOTES, topK: 200, threshold: 0.5, topPercent: 25 })
  const res = await fetch(`${base}/api/library`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
  if (!res.ok) throw new Error(`POST /api/library -> ${res.status} ${await res.text()}`)
  const { libraryId, fixture } = (await res.json()) as { libraryId: string; fixture?: boolean }
  if (fixture) throw new Error('server runs with LIBRARY_FIXTURE=1; refusing to record fixture data')
  console.log(`library ${libraryId} started on ${base}`)

  const stream = await fetch(`${base}/api/library/${libraryId}/stream`, { headers: { accept: 'text/event-stream' } })
  if (!stream.ok || !stream.body) throw new Error(`stream -> ${stream.status}`)
  const events: LibraryEvent[] = []
  const decoder = new TextDecoder()
  let buf = ''
  let finished = false
  const handle = (block: string) => {
    const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n')
    if (!data) return
    const ev = LibraryEvent.parse(JSON.parse(data))
    events.push(ev)
    if (ev.type === 'stage') console.log(`  stage ${ev.stage} ${ev.status}${ev.count != null ? ` (${ev.count})` : ''}${ev.ms != null ? ` ${ev.ms}ms` : ''}`)
    else if (ev.type === 'source') console.log(`  source ${ev.source} ${ev.count}${ev.error ? ` ERR ${ev.error}` : ''}`)
    else console.log(`  ${ev.type}`)
    if (ev.type === 'done' || ev.type === 'error') finished = true
  }
  const reader = stream.body.getReader()
  while (!finished) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let i: number
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '') }
  }
  if (buf.trim()) handle(buf)
  const err = events.find(e => e.type === 'error')
  if (err && err.type === 'error') throw new Error(`library run reported an error: ${err.message}`)
  if (!events.some(e => e.type === 'done')) throw new Error('stream ended without a done event')

  const lib = await fetch(`${base}/api/library/${libraryId}`)
  if (!lib.ok) throw new Error(`GET /api/library/${libraryId} -> ${lib.status}`)
  const body = (await lib.json()) as { goals: unknown; papers: unknown[]; request: Record<string, unknown> }
  const goals = Goals.parse(body.goals)
  const all = body.papers.map(p => LibPaper.parse(p)).sort((a, b) => a.rank - b.rank)
  if (all.length === 0) throw new Error('library has no papers')

  // D-27 pass rule: passed = top X% of this library AND total >= floor AND not excluded. Applied here so the recording is
  // correct even when the server build still uses the floor-only rule (idempotent when the server already applies it).
  const topPercent = request.topPercent, floor = request.threshold
  const cutoff = Math.ceil((all.length * topPercent) / 100)
  const passRule = { topPercent, threshold: floor, cutoff }
  const applyRule = (p: LibPaper): LibPaper => ({ ...p, passed: !p.excluded && p.rank <= cutoff && p.total >= floor })
  const rescored = all.map(applyRule)

  const build = (ps: LibPaper[]) => {
    const keep = new Map(ps.map(p => [p.paper.id, p]))
    const nPassed = rescored.filter(p => p.passed).length
    const evs = events.map(e => {
      if (e.type === 'papers') return { ...e, papers: e.papers.filter(p => keep.has(p.paper.id)).map(p => keep.get(p.paper.id)!), passed: nPassed }
      if (e.type === 'done') return { ...e, passed: nPassed, dir: '' } // no local paths in the recording
      return e
    })
    return { recordedAt: new Date().toISOString(), sourceLibraryId: libraryId, request: body.request, passRule, events: evs, library: { goals, papers: ps, total: all.length, passed: nPassed }, notes: NOTES }
  }
  let papers = rescored
  let out = build(papers)
  let json = JSON.stringify(out)
  if (json.length > MAX_BYTES) {
    const keepSet = new Set(rescored.filter(p => p.rank <= KEEP_TOP || p.passed).map(p => p.paper.id))
    papers = rescored.filter(p => keepSet.has(p.paper.id))
    console.warn(`recording > 5 MB (${(json.length / 1e6).toFixed(1)} MB): trimmed to ${papers.length} of ${all.length} papers (top ${KEEP_TOP} + all passed)`)
    out = build(papers)
    json = JSON.stringify(out)
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, json)
  const sources = events.filter(e => e.type === 'source').length
  const passed = out.library.passed
  console.log(`wrote ${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KiB, ${events.length} events, ${sources} source events, ${out.library.papers.length}/${out.library.total} papers, ${passed} passed`)
}

main().catch(e => { console.error(e); process.exit(1) })
