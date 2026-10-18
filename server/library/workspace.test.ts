import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createQuestion, deleteNote, listNotes, listQuestions, notePathIn, renameQuestion, trashQuestion, writeNote } from './workspace'

describe('workspace question folders (D-37)', () => {
  it('creates, writes notes, renames and trashes; rejects unsafe paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'ws-'))
    process.env.WORKSPACE_DIR = root
    expect(createQuestion('Melanoma immune cells', '---\ntype: question\n---\n# Question\n\nWhich cells?\n')).toMatchObject({ id: 'Melanoma immune cells', text: 'Which cells?' })
    expect(createQuestion('Melanoma immune cells', 'x')).toBe('exists')
    expect(createQuestion('../escape', 'x')).toBeNull()
    expect(createQuestion('.hidden', 'x')).toBeNull()
    expect(writeNote('Melanoma immune cells', 'seeds/S1 Tirosh 2016.md', 'doi 10.1126/science.aad0501')).toBe(true)
    for (const bad of ['../x.md', 'seeds/../../x.md', 'libraries/a.md', 'notes/a.txt', '.secret.md', 'a//b.md']) expect(notePathIn('Melanoma immune cells', bad)).toBeNull()
    expect(listNotes('Melanoma immune cells')!.map(n => n.path).sort()).toEqual(['Question.md', 'seeds/S1 Tirosh 2016.md'])
    expect(deleteNote('Melanoma immune cells', 'Question.md')).toBe(false)
    expect(renameQuestion('Melanoma immune cells', 'Melanoma')).toBe('ok')
    expect(listQuestions().map(q => q.id)).toEqual(['Melanoma'])
    expect(trashQuestion('Melanoma')).toBe(true)
    expect(existsSync(join(root, '.trash', 'Melanoma', 'Question.md'))).toBe(true)
    expect(listQuestions()).toEqual([])
  })
})
