// "N papers from your notes are treated as known": ids (DOI / PMID / arXiv / OpenAlex) named in notes that are not seeds.
// Same id patterns and seed rule as server/library/goals.ts (knownBySource), so the panel count matches the build's.
import type { VaultNote } from '@shared/library'

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'`<>\]\[(){}|,;]+)/gi
const PMID_RE = /(?:\bPMID\s*:?\s*|pubmed\.ncbi\.nlm\.nih\.gov\/)(\d{5,9})\b/gi
const ARXIV_RE = /(?:\barXiv\s*:?\s*|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5})(?:v\d+)?/gi
const ARXIV_DOI_RE = /^10\.48550\/arxiv\.(\d{4}\.\d{4,5})/i
const OPENALEX_RE = /(?:openalex\.org\/(?:works\/)?|\b)(W\d{6,12})\b/g
const isSeed = (n: Pick<VaultNote, 'path'>) => /(^|\/)seeds\//i.test(n.path)

function idsIn(text: string, out: Set<string>) {
  for (const m of text.matchAll(DOI_RE)) {
    const doi = m[1].replace(/[.)\]}>*_`'"]+$/, '').toLowerCase()
    const ax = doi.match(ARXIV_DOI_RE)
    out.add(ax ? `arxiv:${ax[1]}` : doi)
  }
  for (const m of text.matchAll(PMID_RE)) out.add(`pmid:${m[1]}`)
  for (const m of text.matchAll(ARXIV_RE)) out.add(`arxiv:${m[1]}`)
  for (const m of text.matchAll(OPENALEX_RE)) out.add(m[1])
}

/** Ids named only in non-seed notes. */
export function notesKnownCount(notes: Pick<VaultNote, 'path' | 'content'>[]): number {
  const seeds = new Set<string>(), other = new Set<string>()
  for (const n of notes) idsIn(n.content, isSeed(n) ? seeds : other)
  return [...other].filter(id => !seeds.has(id)).length
}
