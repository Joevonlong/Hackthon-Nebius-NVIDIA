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

describe('known-id extraction stays linear (#41)', () => {
  const timed = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t }
  const shapes = [(n: number) => 'PMID' + ' '.repeat(n) + 'x', (n: number) => 'arXiv' + ' '.repeat(n) + 'x', (n: number) => '10.1234/a' + '.'.repeat(n) + 'x', (n: number) => '\n'.repeat(n) + 'x', (n: number) => '\n \t'.repeat(n / 3) + 'x', (n: number) => '# a' + ' '.repeat(n) + 'x']
  it('long runs of 4 KB and 1 MB finish under 200 ms in both copies', () => {
    for (const make of shapes) for (const n of [4_000, 1_000_000]) {
      const notes = [{ path: 'Notes/a.md', title: 'a', content: make(n) }]
      expect(timed(() => notesKnownGroups(notes))).toBeLessThan(200)
      expect(timed(() => knownBySource(notes))).toBeLessThan(200)
    }
  })
})
