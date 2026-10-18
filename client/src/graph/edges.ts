// Owner: lane C. CR-10 E-1: citation edges for the graph view. Pure functions (no store access) so they are unit-tested.
// One id index over the drawn nodes: OpenAlex W id (with or without https://openalex.org/), DOI (without https://doi.org/),
// PMID ("pmid:123" or "123"), arXiv id. Edges come from each drawn paper's referencedWorks and its cites / cited_by relations.
import type { Paper } from '@shared/contracts'
import type { LibPaper } from '@shared/library'

export type EdgeKind = 'cite' | 'seed'
export interface CiteEdge { source: string; target: string; kind: EdgeKind }
/** A drawn library paper (graph node id + the paper). */
export interface EdgeLib { node: string; lib: LibPaper }
/** A drawn vault note. `seed` marks seed notes (their edges are kind 'seed'). */
export interface EdgeNote { node: string; paperId?: string; content: string; seed: boolean }
/** Papers that are not drawn but whose ids, references and relations are known (all library papers, run seeds, candidates). */
export type PoolPaper = Paper | LibPaper

const stripV = (s: string) => s.replace(/v\d+$/, '')

/** Canonical keys for one id string in any of the supported forms ([] for empty input). */
export function idKeys(raw: string | null | undefined): string[] {
  if (!raw) return []
  const s = raw.trim().toLowerCase().replace(/^<|>$/g, '')
  if (!s) return []
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(?:https?:\/\/)?(?:api\.)?openalex\.org\/(?:works\/)?(w\d+)\/?$/)) || (m = s.match(/^(?:openalex:\s*)?(w\d+)$/))) return ['oa:' + m[1]]
  if ((m = s.match(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\/(.+)$/)) || (m = s.match(/^doi:\s*(.+)$/)) || (m = s.match(/^(10\.\d{4,9}\/\S+)$/))) {
    const doi = m[1].replace(/[.,;)\]]+$/, '')
    const ax = doi.match(/^10\.48550\/arxiv\.(.+)$/)
    return ax ? ['doi:' + doi, 'arxiv:' + stripV(ax[1])] : ['doi:' + doi]
  }
  if ((m = s.match(/^(?:pmid:\s*|(?:https?:\/\/)?pubmed\.ncbi\.nlm\.nih\.gov\/)?(\d{1,9})\/?$/))) return ['pmid:' + m[1]]
  if ((m = s.match(/^(?:https?:\/\/)?arxiv\.org\/(?:abs|pdf)\/(.+?)(?:\.pdf)?$/)) || (m = s.match(/^arxiv:\s*(.+)$/)) || (m = s.match(/^(\d{4}\.\d{4,5}(?:v\d+)?)$/))) return ['arxiv:' + stripV(m[1])]
  return ['raw:' + s]
}

const paperOf = (p: PoolPaper): Paper => ('paper' in p ? p.paper : p)

/** Every key a paper is known by. */
export function paperKeys(p: Paper): string[] {
  return [...new Set([p.id, p.doi, p.pmid, p.url].flatMap(idKeys))]
}

/** Keys of the paper a drawn note stands for (frontmatter / paperId; a seed note's text ids when it has none). */
export function notePaperKeys(n: Pick<EdgeNote, 'paperId' | 'content' | 'seed'>): string[] {
  const k = noteKeys(n)
  return n.seed && !k.primary.length ? k.text : k.primary
}

/** Ids in a note: note.paperId and the frontmatter ids (primary); DOIs / PMIDs / arXiv / OpenAlex ids in the text (fallback). */
export function noteKeys(n: Pick<EdgeNote, 'paperId' | 'content'>): { primary: string[]; text: string[] } {
  const primary = new Set(idKeys(n.paperId))
  const fm = n.content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
  for (const m of fm.matchAll(/^(paper_id|doi|pmid|arxiv|openalex):[ \t]*["']?([^\s"']+)/gim)) {
    const k = m[1].toLowerCase()
    for (const key of idKeys(k === 'paper_id' || k === 'openalex' ? m[2] : `${k}:${m[2].replace(/^(?:doi|pmid|arxiv):\s*/i, '')}`)) primary.add(key)
  }
  const text = new Set<string>()
  const body = n.content
  for (const m of body.matchAll(/\b(10\.\d{4,9}\/[^\s"'<>\]|]+)/g)) idKeys(m[1].replace(/[.,;)]+$/, '')).forEach(k => text.add(k))
  for (const m of body.matchAll(/\bpmid:?\s*(\d{4,9})\b/gi)) text.add('pmid:' + m[1])
  for (const m of body.matchAll(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{4,9})/gi)) text.add('pmid:' + m[1])
  for (const m of body.matchAll(/\barxiv[:.\s/]*(?:abs\/)?(\d{4}\.\d{4,5})/gi)) text.add('arxiv:' + m[1])
  for (const m of body.matchAll(/openalex\.org\/(W\d+)/gi)) text.add('oa:' + m[1].toLowerCase())
  for (const k of primary) text.delete(k)
  return { primary: [...primary], text: [...text] }
}

/** Resolves any id form to a drawn node: directly, or through a pool paper that carries the same id in another form. */
export class IdIndex {
  private readonly nodeOf = new Map<string, string>()
  private readonly alias = new Map<string, string[]>()
  /** First registration wins, so register the most specific owners first. */
  add(node: string, keys: string[]) { for (const k of keys) if (!this.nodeOf.has(k)) this.nodeOf.set(k, node) }
  addAlias(keys: string[]) { for (const k of keys) { const cur = this.alias.get(k); if (cur) cur.push(...keys.filter(x => !cur.includes(x))); else this.alias.set(k, [...keys]) } }
  resolve(id: string | null | undefined): string | undefined {
    const keys = idKeys(id)
    for (const k of keys) { const n = this.nodeOf.get(k); if (n) return n }
    for (const k of keys) for (const a of this.alias.get(k) ?? []) { const n = this.nodeOf.get(a); if (n) return n }
    return undefined
  }
}

export interface EdgeResult { edges: CiteEdge[]; index: IdIndex; cite: number; seed: number }

/**
 * Citation edges among the drawn nodes, deduped (undirected). Sources: every drawn library paper and every vault note that
 * matches a pool paper; for each, its referencedWorks (source cites target) and its cites / cited_by relations (any note,
 * e.g. OpenAlex or Europe PMC references). Kind 'seed' when one end is a seed note, else 'cite'.
 */
export function buildCitationEdges(input: { libs: EdgeLib[]; notes: EdgeNote[]; pool?: PoolPaper[] }): EdgeResult {
  const index = new IdIndex()
  const pool = [...input.libs.map(l => l.lib), ...(input.pool ?? [])]
  const poolByKey = new Map<string, PoolPaper>()
  for (const p of pool) { const ks = paperKeys(paperOf(p)); index.addAlias(ks); for (const k of ks) if (!poolByKey.has(k)) poolByKey.set(k, p) }
  // A seed note without frontmatter ids is the paper its text names (e.g. a note holding just a DOI).
  const nk = input.notes.map(n => { const k = noteKeys(n); return { n, primary: notePaperKeys(n), text: n.seed && !k.primary.length ? [] : k.text } })
  for (const { n, primary } of nk) index.add(n.node, primary)
  for (const l of input.libs) index.add(l.node, paperKeys(l.lib.paper))
  for (const { n, text } of nk) index.add(n.node, text)

  const seeds = new Set(input.notes.filter(n => n.seed).map(n => n.node))
  const edges: CiteEdge[] = []
  const seen = new Set<string>()
  let cite = 0, seed = 0
  const add = (a: string | undefined, b: string | undefined) => {
    if (!a || !b || a === b) return
    const key = a < b ? a + '|' + b : b + '|' + a
    if (seen.has(key)) return
    seen.add(key)
    const kind: EdgeKind = seeds.has(a) || seeds.has(b) ? 'seed' : 'cite'
    if (kind === 'seed') seed++; else cite++
    edges.push({ source: a, target: b, kind })
  }
  const walk = (node: string, paper: Paper | undefined, relations: LibPaper['relations']) => {
    for (const r of paper?.referencedWorks ?? []) add(node, index.resolve(r))
    for (const r of relations) {
      if (r.type === 'cites') add(node, index.resolve(r.paperId))
      else if (r.type === 'cited_by') add(index.resolve(r.paperId), node)
    }
  }
  for (const l of input.libs) walk(l.node, l.lib.paper, l.lib.relations)
  for (const { n, primary } of nk) {
    // A note's own paper: the pool paper matching its paperId / frontmatter ids. Ids merely mentioned in a note's text make
    // it a target only (a question note listing seed DOIs is not those papers).
    const p = primary.map(k => poolByKey.get(k)).find(Boolean)
    if (p) walk(n.node, paperOf(p), 'paper' in p ? p.relations : [])
  }
  return { edges, index, cite, seed }
}
