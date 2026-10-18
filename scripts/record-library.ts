// Records a REAL Library run (melanoma demo vault) into server/demo/recordings/library-melanoma.json.
// Replayed by /api/demo/library/* (client uses it with ?demo=1). No mock data: every event comes from the live pipeline.
// Usage: pnpm tsx scripts/record-library.ts [baseUrl=http://localhost:3023] [out=server/demo/recordings/library-melanoma.json]
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { LibPaper, LibraryEvent, LibraryRequest, Goals, type VaultNote } from '../shared/library'
import { Seed as SeedSchema } from '../shared/contracts'
import { buildSeedNote } from '../client/src/discover/literatureNote'

const base = (process.argv[2] || 'http://localhost:3023').replace(/\/$/, '')
const OUT = process.argv[3] || 'server/demo/recordings/library-melanoma.json'
const MAX_BYTES = 5 * 1024 * 1024
const KEEP_TOP = 150

const QUESTION = 'Which single-cell methods help study melanoma immune cells?'
const SEED_DOIS = ['10.1126/science.aad0501', '10.1016/j.cell.2018.10.038', '10.1038/s41586-021-03704-y', '10.1038/s41586-022-04682-5', '10.1158/1078-0432.CCR-21-1694']

// Mirrors client/src/stores/vault.ts (nameFromQuestion / questionNote) so the notes match what the shipped UI sends.
const safeQuestionName = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60)
function nameFromQuestion(text: string): string {
  const stop = new Set('a an and are can do does for from how in is of on or the to what which who why with help helps study'.split(' '))
  const w = text.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(x => x && !stop.has(x.toLowerCase())).slice(0, 6)
  return safeQuestionName(w.join(' ')) || 'Question'
}
const questionContent = (question: string) =>
  `---\ntype: question\ncreated: ${new Date().toISOString().slice(0, 10)}\n---\n${question}\n\n## Seeds\n\nAdd trusted papers in the **Library** tab (paste ids or upload a .bib / .ris / CSL JSON / CSV / PDF). Their notes land in seeds/ next to this note, and only this question's builds read them.\n\n## Kept so far\n\n- [ ] Build the library from this question\n- [ ] Keep the papers worth reading\n`

// Same note layout the shipped client writes (D-33): Questions/<name>/Question.md + Questions/<name>/seeds/S<n> <short>.md,
// seeds resolved through POST /api/seeds/resolve exactly like the Library tab's "Add seed papers".
async function buildNotes(): Promise<{ notes: VaultNote[]; questionName: string }> {
  const questionName = nameFromQuestion(QUESTION)
  const res = await fetch(`${base}/api/seeds/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inputs: SEED_DOIS }) })
  if (!res.ok) throw new Error(`POST /api/seeds/resolve -> ${res.status} ${await res.text()}`)
  const out = (await res.json()) as { seeds: unknown[]; errors: { input: string; message: string }[] }
  if (out.errors.length) throw new Error(`seed resolve errors: ${JSON.stringify(out.errors)}`)
  const resolved = out.seeds.map(x => SeedSchema.parse(x))
  const seeds = SEED_DOIS.map((doi, i) => {
    const raw = resolved.find(x => x.input.toLowerCase().includes(doi.toLowerCase()) || x.doi?.toLowerCase() === doi.toLowerCase())
    if (!raw) throw new Error(`seed ${doi} not resolved`)
    return { ...raw, n: i + 1, label: `S${i + 1}` }
  })
  const dir = `Questions/${questionName}`
  const notes: VaultNote[] = [{ path: `${dir}/Question.md`, title: 'Question', content: questionContent(QUESTION) }]
  for (const s of seeds) { const n = buildSeedNote(s); notes.push({ path: `${dir}/seeds/${n.path.split('/').pop()}`, title: n.title, content: n.content }) }
  return { notes, questionName }
}

async function main() {
  const { notes: NOTES, questionName } = await buildNotes()
  const request = LibraryRequest.parse({ notes: NOTES, topK: 30, threshold: 0.5, topPercent: 25, questionId: questionName, questionName })
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

  // D-27/D-38: the server applies the pass rule (top X% of non-excluded AND floor AND not LLM-off-topic); the recording keeps its flags as returned.
  const topPercent = request.topPercent, floor = request.threshold
  const nonExcluded = all.filter(p => !p.excluded).length
  const passRule = { topPercent, threshold: floor, cutoff: Math.max(1, Math.ceil((nonExcluded * topPercent) / 100)) }
  const rescored = all
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
