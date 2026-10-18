// Owner: lane L2. End-of-library trace files in logs/runs/<id>/ (next to api / llm / tavily / events .jsonl):
//   summary.md (goals + note evidence, per-source calls, label distribution, weights, top N with every component, excluded),
//   papers.jsonl (every scored paper, flat), relations.jsonl (every edge behind a paper).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { env } from '../env'
import { runLogDir, writeRunFile } from '../trace'
import type { LibraryState } from './pipeline'

const jsonl = (rows: unknown[]) => rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')
const readJsonl = (file: string): any[] => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) : []
const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const f3 = (n: number | null) => (n == null ? '—' : n.toFixed(3))

function dist(xs: (string | null)[]): string {
  const m = new Map<string, number>()
  for (const x of xs) m.set(x ?? '(unknown)', (m.get(x ?? '(unknown)') ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ') || '(none)'
}

export function writeLibraryReport(s: LibraryState, topN = Math.min(s.request.topK, 30)): void {
  try {
    const papers = s.papers.map(p => ({
      rank: p.rank, id: p.paper.id, title: p.paper.title, year: p.paper.year, venue: p.paper.venue, doi: p.paper.doi, pmid: p.paper.pmid,
      total: Math.round(p.total * 1000) / 1000, passed: p.passed, excluded: p.excluded, kind: p.labels.kind, oa: p.labels.openAccess, field: p.labels.field,
      subtopics: p.labels.subtopics, tags: p.labels.tags, sources: p.labels.sources,
      components: Object.fromEntries(p.components.map(c => [c.key, c.value == null ? null : Math.round(c.value * 1000) / 1000])),
      llm: p.llmRead ? { relevance: p.llmRead.relevance, quality: p.llmRead.quality, verified: p.llmRead.verified } : null, file: p.file, url: p.paper.url,
    }))
    const relations: unknown[] = []
    for (const p of s.papers) {
      for (const r of p.relations) relations.push({ from: p.paper.id, to: r.paperId, type: r.type, note: r.note })
      for (const h of p.hits) relations.push({ from: `${h.source}:${h.via}`, to: p.paper.id, type: 'hit', query: h.query, rank: h.rank, url: h.url })
    }
    writeRunFile(s.id, 'papers.jsonl', jsonl(papers))
    writeRunFile(s.id, 'relations.jsonl', jsonl(relations))
    writeRunFile(s.id, 'summary.md', summary(s, topN, relations.length))
  } catch (e) { console.warn('library report failed', (e as Error).message) }
}

function summary(s: LibraryState, topN: number, nRel: number): string {
  const dir = runLogDir(s.id)
  const llm = readJsonl(join(dir, 'llm.jsonl'))
  const g = s.goals
  const L: string[] = []
  const ms = Date.now() - s.startedAt
  const passed = s.papers.filter(p => p.passed).length
  L.push(`# Library ${s.id}`, '', `- Notes: ${s.request.notes.length} · total ${(ms / 1000).toFixed(1)} s · ${s.papers.length} scored papers · ${passed} pass threshold ${s.request.threshold} · ${nRel} relations`,
    `- Files: ${s.dir ?? '(not written)'} · logs: ${dir}`, `- Relevance: ${s.relevanceMethod === 'embedding' ? env.models.embed : s.relevanceMethod} · LLM reads: ${s.llmReads} (${env.models.judge})`, '')

  L.push('## Goals', '')
  if (g) {
    L.push(`- **Topic:** ${g.topic}`, `- **Question:** ${g.question}`, `- **Planner:** ${g.model ?? 'deterministic fallback'}`, '', '**Goals**', '')
    g.goals.forEach((x, i) => L.push(`${i + 1}. ${x}`))
    L.push('', '**Evidence from the notes (verified verbatim)**', '')
    if (!g.evidence.length) L.push('- (none verified)')
    for (const e of g.evidence) L.push(`- \`${e.notePath}\`: "${esc(e.quote)}"`)
    L.push('', '**Subtopics**', '', '| subtopic | query |', '|---|---|')
    for (const t of g.subtopics) L.push(`| ${esc(t.name)} | ${esc(t.query)} |`)
    L.push('', `**Keywords:** ${g.keywords.join(', ')}`, '', `**Known papers in the notes:** ${g.knownPapers.map((k, i) => `K${i + 1} ${k}`).join(' · ') || '(none)'}`, '')
  }

  L.push('## Stages', '', '| stage | status | count | ms | message |', '|---|---|---|---|---|')
  for (const e of s.events) if (e.type === 'stage' && e.status !== 'start') L.push(`| ${e.stage} | ${e.status} | ${e.count ?? ''} | ${e.ms ?? ''} | ${esc(e.message)} |`)

  const bySrc = new Map<string, { calls: number; results: number; errors: number; ms: number }>()
  for (const c of s.calls) { const a = bySrc.get(c.source) ?? { calls: 0, results: 0, errors: 0, ms: 0 }; a.calls++; a.results += c.count; if (c.error) a.errors++; a.ms += c.ms; bySrc.set(c.source, a) }
  L.push('', '## Source calls', '', '| source | calls | results | errors | ms |', '|---|---|---|---|---|')
  for (const [k, a] of bySrc) L.push(`| ${k} | ${a.calls} | ${a.results} | ${a.errors} | ${a.ms} |`)
  if (!bySrc.size) L.push('| (none) | | | | |')
  if (s.calls.length) { L.push('', '<details><summary>every call</summary>', ''); for (const c of s.calls) L.push(`- ${c.source} \`${esc(c.query)}\` → ${c.count} (${c.ms} ms)${c.error ? ` ERROR ${esc(c.error)}` : ''}`); L.push('', '</details>') }

  const byModel = new Map<string, { calls: number; errors: number; ms: number; tokens: number }>()
  for (const r of llm) { const k = `${r.endpoint} · ${r.model ?? '-'}`; const a = byModel.get(k) ?? { calls: 0, errors: 0, ms: 0, tokens: 0 }; a.calls++; if (r.status >= 400) a.errors++; a.ms += r.ms ?? 0; a.tokens += r.usage?.total_tokens ?? 0; byModel.set(k, a) }
  L.push('', '## Token Factory calls (llm.jsonl)', '', '| endpoint · model | calls | errors | total ms | tokens |', '|---|---|---|---|---|')
  for (const [k, a] of byModel) L.push(`| ${k} | ${a.calls} | ${a.errors} | ${a.ms} | ${a.tokens} |`)
  if (!llm.length) L.push('| (none) | | | | |')

  const ps = s.papers.filter(p => !p.excluded)
  L.push('', '## Label distribution (not excluded)', '',
    `- kind: ${dist(ps.map(p => p.labels.kind))}`, `- open access: ${dist(ps.map(p => p.labels.openAccess))}`, `- field: ${dist(ps.map(p => p.labels.field))}`,
    `- recency: ${dist(ps.map(p => p.labels.recency))}`, `- peer reviewed: ${dist(ps.map(p => p.labels.peerReviewed == null ? null : String(p.labels.peerReviewed)))}`,
    `- subtopics: ${dist(ps.flatMap(p => p.labels.subtopics))}`, `- tags: ${dist(ps.flatMap(p => p.labels.tags))}`)

  const w = s.request.weights
  L.push('', '## Score weights', '', '| relevance | graph | citations | venue | authors | llm |', '|---|---|---|---|---|---|', `| ${w.relevance} | ${w.graph} | ${w.citations} | ${w.venue} | ${w.authors} | ${w.llm} |`, '',
    'Not-assessed components (value null) have their weight redistributed proportionally over the assessed ones.')

  L.push('', `## Top ${topN}`, '', '| # | paper | year | kind | total | pass | relevance | graph | citations | venue | authors | llm |', '|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const p of s.papers.slice(0, topN)) {
    const v = Object.fromEntries(p.components.map(c => [c.key, c.value]))
    L.push(`| ${p.rank} | [${esc(p.paper.title.slice(0, 90))}](${p.paper.url}) | ${p.paper.year ?? ''} | ${p.labels.kind} | ${p.total.toFixed(3)} | ${p.passed ? '✓' : ''} | ${f3(v.relevance)} | ${f3(v.graph)} | ${f3(v.citations)} | ${f3(v.venue)} | ${f3(v.authors)} | ${f3(v.llm)} |`)
  }
  L.push('', '### Evidence per paper', '')
  for (const p of s.papers.slice(0, topN)) {
    L.push(`#### ${p.rank}. ${esc(p.paper.title)} (${p.paper.year ?? 'n.d.'}) — total ${p.total.toFixed(3)}${p.passed ? ' ✓' : ''}`, '', `\`${p.file}\` · ${p.labels.kind} · ${p.labels.recency} · subtopics: ${p.labels.subtopics.join(', ') || '—'} · tags: ${p.labels.tags.join(', ') || '—'}`, '')
    for (const c of p.components) {
      L.push(`- **${c.key}** ${c.value == null ? 'not assessed' : `${c.value.toFixed(3)} × ${c.weight.toFixed(3)} = ${c.contribution.toFixed(3)}`} — ${esc(c.how)}`)
      for (const e of c.evidence) L.push(`  - ${esc(e.text)}${e.source ? ` ([${esc(e.source.name)}](${e.source.url}))` : ''}`)
    }
    L.push('')
  }

  const ex = s.papers.filter(p => p.excluded)
  L.push('## Excluded', '', ex.length ? `- ${dist(ex.map(p => p.excluded!.replace(/ of .*/, ' of …')))}` : '- (none)')
  for (const p of ex.slice(0, 20)) L.push(`  - ${esc(p.paper.title.slice(0, 100))} — ${p.excluded}`)
  L.push('', '## Files', '', '- `events.jsonl` every LibraryEvent', '- `llm.jsonl` every Token Factory call', '- `api.jsonl` / `tavily.jsonl` source calls (lane L1)', '- `papers.jsonl` every scored paper with component values', '- `relations.jsonl` every edge (cites / cited_by / similar) and search hit')
  return L.join('\n') + '\n'
}
