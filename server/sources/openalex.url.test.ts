import { describe, expect, it } from 'vitest'
import { workPath } from './openalex'
import { parseSeedInput } from '../discovery/seeds'

describe('OpenAlex request paths (#35)', () => {
  it('encodes ids so / ? # and .. cannot change the path or add a query', () => {
    const v = '10.1/a?b#c/../../authors/A1'
    const u = new URL('https://api.openalex.org' + workPath({ kind: 'doi', value: v }))
    expect(u.pathname).toBe('/works/doi:10.1%2Fa%3Fb%23c%2F..%2F..%2Fauthors%2FA1')
    expect(u.search).toBe('')
    expect(u.hash).toBe('')
  })
  it('encodes OpenAlex and PMID ids too', () => {
    expect(workPath({ kind: 'openalex', value: 'W1/2?3' })).toBe('/works/W1%2F2%3F3')
    expect(workPath({ kind: 'pmid', value: '123' })).toBe('/works/pmid:123')
  })
  it('seed input with dot segments is rejected', () => {
    expect(parseSeedInput('10.1234/../../authors/A123')).toBeNull()
    expect(parseSeedInput('10.1234/abc.def')).toMatchObject({ kind: 'doi' })
  })
})
