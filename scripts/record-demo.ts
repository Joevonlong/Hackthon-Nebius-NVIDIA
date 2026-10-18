// Records a real run into server/demo/recordings/melanoma.json (replayed by /api/demo/stream).
// Usage: pnpm tsx scripts/record-demo.ts [baseUrl=http://localhost:3001] [preset=demo]
import { writeFileSync, mkdirSync } from 'node:fs'
import { RunEvent, RunSnapshot, type Candidate, type Facet, type Seed } from '../shared/contracts'

const base = (process.argv[2] || 'http://localhost:3001').replace(/\/$/, '')
const preset = process.argv[3] || 'demo'
const QUESTION = 'Which single-cell methods help study melanoma immune cells?'
const SEEDS = ['10.1126/science.aad0501', '10.1016/j.cell.2018.10.038', '10.1038/s41586-021-03704-y', '10.1038/s41586-022-04682-5', '10.1158/1078-0432.CCR-21-1694']
const OUT = 'server/demo/recordings/melanoma.json'

async function main() {
  const res = await fetch(`${base}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: QUESTION, seeds: SEEDS, preset }) })
  if (!res.ok) throw new Error(`POST /api/runs -> ${res.status} ${await res.text()}`)
  const { runId } = (await res.json()) as { runId: string }
  console.log(`run ${runId} started on ${base}`)

  const stream = await fetch(`${base}/api/runs/${runId}/stream`, { headers: { accept: 'text/event-stream' } })
  if (!stream.ok || !stream.body) throw new Error(`stream -> ${stream.status}`)

  const events: RunEvent[] = []
  const decoder = new TextDecoder()
  let buf = ''
  let finished = false
  const handle = (block: string) => {
    const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n')
    if (!data) return
    const ev = RunEvent.parse(JSON.parse(data))
    events.push(ev)
    if (ev.type === 'stage') console.log(`  stage ${ev.stage} ${ev.status}${ev.count != null ? ` (${ev.count})` : ''}`)
    else if (ev.type !== 'judgement') console.log(`  ${ev.type}`)
    if (ev.type === 'done' || ev.type === 'error') finished = true
  }
  const reader = stream.body.getReader()
  while (!finished) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let i: number
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      handle(buf.slice(0, i))
      buf = buf.slice(i).replace(/^\r?\n\r?\n/, '')
    }
  }
  await reader.cancel().catch(() => {})
  const err = events.find(e => e.type === 'error')
  if (err && err.type === 'error') throw new Error(`run failed: ${err.message}`)
  if (!events.some(e => e.type === 'done')) throw new Error('stream ended without a done event')

  // Prefer the server's own snapshot (final candidates with judgements); rebuild from events when unavailable.
  let snap: RunSnapshot | null = null
  const sr = await fetch(`${base}/api/runs/${runId}`)
  if (sr.ok) {
    const parsed = RunSnapshot.safeParse(await sr.json())
    if (parsed.success) snap = parsed.data
    else console.warn('server snapshot failed validation, rebuilding from events:', parsed.error.issues.slice(0, 3))
  }
  if (!snap) {
    let seeds: Seed[] = [], facets: Facet[] = [], candidates: Candidate[] = [], counts: Record<string, number> = {}, total = 0
    for (const e of events) {
      if (e.type === 'seeds') seeds = e.seeds
      else if (e.type === 'facets') facets = e.facets
      else if (e.type === 'candidates') { candidates = e.candidates; counts = e.counts; total = e.total }
      else if (e.type === 'judgement') candidates = candidates.map(c => (c.paper.id === e.paperId ? { ...c, judgement: e.judgement } : c))
      else if (e.type === 'done') { counts = e.counts; total = e.total }
    }
    snap = RunSnapshot.parse({ runId, question: QUESTION, preset, seeds, facets, candidates, counts, total, events })
  }
  // The recording is what the demo replays: use the events we consumed (the server snapshot may omit some), a real run (not provisional).
  const final = RunSnapshot.parse({ ...snap, events })
  mkdirSync('server/demo/recordings', { recursive: true })
  writeFileSync(OUT, JSON.stringify(final, null, 1) + '\n')
  const judged = final.candidates.filter(c => c.judgement).length
  console.log(`wrote ${OUT}: ${final.candidates.length} candidates (${judged} judged), ${events.length} events, total ${final.total}`)
}

main().catch(e => { console.error(e); process.exit(1) })
