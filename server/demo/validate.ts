// Validates every server/demo/recordings/*.json against the RunSnapshot contract. Run: pnpm tsx server/demo/validate.ts
import { readdirSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import { RunSnapshot } from '../../shared/contracts'
import { Goals, LibPaper, LibraryEvent } from '../../shared/library'

const LibraryRecording = z.object({
  request: z.record(z.string(), z.unknown()), events: z.array(LibraryEvent),
  library: z.object({ goals: Goals, papers: z.array(LibPaper) }), notes: z.array(z.object({ path: z.string(), title: z.string(), content: z.string() })),
})

const dir = 'server/demo/recordings'
let bad = 0
for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  if (f.startsWith('library-')) { // Library recordings (scripts/record-library.ts) have their own schema
    const r = LibraryRecording.safeParse(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
    if (r.success) console.log(`OK   ${f}: ${r.data.events.length} events, ${r.data.library.papers.length} papers`)
    else { bad++; console.error(`FAIL ${f}`, r.error.issues.slice(0, 5)) }
    continue
  }
  const r = RunSnapshot.safeParse(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
  if (r.success) {
    const prov = r.data.events.some(e => e.type === 'run' && e.config.provisional === true)
    console.log(`OK   ${f}: ${r.data.candidates.length} candidates, ${r.data.events.length} events, total ${r.data.total}${prov ? ' (provisional)' : ''}`)
  } else { bad++; console.error(`FAIL ${f}`, r.error.issues.slice(0, 5)) }
}
process.exit(bad ? 1 : 0)
