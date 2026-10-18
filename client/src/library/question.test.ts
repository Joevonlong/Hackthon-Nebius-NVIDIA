import { describe, expect, it } from 'vitest'
import { questionNote } from '../stores/vault'
import { readQuestion, writeQuestion } from './question'

describe('Question.md paragraph', () => {
  it('reads and replaces the question paragraph and keeps the rest', () => {
    const note = questionNote('Which single-cell methods help study melanoma immune cells?')
    expect(readQuestion(note.content)).toBe('Which single-cell methods help study melanoma immune cells?')
    const next = writeQuestion(note.content, 'How do T cells exhaust in melanoma?')
    expect(readQuestion(next)).toBe('How do T cells exhaust in melanoma?')
    expect(next).toContain('## Seeds')
    expect(next).toContain('## Kept so far')
    expect(next.startsWith('---\ntype: question')).toBe(true)
    expect(next).not.toContain('Which single-cell methods')
  })

  it('inserts a paragraph when the note has none', () => {
    const next = writeQuestion('# Question\n\n## Seeds\n\nsome text\n', 'Q?')
    expect(readQuestion(next)).toBe('Q?')
    expect(next).toContain('## Seeds\n\nsome text')
    expect(writeQuestion('', 'Only')).toContain('Only')
  })
})
