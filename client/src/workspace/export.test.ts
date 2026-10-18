import { describe, expect, it } from 'vitest'
import { bibliography, toBibTeX, toCslJson, zip } from './export'
import { extractDois } from './importRefs'
import type { Note } from '../stores/vault'

const notes: Note[] = [
  { path: 'Notes/Question.md', kind: 'note', title: 'Question', content: '# Q', updatedAt: 0 },
  { path: 'Seeds/S1 Tirosh 2016.md', kind: 'seed', title: 'S1', updatedAt: 0,
    content: '---\ntitle: "Dissecting the multicellular ecosystem"\nauthors: [Itay Tirosh, Aviv Regev]\nyear: 2016\nvenue: Science\ndoi: 10.1126/science.aad0501\n---\n# x' },
  { path: 'Discovered/Minowa 2026.md', kind: 'lit', title: 'Minowa 2026', updatedAt: 0,
    content: '---\ntitle: Immune microenvironment of acral melanoma\nfirst_author: Minowa\nyear: 2026\n---\n' },
]

describe('export', () => {
  it('builds a bibliography from seed and lit notes only', () => {
    const b = bibliography(notes)
    expect(b.map(e => e.key)).toEqual(['tirosh2016dissecting', 'minowa2026immune'])
    expect(b[0].authors).toEqual(['Itay Tirosh', 'Aviv Regev'])
  })
  it('writes BibTeX and CSL JSON', () => {
    const b = bibliography(notes)
    expect(toBibTeX(b)).toContain('author = {Itay Tirosh and Aviv Regev}')
    const csl = JSON.parse(toCslJson(b))
    expect(csl[0]).toMatchObject({ DOI: '10.1126/science.aad0501', author: [{ family: 'Tirosh', given: 'Itay' }, { family: 'Regev', given: 'Aviv' }] })
  })
  it('writes a store-only zip with one entry per note', async () => {
    const buf = new Uint8Array(await zip(notes.map(n => ({ name: n.path, content: n.content }))).arrayBuffer())
    const view = new DataView(buf.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint16(buf.length - 22 + 10, true)).toBe(3)
  })
})

describe('importRefs', () => {
  it('extracts DOIs from BibTeX and CSL JSON', () => {
    expect(extractDois('@article{a, doi = {10.1126/science.aad0501}}', 'a.bib')).toEqual(['10.1126/science.aad0501'])
    expect(extractDois('[{"DOI":"https://doi.org/10.1038/S41586-021-03704-Y"}]', 'a.json')).toEqual(['10.1038/s41586-021-03704-y'])
  })
})
