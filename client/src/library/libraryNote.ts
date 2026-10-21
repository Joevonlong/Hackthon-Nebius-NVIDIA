// Literature note for a Library paper (lane L3). Same path and front matter style as discover/literatureNote.ts,
// plus labels, the total score and its top evidence lines.
import type { LibPaper } from '@shared/library'
import { litNoteName, litNotePath, sourceLinks } from '../discover/literatureNote'
import { mdLink } from '../util/safeUrl'
import { COMPONENT_META, f2 } from './score'

const yaml = (v: string) => '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"'
const list = (xs: string[]) => '[' + xs.map(x => yaml(x)).join(', ') + ']'

export function buildLibraryNote(lp: LibPaper, ctx: { libraryId: string | null; threshold: number }): { path: string; title: string; content: string } {
  const p = lp.paper, l = lp.labels
  const fm = [
    `paper_id: ${p.id}`, `doi: ${p.doi ?? ''}`, `pmid: ${p.pmid ?? ''}`, `title: ${yaml(p.title)}`,
    `authors: ${yaml(p.authors.join('; '))}`, `year: ${p.year ?? ''}`, `venue: ${yaml(p.venue ?? '')}`, `type: ${p.type ?? ''}`,
    `cited_by: ${p.citedByCount}`, `kind: ${l.kind}`, `study_design: ${list(l.studyDesign)}`, `peer_reviewed: ${l.peerReviewed ?? ''}`,
    `open_access: ${l.openAccess ?? ''}`, `field: ${yaml(l.field ?? '')}`, `subfield: ${yaml(l.subfield ?? '')}`, `recency: ${l.recency}`,
    `tags: ${list(l.tags)}`, `found_by: [${l.sources.join(', ')}]`, `subtopics: ${list(l.subtopics)}`,
    `score_total: ${f2(lp.total)}`, `score_threshold: ${f2(ctx.threshold)}`, `passed: ${lp.passed}`, `rank: ${lp.rank}`,
    ...lp.components.map(c => `score_${c.key}: ${c.value == null ? 'null' : f2(c.value)}`),
    `library: ${ctx.libraryId ?? ''}`, `library_file: ${lp.file}`, `retracted: ${p.isRetracted}`, `role: literature`,
  ].join('\n')
  const top = [...lp.components].sort((a, b) => b.contribution - a.contribution)
  // Q-10: the same effective weight the UI shows (share of the assessed weights), so share × value = contribution
  const assessed = lp.components.filter(c => c.value != null).reduce((s, c) => s + c.weight, 0)
  const share = (c: LibPaper['components'][number]) => c.value == null || assessed <= 0 ? 0 : c.weight / assessed
  const pc = (x: number) => `${Math.round(x * 100)}%`
  const body = [
    `# ${p.title}`, '',
    `${p.authors.slice(0, 3).join(', ')}${p.authors.length > 3 ? ' et al.' : ''} · ${p.year ?? ''} · ${p.venue ?? ''} · ${p.citedByCount.toLocaleString('en')} citations`, '',
    `**Library score:** ${f2(lp.total)} (${lp.passed ? 'passed' : 'below'} threshold ${f2(ctx.threshold)}) · rank #${lp.rank}`, '',
    '## Why this score', '',
    ...top.map(c => [
      c.value == null
        ? `- **${COMPONENT_META[c.key].label}** · weight 0% (not assessed; its share moved to the assessed components) = 0.00 — ${c.how}`
        : `- **${COMPONENT_META[c.key].label}** · weight ${pc(share(c))} × value ${f2(c.value)} = ${f2(c.contribution)} — ${c.how}`,
      ...c.evidence.slice(0, 3).map(e => `  - ${e.text}${e.source ? ` · ${mdLink(e.source.name, e.source.url)}` : ''}`),
    ].join('\n')), '',
    ...(lp.llmRead ? [`**LLM read (${lp.llmRead.model}):** ${lp.llmRead.why}`, ...(lp.llmRead.quote ? ['', `> ${lp.llmRead.quote}`, '', lp.llmRead.verified ? '✓ verified quote' : '⚠ unverified quote'] : []), ''] : []),
    '## Relations', '',
    ...(lp.relations.length ? lp.relations.map(r => `- ${r.type} ${r.paperId}${r.note ? ` (${r.note})` : ''}`) : ['- none recorded']), '',
    `Source: ${sourceLinks(p)}`, '',
    '## My notes', '', '',
  ].join('\n')
  return { path: litNotePath(p), title: litNoteName(p), content: `---\n${fm}\n---\n${body}` }
}
