import { describe, expect, it } from 'vitest'
import { notesKnownCount, notesKnownGroups } from './knownNotes'
import { knownBySource } from '../../../server/library/goals'

const seed = { path: 'Questions/q/seeds/S1.md', title: 'S1', content: '---\ndoi: 10.1234/seed\npmid: 1234567\n---\nW1234567' }

describe('notes treated as known', () => {
  it('counts papers, not ids: ids in one paragraph of a note are one paper; seed ids are excluded', () => {
    expect(notesKnownCount([
      seed,
      { path: 'Questions/q/Idea.md', content: 'see 10.2345/other and PMID 7654321\n\nalso 10.1234/seed, arXiv:2101.01234' },
    ])).toBe(2)
    expect(notesKnownCount([seed])).toBe(0)
  })
  it('a reference list (one id per line) is N papers', () => {
    expect(notesKnownCount([{ path: 'Notes/refs.md', content: '- 10.1111/aaa\n- 10.2222/bbb\n- 10.3333/ccc' }])).toBe(3)
  })
  it('one note with a DOI and a PMID is 1 paper', () => {
    expect(notesKnownCount([{ path: 'Notes/a.md', content: 'doi 10.1234/x PMID 1234567' }])).toBe(1)
  })
  it('matches server/library/goals.ts on the same strings (the regexes cannot drift)', () => {
    const notes = [
      seed,
      { path: 'Notes/a.md', title: 'a', content: 'https://doi.org/10.48550/arXiv.2101.00001 and openalex.org/W9999999 (PMID: 7654321)\n\nDOI 10.5555/ABC.1.' },
      { path: 'Notes/b.md', title: 'b', content: 'pubmed.ncbi.nlm.nih.gov/8888888/ plus arxiv.org/abs/2203.00002v2 and 10.1234/seed' },
    ]
    const server = knownBySource(notes).fromNotes
    const norm = (gs: string[][]) => gs.map(g => [...g].sort()).sort((x, y) => x[0].localeCompare(y[0]))
    expect(norm(notesKnownGroups(notes))).toEqual(norm(server))
    expect(server.length).toBeGreaterThan(2)
  })
})
