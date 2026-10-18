// Validates every server/demo/recordings/*.json against the RunSnapshot contract. Run: pnpm tsx server/demo/validate.ts
import { readdirSync, readFileSync } from 'node:fs'
import { RunSnapshot } from '../../shared/contracts'

const dir = 'server/demo/recordings'
let bad = 0
for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const r = RunSnapshot.safeParse(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
  if (r.success) {
    const prov = r.data.events.some(e => e.type === 'run' && e.config.provisional === true)
    console.log(`OK   ${f}: ${r.data.candidates.length} candidates, ${r.data.events.length} events, total ${r.data.total}${prov ? ' (provisional)' : ''}`)
  } else { bad++; console.error(`FAIL ${f}`, r.error.issues.slice(0, 5)) }
}
process.exit(bad ? 1 : 0)
