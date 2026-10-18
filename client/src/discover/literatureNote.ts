// Seed and literature note builders (Markdown + front matter). Owner: lane C.
// Paths follow shared/contracts.ts: 'Seeds/S1 Tirosh 2016.md', 'Discovered/<Author> <Year> <first 5 title words>.md'.
import { ROUTE_LABEL, type Candidate, type Paper, type Seed, type Signal } from '@shared/contracts'

export const lastName = (a: string | undefined) => { const p = String(a || '').trim().split(/\s+/); return p[p.length - 1] || '' }
export const firstAuthor = (p: Paper) => p.authors[0] || 'Unknown'
const safe = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim()
const yaml = (v: string) => '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"'

export const seedNoteName = (s: Pick<Seed, 'n' | 'shortName'>) => safe(`S${s.n} ${s.shortName}`)
export const seedNotePath = (s: Pick<Seed, 'n' | 'shortName'>) => `Seeds/${seedNoteName(s)}.md`

export function litNoteName(p: Paper): string {
  const words = p.title.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 5).join(' ')
  return safe(`${lastName(firstAuthor(p))} ${p.year ?? 'n.d.'} ${words}`)
}
export const litNotePath = (p: Paper) => `Discovered/${litNoteName(p)}.md`

/** Short label for tabs: "Minowa 2026 · Immune microenvironment…" */
export const shortTitle = (p: Paper) => `${lastName(firstAuthor(p))} ${p.year ?? ''} · ${p.title.length > 42 ? p.title.slice(0, 40).replace(/\s+\S*$/, '') + '…' : p.title}`

export const doiUrl = (doi: string) => `https://doi.org/${doi}`
export const pubmedUrl = (pmid: string) => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`

export function sourceLinks(p: Paper): string {
  const links = [`[OpenAlex](${p.url})`]
  if (p.doi) links.push(`[DOI](${doiUrl(p.doi)})`)
  if (p.pmid) links.push(`[PubMed](${pubmedUrl(p.pmid)})`)
  return links.join(' · ')
}

const ABSTRACT_SOURCE: Record<string, string> = { openalex: 'OpenAlex', pubmed: 'PubMed', europepmc: 'Europe PMC' }
export const abstractSourceLabel = (s: string | null | undefined) => (s && ABSTRACT_SOURCE[s]) || 'unknown source'

export function buildSeedNote(s: Seed): { path: string; title: string; content: string } {
  const fm = [
    `paper_id: ${s.id}`, `doi: ${s.doi ?? ''}`, `pmid: ${s.pmid ?? ''}`, `title: ${yaml(s.title)}`,
    `authors: ${yaml(s.authors.join('; '))}`, `year: ${s.year ?? ''}`, `venue: ${yaml(s.venue ?? '')}`,
    `cited_by: ${s.citedByCount}`, `role: seed`, `seed: ${s.label}`,
  ].join('\n')
  const body = [
    `# ${s.title}`, '',
    `${s.authors.slice(0, 3).join(', ')}${s.authors.length > 3 ? ' et al.' : ''} · ${s.year ?? ''} · ${s.venue ?? ''}`, '',
    '## Abstract', '', s.abstract || '_No abstract available from OpenAlex or PubMed._', '',
    `Source: ${s.abstract ? abstractSourceLabel(s.abstractSource) + ' abstract · ' : ''}${sourceLinks(s)} · input \`${s.input}\``, '',
    '## My notes', '', '',
  ].join('\n')
  return { path: seedNotePath(s), title: seedNoteName(s), content: `---\n${fm}\n---\n${body}` }
}

function seedRef(n: number, seeds: Seed[]): string {
  const s = seeds.find(x => x.n === n)
  return s ? `[[${seedNoteName(s)}]]` : `S${n}`
}

/** One readable line per signal, with route label and source; `link` renders seed references. */
export function signalLine(sig: Signal, link: (n: number) => string): string {
  const seeds = sig.seedNs.map(link).join(', ')
  const what = {
    cites_seed: `cites ${seeds}`,
    cited_by_seed: `cited by ${seeds}`,
    pubmed_similar: `PubMed similar to ${seeds || 'a seed'}${sig.value != null ? ` (rank ${sig.value})` : ''}`,
    query: `query match${sig.note ? `: ${sig.note}` : ''}`,
    web: `found on the web${sig.note ? `: ${sig.note}` : ''}`,
    coupling: `shares references with ${seeds}${sig.value != null ? ` (coupling ${sig.value.toFixed(2)})` : ''}`,
    link_dropped_date: `link to ${seeds} dropped by the date check`,
  }[sig.kind]
  return `${what} · ${sig.route} ${ROUTE_LABEL[sig.route]}`
}

export function buildLiteratureNote(c: Candidate, ctx: { seeds: Seed[]; runId: string | null }): { path: string; title: string; content: string } {
  const p = c.paper, j = c.judgement
  const sl = (ns: number[]) => '[' + ns.map(n => 'S' + n).join(', ') + ']'
  const fm = [
    `paper_id: ${p.id}`, `doi: ${p.doi ?? ''}`, `pmid: ${p.pmid ?? ''}`, `title: ${yaml(p.title)}`,
    `authors: ${yaml(p.authors.join('; '))}`, `year: ${p.year ?? ''}`, `venue: ${yaml(p.venue ?? '')}`, `type: ${p.type ?? ''}`,
    `cited_by: ${p.citedByCount}`, `lane: ${c.lane}`, `routes: [${c.routes.join(', ')}]`,
    `seed_links: ${yaml(`cites ${sl(c.features.out)} · cited_by ${sl(c.features.in)}`)}`,
    `run: ${ctx.runId ?? ''}`, `retracted: ${p.isRetracted}`,
    ...(j ? [`judge_model: ${yaml(j.model)}`, `relevance: ${j.relevance}`, `verified: ${j.verified}`] : ['verified: false']),
    ...(j?.verified && j.quoteRef ? [`quote_source: ${j.quoteRef.source}`, `quote_start: ${j.quoteRef.start}`, `quote_end: ${j.quoteRef.end}`] : []),
    `role: literature`,
  ].join('\n')
  const link = (n: number) => seedRef(n, ctx.seeds)
  const trail = c.signals.length
    ? c.signals.map(s => `- ${signalLine(s, link)} · [${s.source.name}](${s.source.url})`)
    : ['- No recorded signals.']
  const body = [
    `# ${p.title}`, '',
    `${p.authors.slice(0, 3).join(', ')}${p.authors.length > 3 ? ' et al.' : ''} · ${p.year ?? ''} · ${p.venue ?? ''} · ${p.citedByCount.toLocaleString('en')} citations`, '',
    j ? `**Why:** ${j.why}` : '**Why:** _judge pending: not graded in this run._', '',
    ...(j?.quote ? [`> ${j.quote}`, '', j.verified && j.quoteRef
      ? `✓ verified · source ${abstractSourceLabel(j.quoteRef.source)} · chars ${j.quoteRef.start}–${j.quoteRef.end}`
      : '⚠ unverified: the quote was not found word for word in the abstract.', ''] : []),
    ...(j ? [`**Uncertainty:** ${j.uncertainty}`, ''] : []),
    '## Paper trail', '', ...trail, '',
    '## Why ranked here', '', '`' + c.whyRanked + '`', '',
    `Source: ${sourceLinks(p)}`, '',
    '## My notes', '', '',
  ].join('\n')
  return { path: litNotePath(p), title: litNoteName(p), content: `---\n${fm}\n---\n${body}` }
}
