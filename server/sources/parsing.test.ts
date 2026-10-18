import { describe, expect, it } from 'vitest'
import { Paper as PaperSchema } from '@shared/contracts'
import { invertedIndexToText, mapWork, normDoi } from './openalex'
import { parseEfetchAbstracts } from './pubmed'
import { parseSeedInput, shortName } from '../discovery/seeds'
import { cacheKeyUrl } from '../data/http'
import { decodeVec, encodeVec } from '../data/repo'

describe('OpenAlex mapping', () => {
  it('rebuilds abstracts from the inverted index', () => {
    expect(invertedIndexToText({ To: [0], explore: [1], the: [2, 5], states: [3], of: [4], tumors: [6] })).toBe('To explore the states of the tumors')
    expect(invertedIndexToText(null)).toBeNull()
    expect(invertedIndexToText({})).toBeNull()
  })
  it('maps a work to the Paper contract', () => {
    const p = mapWork({
      id: 'https://openalex.org/W2332292689', doi: 'https://doi.org/10.1126/SCIENCE.AAD0501',
      ids: { pmid: 'https://pubmed.ncbi.nlm.nih.gov/27124452', pmcid: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4944528' },
      display_name: 'Dissecting the multicellular ecosystem', publication_year: 2016, publication_date: '2016-04-08', cited_by_count: 5000,
      type: 'article', primary_location: { source: { display_name: 'Science' } }, authorships: [{ author: { display_name: 'Itay Tirosh' } }],
      is_retracted: false, referenced_works: ['https://openalex.org/W1'], open_access: { is_oa: true, oa_url: 'https://x' },
      abstract_inverted_index: { Hello: [0], world: [1] }, citation_normalized_percentile: { value: 0.99 },
    })
    expect(p).toMatchObject({ id: 'W2332292689', doi: '10.1126/science.aad0501', pmid: '27124452', pmcid: 'PMC4944528', abstract: 'Hello world', abstractSource: 'openalex', citationPct: 0.99, referencedWorks: ['W1'], venue: 'Science' })
    expect(PaperSchema.safeParse(p).success).toBe(true)
    expect(shortName(p)).toBe('Tirosh 2016')
  })
  it('normalises DOIs', () => {
    expect(normDoi('https://doi.org/10.1016/J.CELL.2018.10.038')).toBe('10.1016/j.cell.2018.10.038')
    expect(normDoi(null)).toBeNull()
  })
})

describe('seed input parsing', () => {
  it.each([
    ['10.1126/science.aad0501', { kind: 'doi', value: '10.1126/science.aad0501' }],
    ['https://doi.org/10.1016/j.cell.2018.10.038', { kind: 'doi', value: '10.1016/j.cell.2018.10.038' }],
    ['doi:10.1158/1078-0432.CCR-21-1694', { kind: 'doi', value: '10.1158/1078-0432.ccr-21-1694' }],
    ['27124452', { kind: 'pmid', value: '27124452' }],
    ['PMID: 27124452', { kind: 'pmid', value: '27124452' }],
    ['https://pubmed.ncbi.nlm.nih.gov/27124452/', { kind: 'pmid', value: '27124452' }],
    ['W2332292689', { kind: 'openalex', value: 'W2332292689' }],
    ['https://openalex.org/W2332292689', { kind: 'openalex', value: 'W2332292689' }],
    ['PMC4944528', { kind: 'pmcid', value: 'PMC4944528' }],
  ])('%s', (input, want) => expect(parseSeedInput(input)).toEqual(want))
  it('rejects junk', () => {
    expect(parseSeedInput('melanoma')).toBeNull()
    expect(parseSeedInput('')).toBeNull()
  })
})

describe('PubMed efetch parsing', () => {
  it('joins labelled AbstractText sections and decodes entities', () => {
    const xml = `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">123</PMID><Article><Abstract>
      <AbstractText Label="BACKGROUND" NlmCategory="BACKGROUND">CD8<sup>+</sup> T cells &amp; tumors.</AbstractText>
      <AbstractText Label="RESULTS">We found &lt;5% overlap.</AbstractText></Abstract></Article></MedlineCitation>
      <PubmedData><ArticleIdList><ArticleId IdType="pubmed">123</ArticleId></ArticleIdList></PubmedData></PubmedArticle>
      <PubmedArticle><MedlineCitation><PMID Version="1">456</PMID><Article></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>`
    const m = parseEfetchAbstracts(xml)
    expect(m.get('123')).toBe('BACKGROUND: CD8+ T cells & tumors.\nRESULTS: We found <5% overlap.')
    expect(m.has('456')).toBe(false)
  })
})

describe('storage helpers', () => {
  it('cache keys never contain secrets', () => {
    expect(cacheKeyUrl('https://api.openalex.org/works?filter=x&api_key=SECRET&mailto=a@b.c')).toBe('https://api.openalex.org/works?filter=x')
  })
  it('fp16 embedding round trip', () => {
    const v = [0.5, -0.25, 0.1234, 0, 1]
    const back = decodeVec(encodeVec(v))
    back.forEach((x, i) => expect(Math.abs(x - v[i])).toBeLessThan(1e-3))
  })
})
