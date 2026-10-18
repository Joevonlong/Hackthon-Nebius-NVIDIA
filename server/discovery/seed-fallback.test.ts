import { describe, expect, it } from 'vitest'
import { Seed } from '@shared/contracts'
import { HttpError } from '../data/http'
import { mapCrossref, mapEsummary, mapEuropePmc, resolveWithoutOpenAlex } from './seed-fallback'
import { resolveSeeds, shortName } from './seeds'

const crossrefMsg = {
  DOI: '10.1126/science.ade2574', type: 'journal-article', title: ['Evolutionary-scale prediction of atomic-level protein structure with a language model'],
  author: [{ given: 'Zeming', family: 'Lin' }, { given: 'Alexander', family: 'Rives' }], 'container-title': ['Science'],
  published: { 'date-parts': [[2023, 3, 17]] }, 'is-referenced-by-count': 2000, URL: 'https://doi.org/10.1126/science.ade2574',
}

describe('Q2-6 seed resolve without OpenAlex', () => {
  it('maps Crossref, Europe PMC and PubMed esummary records to contract Papers', () => {
    const c = mapCrossref(crossrefMsg)!
    expect(c).toMatchObject({ id: 'doi:10.1126/science.ade2574', doi: '10.1126/science.ade2574', year: 2023, publicationDate: '2023-03-17', venue: 'Science', type: 'article', citationPct: null, authors: ['Zeming Lin', 'Alexander Rives'] })
    const e = mapEuropePmc({ id: '36927031', source: 'MED', pmid: '36927031', doi: '10.1126/SCIENCE.ADE2574', title: 'Evolutionary-scale prediction.', pubYear: '2023', journalInfo: { journal: { title: 'Science' } }, abstractText: '<p>Recent advances…</p>', authorList: { author: [{ fullName: 'Lin Z' }] } })!
    expect(e).toMatchObject({ id: 'pmid:36927031', doi: '10.1126/science.ade2574', abstract: 'Recent advances…', abstractSource: 'europepmc', url: 'https://pubmed.ncbi.nlm.nih.gov/36927031/' })
    const s = mapEsummary('38082384', { uid: '38082384', title: 'A paper.', pubdate: '2023 Dec 11', fulljournalname: 'Signal Transduction and Targeted Therapy', authors: [{ name: 'Yan M', authtype: 'Author' }], articleids: [{ idtype: 'doi', value: '10.1038/s41392-023-01681-2' }], pubtype: ['Journal Article'] })!
    expect(s).toMatchObject({ id: 'pmid:38082384', pmid: '38082384', doi: '10.1038/s41392-023-01681-2', year: 2023, authors: ['Yan M'], title: 'A paper' })
    for (const p of [c, e, s]) expect(Seed.omit({ n: true, label: true, shortName: true, input: true }).safeParse(p).success).toBe(true)
  })

  it('DOI → Crossref, merged with Europe PMC (pmid, abstract); PMID → esummary', async () => {
    const deps = {
      crossref: async () => mapCrossref(crossrefMsg),
      europePmc: async () => mapEuropePmc({ id: '1', source: 'MED', pmid: '36927031', doi: '10.1126/science.ade2574', title: 'x', abstractText: 'abs' }),
      esummary: async (pmid: string) => mapEsummary(pmid, { title: 'P', pubdate: '2020' }),
    }
    const d = await resolveWithoutOpenAlex({ kind: 'doi', value: '10.1126/science.ade2574' }, deps)
    expect(d?.source).toBe('Crossref')
    expect(d?.paper).toMatchObject({ id: 'pmid:36927031', pmid: '36927031', abstract: 'abs', title: crossrefMsg.title[0] })
    const p = await resolveWithoutOpenAlex({ kind: 'pmid', value: '123' }, deps)
    expect(p).toMatchObject({ source: 'PubMed', paper: { id: 'pmid:123', year: 2020 } })
    const none = await resolveWithoutOpenAlex({ kind: 'doi', value: '10.1/x' }, { crossref: async () => { throw new Error('down') }, europePmc: async () => null })
    expect(none).toBeNull()
  })

  it('resolveSeeds: an OpenAlex 429 still resolves the seed and returns a clear warning', async () => {
    const getWork = async () => { throw new HttpError(429, 'https://api.openalex.org/works/doi:x', 'Too Many Requests') }
    const fallback = async () => ({ paper: { ...mapCrossref(crossrefMsg)!, abstract: 'a', abstractSource: 'europepmc' as const }, source: 'Crossref' as const })
    const r = await resolveSeeds(['10.1126/science.ade2574'], { getWork: getWork as never, fallback })
    expect(r.errors).toEqual([])
    expect(r.seeds).toHaveLength(1)
    expect(Seed.safeParse(r.seeds[0]).success).toBe(true)
    expect(r.seeds[0]).toMatchObject({ label: 'S1', input: '10.1126/science.ade2574', shortName: 'Lin 2023' })
    expect(r.warning).toMatch(/^OpenAlex rate-limited — resolved via Crossref/)
    expect(r.resolvedVia).toEqual([{ input: '10.1126/science.ade2574', paperId: 'doi:10.1126/science.ade2574', source: 'Crossref', reason: 'OpenAlex rate-limited' }])
  })

  it('short names: PubMed-style "Yan M" reads as the surname', () => {
    expect(shortName({ authors: ['Yan M'], year: 2023, title: 't' })).toBe('Yan 2023')
    expect(shortName({ authors: ['Itay Tirosh'], year: 2016, title: 't' })).toBe('Tirosh 2016')
  })

  it('resolveSeeds: OpenAlex hit → no warning; nothing anywhere → a clear error', async () => {
    const ok = await resolveSeeds(['W1'], { getWork: (async () => ({ value: { ...mapCrossref(crossrefMsg)!, abstract: 'a', id: 'W1', url: 'https://openalex.org/W1' }, url: 'u', hash: 'h' })) as never, fallback: async () => null })
    expect(ok.warning).toBeNull()
    expect(ok.seeds[0].id).toBe('W1')
    const miss = await resolveSeeds(['10.1234/none'], { getWork: (async () => { throw new HttpError(401, 'u', 'unauthorized') }) as never, fallback: async () => null })
    expect(miss.seeds).toEqual([])
    expect(miss.errors[0].message).toMatch(/OpenAlex refused the request \(API key\); not found via Crossref/)
  })
})
