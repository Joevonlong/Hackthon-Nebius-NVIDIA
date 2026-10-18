// Writes the end-of-run trace files next to the live channel logs (see server/trace.ts):
//   papers.jsonl      every seed and candidate with lane, rank, routes, seed links, judge result
//   relations.jsonl   every edge behind a candidate (cites seed, cited by seed, PubMed similar, query, web)
//   references.jsonl  each seed's reference list (OpenAlex referenced_works)
//   summary.md        human-readable report: stages, API calls, LLM calls, Tavily results, top papers per lane
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LANE_ORDER, type Candidate } from '@shared/contracts'
import { runLogDir, writeRunFile } from '../trace'
import type { RunState } from './registry'

const jsonl = (rows: unknown[]) => rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')
const readJsonl = (file: string): any[] => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) : []
const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function writeRunTrace(run: RunState, all: Candidate[]): void {
  try {
    const seedById = new Map(run.seeds.map(s => [s.id, s]))
    const seedByN = new Map(run.seeds.map(s => [s.n, s]))
    const papers = [
      ...run.seeds.map(s => ({ role: 'seed', label: s.label, id: s.id, title: s.title, year: s.year, venue: s.venue, doi: s.doi, pmid: s.pmid, citedBy: s.citedByCount, abstractSource: s.abstractSource, references: s.referencedWorks.length, url: s.url })),
      ...all.map(c => ({
        role: 'candidate', lane: c.lane, rank: c.rank, id: c.paper.id, title: c.paper.title, year: c.paper.year, venue: c.paper.venue, doi: c.paper.doi, pmid: c.paper.pmid,
        citedBy: c.paper.citedByCount, type: c.paper.type, isRetracted: c.paper.isRetracted, abstractSource: c.paper.abstractSource,
        routes: c.routes, links: c.features.links, cites: c.features.out.map(n => `S${n}`), citedBy_seeds: c.features.in.map(n => `S${n}`),
        eQuestion: c.features.eQuestion, rerank: c.features.rerank, score: c.score, whyRanked: c.whyRanked,
        judge: c.judgement ? { relevance: c.judgement.relevance, facets: c.judgement.facets, paperType: c.judgement.paperType, verified: c.judgement.verified, why: c.judgement.why, quote: c.judgement.quote } : null,
        url: c.paper.url,
      })),
    ]
    const relations: unknown[] = []
    for (const c of all) for (const s of c.signals) {
      const seeds = s.seedNs.map(n => seedByN.get(n)).filter(Boolean)
      const base = { route: s.route, kind: s.kind, value: s.value, source: s.source?.url, note: s.note }
      if (s.kind === 'cites_seed') seeds.forEach(sd => relations.push({ from: c.paper.id, to: sd!.id, toLabel: sd!.label, type: 'cites', ...base }))
      else if (s.kind === 'cited_by_seed') seeds.forEach(sd => relations.push({ from: sd!.id, fromLabel: sd!.label, to: c.paper.id, type: 'cites', ...base }))
      else if (s.kind === 'pubmed_similar') (seeds.length ? seeds : [null]).forEach(sd => relations.push({ from: sd?.id ?? null, fromLabel: sd?.label, to: c.paper.id, type: 'similar', ...base }))
      else relations.push({ from: s.kind, to: c.paper.id, type: s.kind, ...base })
    }
    const references = run.seeds.map(s => ({ seed: s.label, id: s.id, title: s.title, count: s.referencedWorks.length, referencedWorks: s.referencedWorks }))
    writeRunFile(run.id, 'papers.jsonl', jsonl(papers))
    writeRunFile(run.id, 'relations.jsonl', jsonl(relations))
    writeRunFile(run.id, 'references.jsonl', jsonl(references))
    writeRunFile(run.id, 'summary.md', summary(run, all, relations.length, seedById.size))
  } catch (e) { console.warn('trace report failed', (e as Error).message) }
}

function summary(run: RunState, all: Candidate[], nRelations: number, nSeeds: number): string {
  const dir = runLogDir(run.id)
  const api = readJsonl(join(dir, 'api.jsonl'))
  const llm = readJsonl(join(dir, 'llm.jsonl'))
  const tav = readJsonl(join(dir, 'tavily.jsonl'))
  const L: string[] = []
  const ms = Date.now() - run.startedAt
  L.push(`# Run ${run.id}`, '', `- Question: ${run.question}`, `- Preset: ${run.preset} · total ${(ms / 1000).toFixed(1)} s · ${all.length} candidates · ${nSeeds} seeds · ${nRelations} relations`, `- Log folder: ${dir}`, '')
  L.push('## Stages', '', '| stage | status | count | ms | message |', '|---|---|---|---|---|')
  for (const e of run.events) if (e.type === 'stage' && e.status !== 'start') L.push(`| ${e.stage} | ${e.status} | ${e.count ?? ''} | ${e.ms ?? ''} | ${esc(e.message)} |`)
  L.push('', '## Seeds', '', '| | paper | year | abstract from | references |', '|---|---|---|---|---|')
  for (const s of run.seeds) L.push(`| ${s.label} | ${esc(s.title)} | ${s.year ?? ''} | ${s.abstractSource ?? 'none'} | ${s.referencedWorks.length} |`)
  const byApi = new Map<string, { calls: number; cached: number; errors: number; ms: number; bytes: number }>()
  for (const r of api) { const k = r.api; const a = byApi.get(k) ?? { calls: 0, cached: 0, errors: 0, ms: 0, bytes: 0 }; a.calls++; if (r.cached) a.cached++; if (r.error) a.errors++; a.ms += r.ms ?? 0; a.bytes += r.bytes ?? 0; byApi.set(k, a) }
  L.push('', '## Scholarly API calls (api.jsonl)', '', '| api | calls | cache hits | errors | network ms | KB |', '|---|---|---|---|---|---|')
  for (const [k, a] of byApi) L.push(`| ${k} | ${a.calls} | ${a.cached} | ${a.errors} | ${a.ms} | ${Math.round(a.bytes / 1024)} |`)
  const byModel = new Map<string, { calls: number; errors: number; ms: number; tokens: number }>()
  for (const r of llm) { const k = `${r.endpoint} · ${r.model ?? '-'}`; const a = byModel.get(k) ?? { calls: 0, errors: 0, ms: 0, tokens: 0 }; a.calls++; if (r.status >= 400) a.errors++; a.ms += r.ms ?? 0; a.tokens += r.usage?.total_tokens ?? 0; byModel.set(k, a) }
  L.push('', '## Token Factory calls (llm.jsonl)', '', '| endpoint · model | calls | errors | total ms | tokens |', '|---|---|---|---|---|')
  for (const [k, a] of byModel) L.push(`| ${k} | ${a.calls} | ${a.errors} | ${a.ms} | ${a.tokens} |`)
  if (!llm.length) L.push('| (none) | | | | |')
  L.push('', '## Tavily searches (tavily.jsonl)', '')
  if (!tav.length) L.push('(none)')
  for (const t of tav) { L.push(`- **${esc(t.query)}** → ${t.count} hits (${t.ms} ms)`); for (const r of t.results ?? []) L.push(`  - ${esc(r.title)} — ${r.url} (score ${Number(r.score).toFixed(2)})`) }
  const agent = run.events.filter(e => e.type === 'agent')
  if (agent.length) { L.push('', '## Scout agent steps', ''); for (const a of agent) if (a.type === 'agent') L.push(`${a.step}. \`${a.tool}\` ${esc(a.input)} → ${esc(a.output)}`) }
  L.push('', '## Top papers per lane', '')
  for (const lane of LANE_ORDER) {
    const items = all.filter(c => c.lane === lane).sort((a, b) => a.rank - b.rank)
    if (!items.length) continue
    L.push(`### ${lane} (${items.length})`, '', '| # | paper | year | why ranked | judge |', '|---|---|---|---|---|')
    for (const c of items.slice(0, 10)) {
      const j = c.judgement ? `${c.judgement.relevance}/3 ${c.judgement.verified ? '✓ verified' : '⚠ unverified'}: ${esc(c.judgement.why)}` : '—'
      L.push(`| ${c.rank} | ${esc(c.paper.title)} | ${c.paper.year ?? ''} | ${esc(c.whyRanked)} | ${j} |`)
    }
    L.push('')
  }
  L.push('## Files', '', '- `events.jsonl` every streamed RunEvent', '- `api.jsonl` every OpenAlex / PubMed / Europe PMC request (url without keys, status, ms, bytes, cache hit, raw file)', '- `llm.jsonl` every Token Factory call (model, prompt, response, usage)', '- `tavily.jsonl` every Tavily query with its results', '- `papers.jsonl` seeds + all candidates with lane, rank, routes, links, judge', '- `relations.jsonl` every edge: cites, cited by seed, similar, query, web', '- `references.jsonl` each seed\'s reference list')
  return L.join('\n') + '\n'
}
