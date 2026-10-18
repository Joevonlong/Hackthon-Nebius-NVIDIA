// Lane L1 offline tests: parsers, dedupe/merge, title similarity, SerpAPI mapping, query plan. No network.
import { describe, expect, it } from 'vitest'
import type { Goals } from '@shared/library'
import { parseArxivAtom, arxivQuery } from './arxiv'
import { toRecord } from './enrich'
import { groupQueries, keywordGroups, planQueries, queryKey } from './index'
import { capPile, dedupe, newCand, parseKnownId, sameTitle, titleSimilarity, recordKey } from './normalize'
import { parsePubmedXml } from './pubmed-lib'
import { mapScholar } from './scholar'
import { cleanWebTitle, mapWebHit } from './tavily-lib'

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <title type="html">ArXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2101.01234v2</id>
    <published>2021-01-04T18:00:00Z</published>
    <title>Single-cell   atlas of
      melanoma &amp; immune cells</title>
    <summary>  We profile tumour-infiltrating T cells.  </summary>
    <author><name>Ada Lovelace</name></author>
    <author><name>Alan Turing</name></author>
    <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.1000/XYZ.123</arxiv:doi>
    <link title="doi" href="http://dx.doi.org/10.1000/xyz.123" rel="related"/>
    <arxiv:comment xmlns:arxiv="http://arxiv.org/schemas/atom">Accepted at ICML 2021</arxiv:comment>
    <arxiv:journal_ref xmlns:arxiv="http://arxiv.org/schemas/atom">Nature Methods 18 (2021) 1-10</arxiv:journal_ref>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="q-bio.GN" scheme="http://arxiv.org/schemas/atom"/>
    <category term="q-bio.GN" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/q-bio/0601001v1</id>
    <published>2006-01-01T00:00:00Z</published>
    <title>Old style id</title>
    <summary>x</summary>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="q-bio.QM"/>
  </entry>
</feed>`

const EFETCH = `<?xml version="1.0" ?><PubmedArticleSet>
<PubmedArticle><MedlineCitation Status="MEDLINE" Owner="NLM"><PMID Version="1">27124452</PMID>
<Article PubModel="Print"><Journal><JournalIssue CitedMedium="Internet"><PubDate><Year>2016</Year><Month>Apr</Month></PubDate></JournalIssue>
<Title>Science (New York, N.Y.)</Title></Journal>
<ArticleTitle>Dissecting the multicellular ecosystem of metastatic melanoma by single-cell RNA-seq.</ArticleTitle>
<ELocationID EIdType="doi" ValidYN="Y">10.1126/science.aad0501</ELocationID>
<Abstract><AbstractText Label="INTRODUCTION">To explore <i>distinct</i> genotypic &amp; phenotypic states.</AbstractText><AbstractText>Second part.</AbstractText></Abstract>
<AuthorList CompleteYN="Y"><Author ValidYN="Y"><LastName>Tirosh</LastName><ForeName>Itay</ForeName></Author><Author><LastName>Garraway</LastName><ForeName>Levi A</ForeName></Author></AuthorList>
<Language>eng</Language>
<GrantList><Grant><GrantID>R01</GrantID><Agency>NCI NIH HHS</Agency></Grant><Grant><Agency>NCI NIH HHS</Agency></Grant></GrantList>
<PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType><PublicationType UI="D013485">Research Support, N.I.H., Extramural</PublicationType></PublicationTypeList>
</Article>
<MeshHeadingList><MeshHeading><DescriptorName UI="D008545" MajorTopicYN="Y">Melanoma</DescriptorName><QualifierName UI="Q000473">pathology</QualifierName></MeshHeading>
<MeshHeading><DescriptorName UI="D059010" MajorTopicYN="N">Single-Cell Analysis</DescriptorName></MeshHeading></MeshHeadingList>
<CommentsCorrectionsList><CommentsCorrections RefType="CommentIn"><PMID Version="1">99999999</PMID></CommentsCorrections></CommentsCorrectionsList>
</MedlineCitation>
<PubmedData><ArticleIdList><ArticleId IdType="pubmed">27124452</ArticleId><ArticleId IdType="doi">10.1126/science.aad0501</ArticleId><ArticleId IdType="pmc">PMC4944528</ArticleId></ArticleIdList>
<ReferenceList><Reference><ArticleIdList><ArticleId IdType="doi">10.9999/wrong</ArticleId><ArticleId IdType="pmc">PMC1</ArticleId></ArticleIdList></Reference></ReferenceList></PubmedData>
</PubmedArticle>
<PubmedArticle><MedlineCitation><PMID Version="1">111</PMID><Article><Journal><JournalIssue><PubDate><MedlineDate>2019 Jan-Feb</MedlineDate></PubDate></JournalIssue><Title>J X</Title></Journal>
<ArticleTitle>A review</ArticleTitle><PublicationTypeList><PublicationType UI="D016454">Review</PublicationType><PublicationType UI="D017418">Meta-Analysis</PublicationType></PublicationTypeList></Article></MedlineCitation></PubmedArticle>
</PubmedArticleSet>`

describe('arXiv Atom parsing', () => {
  it('parses id, title, summary, authors, categories, journal_ref, doi, comment', () => {
    const [a, b] = parseArxivAtom(ATOM)
    expect(a.id).toBe('2101.01234')
    expect(a.title).toBe('Single-cell atlas of melanoma & immune cells')
    expect(a.summary).toBe('We profile tumour-infiltrating T cells.')
    expect(a.authors).toEqual(['Ada Lovelace', 'Alan Turing'])
    expect(a.primaryCategory).toBe('q-bio.GN')
    expect(a.categories).toEqual(['q-bio.GN', 'cs.LG'])
    expect(a.journalRef).toBe('Nature Methods 18 (2021) 1-10')
    expect(a.doi).toBe('10.1000/xyz.123')
    expect(a.comment).toBe('Accepted at ICML 2021')
    expect(a.year).toBe(2021)
    expect(b.id).toBe('q-bio/0601001')
    expect(b.journalRef).toBeNull()
  })
  it('builds an AND query of content words', () => {
    expect(arxivQuery('Which single-cell methods help study melanoma immune cells?')).toBe('all:"single cell" AND all:melanoma AND all:immune')
    expect(arxivQuery('spatial transcriptomics CITE-seq melanoma', 'melanoma immune cells')).toBe('all:melanoma AND all:spatial AND all:transcriptomics')
  })
})

describe('PubMed efetch parsing', () => {
  const [a, b] = parsePubmedXml(EFETCH)
  it('extracts PublicationType and MeSH lists', () => {
    expect(a.publicationTypes).toEqual(['Journal Article', 'Research Support, N.I.H., Extramural'])
    expect(a.mesh).toEqual(['Melanoma', 'Single-Cell Analysis'])
    expect(b.publicationTypes).toEqual(['Review', 'Meta-Analysis'])
    expect(b.mesh).toEqual([])
  })
  it('extracts title, abstract, journal, year, DOI, PMCID, authors — ignoring reference ids', () => {
    expect(a.pmid).toBe('27124452')
    expect(a.title).toMatch(/^Dissecting the multicellular/)
    expect(a.abstract).toBe('INTRODUCTION: To explore distinct genotypic & phenotypic states.\nSecond part.')
    expect(a.journal).toBe('Science (New York, N.Y.)')
    expect(a.year).toBe(2016)
    expect(a.doi).toBe('10.1126/science.aad0501')
    expect(a.pmcid).toBe('PMC4944528')
    expect(a.authors).toEqual(['Itay Tirosh', 'Levi A Garraway'])
    expect(a.language).toBe('eng')
    expect(a.grants).toEqual(['NCI NIH HHS'])
    expect(b.year).toBe(2019)
    expect(b.abstract).toBeNull()
  })
})

describe('title similarity', () => {
  it('is 1 for case/punctuation variants and high for near-identical titles', () => {
    expect(titleSimilarity('Dissecting the multicellular ecosystem of metastatic melanoma by single-cell RNA-seq.', 'dissecting the multicellular ecosystem of metastatic melanoma by single cell RNA seq')).toBe(1)
    expect(titleSimilarity('Defining T cell states associated with response to checkpoint immunotherapy in melanoma', 'Defining T Cell States Associated with Response to Checkpoint Immunotherapy in Melanoma.')).toBe(1)
  })
  it('rejects different papers that share words', () => {
    expect(titleSimilarity('Single-cell RNA-seq of melanoma T cells', 'Single-cell RNA-seq of lung cancer B cells')).toBeLessThan(0.6)
    expect(sameTitle('A survey of melanoma', 'A survey of melanoma immunotherapy resistance mechanisms')).toBe(false)
    expect(sameTitle('Same title here for sure', 'Same Title Here, for Sure', 2020, 2021)).toBe(true)
    expect(sameTitle('Same title here for sure', 'Same Title Here, for Sure', 2020, 2023)).toBe(false)
  })
})

describe('dedupe + merge', () => {
  const h = (source: any, url: string) => ({ source, via: 'subtopic' as const, query: 'q', rank: 1, url })
  it('merges by DOI, PMID, arXiv id, OpenAlex id and title+year, keeping all hits', () => {
    const cs = [
      newCand({ ids: { openalex: 'W1', doi: '10.1/a', pmid: '11' }, title: 'Paper A title is long enough', year: 2020, work: { id: 'https://openalex.org/W1', display_name: 'Paper A title is long enough' }, hits: [h('openalex', 'oa')] }),
      newCand({ ids: { pmid: '11' }, title: 'Paper A title is long enough.', year: 2020, hits: [h('pubmed', 'pm')], relations: [{ type: 'similar', paperId: 'W9' }] }),
      newCand({ ids: { doi: '10.1/a' }, title: 'Paper A', hits: [h('tavily', 'web')] }),
      newCand({ ids: { arxiv: '2101.00001' }, title: 'Paper B on something else', year: 2021, hits: [h('arxiv', 'ax')] }),
      newCand({ ids: { doi: '10.48550/arxiv.2101.00001' }, title: 'Paper B', hits: [h('scholar', 'sc')] }),
      newCand({ ids: {}, title: 'Paper B on something else', year: 2021, hits: [h('scholar', 'sc2')] }),
      newCand({ ids: {}, title: 'Paper B on something else', year: 2015, hits: [h('scholar', 'sc3')] }), // other year → separate
    ]
    const out = dedupe(cs)
    expect(out).toHaveLength(3)
    const a = out.find(c => c.ids.openalex === 'W1')!
    expect(a.hits.map(x => x.source).sort()).toEqual(['openalex', 'pubmed', 'tavily'])
    expect(a.relations).toEqual([{ type: 'similar', paperId: 'W9' }])
    expect(a.title).toBe('Paper A title is long enough')
    const b = out.find(c => c.ids.arxiv === '2101.00001')!
    expect(b.hits).toHaveLength(3)
    expect(recordKey(b)).toBe('arxiv:2101.00001')
    expect(recordKey(out.find(c => c.year === 2015)!)).toMatch(/^scholar:[0-9a-f]{12}$/)
  })
  it('caps the pile keeping multi-source papers first', () => {
    const one = newCand({ ids: { pmid: '1' }, hits: [h('pubmed', 'x')] })
    const two = newCand({ ids: { pmid: '2' }, hits: [h('pubmed', 'y'), h('openalex', 'z')] })
    expect(capPile([one, two], 1)).toEqual([two])
  })
})

describe('known ids, query plan, records', () => {
  it('classifies known paper identifiers', () => {
    expect(parseKnownId('10.1126/science.aad0501')).toEqual({ kind: 'doi', value: '10.1126/science.aad0501' })
    expect(parseKnownId('https://doi.org/10.48550/arXiv.2101.01234')).toEqual({ kind: 'arxiv', value: '2101.01234' })
    expect(parseKnownId('27124452')).toEqual({ kind: 'pmid', value: '27124452' })
    expect(parseKnownId('W2332292689')).toEqual({ kind: 'openalex', value: 'W2332292689' })
    expect(parseKnownId('arXiv:2101.01234v3')).toEqual({ kind: 'arxiv', value: '2101.01234' })
  })
  it('groups keywords 3–4 and plans question + subtopics + groups', () => {
    const ks = Array.from({ length: 10 }, (_, i) => `k${i}`)
    expect(keywordGroups(ks).map(g => g.length)).toEqual([4, 3, 3])
    const goals: Goals = { topic: 't', question: 'Q?', goals: [], subtopics: [{ name: 's', query: 'sq' }], keywords: ks, knownPapers: [], evidence: [], model: null }
    expect(planQueries(goals).map(q => q.label)).toEqual(['question', 's', 'k0, k3, k6, k9', 'k1, k4, k7', 'k2, k5, k8'])
  })
  it('turns an unresolved arXiv candidate into a preprint record with extra.arxiv', () => {
    const [e] = parseArxivAtom(ATOM)
    const r = toRecord(newCand({ ids: { arxiv: e.id }, title: e.title, year: e.year, arxiv: { ...e, journalRef: null }, hits: [{ source: 'arxiv', via: 'subtopic', query: 'q', rank: 1, url: e.url }] }))
    expect(r.key).toBe('arxiv:2101.01234')
    expect(r.paper.type).toBe('preprint')
    expect(r.paper.abstract).toBe('We profile tumour-infiltrating T cells.')
    expect(r.venue).toMatchObject({ name: 'arXiv', type: 'repository' })
    expect(r.extra.arxiv).toMatchObject({ primaryCategory: 'q-bio.GN', comment: 'Accepted at ICML 2021' })
    expect(r.authors.map(a => a.position)).toEqual(['first', 'last'])
  })
})

describe('SerpAPI Scholar + Tavily mapping', () => {
  it('maps organic_results to items with citations, venue, year and ids', () => {
    const items = mapScholar({ organic_results: [
      { position: 0, title: 'Dissecting the multicellular ecosystem of metastatic melanoma by single-cell RNA-seq', result_id: 'abc', link: 'https://www.science.org/doi/abs/10.1126/science.aad0501', snippet: 'To explore…',
        publication_info: { summary: 'I Tirosh, B Izar, SM Prakadan… - Science, 2016 - science.org', authors: [{ name: 'I Tirosh' }, { name: 'B Izar' }] }, inline_links: { cited_by: { total: 4321 } } },
      { position: 1, title: '[PDF] Some preprint', link: 'https://arxiv.org/abs/2101.01234', publication_info: { summary: 'A Person - arXiv preprint arXiv:2101.01234, 2021 - arxiv.org' } },
      { position: 2, title: '' },
    ] })
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ year: 2016, venue: 'Science', citedBy: 4321, doi: '10.1126/science.aad0501', position: 1, authors: ['I Tirosh', 'B Izar'], resultId: 'abc' })
    expect(items[1]).toMatchObject({ title: 'Some preprint', arxiv: '2101.01234', year: 2021, citedBy: null, authors: ['A Person'] })
  })
  it('cleans web titles and extracts ids from Tavily hits', () => {
    expect(cleanWebTitle('Dissecting the multicellular ecosystem - PubMed')).toBe('Dissecting the multicellular ecosystem')
    const w = mapWebHit({ url: 'https://pubmed.ncbi.nlm.nih.gov/27124452/', title: 'X - PubMed', content: '' }, 2)
    expect(w).toMatchObject({ pmid: '27124452', rank: 3, title: 'X' })
  })
})

describe('query dedupe (PERF)', () => {
  it('groups queries with the same word set, keeps every plan for provenance', () => {
    expect(queryKey('Melanoma single-cell T cells')).toBe(queryKey('T cells, single-cell melanoma'))
    const qs = [{ text: 'melanoma T cells' }, { text: 'T cells melanoma' }, { text: 'macrophages melanoma' }]
    const g = groupQueries(qs, q => queryKey(q.text))
    expect(g.map(x => x.length)).toEqual([2, 1])
    expect(g[0][0]).toBe(qs[0])
  })
})
