import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => { process.env.TOKEN_FACTORY_API_KEY = ''; process.env.TRACE_CONSOLE = '0' })

import { Goals } from '@shared/library'
import { deriveGoals, extractKnownPapers, knownBySource, knownGroups, fallbackGoals, tfidfKeywords, verifyEvidence } from './goals'

const notes = [
  { path: 'Question.md', title: 'Melanoma immune atlas', content: '# Melanoma immune atlas\n\nWhich single-cell methods help study melanoma immune cells?\n\n## T cell exhaustion\n\n## Brain metastasis\n' },
  { path: 'seeds/Tirosh.md', title: 'Tirosh 2016', content: 'DOI: https://doi.org/10.1126/science.aad0501.\nPMID: 27124452\nscRNA-seq of melanoma tumours resolves malignant and immune cells.\n## T cell exhaustion' },
  { path: 'seeds/other.md', title: 'Other', content: 'See arXiv:2101.01234v2 and https://openalex.org/W2899145148 and doi 10.48550/arXiv.2203.00001; pubmed.ncbi.nlm.nih.gov/30388456' },
]

describe('known paper ids', () => {
  it('extracts DOI, PMID, arXiv (incl. arXiv DOIs) and OpenAlex ids', () => {
    expect(extractKnownPapers(notes).sort()).toEqual(['10.1126/science.aad0501', 'W2899145148', 'arxiv:2101.01234', 'arxiv:2203.00001', 'pmid:27124452', 'pmid:30388456'].sort())
  })
})

describe('notes as known papers', () => {
  const vault = [
    { path: 'Questions/q/seeds/S1.md', title: 'S1', content: '---\ndoi: 10.1234/seed\npmid: 1234567\n---\nOpenAlex W1234567' },
    { path: 'Questions/q/Idea.md', title: 'Idea', content: 'see 10.2345/mentioned, PMID 7654321\n\nalso 10.1234/seed and arXiv:2101.01234' },
  ]
  it('a seed note is ONE paper; ids in one paragraph of a note are one paper; the toggle drops note papers', () => {
    expect(knownBySource(vault)).toEqual({
      seeds: [['10.1234/seed', 'pmid:1234567', 'W1234567']],
      fromNotes: [['10.2345/mentioned', 'pmid:7654321'], ['arxiv:2101.01234']],
    })
    expect(knownGroups(vault)).toHaveLength(3)
    expect(knownGroups(vault, false)).toHaveLength(1)
    expect(extractKnownPapers(vault, false)).toEqual(['10.1234/seed', 'pmid:1234567', 'W1234567'])
  })
  it('one note paragraph with a DOI and a PMID is 1 paper', () => {
    expect(knownBySource([{ path: 'Notes/a.md', title: 'a', content: 'doi 10.1234/x PMID 1234567' }]).fromNotes).toHaveLength(1)
  })
})

describe('fallback goals', () => {
  it('uses the question note, headings as subtopics, TF-IDF keywords', () => {
    const g = fallbackGoals(notes, ['x'])
    expect(Goals.safeParse(g).success).toBe(true)
    expect(g.question).toBe('Which single-cell methods help study melanoma immune cells?')
    expect(g.topic).toBe('Melanoma immune atlas')
    expect(g.subtopics.map(s => s.name)).toEqual(['T cell exhaustion', 'Brain metastasis'])
    expect(g.model).toBeNull()
    expect(tfidfKeywords(notes)).toContain('melanoma')
  })
  it('deriveGoals without a key returns the fallback', async () => {
    const g = await deriveGoals(notes)
    expect(g.model).toBeNull()
    expect(g.knownPapers).toHaveLength(6)
  })
})

describe('evidence verification', () => {
  it('keeps verbatim (normalized) quotes, fixes the note path, drops invented ones', () => {
    const ev = verifyEvidence([
      { notePath: 'Question.md', quote: 'scRNA-seq of melanoma tumours resolves malignant and immune cells' },
      { notePath: 'Question.md', quote: 'Which single-cell methods help   study melanoma immune cells?' },
      { notePath: 'Question.md', quote: 'This sentence is not anywhere in the notes at all.' },
    ], notes)
    expect(ev).toEqual([
      { notePath: 'seeds/Tirosh.md', quote: 'scRNA-seq of melanoma tumours resolves malignant and immune cells' },
      { notePath: 'Question.md', quote: 'Which single-cell methods help study melanoma immune cells?' },
    ])
  })
})
