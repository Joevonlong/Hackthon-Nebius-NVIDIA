import { describe, expect, it } from 'vitest'
import { bibliography, exportFile, questionScope, toBibTeX, toCslJson, zip } from './export'
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

describe('Q2-4: exports of one research question', () => {
  const q = (name: string, rel: string, kind: Note['kind'], content: string, paperId?: string): Note =>
    ({ path: `Questions/${name}/${rel}`, kind, title: rel, content, paperId, updatedAt: 0 })
  const all: Note[] = [
    q('Melanoma', 'Question.md', 'note', '# Q'),
    q('Melanoma', 'seeds/S1 Tirosh 2016.md', 'seed', '---\ntitle: Dissecting\nauthors: "Itay Tirosh; Aviv Regev"\nyear: 2016\n---\n'),
    q('Melanoma', 'notes/Yan 2021 Atlas.md', 'lit', '---\npaper_id: W1\ntitle: Atlas\nauthors: "Yan M; Smith JA"\nyear: 2021\n---\n', 'W1'),
    q('Glioma', 'seeds/S1 Neftel 2019.md', 'seed', '---\ntitle: Glioblastoma states\nauthors: "Cyril Neftel"\nyear: 2019\n---\n'),
    { path: 'Discovered/Old 2020.md', kind: 'lit', title: 'Old', content: '---\ntitle: Old kept paper\nyear: 2020\n---\n', paperId: 'W9', updatedAt: 0 },
    { path: 'Discovered/Other 2020.md', kind: 'lit', title: 'Other', content: '---\ntitle: Unrelated\nyear: 2020\n---\n', paperId: 'W8', updatedAt: 0 },
  ]
  it('covers only the active question: its seeds, its notes and older notes of its library papers', () => {
    const scoped = questionScope(all, 'Melanoma', ['W1', 'W9'])
    expect(scoped.map(n => n.path)).toEqual(['Questions/Melanoma/Question.md', 'Questions/Melanoma/seeds/S1 Tirosh 2016.md', 'Questions/Melanoma/notes/Yan 2021 Atlas.md', 'Discovered/Old 2020.md'])
    const bib = exportFile('bib', scoped, 'Melanoma')
    expect(bib.name).toBe('Melanoma.bib')
    expect(bib.data).not.toContain('Glioblastoma')
    expect(bib.data).toContain('@article{yan2021atlas')
    expect(questionScope(all, null)).toEqual([])
  })
  it('CSL JSON splits PubMed-style names (Q2-8)', () => {
    const csl = JSON.parse(exportFile('csl', questionScope(all, 'Melanoma'), 'Melanoma').data as string)
    expect(csl.find((e: { title: string }) => e.title === 'Atlas').author).toEqual([{ family: 'Yan', given: 'M' }, { family: 'Smith', given: 'JA' }])
  })
})

describe('importRefs', () => {
  it('extracts DOIs from BibTeX and CSL JSON', () => {
    expect(extractDois('@article{a, doi = {10.1126/science.aad0501}}', 'a.bib')).toEqual(['10.1126/science.aad0501'])
    expect(extractDois('[{"DOI":"https://doi.org/10.1038/S41586-021-03704-Y"}]', 'a.json')).toEqual(['10.1038/s41586-021-03704-y'])
  })
})
