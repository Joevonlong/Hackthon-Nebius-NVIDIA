import { describe, expect, it } from 'vitest'
import { notesKnownCount } from './knownNotes'

describe('notes treated as known', () => {
  it('counts ids named only in non-seed notes', () => {
    expect(notesKnownCount([
      { path: 'Questions/q/seeds/S1.md', content: 'doi 10.1234/seed' },
      { path: 'Questions/q/Idea.md', content: 'see 10.2345/other, 10.1234/seed and PMID 123456' },
    ])).toBe(2)
    expect(notesKnownCount([{ path: 'Questions/q/seeds/S1.md', content: '10.1234/seed' }])).toBe(0)
  })
})
