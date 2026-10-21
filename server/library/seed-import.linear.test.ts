import { describe, expect, it } from 'vitest'
import { idsInText, parseSeedText } from './seed-import'
import { extractDoi } from '../sources/tavily'

// Issue #41: id extraction runs in linear time. Inputs are generated here, sized for the time limit.
const timed = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t }
const MB = 1_000_000

describe('seed import id extraction stays linear (#41)', () => {
  const shapes: Record<string, (n: number) => string> = {
    'long space runs after a label': n => 'PMID' + ' '.repeat(n) + 'x',
    'long space runs after an arXiv label': n => 'arXiv' + ' '.repeat(n) + 'x',
    'many repeated labels': n => 'PMID '.repeat(Math.ceil(n / 5)),
    'long punctuation run after a DOI': n => '10.1234/a' + '.'.repeat(n) + 'x',
    'long brace run after a DOI': n => '10.1234/a' + '}'.repeat(n) + 'x',
  }
  for (const [name, make] of Object.entries(shapes)) {
    it(`${name}: a few KB and 1 MB finish under 200 ms`, () => {
      for (const n of [4_000, MB]) expect(timed(() => parseSeedText('x.txt', make(n)))).toBeLessThan(200)
    })
  }
  it('still reads ids written with a short separator', () => {
    expect(idsInText('PMID:  {12345678} arXiv : 2101.00001 10.1000/abc.')).toEqual(['10.1000/abc', 'PMID:12345678', 'arXiv:2101.00001'])
  })
})

describe('web-snippet DOI extraction stays linear (#41)', () => {
  it('citation_doi with long space runs and trailing punctuation runs finishes under 200 ms', () => {
    for (const n of [4_000, MB]) {
      expect(timed(() => extractDoi('https://example.org/x', 'citation_doi' + ' '.repeat(n) + 'x'))).toBeLessThan(200)
      expect(timed(() => extractDoi('https://example.org/x', 'doi:10.1234/a' + '.'.repeat(n) + 'x'))).toBeLessThan(200)
    }
  })
  it('still reads the citation_doi meta tag', () => {
    expect(extractDoi('https://example.org/x', '<meta name="citation_doi" content="10.1234/Abc.5">')).toBe('10.1234/abc.5')
  })
})
