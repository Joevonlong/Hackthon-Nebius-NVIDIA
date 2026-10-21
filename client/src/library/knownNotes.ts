// "N papers from your notes are treated as known": papers named by ids (DOI / PMID / arXiv / OpenAlex) in notes that are not seeds.
// Same id patterns, seed rule and grouping as server/library/goals.ts (knownBySource), so the panel count matches the build's;
// knownNotes.test.ts runs both on the same strings so the copies cannot drift.
import type { VaultNote } from '@shared/library'

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'`<>\]\[(){}|,;]+)/gi
const PMID_RE = /(?:\bPMID\s*:?\s*|pubmed\.ncbi\.nlm\.nih\.gov\/)(\d{5,9})\b/gi
const ARXIV_RE = /(?:\barXiv\s*:?\s*|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5})(?:v\d+)?/gi
const ARXIV_DOI_RE = /^10\.48550\/arxiv\.(\d{4}\.\d{4,5})/i
const OPENALEX_RE = /(?:openalex\.org\/(?:works\/)?|\b)(W\d{6,12})\b/g
const isSeed = (n: Pick<VaultNote, 'path'>) => /(^|\/)seeds\//i.test(n.path)

export function idsIn(text: string, out: Set<string>) {
  for (const m of text.matchAll(DOI_RE)) {
    const doi = m[1].replace(/[.)\]}>*_`'"]+$/, '').toLowerCase()
    const ax = doi.match(ARXIV_DOI_RE)
    out.add(ax ? `arxiv:${ax[1]}` : doi)
  }
  for (const m of text.matchAll(PMID_RE)) out.add(`pmid:${m[1]}`)
  for (const m of text.matchAll(ARXIV_RE)) out.add(`arxiv:${m[1]}`)
  for (const m of text.matchAll(OPENALEX_RE)) out.add(m[1])
}

function mergeGroups(groups: string[][]): string[][] {
  const out: Set<string>[] = []
  for (const g of groups) {
    const hit = out.filter(o => g.some(id => o.has(id)))
    const merged = new Set<string>(g)
    for (const o of hit) { for (const id of o) merged.add(id); out.splice(out.indexOf(o), 1) }
    out.push(merged)
  }
  return out.map(o => [...o])
}

/** Groups of ids (one group = one paper) named only in non-seed notes: ids on one line / bullet item are one paper (a reference list is N papers). */
export function notesKnownGroups(notes: Pick<VaultNote, 'path' | 'content'>[]): string[][] {
  const seedIds = new Set<string>(), noteGroups: string[][] = []
  for (const n of notes) {
    if (isSeed(n)) idsIn(n.content, seedIds)
    else for (const block of n.content.split(/\n/)) { const o = new Set<string>(); idsIn(block, o); if (o.size) noteGroups.push([...o]) }
  }
  return mergeGroups(noteGroups.map(g => g.filter(id => !seedIds.has(id))).filter(g => g.length))
}
export const notesKnownCount = (notes: Pick<VaultNote, 'path' | 'content'>[]): number => notesKnownGroups(notes).length
