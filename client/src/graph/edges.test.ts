import { describe, expect, it } from 'vitest'
import type { Paper } from '@shared/contracts'
import type { LibPaper } from '@shared/library'
import { buildCitationEdges, idKeys, noteKeys } from './edges'

const paper = (id: string, o: Partial<Paper> = {}): Paper => ({
  id, doi: null, pmid: null, pmcid: null, title: id, authors: [], year: 2020, publicationDate: null, venue: null, type: 'article',
  citedByCount: 0, citationPct: null, isRetracted: false, isOa: null, oaUrl: null, abstract: null, abstractSource: null,
  referencedWorks: [], url: `https://openalex.org/${id}`, ...o,
})
const lib = (id: string, o: Partial<Paper> = {}, relations: LibPaper['relations'] = []): LibPaper => ({ paper: paper(id, o), relations } as unknown as LibPaper)

describe('idKeys', () => {
  it('normalises OpenAlex, DOI, PMID and arXiv forms', () => {
    expect(idKeys('W123456')).toEqual(['oa:w123456'])
    expect(idKeys('https://openalex.org/W123456')).toEqual(['oa:w123456'])
    expect(idKeys('https://doi.org/10.1126/Science.AAD0501')).toEqual(['doi:10.1126/science.aad0501'])
    expect(idKeys('doi:10.1126/science.aad0501')).toEqual(['doi:10.1126/science.aad0501'])
    expect(idKeys('pmid:27124452')).toEqual(['pmid:27124452'])
    expect(idKeys('27124452')).toEqual(['pmid:27124452'])
    expect(idKeys('arXiv:2101.00001v2')).toEqual(['arxiv:2101.00001'])
    expect(idKeys('10.48550/arXiv.2101.00001')).toEqual(['doi:10.48550/arxiv.2101.00001', 'arxiv:2101.00001'])
    expect(idKeys('')).toEqual([])
  })
})

describe('noteKeys', () => {
  it('reads frontmatter ids as primary and ids in the text as fallback', () => {
    const k = noteKeys({ content: '---\npaper_id: W1\ndoi: 10.1/abc\npmid: 42\n---\n# T\nSee 10.1038/xyz and PMID: 7777777' })
    expect(k.primary.sort()).toEqual(['doi:10.1/abc', 'oa:w1', 'pmid:42'])
    expect(k.text.sort()).toEqual(['doi:10.1038/xyz', 'pmid:7777777'])
  })
})

describe('buildCitationEdges', () => {
  it('links library papers through referencedWorks (any id form), deduped', () => {
    const libs = [
      { node: 'lib:W1', lib: lib('W1', { referencedWorks: ['W2', 'https://openalex.org/W3', 'W999'] }) },
      { node: 'lib:W2', lib: lib('W2', { referencedWorks: ['W1'] }) }, // mutual cite → one edge
      { node: 'lib:W3', lib: lib('W3') },
    ]
    const r = buildCitationEdges({ libs, notes: [] })
    expect(r.edges).toEqual([
      { source: 'lib:W1', target: 'lib:W2', kind: 'cite' },
      { source: 'lib:W1', target: 'lib:W3', kind: 'cite' },
    ])
    expect(r.cite).toBe(2); expect(r.seed).toBe(0)
  })

  it('resolves relations to a seed note by DOI, PMID or W id (via a pool alias) and marks them seed edges', () => {
    const seedPaper = paper('W2332292689', { doi: '10.1126/science.aad0501', pmid: '27124452' })
    const notes = [
      { node: 'note:Seeds/Tirosh.md', content: '# Tirosh 2016\nhttps://doi.org/10.1126/science.aad0501', seed: true }, // no paper_id: matched via DOI text
    ]
    const libs = [
      { node: 'lib:W1', lib: lib('W1', {}, [{ type: 'cited_by', paperId: 'W2332292689' }]) },
      { node: 'lib:W2', lib: lib('W2', {}, [{ type: 'cites', paperId: 'pmid:27124452', note: 'Europe PMC references' }]) },
      { node: 'lib:W3', lib: lib('W3', {}, [{ type: 'similar', paperId: 'W2332292689' }]) }, // not a citation
    ]
    const r = buildCitationEdges({ libs, notes, pool: [seedPaper] })
    expect(r.edges).toEqual([
      { source: 'note:Seeds/Tirosh.md', target: 'lib:W1', kind: 'seed' },
      { source: 'lib:W2', target: 'note:Seeds/Tirosh.md', kind: 'seed' },
    ])
    expect(r.seed).toBe(2)
  })

  it('walks the references of a vault note that is a library paper (by note.paperId / frontmatter)', () => {
    const kept = lib('W5', { doi: '10.5/kept', referencedWorks: ['W1'] })
    const notes = [{ node: 'note:Literature/Kept.md', paperId: 'W5', content: '---\npaper_id: W5\n---\n', seed: false }]
    const libs = [{ node: 'lib:W1', lib: lib('W1') }]
    const r = buildCitationEdges({ libs, notes, pool: [kept] })
    expect(r.edges).toEqual([{ source: 'note:Literature/Kept.md', target: 'lib:W1', kind: 'cite' }])
  })

  it('a note that only mentions ids is a target, not the source paper', () => {
    const libs = [{ node: 'lib:W1', lib: lib('W1', { referencedWorks: ['W7'] }) }]
    const notes = [{ node: 'note:Question.md', content: 'my seeds: https://openalex.org/W7', seed: false }]
    const r = buildCitationEdges({ libs, notes, pool: [lib('W7', { referencedWorks: ['W1'] })] })
    expect(r.edges).toEqual([{ source: 'lib:W1', target: 'note:Question.md', kind: 'cite' }])
  })
})

describe('seed notes without frontmatter', () => {
  it('a seed note holding just a DOI stands for that paper (its references become seed edges)', () => {
    const seedPaper = lib('W2332292689', { doi: '10.1126/science.aad0501', referencedWorks: ['W1'] })
    const libs = [{ node: 'lib:W1', lib: lib('W1') }]
    const notes = [{ node: 'note:Seeds/Tirosh.md', content: '10.1126/science.aad0501', seed: true }]
    const r = buildCitationEdges({ libs, notes, pool: [seedPaper] })
    expect(r.edges).toEqual([{ source: 'note:Seeds/Tirosh.md', target: 'lib:W1', kind: 'seed' }])
  })
})
