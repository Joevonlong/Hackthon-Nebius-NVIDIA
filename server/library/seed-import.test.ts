import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSeedText } from './seed-import'

describe('seed file import (D-36)', () => {
  it('reads DOIs, PMIDs and arXiv ids from BibTeX', () => {
    const bib = `@article{a, title={X}, doi = {10.1126/science.aad0501}, pmid={27124452}}
@article{b, doi = "https://doi.org/10.1016/j.cell.2018.10.038",}
@misc{c, eprint = {1706.03762v5}, archivePrefix={arXiv}}`
    const r = parseSeedText('refs.bib', bib)
    expect(r.format).toBe('bibtex')
    expect(r.ids).toEqual(['10.1126/science.aad0501', 'PMID:27124452', '10.1016/j.cell.2018.10.038', 'arXiv:1706.03762'])
  })
  it('reads RIS DO and AN tags', () => {
    const r = parseSeedText('x.ris', 'TY  - JOUR\nTI  - A\nDO  - 10.1038/nature12345\nAN  - 31234567\nER  - \n')
    expect(r.format).toBe('ris')
    expect(r.ids).toEqual(['10.1038/nature12345', 'PMID:31234567'])
  })
  it('reads CSL JSON', () => {
    const r = parseSeedText('x.json', JSON.stringify([{ DOI: '10.1000/abc' }, { PMID: '12345678' }, { URL: 'https://arxiv.org/abs/2101.00001' }]))
    expect(r.ids).toEqual(['10.1000/abc', 'PMID:12345678', 'arXiv:2101.00001'])
  })
  it('takes the DOI / PMID column of a CSV, or id-looking cells', () => {
    expect(parseSeedText('x.csv', 'Title,DOI,Year\n"A, b",10.1000/a,2020\nB,,2021\n').ids).toEqual(["10.1000/a"])
    expect(parseSeedText('x.csv', 'title;id\nA;W2741809807\nB;31234567\n').ids).toEqual(['W2741809807', 'PMID:31234567'])
  })
  it('reads a plain text list and dedupes', () => {
    expect(parseSeedText('x.txt', '10.1000/A\n10.1000/a\n31234567\narXiv:2101.00001').ids).toEqual(["10.1000/A", 'arXiv:2101.00001', 'PMID:31234567'])
  })
})

describe('BibTeX parsing runs in linear time (#35)', () => {
  const MB = 1024 * 1024
  const attacks: Record<string, string> = {
    'unclosed doi={ repeated': 'doi={'.repeat(Math.ceil(MB / 5)),
    'unclosed doi = " repeated': 'doi = "'.repeat(Math.ceil(MB / 8)),
    'long whitespace runs': ('url ' + ' '.repeat(2000) + '= {').repeat(Math.ceil(MB / 2010)),
    'near-cap values never closed': ('doi={' + 'a'.repeat(999)).repeat(Math.ceil(MB / 1004)),
    'near-cap whitespace then key': ('doi' + ' '.repeat(199) + 'x').repeat(Math.ceil(MB / 203)),
    'many one-level groups': ('doi={' + '{x}'.repeat(60)).repeat(Math.ceil(MB / 185)),
  }
  for (const [name, input] of Object.entries(attacks)) {
    it(`1 MB adversarial input (${name}) finishes in under 1 s`, () => {
      const t = Date.now()
      parseSeedText('x.bib', input)
      expect(Date.now() - t).toBeLessThan(1000)
    })
  }
  it('a Zotero/JabRef-style export (long abstracts, aligned =, nested braces) imports the same ids as before the change', () => {
    const bib = readFileSync(new URL('./seed-import.sample.bib', import.meta.url), 'utf8')
    const r = parseSeedText('refs.bib', bib)
    expect(r.format).toBe('bibtex')
    expect(r.ids).toEqual(['10.1126/science.aad0501', 'PMID:27124452', '10.1016/j.cell.2018.09.006', 'PMID:30388455', 'arXiv:1706.03762'])
  })
  it('doi={ followed by 1000 spaces, repeated to 1 MB, finishes in under 200 ms', () => {
    const input = ('doi={' + ' '.repeat(1000)).repeat(Math.ceil((1024 * 1024) / 1005))
    const t = Date.now()
    parseSeedText('x.bib', input)
    expect(Date.now() - t).toBeLessThan(200)
  })
  it('reads values up to 1000 chars and = aligned with up to 200 spaces', () => {
    const bib = `@article{a, doi={10.1/first}, url${' '.repeat(60)}= {https://x.org/${'a'.repeat(400)}/10.1234/zzz}}`
    expect(parseSeedText('a.bib', bib).ids).toEqual(['10.1/first', '10.1234/zzz'])
  })
  it('still reads entries after the change', () => {
    expect(parseSeedText('a.bib', '@article{a, doi={10.1/abc}}').ids).toEqual(['10.1/abc'])
  })
})
